import { WIDGET_OVERDUE_MAX, WIDGET_TODAY_MAX, WIDGET_UPCOMING_DAYS } from '../domain/constants';
import type { Category, TaskListItem, WidgetLayoutItem } from '../domain/types';
import * as repo from '../data/repos';
import { addDays, toLocalDate } from '../time';
import type { Ctx } from './context';
import { queryTasks } from './queries';
import { readLayout, readSettings, writeLayout } from './settings';

export interface DashboardData {
  layout: WidgetLayoutItem[];
  today: { total: number; items: TaskListItem[] };
  /** Tasks due today that are already Done (for the progress ring). */
  todayDone: number;
  overdue: { total: number; items: TaskListItem[] };
  upcoming: Array<{ date: string; items: TaskListItem[] }>;
  categoryProgress: Array<{ category: Category; openTasks: number; percent: number }>;
}

export class Dashboard {
  constructor(private ctx: Ctx) {}

  async load(): Promise<DashboardData> {
    const now = this.ctx.clock.now();
    return this.ctx.sql.transaction(async (tx) => {
      const dt = (await readSettings(tx)).defaultDueTime;
      const today = toLocalDate(now);
      const todayAll = await queryTasks(tx, { view: 'today' }, now, dt);
      const overdueAll = await queryTasks(tx, { view: 'overdue' }, now, dt);
      const todayDone = (await queryTasks(tx, { dueFrom: today, dueTo: today, status: 'Done' }, now, dt)).length;
      const next = await queryTasks(tx, { dueFrom: addDays(today, 1), dueTo: addDays(today, WIDGET_UPCOMING_DAYS), sort: 'due' }, now, dt);
      const byDay = new Map<string, TaskListItem[]>();
      for (const t of next.filter((x) => x.task.status !== 'Done')) byDay.set(t.task.dueDate as string, [...(byDay.get(t.task.dueDate as string) ?? []), t]);
      const progress: DashboardData['categoryProgress'] = [];
      for (const c of await repo.categories.list(tx)) {
        const open = (await queryTasks(tx, { categoryId: c.id }, now, dt)).filter((x) => x.task.status !== 'Done');
        const total = open.reduce((n, x) => n + x.itemsTotal, 0);
        const done = open.reduce((n, x) => n + x.itemsDone, 0);
        progress.push({ category: c, openTasks: open.length, percent: total === 0 ? 0 : Math.round((done / total) * 100) });
      }
      return {
        layout: await readLayout(tx),
        today: { total: todayAll.length, items: todayAll.slice(0, WIDGET_TODAY_MAX) },
        todayDone,
        overdue: { total: overdueAll.length, items: overdueAll.slice(0, WIDGET_OVERDUE_MAX) },
        upcoming: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => ({ date, items })),
        categoryProgress: progress,
      };
    });
  }
  async layout(): Promise<WidgetLayoutItem[]> { return this.ctx.sql.transaction((tx) => readLayout(tx)); }
  async setLayout(layout: WidgetLayoutItem[]): Promise<void> { await this.ctx.sql.transaction((tx) => writeLayout(tx, layout)); this.ctx.bus.emit({ type: 'data' }); }
}
