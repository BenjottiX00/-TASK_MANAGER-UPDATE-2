import { NOTIFICATION_ACTION_SNOOZE_MINUTES, SNOOZE_MINUTES } from '../domain/constants';
import type { Alarm, AlarmDraft, MissedAlarm, SnoozeOption, Task } from '../domain/types';
import * as repo from '../data/repos';
import type { Ctx } from '../services/context';
import { getCard } from '../services/queries';
import { readSettings } from '../services/settings';
import type { SqlTx, ScheduledItem } from '../ports';
import { buildMessage } from '../notifications/builder';
import { toLocalDate, toLocalTime, tomorrowAt } from '../time';
import { alarmKey, triggerFor } from './planner';

const effectiveTime = (a: Alarm): number => (a.state === 'snoozed' && a.snoozeUntil !== null ? a.snoozeUntil : a.triggerAt);

export class AlarmService {
  constructor(private ctx: Ctx, private onTaskDone: (taskId: number) => Promise<void>) {}

  /** Make a task's alarms equal to `drafts` (max 5, TM-SRS-121). Runs inside the caller's transaction. */
  async replaceForTask(tx: SqlTx, task: Task, drafts: AlarmDraft[], now: number, defaultTime: string): Promise<void> {
    const existing = await repo.alarms.forTask(tx, task.id);
    const wanted = new Map<string, { type: AlarmDraft['type']; at: number }>();
    for (const d of drafts) {
      const at = triggerFor(d.type, d.customAt, task.dueDate, task.dueTime, defaultTime);
      if (at !== null) wanted.set(alarmKey(d.type, d.type === 'custom' ? at : undefined), { type: d.type, at });
    }
    const keep = new Set<string>();
    for (const ex of existing) {
      const k = alarmKey(ex.type, ex.type === 'custom' ? ex.triggerAt : undefined);
      const w = wanted.get(k);
      if (!w) { await repo.alarms.delete(tx, ex.id); continue; }
      keep.add(k);
      if (w.at !== ex.triggerAt) await repo.alarms.update(tx, { ...ex, triggerAt: w.at, state: w.at > now ? 'pending' : 'dismissed', snoozeUntil: null });
    }
    for (const [k, w] of wanted) {
      if (keep.has(k)) continue;
      await repo.alarms.insert(tx, { taskId: task.id, type: w.type, triggerAt: w.at, state: w.at > now ? 'pending' : 'dismissed', snoozeUntil: null });
    }
  }

  /** Due date/time or default time changed: work out the relative alarms again (TM-SRS-127). */
  async recomputeRelative(tx: SqlTx, task: Task, now: number, defaultTime: string, reopened = false): Promise<void> {
    for (const a of await repo.alarms.forTask(tx, task.id)) {
      if (a.type === 'custom') continue;
      const at = triggerFor(a.type, undefined, task.dueDate, task.dueTime, defaultTime);
      if (at === null) { await repo.alarms.delete(tx, a.id); continue; }
      // A task that is opened again (Done -> To Do) gets its alarms that are still ahead back (TM-SRS-127).
      const wake = reopened && a.state === 'dismissed' && at > now;
      if (at !== a.triggerAt || wake) await repo.alarms.update(tx, { ...a, triggerAt: at, state: at > now ? 'pending' : 'dismissed', snoozeUntil: null });
    }
  }
  async recomputeAll(tx: SqlTx, now: number, defaultTime: string): Promise<void> {
    for (const t of await repo.tasks.all(tx)) if (t.status !== 'Done') await this.recomputeRelative(tx, t, now, defaultTime);
  }

  /** Give every alarm that is still ahead to the Android scheduler (TM-SRS-102, 103). */
  async scheduleOs(): Promise<void> {
    const now = this.ctx.clock.now();
    const items: ScheduledItem[] = await this.ctx.sql.transaction(async (tx) => {
      const s = await readSettings(tx);
      if (!s.notificationsEnabled) return [];
      const out: ScheduledItem[] = [];
      const waiting = (await repo.alarms.waiting(tx)).filter((w) => w.taskStatus !== 'Done' && effectiveTime(w.alarm) > now);
      waiting.sort((a, b) => effectiveTime(a.alarm) - effectiveTime(b.alarm));
      for (const { alarm } of waiting.slice(0, this.ctx.scheduler.capacity())) {
        const card = await getCard(tx, alarm.taskId, now, s.defaultDueTime);
        if (!card) continue;
        const m = buildMessage(card, s.defaultDueTime);
        out.push({ osId: alarm.id, fireAt: effectiveTime(alarm), title: m.title, body: m.body, payload: { taskId: alarm.taskId, alarmId: alarm.id }, actions: ['snooze', 'done'], sound: s.soundEnabled });
      }
      return out;
    });
    await this.ctx.scheduler.replaceAll(items);
  }

