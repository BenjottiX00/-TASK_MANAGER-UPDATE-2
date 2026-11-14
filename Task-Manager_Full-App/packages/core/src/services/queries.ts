import type { Ctx } from './context';
import type { SqlTx } from '../ports';
import type { Category, ChecklistItem, Alarm, Task, TaskFilter, TaskListItem } from '../domain/types';
import { toTask } from '../data/repos';
import * as repo from '../data/repos';
import { readSettings } from './settings';
import { addDays, dueMs, toLocalDate } from '../time';

const PRIORITY_RANK = `CASE t.priority WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END`;
const STATUS_RANK = `CASE t.status WHEN 'To Do' THEN 0 WHEN 'In Progress' THEN 1 ELSE 2 END`;
const DUE_ORDER = `t.due_date IS NULL, t.due_date, COALESCE(t.due_time, '99:99')`;

const SELECT = `
  SELECT t.*, c.name AS category_name, c.color AS category_color,
    (SELECT COUNT(*) FROM checklist_item i WHERE i.task_id = t.id) AS items_total,
    (SELECT COUNT(*) FROM checklist_item i WHERE i.task_id = t.id AND i.is_done = 1) AS items_done,
    (SELECT i.text FROM checklist_item i WHERE i.task_id = t.id AND i.is_done = 0 ORDER BY i.position, i.id LIMIT 1) AS first_unchecked,
    (SELECT i.id FROM checklist_item i WHERE i.task_id = t.id AND i.is_done = 0 ORDER BY i.position, i.id LIMIT 1) AS first_unchecked_id
  FROM task t JOIN category c ON c.id = t.category_id`;

type Row = Parameters<typeof toTask>[0] & { category_name: string; category_color: string; items_total: number; items_done: number; first_unchecked: string | null; first_unchecked_id: number | null };

export function isOverdue(t: Task, nowMs: number, defaultTime: string): boolean {
  return t.status !== 'Done' && t.dueDate !== null && dueMs(t.dueDate, t.dueTime, defaultTime) < nowMs;
}
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => '\\' + m);

export function toListItem(r: Row, nowMs: number, defaultTime: string): TaskListItem {
  const task = toTask(r);
  const total = r.items_total;
  return {
    task, categoryName: r.category_name, categoryColor: r.category_color,
    itemsDone: r.items_done, itemsTotal: total,
    percent: total === 0 ? 0 : Math.round((r.items_done / total) * 100),
    firstUnchecked: r.first_unchecked, firstUncheckedId: r.first_unchecked_id, overdue: isOverdue(task, nowMs, defaultTime),
  };
}

export async function queryTasks(tx: SqlTx, f: TaskFilter, nowMs: number, defaultTime: string): Promise<TaskListItem[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const today = toLocalDate(nowMs);
  if (f.view === 'today') { where.push(`t.status <> 'Done' AND t.due_date = ?`); params.push(today); }
  if (f.view === 'overdue') { where.push(`t.status <> 'Done' AND t.due_date IS NOT NULL AND t.due_date <= ?`); params.push(today); }
  if (f.view === 'category' || f.categoryId !== undefined) { where.push('t.category_id = ?'); params.push(f.categoryId ?? -1); }
  if (f.status) { where.push('t.status = ?'); params.push(f.status); }
  if (f.priority) { where.push('t.priority = ?'); params.push(f.priority); }
  if (f.dueFrom) { where.push('t.due_date >= ?'); params.push(f.dueFrom); }
  if (f.dueTo) { where.push('t.due_date <= ?'); params.push(f.dueTo); }
  const q = f.search?.trim();
  if (q) {
    const like = `%${likeEscape(q)}%`;
    where.push(`(t.title LIKE ? ESCAPE '\\' OR t.what LIKE ? ESCAPE '\\' OR t.outcome LIKE ? ESCAPE '\\' OR t.done_when LIKE ? ESCAPE '\\'
      OR EXISTS (SELECT 1 FROM checklist_item i WHERE i.task_id = t.id AND i.text LIKE ? ESCAPE '\\'))`);
    params.push(like, like, like, like, like);
  }
  let order: string;
  if (f.view === 'today') order = `${PRIORITY_RANK}, COALESCE(t.due_time, '99:99'), t.title COLLATE NOCASE`;     // TM-SRS-040
  else if (f.view === 'overdue') order = `${DUE_ORDER}, ${PRIORITY_RANK}`;                                         // oldest first
  else if (f.sort === 'priority') order = `${PRIORITY_RANK}, ${DUE_ORDER}`;
  else if (f.sort === 'category') order = `c.name COLLATE NOCASE, ${DUE_ORDER}`;
  else if (f.sort === 'status') order = `${STATUS_RANK}, ${DUE_ORDER}`;
  else order = `${DUE_ORDER}, ${PRIORITY_RANK}, t.title COLLATE NOCASE`;
  const sql = `${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order}`;
  let list = (await tx.all<Row>(sql, params)).map((r) => toListItem(r, nowMs, defaultTime));
  if (f.view === 'overdue') list = list.filter((x) => x.overdue);
  return list;
}

export async function getCard(tx: SqlTx, id: number, nowMs: number, defaultTime: string): Promise<TaskListItem | null> {
  const r = (await tx.all<Row>(`${SELECT} WHERE t.id = ?`, [id]))[0];
  return r ? toListItem(r, nowMs, defaultTime) : null;
}

export class Queries {
  constructor(private ctx: Ctx) {}
  private async withTx<T>(fn: (tx: SqlTx, now: number, defaultTime: string) => Promise<T>): Promise<T> {
    const now = this.ctx.clock.now();
    return this.ctx.sql.transaction(async (tx) => fn(tx, now, (await readSettings(tx)).defaultDueTime));
  }
  list(filter: TaskFilter): Promise<TaskListItem[]> { return this.withTx((tx, now, dt) => queryTasks(tx, filter, now, dt)); }
  async detail(id: number): Promise<{ card: TaskListItem; items: ChecklistItem[]; alarms: Alarm[] } | null> {
    return this.withTx(async (tx, now, dt) => {
      const card = await getCard(tx, id, now, dt);
      if (!card) return null;
      return { card, items: await repo.items.forTask(tx, id), alarms: await repo.alarms.forTask(tx, id) };
    });
  }
  async counts(): Promise<{ today: number; overdue: number; upcoming: number }> {
    return this.withTx(async (tx, now, dt) => {
      const today = toLocalDate(now);
      const todayN = (await queryTasks(tx, { view: 'today' }, now, dt)).length;
      const overdue = (await queryTasks(tx, { view: 'overdue' }, now, dt)).length;
      const up = await tx.all<{ n: number }>(`SELECT COUNT(*) AS n FROM task WHERE status <> 'Done' AND due_date > ? AND due_date <= ?`, [today, addDays(today, 7)]);
      return { today: todayN, overdue, upcoming: up[0]!.n };
    });
  }
  categories(): Promise<Category[]> { return this.ctx.sql.transaction((tx) => repo.categories.list(tx)); }
}
