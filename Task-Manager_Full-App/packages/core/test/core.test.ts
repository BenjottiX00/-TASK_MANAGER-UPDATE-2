import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as repo from '../src/data/repos';
import { localToMs } from '../src/time';
import type { CoreEvent } from '../src/bus/events';
import { draft, makeCore } from '../test-utils/fakes';
import { NodeSqliteDriver } from '../test-utils/nodeSqliteDriver';

// Fri 30 Oct 2026, 02:00 in Manila = Thu 29 Oct 2026, 18:00 UTC
const NOW = Date.UTC(2026, 9, 29, 18, 0, 0);
const at = (date: string, time: string) => localToMs(date, time);
const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));
async function mustCreate(h: Awaited<ReturnType<typeof makeCore>>, over = {}) {
  const r = await h.core.tasks.create(draft(over));
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.id;
}

describe('first start', () => {
  it('creates the 4 default categories, default settings and the 4 widgets', async () => {
    const h = await makeCore(NOW);
    expect((await h.core.categories.list()).map((c) => c.name)).toEqual(['Work', 'Study', 'Home', 'Personal']);
    expect(await h.core.getSettings()).toEqual({ notificationsEnabled: true, soundEnabled: true, defaultDueTime: '09:00' });
    expect((await h.core.dashboard.layout()).map((w) => w.widget)).toEqual(['today', 'overdue', 'upcoming', 'category_progress']);
  });
  it('does not create the default data again on the second start', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tm-'));
    const file = join(dir, 'a.db');
    const h1 = await makeCore(NOW, file);
    await h1.core.categories.create('Gym');
    h1.sql.close();
    const h2 = await makeCore(NOW, file);
    expect((await h2.core.categories.list()).map((c) => c.name)).toEqual(['Work', 'Study', 'Home', 'Personal', 'Gym']);
  });
});

