import { EventBus } from './bus/events';
import { AlarmService } from './alarms/alarmService';
import { DEFAULT_CATEGORIES, SCHEMA_VERSION } from './domain/constants';
import type { AppSettings, MissedAlarm, NotificationRecord } from './domain/types';
import * as repo from './data/repos';
import { SCHEMA_V1 } from './data/schema';
import { Backup } from './services/backup';
import { CategoryService } from './services/categoryService';
import type { Ctx, Deps, Result } from './services/context';
import { Dashboard } from './services/dashboard';
import { Queries } from './services/queries';
import { DEFAULT_SETTINGS, readSettings, writeLayout, writeSettings, WIDGET_IDS } from './services/settings';
import { TaskService } from './services/taskService';
import { isValidTime } from './time';

export type InitResult = { ok: true; firstRun: boolean } | { ok: false; reason: 'corrupt' | 'error'; message: string };

/** The whole app logic, built from the ports (LLD section 3). The UI only talks to this object. */
export class TaskManagerCore {
  readonly bus = new EventBus();
  readonly tasks: TaskService;
  readonly categories: CategoryService;
  readonly alarms: AlarmService;
  readonly queries: Queries;
  readonly dashboard: Dashboard;
  readonly backup: Backup;
  private ctx: Ctx;

  constructor(deps: Deps) {
    this.ctx = { ...deps, bus: this.bus };
    // The alarm service needs the task service only later (Mark Done), so the callback looks it up when called.
    this.alarms = new AlarmService(this.ctx, (taskId) => this.tasks.markDoneKeepingSteps(taskId));
    this.tasks = new TaskService(this.ctx, this.alarms);
    this.categories = new CategoryService(this.ctx);
    this.queries = new Queries(this.ctx);
    this.dashboard = new Dashboard(this.ctx);
    this.backup = new Backup(this.ctx, this.alarms);
    deps.scheduler.onAction((a) => { void this.alarms.handleOsAction(a); });
  }

  /** Open the database, check it, create tables on the first run (TM-SRS-093, 112). */
  async init(): Promise<InitResult> {
    try {
      await this.ctx.sql.open();
      if (!(await this.ctx.sql.integrityCheck())) return { ok: false, reason: 'corrupt', message: 'The database file is damaged.' };
      const firstRun = await this.ctx.sql.transaction(async (tx) => {
        const v = (await tx.all<{ user_version: number }>('PRAGMA user_version'))[0]?.user_version ?? 0;
        if (v >= SCHEMA_VERSION) return false;
        for (const stmt of SCHEMA_V1) await tx.run(stmt);
        for (const c of DEFAULT_CATEGORIES) await repo.categories.insert(tx, c.name, c.color);   // TM-SRS-030
        await writeSettings(tx, DEFAULT_SETTINGS);
        await writeLayout(tx, WIDGET_IDS.map((widget, position) => ({ widget, position, isVisible: true })));
        await tx.run(`PRAGMA user_version = ${SCHEMA_VERSION}`);
        return true;
      });
      return { ok: true, firstRun };
    } catch (e) { return { ok: false, reason: 'error', message: (e as Error).message }; }
  }

  /** After init: list missed alarms, hand the next alarms to Android. */
  async start(): Promise<MissedAlarm[]> {
    const missed = await this.alarms.collectMissed();
    await this.alarms.scheduleOs();
    this.bus.emit({ type: 'data' });
    return missed;
  }

  /** Damaged file: keep it, start with an empty database. The user can then import a backup. */
  async recoverWithEmptyDatabase(): Promise<InitResult> {
    await this.ctx.sql.quarantine();
    return this.init();
  }

  // ---------- settings (TM-SRS-138, 120) ----------
  async getSettings(): Promise<AppSettings> { return this.ctx.sql.transaction((tx) => readSettings(tx)); }
  async updateSettings(patch: Partial<AppSettings>): Promise<Result> {
    if (patch.defaultDueTime !== undefined && !isValidTime(patch.defaultDueTime)) return { ok: false, error: 'Use a time like 09:00.' };
    const now = this.ctx.clock.now();
    await this.ctx.sql.transaction(async (tx) => {
      const next = { ...(await readSettings(tx)), ...patch };
      await writeSettings(tx, next);
      if (patch.defaultDueTime !== undefined) await this.alarms.recomputeAll(tx, now, next.defaultDueTime);
    });
    await this.alarms.scheduleOs();
    this.bus.emit({ type: 'data' });
    return { ok: true };
  }

  // ---------- notification center (TM-SRS-135) ----------
  notifications(): Promise<{ items: NotificationRecord[]; unread: number }> {
    return this.ctx.sql.transaction(async (tx) => ({ items: await repo.notifications.list(tx), unread: await repo.notifications.unread(tx) }));
  }
  async markNotificationRead(id: number): Promise<void> { await this.ctx.sql.transaction((tx) => repo.notifications.markRead(tx, id)); this.bus.emit({ type: 'data' }); }
  async markAllNotificationsRead(): Promise<void> { await this.ctx.sql.transaction((tx) => repo.notifications.markAllRead(tx)); this.bus.emit({ type: 'data' }); }
}

export const createCore = (deps: Deps): TaskManagerCore => new TaskManagerCore(deps);
