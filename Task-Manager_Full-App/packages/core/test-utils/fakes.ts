import type { OsNotifier, OsScheduler, ScheduledItem } from '../src/ports';
import { createCore, type TaskManagerCore } from '../src/core';
import type { TaskDraft } from '../src/domain/types';
import { NodeSqliteDriver } from './nodeSqliteDriver';

export class FakeScheduler implements OsScheduler {
  scheduled: ScheduledItem[] = [];
  calls = 0;
  private cb: ((a: { alarmId: number; action: 'snooze' | 'done' | 'open' }) => void) | null = null;
  async replaceAll(items: ScheduledItem[]): Promise<void> { this.calls++; this.scheduled = items; }
  capacity(): number { return 100; }
  onAction(cb: (a: { alarmId: number; action: 'snooze' | 'done' | 'open' }) => void): void { this.cb = cb; }
  press(alarmId: number, action: 'snooze' | 'done' | 'open'): void { this.cb?.({ alarmId, action }); }
}
export const fakeNotifier: OsNotifier = { permission: async () => 'granted', requestPermission: async () => 'granted' };

export class FakeClock { constructor(public t: number) {} now(): number { return this.t; } }

export interface Harness { core: TaskManagerCore; clock: FakeClock; scheduler: FakeScheduler; sql: NodeSqliteDriver; }
export async function makeCore(nowMs: number, path = ':memory:'): Promise<Harness> {
  const sql = new NodeSqliteDriver(path);
  const clock = new FakeClock(nowMs);
  const scheduler = new FakeScheduler();
  const core = createCore({ sql, clock, scheduler, notifier: fakeNotifier });
  const r = await core.init();
  if (!r.ok) throw new Error(r.message);
  await core.start();
  return { core, clock, scheduler, sql };
}

export function draft(over: Partial<TaskDraft> = {}): TaskDraft {
  return {
    title: 'Finish lab report', what: 'Write the budget summary section', outcome: 'One-page summary with totals',
    doneWhen: 'Totals match and the PDF is saved', categoryId: 1, priority: 'Medium', status: 'To Do',
    dueDate: null, dueTime: null, checklist: [{ text: 'Collect figures', isDone: false }, { text: 'Draft text', isDone: false }],
    ...over,
  };
}
