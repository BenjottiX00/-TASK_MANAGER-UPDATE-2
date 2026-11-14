import { CATEGORY_NAME_MAX, EXPORT_SCHEMA_VERSION, MAX_ALARMS_PER_TASK, MAX_CHECKLIST_ITEMS } from '../domain/constants';
import type { TaskListItem } from '../domain/types';
import * as repo from '../data/repos';
import { TABLES_IN_DELETE_ORDER } from '../data/schema';
import { cleanLine, cleanText } from '../validation/text';
import { isValidDate, isValidTime } from '../time';
import type { AlarmService } from '../alarms/alarmService';
import type { Ctx, Result } from './context';
import { WIDGET_IDS, readLayout, readSettings } from './settings';

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x);
const isStr = (x: unknown): x is string => typeof x === 'string';
const ALARM_TYPES = ['at_due', 'before_15m', 'before_1h', 'before_1d', 'custom'];
const ALARM_STATES = ['pending', 'fired', 'snoozed', 'dismissed'];

interface ExportDoc {
  app: 'task-manager'; schemaVersion: number; exportedAt: number;
  categories: Array<{ id: number; name: string; color: string }>;
  tasks: Array<Record<string, unknown>>;
  checklistItems: Array<Record<string, unknown>>;
  alarms: Array<Record<string, unknown>>;
  settings: Record<string, string>;
  widgetLayout: Array<{ widget: string; position: number; isVisible: boolean }>;
}

/** Checks a whole import file and returns a CLEANED copy, or the first problem found. Nothing is saved here. */
export function parseImport(text: string): { ok: true; doc: ExportDoc } | { ok: false; error: string } {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: 'This file is not valid JSON.' }; }
  if (!isObj(raw) || raw.app !== 'task-manager') return { ok: false, error: 'This is not a Task Manager backup file.' };
  if (raw.schemaVersion !== EXPORT_SCHEMA_VERSION) return { ok: false, error: 'This backup was made by a different version of the app.' };
  const arr = (k: string): unknown[] | null => (Array.isArray(raw[k]) ? (raw[k] as unknown[]) : null);
  const cats = arr('categories'), tasks = arr('tasks'), items = arr('checklistItems'), alarms = arr('alarms'), layout = arr('widgetLayout');
  if (!cats || !tasks || !items || !alarms || !layout || !isObj(raw.settings)) return { ok: false, error: 'The backup is missing some data.' };

  const doc: ExportDoc = { app: 'task-manager', schemaVersion: EXPORT_SCHEMA_VERSION, exportedAt: Number(raw.exportedAt) || 0, categories: [], tasks: [], checklistItems: [], alarms: [], settings: {}, widgetLayout: [] };
  const catIds = new Set<number>(), taskIds = new Set<number>(), names = new Set<string>();
  for (const c of cats) {
    if (!isObj(c) || !isInt(c.id) || !isStr(c.name) || !isStr(c.color)) return { ok: false, error: 'A category in the backup is not valid.' };
    const name = cleanLine(c.name);
    if (name.length < 1 || name.length > CATEGORY_NAME_MAX || names.has(name.toLowerCase()) || catIds.has(c.id)) return { ok: false, error: `Category "${name}" is not valid or is repeated.` };
    names.add(name.toLowerCase()); catIds.add(c.id);
    doc.categories.push({ id: c.id, name, color: cleanLine(c.color).slice(0, 20) });
  }
  for (const t of tasks) {
    if (!isObj(t) || !isInt(t.id) || !isInt(t.categoryId) || !catIds.has(t.categoryId) || taskIds.has(t.id)) return { ok: false, error: 'A task in the backup is not valid.' };
    const title = cleanLine(t.title), what = cleanText(t.what), outcome = cleanText(t.outcome), doneWhen = cleanText(t.doneWhen);
    if (title.length < 3 || title.length > 100 || !what || !outcome || !doneWhen) return { ok: false, error: `Task "${title}" is not valid.` };
    if (!['High', 'Medium', 'Low'].includes(t.priority as string) || !['To Do', 'In Progress', 'Done'].includes(t.status as string)) return { ok: false, error: `Task "${title}" has a wrong priority or status.` };
    const dueDate = t.dueDate === null ? null : isStr(t.dueDate) && isValidDate(t.dueDate) ? t.dueDate : undefined;
    const dueTime = t.dueTime === null ? null : isStr(t.dueTime) && isValidTime(t.dueTime) ? t.dueTime : undefined;
    if (dueDate === undefined || dueTime === undefined || (dueTime !== null && dueDate === null)) return { ok: false, error: `Task "${title}" has a wrong due date or time.` };
    if (!isInt(t.createdAt) || !isInt(t.modifiedAt)) return { ok: false, error: `Task "${title}" has wrong dates.` };
    taskIds.add(t.id);
    doc.tasks.push({ id: t.id, categoryId: t.categoryId, title, what, outcome, doneWhen, priority: t.priority, status: t.status, dueDate, dueTime, createdAt: t.createdAt, modifiedAt: t.modifiedAt });
  }
  const perTask = new Map<number, number>();
  for (const i of items) {
    if (!isObj(i) || !isInt(i.id) || !isInt(i.taskId) || !taskIds.has(i.taskId) || !isInt(i.position) || typeof i.isDone !== 'boolean') return { ok: false, error: 'A checklist item in the backup is not valid.' };
    const text = cleanLine(i.text);
    if (text.length < 1 || text.length > 200) return { ok: false, error: 'A checklist item in the backup has wrong text.' };
    perTask.set(i.taskId, (perTask.get(i.taskId) ?? 0) + 1);
    if ((perTask.get(i.taskId) as number) > MAX_CHECKLIST_ITEMS) return { ok: false, error: 'A task in the backup has too many checklist items.' };
    doc.checklistItems.push({ id: i.id, taskId: i.taskId, position: i.position, text, isDone: i.isDone });
  }
  for (const id of taskIds) if (!perTask.has(id)) return { ok: false, error: 'A task in the backup has no checklist item.' };
  const alarmCount = new Map<number, number>();
  for (const a of alarms) {
    if (!isObj(a) || !isInt(a.id) || !isInt(a.taskId) || !taskIds.has(a.taskId) || !ALARM_TYPES.includes(a.type as string) || !ALARM_STATES.includes(a.state as string) || !isInt(a.triggerAt) || !(a.snoozeUntil === null || isInt(a.snoozeUntil))) return { ok: false, error: 'An alarm in the backup is not valid.' };
    alarmCount.set(a.taskId, (alarmCount.get(a.taskId) ?? 0) + 1);
    if ((alarmCount.get(a.taskId) as number) > MAX_ALARMS_PER_TASK) return { ok: false, error: 'A task in the backup has too many alarms.' };
    doc.alarms.push({ id: a.id, taskId: a.taskId, type: a.type, state: a.state, triggerAt: a.triggerAt, snoozeUntil: a.snoozeUntil });
  }
  const s = raw.settings as Record<string, unknown>;
  if (s.notificationsEnabled !== undefined) doc.settings.notificationsEnabled = String(s.notificationsEnabled === true || s.notificationsEnabled === 'true');
  if (s.soundEnabled !== undefined) doc.settings.soundEnabled = String(s.soundEnabled === true || s.soundEnabled === 'true');
  if (s.defaultDueTime !== undefined) { if (!isStr(s.defaultDueTime) || !isValidTime(s.defaultDueTime)) return { ok: false, error: 'The default due time in the backup is not valid.' }; doc.settings.defaultDueTime = s.defaultDueTime; }
  for (const w of layout) {
    if (!isObj(w) || !WIDGET_IDS.includes(w.widget as never) || !isInt(w.position) || typeof w.isVisible !== 'boolean') return { ok: false, error: 'A widget setting in the backup is not valid.' };
    doc.widgetLayout.push({ widget: w.widget as string, position: w.position, isVisible: w.isVisible });
  }
  return { ok: true, doc };
}

