import type { SqlTx } from '../ports';
import type {
  Alarm, AlarmState, AlarmType, Category, ChecklistItem, NotificationKind, NotificationRecord,
  Priority, Status, Task, WidgetId, WidgetLayoutItem,
} from '../domain/types';
import { NOTIFICATION_HISTORY_MAX } from '../domain/constants';

// ---------- row mappers ----------
interface TaskRow { id: number; category_id: number; title: string; what: string; outcome: string; done_when: string; priority: Priority; status: Status; due_date: string | null; due_time: string | null; created_at: number; modified_at: number; }
export const toTask = (r: TaskRow): Task => ({ id: r.id, categoryId: r.category_id, title: r.title, what: r.what, outcome: r.outcome, doneWhen: r.done_when, priority: r.priority, status: r.status, dueDate: r.due_date, dueTime: r.due_time, createdAt: r.created_at, modifiedAt: r.modified_at });
interface ItemRow { id: number; task_id: number; position: number; text: string; is_done: number; }
const toItem = (r: ItemRow): ChecklistItem => ({ id: r.id, taskId: r.task_id, position: r.position, text: r.text, isDone: r.is_done === 1 });
interface AlarmRow { id: number; task_id: number; type: AlarmType; trigger_at: number; state: AlarmState; snooze_until: number | null; }
export const toAlarm = (r: AlarmRow): Alarm => ({ id: r.id, taskId: r.task_id, type: r.type, triggerAt: r.trigger_at, state: r.state, snoozeUntil: r.snooze_until });
interface NotifRow { id: number; alarm_id: number | null; kind: NotificationKind; title: string; body: string; created_at: number; is_read: number; }
const toNotif = (r: NotifRow): NotificationRecord => ({ id: r.id, alarmId: r.alarm_id, kind: r.kind, title: r.title, body: r.body, createdAt: r.created_at, isRead: r.is_read === 1 });

// ---------- categories ----------
export const categories = {
  list: (tx: SqlTx) => tx.all<Category>('SELECT id, name, color FROM category ORDER BY id'),
  get: async (tx: SqlTx, id: number) => (await tx.all<Category>('SELECT id, name, color FROM category WHERE id = ?', [id]))[0] ?? null,
  insert: async (tx: SqlTx, name: string, color: string) => (await tx.run('INSERT INTO category (name, color) VALUES (?, ?)', [name, color])).lastId,
  update: (tx: SqlTx, id: number, name: string, color: string) => tx.run('UPDATE category SET name = ?, color = ? WHERE id = ?', [name, color, id]),
  delete: (tx: SqlTx, id: number) => tx.run('DELETE FROM category WHERE id = ?', [id]),
  countTasks: async (tx: SqlTx, id: number) => (await tx.all<{ n: number }>('SELECT COUNT(*) AS n FROM task WHERE category_id = ?', [id]))[0]!.n,
  moveTasks: (tx: SqlTx, from: number, to: number) => tx.run('UPDATE task SET category_id = ? WHERE category_id = ?', [to, from]),
};