  /** An alarm time has been reached (by the app's own timer, or told by Android). Safe to call twice. */
  async handleFired(alarmId: number): Promise<boolean> {
    const now = this.ctx.clock.now();
    const res = await this.ctx.sql.transaction(async (tx) => {
      const alarm = await repo.alarms.get(tx, alarmId);
      if (!alarm || (alarm.state !== 'pending' && alarm.state !== 'snoozed')) return null;
      const s = await readSettings(tx);
      const card = await getCard(tx, alarm.taskId, now, s.defaultDueTime);
      if (!card || card.task.status === 'Done') { await repo.alarms.setState(tx, alarmId, 'dismissed'); return null; }
      await repo.alarms.setState(tx, alarmId, 'fired');
      const m = buildMessage(card, s.defaultDueTime);
      await repo.notifications.insert(tx, { alarmId, kind: 'alarm', title: m.title, body: m.body, createdAt: now, isRead: false });
      return { m, taskId: alarm.taskId, show: s.notificationsEnabled };
    });
    if (!res) return false;
    if (res.show) this.ctx.bus.emit({ type: 'alert', alarmId, taskId: res.taskId, title: res.m.title, body: res.m.body });
    this.ctx.bus.emit({ type: 'data' });
    return true;
  }

  /** Called every few seconds while the app is open. Returns how many alarms rang. */
  async tick(): Promise<number> {
    const now = this.ctx.clock.now();
    const due = await this.ctx.sql.transaction(async (tx) => (await repo.alarms.waiting(tx)).filter((w) => effectiveTime(w.alarm) <= now).map((w) => w.alarm.id));
    let n = 0;
    for (const id of due) if (await this.handleFired(id)) n++;
    return n;
  }

  async snooze(alarmId: number, option: SnoozeOption): Promise<void> {
    const now = this.ctx.clock.now();
    await this.ctx.sql.transaction(async (tx) => {
      const alarm = await repo.alarms.get(tx, alarmId);
      if (!alarm || alarm.state === 'dismissed') return;
      const s = await readSettings(tx);
      const until = option === 'tomorrow' ? tomorrowAt(now, s.defaultDueTime) : now + SNOOZE_MINUTES[option] * 60_000;
      await repo.alarms.setState(tx, alarmId, 'snoozed', until);
    });
    await this.scheduleOs();
    this.ctx.bus.emit({ type: 'data' });
  }
  async dismiss(alarmId: number): Promise<void> {
    await this.ctx.sql.transaction((tx) => repo.alarms.setState(tx, alarmId, 'dismissed'));
    await this.scheduleOs();
    this.ctx.bus.emit({ type: 'data' });
  }
  async markDone(alarmId: number): Promise<void> {
    const a = await this.ctx.sql.transaction((tx) => repo.alarms.get(tx, alarmId));
    if (a) await this.onTaskDone(a.taskId);
  }

  /** TM-SRS-126: alarms that came due while the app was not running become "missed" (once). */
  async collectMissed(): Promise<MissedAlarm[]> {
    const now = this.ctx.clock.now();
    await this.ctx.sql.transaction(async (tx) => {
      const s = await readSettings(tx);
      for (const { alarm, taskStatus } of await repo.alarms.waiting(tx)) {
        if (effectiveTime(alarm) > now) continue;
        if (taskStatus === 'Done') { await repo.alarms.setState(tx, alarm.id, 'dismissed'); continue; }
        const card = await getCard(tx, alarm.taskId, now, s.defaultDueTime);
        if (!card) continue;
        await repo.alarms.setState(tx, alarm.id, 'fired');
        const when = effectiveTime(alarm);
        await repo.notifications.insert(tx, { alarmId: alarm.id, kind: 'missed', title: `Missed: ${card.task.title}`, body: `Scheduled ${toLocalDate(when)} ${toLocalTime(when)}`, createdAt: now, isRead: false });
      }
    });
    return this.missedList();
  }
  async missedList(): Promise<MissedAlarm[]> {
    const rows = await this.ctx.sql.transaction((tx) => repo.notifications.missed(tx));
    return rows.map((r) => ({ alarmId: r.alarm_id, taskId: r.task_id, title: r.title, scheduledAt: r.trigger_at, taskStatus: r.status }));
  }

  /** Notification button or tap, reported by the Android shell. Returns the task to open, if any. */
  async handleOsAction(a: { alarmId: number; action: 'snooze' | 'done' | 'open' }): Promise<number | null> {
    const alarm = await this.ctx.sql.transaction((tx) => repo.alarms.get(tx, a.alarmId));
    if (!alarm) return null;
    if (a.action === 'snooze') { await this.snooze(a.alarmId, `${NOTIFICATION_ACTION_SNOOZE_MINUTES}m` as SnoozeOption); return null; }
    if (a.action === 'done') { await this.markDone(a.alarmId); return null; }
    if (alarm.state === 'pending' || alarm.state === 'snoozed') await this.ctx.sql.transaction((tx) => repo.alarms.setState(tx, alarm.id, 'dismissed'));
    this.ctx.bus.emit({ type: 'open-task', taskId: alarm.taskId });
    this.ctx.bus.emit({ type: 'data' });
    return alarm.taskId;
  }
}