describe('creating and editing tasks', () => {
  it('refuses a task that breaks a rule and saves nothing', async () => {
    const h = await makeCore(NOW);
    const r = await h.core.tasks.create(draft({ title: 'ab', checklist: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok && 'errors' in r) { expect(r.errors.title).toBeTruthy(); expect(r.errors.checklist).toBeTruthy(); }
    expect(await h.core.queries.list({ view: 'all' })).toHaveLength(0);
  });
  it('saves everything or nothing: a missing category rolls the whole save back (TM-SRS-060)', async () => {
    const h = await makeCore(NOW);
    const r = await h.core.tasks.create(draft({ categoryId: 999 }));
    expect(r.ok).toBe(false);
    const n = await h.sql.all<{ n: number }>('SELECT (SELECT COUNT(*) FROM task) + (SELECT COUNT(*) FROM checklist_item) + (SELECT COUNT(*) FROM alarm) AS n');
    expect(n[0]!.n).toBe(0);
  });
  it('cleans typed text before saving (TM-SRS-111)', async () => {
    const h = await makeCore(NOW);
    const id = await mustCreate(h, { title: '  <b>Read</b>   chapter 3  ' });
    expect((await h.core.queries.detail(id))!.card.task.title).toBe('Read chapter 3');
  });
  it('a task with a due date gets one at-due alarm by default, and Android is told', async () => {
    const h = await makeCore(NOW);
    const id = await mustCreate(h, { dueDate: '2026-10-30', dueTime: '11:00' });
    const d = (await h.core.queries.detail(id))!;
    expect(d.items).toHaveLength(2);
    expect(d.alarms).toHaveLength(1);
    expect(d.alarms[0]!.type).toBe('at_due');
    expect(d.alarms[0]!.triggerAt).toBe(at('2026-10-30', '11:00'));
    expect(h.scheduler.scheduled).toHaveLength(1);
    expect(h.scheduler.scheduled[0]!.fireAt).toBe(at('2026-10-30', '11:00'));
    expect(h.scheduler.scheduled[0]!.actions).toEqual(['snooze', 'done']);
  });
  it('no due time = alarm at the default time 09:00', async () => {
    const h = await makeCore(NOW);
    const id = await mustCreate(h, { dueDate: '2026-10-31' });
    expect((await h.core.queries.detail(id))!.alarms[0]!.triggerAt).toBe(at('2026-10-31', '09:00'));
  });
  it('supports 5 preset types and custom alarms', async () => {
    const h = await makeCore(NOW);
    const id = await mustCreate(h, { dueDate: '2026-11-02', dueTime: '10:00', alarms: [{ type: 'at_due' }, { type: 'before_15m' }, { type: 'before_1h' }, { type: 'before_1d' }, { type: 'custom', customAt: at('2026-10-31', '20:00') }] });
    const times = (await h.core.queries.detail(id))!.alarms.map((a) => a.triggerAt).sort((a, b) => a - b);
    expect(times).toEqual([at('2026-10-31', '20:00'), at('2026-11-01', '10:00'), at('2026-11-02', '09:00'), at('2026-11-02', '09:45'), at('2026-11-02', '10:00')]);
  });
  it('an alarm time that has already passed is kept but never rings', async () => {
    const h = await makeCore(NOW);
    const id = await mustCreate(h, { dueDate: '2026-10-30', dueTime: '01:00' });
    expect((await h.core.queries.detail(id))!.alarms[0]!.state).toBe('dismissed');
    expect(h.scheduler.scheduled).toHaveLength(0);
  });
  it('changing the due time recomputes the relative alarms (TM-SRS-127)', async () => {
    const h = await makeCore(NOW);
    const id = await mustCreate(h, { dueDate: '2026-10-30', dueTime: '11:00', alarms: [{ type: 'at_due' }, { type: 'before_1h' }] });
    const d = (await h.core.queries.detail(id))!;
    const r = await h.core.tasks.update(id, draft({ dueDate: '2026-10-30', dueTime: '15:00', checklist: d.items.map((i) => ({ id: i.id, text: i.text, isDone: i.isDone })) }));
    expect(r.ok).toBe(true);
    const times = (await h.core.queries.detail(id))!.alarms.map((a) => a.triggerAt).sort((a, b) => a - b);
    expect(times).toEqual([at('2026-10-30', '14:00'), at('2026-10-30', '15:00')]);
    expect(h.scheduler.scheduled.map((s) => s.fireAt).sort((a, b) => a - b)).toEqual(times);
  });
  it('editing keeps checklist ids that stay and removes the ones taken out', async () => {
    const h = await makeCore(NOW);
    const id = await mustCreate(h);
    const before = (await h.core.queries.detail(id))!.items;
    const r = await h.core.tasks.update(id, draft({ checklist: [{ id: before[0]!.id, text: 'Collect all figures', isDone: true }, { text: 'Brand new step', isDone: false }] }));
    expect(r.ok).toBe(true);
    const after = (await h.core.queries.detail(id))!.items;
    expect(after.map((i) => i.text)).toEqual(['Collect all figures', 'Brand new step']);
    expect(after[0]!.id).toBe(before[0]!.id);
    expect(after[0]!.isDone).toBe(true);
  });
  it('deleting a task removes its steps and alarms (TM-SRS-019)', async () => {
    const h = await makeCore(NOW);
    const id = await mustCreate(h, { dueDate: '2026-10-31' });
    await h.core.tasks.delete(id);
    const n = await h.sql.all<{ i: number; a: number }>('SELECT (SELECT COUNT(*) FROM checklist_item) AS i, (SELECT COUNT(*) FROM alarm) AS a');
    expect(n[0]).toEqual({ i: 0, a: 0 });
    expect(h.scheduler.scheduled).toHaveLength(0);
  });
});

describe('checklist (SRS 020-027)', () => {
  it('progress is done / total and a percent', async () => {
    const h = await makeCore(NOW);
    const id = await mustCreate(h, { checklist: [1, 2, 3, 4].map((n) => ({ text: `s${n}`, isDone: n <= 2 })) });
    const c = (await h.core.queries.detail(id))!.card;
    expect([c.itemsDone, c.itemsTotal, c.percent, c.firstUnchecked]).toEqual([2, 4, 50, 's3']);
  });
  it('ticking the last open step says the task can be marked Done', async () => {
    const h = await makeCore(NOW);
    const id = await mustCreate(h, { checklist: [{ text: 'only', isDone: false }] });
    const it = (await h.core.queries.detail(id))!.items[0]!;
    expect(await h.core.tasks.setItemDone(it.id, true)).toEqual({ allDone: true, taskId: id });
  });
  it('the last item cannot be deleted; the 51st cannot be added', async () => {
    const h = await makeCore(NOW);
    const id = await mustCreate(h, { checklist: [{ text: 'only', isDone: false }] });
    const it = (await h.core.queries.detail(id))!.items[0]!;
    expect((await h.core.tasks.deleteItem(it.id)).ok).toBe(false);
    for (let i = 0; i < 49; i++) expect((await h.core.tasks.addItem(id, `extra ${i}`)).ok).toBe(true);
    expect((await h.core.tasks.addItem(id, 'one too many')).ok).toBe(false);
  });
  it('items can be moved up and down', async () => {
    const h = await makeCore(NOW);
    const id = await mustCreate(h, { checklist: [{ text: 'a', isDone: false }, { text: 'b', isDone: false }, { text: 'c', isDone: false }] });
    const items = (await h.core.queries.detail(id))!.items;
    await h.core.tasks.moveItem(items[2]!.id, -1);
    expect((await h.core.queries.detail(id))!.items.map((i) => i.text)).toEqual(['a', 'c', 'b']);
  });
  it('setting Done with open steps asks first; "tick" ticks them all; "keep" leaves them (TM-SRS-026)', async () => {
    const h = await makeCore(NOW);
    const a = await mustCreate(h, { dueDate: '2026-10-31' });
    const ask = await h.core.tasks.setStatus(a, 'Done');
    expect(ask).toEqual({ ok: false, needsDecision: true, unchecked: 2 });
    expect((await h.core.queries.detail(a))!.card.task.status).toBe('To Do');
    expect((await h.core.tasks.setStatus(a, 'Done', 'tick')).ok).toBe(true);
    expect((await h.core.queries.detail(a))!.card.percent).toBe(100);
    const b = await mustCreate(h);
    expect((await h.core.tasks.setStatus(b, 'Done', 'keep')).ok).toBe(true);
    expect((await h.core.queries.detail(b))!.card.percent).toBe(0);
  });
});

describe('Today and Overdue use the LOCAL date (bug fix)', () => {
  it('at 02:00 local on 30 Oct, a task due 30 Oct is Today and one due 29 Oct is Overdue', async () => {
    const h = await makeCore(NOW);
    const today = await mustCreate(h, { title: 'Due today', dueDate: '2026-10-30', dueTime: '10:00' });
    const old = await mustCreate(h, { title: 'Due yesterday', dueDate: '2026-10-29', dueTime: '10:00' });
    expect((await h.core.queries.list({ view: 'today' })).map((x) => x.task.id)).toEqual([today]);
    expect((await h.core.queries.list({ view: 'overdue' })).map((x) => x.task.id)).toEqual([old]);
    expect(await h.core.queries.counts()).toEqual({ today: 1, overdue: 1, upcoming: 0 });
  });
  it('a task is overdue once its due time has passed, and Done tasks never are', async () => {
    const h = await makeCore(NOW);
    const id = await mustCreate(h, { dueDate: '2026-10-30', dueTime: '11:00' });
    expect((await h.core.queries.list({ view: 'overdue' }))).toHaveLength(0);
    h.clock.t = at('2026-10-30', '12:00');
    const o = await h.core.queries.list({ view: 'overdue' });
    expect(o).toHaveLength(1);
    expect(o[0]!.overdue).toBe(true);
    expect((await h.core.queries.list({ view: 'today' }))).toHaveLength(1);
    await h.core.tasks.setStatus(id, 'Done', 'keep');
    expect((await h.core.queries.list({ view: 'overdue' }))).toHaveLength(0);
  });
  it('Today lists High priority first, then by title (TM-SRS-040)', async () => {
    const h = await makeCore(NOW);
    await mustCreate(h, { title: 'Bbb task', dueDate: '2026-10-30', priority: 'Low' });
    await mustCreate(h, { title: 'Aaa task', dueDate: '2026-10-30', priority: 'Medium' });
    await mustCreate(h, { title: 'Zzz task', dueDate: '2026-10-30', priority: 'High' });
    expect((await h.core.queries.list({ view: 'today' })).map((x) => x.task.title)).toEqual(['Zzz task', 'Aaa task', 'Bbb task']);
  });
  it('Overdue lists the oldest first', async () => {
    const h = await makeCore(NOW);
    await mustCreate(h, { title: 'Newer one', dueDate: '2026-10-29' });
    await mustCreate(h, { title: 'Older one', dueDate: '2026-10-20' });
    expect((await h.core.queries.list({ view: 'overdue' })).map((x) => x.task.title)).toEqual(['Older one', 'Newer one']);
  });
});

describe('search and filters (SRS 050-052)', () => {
  async function seed() {
    const h = await makeCore(NOW);
    await mustCreate(h, { title: 'Pay water bill', what: 'Pay the water bill online', categoryId: 3, priority: 'High', dueDate: '2026-11-03' });
    await mustCreate(h, { title: 'Study chapter five', categoryId: 2, priority: 'Low', dueDate: '2026-11-10', checklist: [{ text: 'Read pages 100%', isDone: false }] });
    await mustCreate(h, { title: 'Team meeting prep', categoryId: 1, priority: 'High', dueDate: '2026-11-05', status: 'In Progress' });
    return h;
  }
  it('searches title, description and checklist text', async () => {
    const h = await seed();
    expect((await h.core.queries.list({ search: 'water' })).map((x) => x.task.title)).toEqual(['Pay water bill']);
    expect((await h.core.queries.list({ search: 'pages' })).map((x) => x.task.title)).toEqual(['Study chapter five']);
  });
  it('treats % and _ as normal characters', async () => {
    const h = await seed();
    expect(await h.core.queries.list({ search: '%' })).toHaveLength(1);
    expect(await h.core.queries.list({ search: '_' })).toHaveLength(0);
  });
  it('combines category, status, priority and date range', async () => {
    const h = await seed();
    expect(await h.core.queries.list({ priority: 'High' })).toHaveLength(2);
    expect(await h.core.queries.list({ priority: 'High', status: 'In Progress' })).toHaveLength(1);
    expect(await h.core.queries.list({ categoryId: 3, priority: 'High' })).toHaveLength(1);
    expect(await h.core.queries.list({ dueFrom: '2026-11-04', dueTo: '2026-11-10' })).toHaveLength(2);
    expect(await h.core.queries.list({ search: 'chapter', priority: 'High' })).toHaveLength(0);
  });
  it('sorts by due date, priority, category and status', async () => {
    const h = await seed();
    const t = async (sort: 'due' | 'priority' | 'category' | 'status') => (await h.core.queries.list({ sort })).map((x) => x.task.title);
    expect(await t('due')).toEqual(['Pay water bill', 'Team meeting prep', 'Study chapter five']);
    expect((await t('priority'))[2]).toBe('Study chapter five');
    expect((await t('category'))[0]).toBe('Pay water bill');   // Home, Study, Work
    expect((await t('category'))[2]).toBe('Team meeting prep');
    expect((await t('status'))[2]).toBe('Team meeting prep');
  });
});

describe('categories (SRS 030-034)', () => {
  it('names are unique and can be renamed and recolored', async () => {
    const h = await makeCore(NOW);
    expect((await h.core.categories.create('work')).ok).toBe(false);
    expect((await h.core.categories.update(1, 'Job', '#C9524F')).ok).toBe(true);
    expect((await h.core.categories.list())[0]).toEqual({ id: 1, name: 'Job', color: '#C9524F' });
    expect((await h.core.categories.update(2, 'Job', '#000000')).ok).toBe(false);
  });
  it('a category with tasks cannot be deleted until its tasks are moved', async () => {
    const h = await makeCore(NOW);
    const id = await mustCreate(h, { categoryId: 2 });
    expect(await h.core.categories.delete(2)).toEqual({ ok: false, needsMove: true, taskCount: 1 });
    expect((await h.core.categories.delete(2, 2)).ok).toBe(false);
    expect((await h.core.categories.delete(2, 3)).ok).toBe(true);
    expect((await h.core.queries.detail(id))!.card.task.categoryId).toBe(3);
  });
  it('an empty category deletes at once; the last category stays', async () => {
    const h = await makeCore(NOW);
    expect((await h.core.categories.delete(4)).ok).toBe(true);
    await h.core.categories.delete(3); await h.core.categories.delete(2);
    expect((await h.core.categories.delete(1)).ok).toBe(false);
  });
});

describe('alarms and notifications (SRS 120-138)', () => {
  it('the notification has the title, category, due time, progress and the first unchecked step', async () => {
    const h = await makeCore(NOW);
    await mustCreate(h, { dueDate: '2026-10-30', dueTime: '11:00', categoryId: 2 });
    const s = h.scheduler.scheduled[0]!;
    expect(s.title).toBe('Finish lab report');
    expect(s.body).toContain('Study');
    expect(s.body).toContain('Due 2026-10-30 11:00');
    expect(s.body).toContain('Progress: 0/2 done');
    expect(s.body).toContain('Next step: Collect figures');
  });
  it('when the alarm time comes: one alert, one notification, and no second ring', async () => {
    const h = await makeCore(NOW);
    const id = await mustCreate(h, { dueDate: '2026-10-30', dueTime: '11:00' });
    const events: CoreEvent[] = [];
    h.core.bus.on((e) => events.push(e));
    h.clock.t = at('2026-10-30', '11:00');
    expect(await h.core.alarms.tick()).toBe(1);
    expect(events.filter((e) => e.type === 'alert')).toHaveLength(1);
    const n = await h.core.notifications();
    expect(n.items).toHaveLength(1);
    expect(n.unread).toBe(1);
    expect(n.items[0]!.kind).toBe('alarm');
    expect(await h.core.alarms.tick()).toBe(0);
    expect((await h.core.queries.detail(id))!.alarms[0]!.state).toBe('fired');
  });
  it('snooze 5 min, 15 min, 1 hour or until tomorrow (TM-SRS-124)', async () => {
    const h = await makeCore(NOW);
    const id = await mustCreate(h, { dueDate: '2026-10-30', dueTime: '11:00' });
    const alarmId = (await h.core.queries.detail(id))!.alarms[0]!.id;
    const ring = async () => { h.clock.t = Math.max(h.clock.t, at('2026-10-30', '11:00')); await h.core.alarms.tick(); };
    const expected: Array<['5m' | '15m' | '1h' | 'tomorrow', number]> = [['5m', 5 * 60_000], ['15m', 15 * 60_000], ['1h', 3_600_000], ['tomorrow', 0]];
    for (const [opt, ms] of expected) {
      await ring();
      await h.core.alarms.snooze(alarmId, opt);
      const a = (await h.core.queries.detail(id))!.alarms[0]!;
      expect(a.state).toBe('snoozed');
      expect(a.snoozeUntil).toBe(opt === 'tomorrow' ? at('2026-10-31', '09:00') : h.clock.t + ms);
      expect(h.scheduler.scheduled[0]!.fireAt).toBe(a.snoozeUntil);
      h.clock.t = a.snoozeUntil as number;   // time passes until the snoozed alarm rings again
    }
  });
  it('Done cancels the pending alarms; back to To Do plans them again (TM-SRS-127)', async () => {
    const h = await makeCore(NOW);
    const id = await mustCreate(h, { dueDate: '2026-10-31', dueTime: '10:00' });
    await h.core.tasks.setStatus(id, 'Done', 'keep');
    expect((await h.core.queries.detail(id))!.alarms[0]!.state).toBe('dismissed');
    expect(h.scheduler.scheduled).toHaveLength(0);
    await h.core.tasks.setStatus(id, 'To Do');
    expect((await h.core.queries.detail(id))!.alarms[0]!.state).toBe('pending');
    expect(h.scheduler.scheduled).toHaveLength(1);
  });
  it('the notification buttons: Snooze (15 min) and Mark Done (TM-SRS-132)', async () => {
    const h = await makeCore(NOW);
    const id = await mustCreate(h, { dueDate: '2026-10-30', dueTime: '11:00' });
    const alarmId = (await h.core.queries.detail(id))!.alarms[0]!.id;
    h.clock.t = at('2026-10-30', '11:00');
    h.scheduler.press(alarmId, 'snooze'); await wait();
    const a = (await h.core.queries.detail(id))!.alarms[0]!;
    expect([a.state, a.snoozeUntil]).toEqual(['snoozed', h.clock.t + 15 * 60_000]);
    h.scheduler.press(alarmId, 'done'); await wait();
    expect((await h.core.queries.detail(id))!.card.task.status).toBe('Done');
    expect(h.scheduler.scheduled).toHaveLength(0);
  });
  it('tapping a notification opens the task and counts as seen', async () => {
    const h = await makeCore(NOW);
    const id = await mustCreate(h, { dueDate: '2026-10-30', dueTime: '11:00' });
    const alarmId = (await h.core.queries.detail(id))!.alarms[0]!.id;
    const events: CoreEvent[] = [];
    h.core.bus.on((e) => events.push(e));
    h.scheduler.press(alarmId, 'open'); await wait();
    expect(events).toContainEqual({ type: 'open-task', taskId: id });
    expect((await h.core.queries.detail(id))!.alarms[0]!.state).toBe('dismissed');
  });
  it('alarms that came due while the app was closed are listed once as missed (TM-SRS-126)', async () => {
    const h = await makeCore(NOW);
    const id = await mustCreate(h, { dueDate: '2026-10-30', dueTime: '11:00' });
    h.clock.t = at('2026-10-30', '13:00');           // the app was closed at 11:00
    const missed = await h.core.start();
    expect(missed).toHaveLength(1);
    expect(missed[0]).toEqual({ alarmId: missed[0]!.alarmId, taskId: id, title: 'Finish lab report', scheduledAt: at('2026-10-30', '11:00'), taskStatus: 'To Do' });
    expect((await h.core.notifications()).items[0]!.kind).toBe('missed');
    expect(await h.core.start()).toHaveLength(1);    // still listed, not duplicated
    expect((await h.core.notifications()).items).toHaveLength(1);
    await h.core.alarms.dismiss(missed[0]!.alarmId);
    expect(await h.core.alarms.missedList()).toHaveLength(0);
  });
  it('a Done task never shows up as missed', async () => {
    const h = await makeCore(NOW);
    const id = await mustCreate(h, { dueDate: '2026-10-30', dueTime: '11:00' });
    await h.core.tasks.setStatus(id, 'Done', 'keep');
    h.clock.t = at('2026-10-30', '13:00');
    expect(await h.core.start()).toHaveLength(0);
  });
  it('the notification history keeps only the last 50 (TM-SRS-095)', async () => {
    const h = await makeCore(NOW);
    await h.sql.transaction(async (tx) => { for (let i = 0; i < 55; i++) await repo.notifications.insert(tx, { alarmId: null, kind: 'alarm', title: `n${i}`, body: '', createdAt: NOW + i, isRead: false }); });
    const n = await h.core.notifications();
    expect(n.items).toHaveLength(50);
    expect(n.items[0]!.title).toBe('n54');
    await h.core.markAllNotificationsRead();
    expect((await h.core.notifications()).unread).toBe(0);
  });
  it('with notifications switched off, nothing is given to Android and no alert shows (TM-SRS-138)', async () => {
    const h = await makeCore(NOW);
    await h.core.updateSettings({ notificationsEnabled: false });
    await mustCreate(h, { dueDate: '2026-10-30', dueTime: '11:00' });
    expect(h.scheduler.scheduled).toHaveLength(0);
    const events: CoreEvent[] = [];
    h.core.bus.on((e) => events.push(e));
    h.clock.t = at('2026-10-30', '11:00'); await h.core.alarms.tick();
    expect(events.filter((e) => e.type === 'alert')).toHaveLength(0);
    await h.core.updateSettings({ notificationsEnabled: true });
    expect(h.scheduler.scheduled).toHaveLength(0);   // that alarm already rang
  });
  it('the sound setting reaches the scheduled alarm', async () => {
    const h = await makeCore(NOW);
    await mustCreate(h, { dueDate: '2026-10-31' });
    expect(h.scheduler.scheduled[0]!.sound).toBe(true);
    await h.core.updateSettings({ soundEnabled: false });
    expect(h.scheduler.scheduled[0]!.sound).toBe(false);
  });
  it('changing the default due time moves the alarms of tasks that have no due time', async () => {
    const h = await makeCore(NOW);
    const id = await mustCreate(h, { dueDate: '2026-10-31' });
    expect((await h.core.updateSettings({ defaultDueTime: '25:99' })).ok).toBe(false);
    await h.core.updateSettings({ defaultDueTime: '08:30' });
    expect((await h.core.queries.detail(id))!.alarms[0]!.triggerAt).toBe(at('2026-10-31', '08:30'));
  });
});

describe('dashboard widgets (SRS 140-147)', () => {
  it('fills the four widgets', async () => {
    const h = await makeCore(NOW);
    for (let i = 0; i < 7; i++) await mustCreate(h, { title: `Today task ${i}`, dueDate: '2026-10-30' });
    await mustCreate(h, { title: 'Late one', dueDate: '2026-10-25' });
    await mustCreate(h, { title: 'Next week', dueDate: '2026-11-03', categoryId: 2, checklist: [{ text: 'a', isDone: true }, { text: 'b', isDone: false }] });
    await mustCreate(h, { title: 'Far away', dueDate: '2026-12-25' });
    const d = await h.core.dashboard.load();
    expect(d.today.total).toBe(7); expect(d.today.items).toHaveLength(5); expect(d.todayDone).toBe(0);
    expect(d.overdue.total).toBe(1);
    expect(d.upcoming.map((u) => u.date)).toEqual(['2026-11-03']);
    expect(d.categoryProgress.find((c) => c.category.name === 'Study')).toEqual({ category: { id: 2, name: 'Study', color: '#7B52AB' }, openTasks: 1, percent: 50 });
  });
  it('counts the tasks already finished today (progress ring)', async () => {
    const h = await makeCore(NOW);
    const a = await mustCreate(h, { title: 'Task one', dueDate: '2026-10-30' });
    await mustCreate(h, { title: 'Task two', dueDate: '2026-10-30' });
    await h.core.tasks.setStatus(a, 'Done', 'keep');
    const d = await h.core.dashboard.load();
    expect([d.todayDone, d.today.total]).toEqual([1, 1]);
  });
  it('hide and reorder are saved', async () => {
    const h = await makeCore(NOW);
    const l = await h.core.dashboard.layout();
    await h.core.dashboard.setLayout([{ ...l[3]!, position: 0 }, { ...l[0]!, position: 1, isVisible: false }, { ...l[1]!, position: 2 }, { ...l[2]!, position: 3 }]);
    const after = await h.core.dashboard.layout();
    expect(after.map((w) => w.widget)).toEqual(['category_progress', 'today', 'overdue', 'upcoming']);
    expect(after[1]!.isVisible).toBe(false);
  });
});

describe('export and import (SRS 070-071)', () => {
  async function filled() {
    const h = await makeCore(NOW);
    await mustCreate(h, { title: 'Alpha task', dueDate: '2026-10-31', dueTime: '10:00', alarms: [{ type: 'at_due' }, { type: 'before_1h' }] });
    await mustCreate(h, { title: 'Beta task', priority: 'High', checklist: [{ text: 'one', isDone: true }] });
    await h.core.updateSettings({ defaultDueTime: '08:00', soundEnabled: false });
    return h;
  }
  it('exports everything and imports it into an empty app with the same result', async () => {
    const a = await filled();
    const json = await a.core.backup.exportJson();
    const b = await makeCore(NOW);
    expect(await b.core.backup.importJson(json)).toEqual({ ok: true });
    expect(await b.core.backup.exportJson()).toBe(json.replace(/"exportedAt": \d+/, `"exportedAt": ${NOW}`));
    expect((await b.core.queries.list({})).map((x) => x.task.title)).toEqual(['Alpha task', 'Beta task']);
    expect(await b.core.getSettings()).toEqual({ notificationsEnabled: true, soundEnabled: false, defaultDueTime: '08:00' });
    expect(b.scheduler.scheduled).toHaveLength(2);       // alarms are given to Android again
  });
  it('a bad file changes nothing', async () => {
    const h = await filled();
    const before = await h.core.backup.exportJson();
    const good = JSON.parse(before);
    const bads: Array<[string, unknown]> = [
      ['not json', 'this is not json {'],
      ['wrong app', { app: 'other' }],
      ['task with a missing category', { ...good, tasks: [{ ...good.tasks[0], categoryId: 999 }] }],
      ['task with no checklist', { ...good, checklistItems: [] }],
      ['bad priority', { ...good, tasks: [{ ...good.tasks[0], priority: 'Urgent' }] }],
      ['bad default time', { ...good, settings: { ...good.settings, defaultDueTime: '99:99' } }],
    ];
    for (const [name, content] of bads) {
      const r = await h.core.backup.importJson(typeof content === 'string' ? content : JSON.stringify(content));
      expect(r.ok).toBe(false);
      expect(await h.core.backup.exportJson()).toBe(before.replace(/"exportedAt": \d+/, `"exportedAt": ${NOW}`));
      void name;
    }
  });
  it('cleans text inside an imported file', async () => {
    const h = await filled();
    const good = JSON.parse(await h.core.backup.exportJson());
    good.tasks[0].title = '<img src=x onerror=alert(1)>Safe title';
    expect((await h.core.backup.importJson(JSON.stringify(good))).ok).toBe(true);
    expect((await h.core.queries.list({})).map((x) => x.task.title)).toContain('Safe title');
  });
  it('CSV of the list on screen: quotes are escaped and formulas are defused', async () => {
    const h = await makeCore(NOW);
    await mustCreate(h, { title: '=HYPERLINK("http://x")', what: 'w, with comma' });
    await mustCreate(h, { title: 'Say "hello" now' });
    const csv = h.core.backup.exportCsv(await h.core.queries.list({}));
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('Title,Category,Priority,Status,Due date,Due time,Checklist done,Checklist total,Progress %');
    expect(lines.some((l) => l.startsWith(`"'=HYPERLINK(""http://x"")"`))).toBe(true);
    expect(lines.some((l) => l.startsWith('"Say ""hello"" now"'))).toBe(true);
  });
});

describe('a damaged database (TM-SRS-112)', () => {
  it('is reported, kept untouched, and the app starts empty so a backup can be imported', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tm-'));
    const file = join(dir, 'bad.db');
    writeFileSync(file, 'this is definitely not a sqlite database '.repeat(40));
    const original = readFileSync(file);
    const h = await (async () => {
      const sql = new NodeSqliteDriver(file);
      const { createCore } = await import('../src/core');
      const { FakeClock, FakeScheduler, fakeNotifier } = await import('../test-utils/fakes');
      return { core: createCore({ sql, clock: new FakeClock(NOW), scheduler: new FakeScheduler(), notifier: fakeNotifier }) };
    })();
    const r = await h.core.init();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('corrupt');
    const r2 = await h.core.recoverWithEmptyDatabase();
    expect(r2.ok).toBe(true);
    expect((await h.core.categories.list()).length).toBe(4);
    expect(readFileSync(file).equals(original)).toBe(true);   // the damaged file was not deleted or changed
  });
});