// ---------- tasks ----------
export const tasks = {
  get: async (tx: SqlTx, id: number) => { const r = (await tx.all<TaskRow>('SELECT * FROM task WHERE id = ?', [id]))[0]; return r ? toTask(r) : null; },
  insert: async (tx: SqlTx, t: Omit<Task, 'id'>) =>
    (await tx.run(
      `INSERT INTO task (category_id, title, what, outcome, done_when, priority, status, due_date, due_time, created_at, modified_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [t.categoryId, t.title, t.what, t.outcome, t.doneWhen, t.priority, t.status, t.dueDate, t.dueTime, t.createdAt, t.modifiedAt],
    )).lastId,
  update: (tx: SqlTx, t: Task) =>
    tx.run(
      `UPDATE task SET category_id=?, title=?, what=?, outcome=?, done_when=?, priority=?, status=?, due_date=?, due_time=?, modified_at=? WHERE id=?`,
      [t.categoryId, t.title, t.what, t.outcome, t.doneWhen, t.priority, t.status, t.dueDate, t.dueTime, t.modifiedAt, t.id],
    ),
  setStatus: (tx: SqlTx, id: number, status: Status, at: number) => tx.run('UPDATE task SET status = ?, modified_at = ? WHERE id = ?', [status, at, id]),
  delete: (tx: SqlTx, id: number) => tx.run('DELETE FROM task WHERE id = ?', [id]), // items + alarms go with it (CASCADE)
  all: async (tx: SqlTx) => (await tx.all<TaskRow>('SELECT * FROM task ORDER BY id')).map(toTask),
};

// ---------- checklist ----------
export const items = {
  forTask: async (tx: SqlTx, taskId: number) => (await tx.all<ItemRow>('SELECT * FROM checklist_item WHERE task_id = ? ORDER BY position, id', [taskId])).map(toItem),
  get: async (tx: SqlTx, id: number) => { const r = (await tx.all<ItemRow>('SELECT * FROM checklist_item WHERE id = ?', [id]))[0]; return r ? toItem(r) : null; },
  insert: (tx: SqlTx, taskId: number, position: number, text: string, done: boolean) =>
    tx.run('INSERT INTO checklist_item (task_id, position, text, is_done) VALUES (?,?,?,?)', [taskId, position, text, done ? 1 : 0]),
  update: (tx: SqlTx, id: number, position: number, text: string, done: boolean) =>
    tx.run('UPDATE checklist_item SET position = ?, text = ?, is_done = ? WHERE id = ?', [position, text, done ? 1 : 0, id]),
  delete: (tx: SqlTx, id: number) => tx.run('DELETE FROM checklist_item WHERE id = ?', [id]),
  setDone: (tx: SqlTx, id: number, done: boolean) => tx.run('UPDATE checklist_item SET is_done = ? WHERE id = ?', [done ? 1 : 0, id]),
  setAllDone: (tx: SqlTx, taskId: number, done: boolean) => tx.run('UPDATE checklist_item SET is_done = ? WHERE task_id = ?', [done ? 1 : 0, taskId]),
  all: async (tx: SqlTx) => (await tx.all<ItemRow>('SELECT * FROM checklist_item ORDER BY task_id, position, id')).map(toItem),
};

// ---------- alarms ----------
export const alarms = {
  forTask: async (tx: SqlTx, taskId: number) => (await tx.all<AlarmRow>('SELECT * FROM alarm WHERE task_id = ? ORDER BY trigger_at, id', [taskId])).map(toAlarm),
  get: async (tx: SqlTx, id: number) => { const r = (await tx.all<AlarmRow>('SELECT * FROM alarm WHERE id = ?', [id]))[0]; return r ? toAlarm(r) : null; },
  insert: async (tx: SqlTx, a: Omit<Alarm, 'id'>) =>
    (await tx.run('INSERT INTO alarm (task_id, type, trigger_at, state, snooze_until) VALUES (?,?,?,?,?)', [a.taskId, a.type, a.triggerAt, a.state, a.snoozeUntil])).lastId,
  update: (tx: SqlTx, a: Alarm) => tx.run('UPDATE alarm SET type=?, trigger_at=?, state=?, snooze_until=? WHERE id=?', [a.type, a.triggerAt, a.state, a.snoozeUntil, a.id]),
  setState: (tx: SqlTx, id: number, state: AlarmState, snoozeUntil: number | null = null) =>
    tx.run('UPDATE alarm SET state = ?, snooze_until = ? WHERE id = ?', [state, snoozeUntil, id]),
  delete: (tx: SqlTx, id: number) => tx.run('DELETE FROM alarm WHERE id = ?', [id]),
  /** Every alarm that is waiting (pending or snoozed), with the task it belongs to. */
  waiting: async (tx: SqlTx) =>
    (await tx.all<AlarmRow & { task_status: Status }>(
      `SELECT a.*, t.status AS task_status FROM alarm a JOIN task t ON t.id = a.task_id WHERE a.state IN ('pending','snoozed')`,
    )).map((r) => ({ alarm: toAlarm(r), taskStatus: r.task_status })),
  all: async (tx: SqlTx) => (await tx.all<AlarmRow>('SELECT * FROM alarm ORDER BY id')).map(toAlarm),
  cancelForTask: (tx: SqlTx, taskId: number) =>
    tx.run(`UPDATE alarm SET state = 'dismissed', snooze_until = NULL WHERE task_id = ? AND state <> 'dismissed'`, [taskId]),
};

// ---------- notifications ----------
export const notifications = {
  insert: async (tx: SqlTx, n: Omit<NotificationRecord, 'id'>) => {
    const id = (await tx.run('INSERT INTO notification (alarm_id, kind, title, body, created_at, is_read) VALUES (?,?,?,?,?,?)', [n.alarmId, n.kind, n.title, n.body, n.createdAt, n.isRead ? 1 : 0])).lastId;
    // TM-SRS-095/135: keep only the last 50
    await tx.run('DELETE FROM notification WHERE id NOT IN (SELECT id FROM notification ORDER BY id DESC LIMIT ?)', [NOTIFICATION_HISTORY_MAX]);
    return id;
  },
  list: async (tx: SqlTx) => (await tx.all<NotifRow>('SELECT * FROM notification ORDER BY created_at DESC, id DESC LIMIT ?', [NOTIFICATION_HISTORY_MAX])).map(toNotif),
  unread: async (tx: SqlTx) => (await tx.all<{ n: number }>('SELECT COUNT(*) AS n FROM notification WHERE is_read = 0'))[0]!.n,
  markRead: (tx: SqlTx, id: number) => tx.run('UPDATE notification SET is_read = 1 WHERE id = ?', [id]),
  markAllRead: (tx: SqlTx) => tx.run('UPDATE notification SET is_read = 1'),
  /** Alarms found "missed" at start-up that the user has not acted on yet. */
  missed: (tx: SqlTx) =>
    tx.all<{ alarm_id: number; task_id: number; title: string; trigger_at: number; status: Status }>(
      `SELECT a.id AS alarm_id, a.task_id AS task_id, t.title AS title, a.trigger_at AS trigger_at, t.status AS status
       FROM notification n JOIN alarm a ON a.id = n.alarm_id JOIN task t ON t.id = a.task_id
       WHERE n.kind = 'missed' AND a.state = 'fired' ORDER BY a.trigger_at`,
    ),
};

// ---------- settings + widget layout ----------
export const settings = {
  all: async (tx: SqlTx) => Object.fromEntries((await tx.all<{ key: string; value: string }>('SELECT key, value FROM settings')).map((r) => [r.key, r.value])) as Record<string, string>,
  set: (tx: SqlTx, key: string, value: string) => tx.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]),
};
export const widgets = {
  list: async (tx: SqlTx) => (await tx.all<{ widget: WidgetId; position: number; is_visible: number }>('SELECT * FROM widget_layout ORDER BY position')).map((r): WidgetLayoutItem => ({ widget: r.widget, position: r.position, isVisible: r.is_visible === 1 })),
  set: (tx: SqlTx, w: WidgetLayoutItem) => tx.run('INSERT INTO widget_layout (widget, position, is_visible) VALUES (?,?,?) ON CONFLICT(widget) DO UPDATE SET position = excluded.position, is_visible = excluded.is_visible', [w.widget, w.position, w.isVisible ? 1 : 0]),
};
