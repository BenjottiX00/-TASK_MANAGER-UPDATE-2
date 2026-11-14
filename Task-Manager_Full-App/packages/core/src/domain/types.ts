export type Priority = 'High' | 'Medium' | 'Low';
export type Status = 'To Do' | 'In Progress' | 'Done';
export type AlarmType = 'at_due' | 'before_15m' | 'before_1h' | 'before_1d' | 'custom';
export type AlarmState = 'pending' | 'fired' | 'snoozed' | 'dismissed';
export type SnoozeOption = '5m' | '15m' | '1h' | 'tomorrow';
export type WidgetId = 'today' | 'overdue' | 'upcoming' | 'category_progress';
export type NotificationKind = 'alarm' | 'missed';

export interface Category { id: number; name: string; color: string; }

export interface Task {
  id: number;
  categoryId: number;
  title: string;
  what: string;
  outcome: string;
  doneWhen: string;
  priority: Priority;
  status: Status;
  dueDate: string | null; // 'YYYY-MM-DD' (device local date)
  dueTime: string | null; // 'HH:MM' (device local time)
  createdAt: number;      // UTC epoch ms
  modifiedAt: number;
}

export interface ChecklistItem { id: number; taskId: number; position: number; text: string; isDone: boolean; }

export interface Alarm {
  id: number;
  taskId: number;
  type: AlarmType;
  triggerAt: number;       // UTC epoch ms
  state: AlarmState;
  snoozeUntil: number | null;
}

export interface NotificationRecord {
  id: number;
  alarmId: number | null;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: number;
  isRead: boolean;
}

export interface AppSettings { notificationsEnabled: boolean; soundEnabled: boolean; defaultDueTime: string; }
export interface WidgetLayoutItem { widget: WidgetId; position: number; isVisible: boolean; }

export interface AlarmDraft { type: AlarmType; customAt?: number; }
export interface ChecklistDraft { id?: number; text: string; isDone: boolean; }
export interface TaskDraft {
  title: string;
  what: string;
  outcome: string;
  doneWhen: string;
  categoryId: number | null;
  priority: Priority;
  status: Status;
  dueDate: string | null;
  dueTime: string | null;
  checklist: ChecklistDraft[];
  /** undefined = "default": one at-due alarm when there is a due date. */
  alarms?: AlarmDraft[];
}

export type FieldErrors = Partial<Record<'title' | 'what' | 'outcome' | 'doneWhen' | 'description' | 'categoryId' | 'checklist' | 'dueDate' | 'dueTime' | 'alarms', string>>;
export interface ValidationResult { ok: boolean; errors: FieldErrors; warnings: string[]; }

export interface TaskListItem {
  task: Task;
  categoryName: string;
  categoryColor: string;
  itemsDone: number;
  itemsTotal: number;
  percent: number;
  firstUnchecked: string | null;
  firstUncheckedId: number | null;
  overdue: boolean;
}

export type TaskSort = 'due' | 'priority' | 'category' | 'status';
export interface TaskFilter {
  view?: 'today' | 'overdue' | 'all' | 'category';
  categoryId?: number;
  search?: string;
  status?: Status;
  priority?: Priority;
  dueFrom?: string;
  dueTo?: string;
  sort?: TaskSort;
}

export interface MissedAlarm { alarmId: number; taskId: number; title: string; scheduledAt: number; taskStatus: Status; }