const csvCell = (v: string | number): string => {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;          // stops spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export class Backup {
  constructor(private ctx: Ctx, private alarms: AlarmService) {}

  /** TM-SRS-070: everything except the notification history. */
  async exportJson(): Promise<string> {
    return this.ctx.sql.transaction(async (tx) => {
      const s = await readSettings(tx);
      const doc: ExportDoc = {
        app: 'task-manager', schemaVersion: EXPORT_SCHEMA_VERSION, exportedAt: this.ctx.clock.now(),
        categories: await repo.categories.list(tx),
        tasks: (await repo.tasks.all(tx)) as unknown as Array<Record<string, unknown>>,
        checklistItems: (await repo.items.all(tx)) as unknown as Array<Record<string, unknown>>,
        alarms: (await repo.alarms.all(tx)) as unknown as Array<Record<string, unknown>>,
        settings: { notificationsEnabled: String(s.notificationsEnabled), soundEnabled: String(s.soundEnabled), defaultDueTime: s.defaultDueTime },
        widgetLayout: await readLayout(tx),
      };
      return JSON.stringify(doc, null, 2);
    });
  }

  /** TM-SRS-071: replace all data. If anything is wrong, nothing changes. */
  async importJson(text: string): Promise<Result> {
    const parsed = parseImport(text);
    if (!parsed.ok) return parsed;
    const d = parsed.doc;
    try {
      await this.ctx.sql.transaction(async (tx) => {
        for (const t of TABLES_IN_DELETE_ORDER) await tx.run(`DELETE FROM ${t}`);
        for (const c of d.categories) await tx.run('INSERT INTO category (id, name, color) VALUES (?,?,?)', [c.id, c.name, c.color]);
        for (const t of d.tasks) await tx.run('INSERT INTO task (id, category_id, title, what, outcome, done_when, priority, status, due_date, due_time, created_at, modified_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [t.id, t.categoryId, t.title, t.what, t.outcome, t.doneWhen, t.priority, t.status, t.dueDate, t.dueTime, t.createdAt, t.modifiedAt]);
        for (const i of d.checklistItems) await tx.run('INSERT INTO checklist_item (id, task_id, position, text, is_done) VALUES (?,?,?,?,?)', [i.id, i.taskId, i.position, i.text, i.isDone ? 1 : 0]);
        for (const a of d.alarms) await tx.run('INSERT INTO alarm (id, task_id, type, trigger_at, state, snooze_until) VALUES (?,?,?,?,?,?)', [a.id, a.taskId, a.type, a.triggerAt, a.state, a.snoozeUntil]);
        for (const [k, v] of Object.entries(d.settings)) await repo.settings.set(tx, k, v);
        for (const w of d.widgetLayout) await repo.widgets.set(tx, w as never);
      });
    } catch (e) { return { ok: false, error: `Import failed, nothing was changed. (${(e as Error).message})` }; }
    await this.alarms.scheduleOs();
    this.ctx.bus.emit({ type: 'data' });
    return { ok: true };
  }

  /** TM-SRS-070: the list that is on screen. */
  exportCsv(list: TaskListItem[]): string {
    const head = ['Title', 'Category', 'Priority', 'Status', 'Due date', 'Due time', 'Checklist done', 'Checklist total', 'Progress %'];
    const rows = list.map((x) => [x.task.title, x.categoryName, x.task.priority, x.task.status, x.task.dueDate ?? '', x.task.dueTime ?? '', x.itemsDone, x.itemsTotal, x.percent]);
    return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }
}
