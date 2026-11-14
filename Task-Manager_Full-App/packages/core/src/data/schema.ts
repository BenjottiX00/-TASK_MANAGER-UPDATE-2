// SQLite schema, version 1 (LLD section 4, SRS v1.4: 7 tables).
// Dates are stored as local 'YYYY-MM-DD' / 'HH:MM' text; moments are UTC epoch ms.
export const SCHEMA_V1: string[] = [
  `CREATE TABLE IF NOT EXISTS category (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(name) BETWEEN 1 AND 30),
     color TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS task (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     category_id INTEGER NOT NULL REFERENCES category(id) ON DELETE RESTRICT,
     title TEXT NOT NULL CHECK (length(title) BETWEEN 3 AND 100),
     what TEXT NOT NULL,
     outcome TEXT NOT NULL,
     done_when TEXT NOT NULL,
     priority TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('High','Medium','Low')),
     status TEXT NOT NULL DEFAULT 'To Do' CHECK (status IN ('To Do','In Progress','Done')),
     due_date TEXT,
     due_time TEXT,
     created_at INTEGER NOT NULL,
     modified_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS checklist_item (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     task_id INTEGER NOT NULL REFERENCES task(id) ON DELETE CASCADE,
     position INTEGER NOT NULL,
     text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 200),
     is_done INTEGER NOT NULL DEFAULT 0 CHECK (is_done IN (0,1))
   )`,
  `CREATE TABLE IF NOT EXISTS alarm (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     task_id INTEGER NOT NULL REFERENCES task(id) ON DELETE CASCADE,
     type TEXT NOT NULL CHECK (type IN ('at_due','before_15m','before_1h','before_1d','custom')),
     trigger_at INTEGER NOT NULL,
     state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','fired','snoozed','dismissed')),
     snooze_until INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS notification (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     alarm_id INTEGER REFERENCES alarm(id) ON DELETE SET NULL,
     kind TEXT NOT NULL CHECK (kind IN ('alarm','missed')),
     title TEXT NOT NULL,
     body TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0,1))
   )`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS widget_layout (
     widget TEXT PRIMARY KEY CHECK (widget IN ('today','overdue','upcoming','category_progress')),
     position INTEGER NOT NULL,
     is_visible INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0,1))
   )`,
  `CREATE INDEX IF NOT EXISTS idx_task_due ON task(due_date)`,
  `CREATE INDEX IF NOT EXISTS idx_task_category ON task(category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_item_task ON checklist_item(task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_alarm_task ON alarm(task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_alarm_trigger ON alarm(trigger_at)`,
];
export const TABLES_IN_DELETE_ORDER = ['notification', 'alarm', 'checklist_item', 'task', 'category', 'settings', 'widget_layout'] as const;
