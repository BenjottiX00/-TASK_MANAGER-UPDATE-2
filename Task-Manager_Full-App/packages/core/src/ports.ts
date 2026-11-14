// Ports: the only way the core talks to the outside world (LLD section 3).
// The core never imports Capacitor, SQLite plugins, or the DOM.
// SRS v1.4: Android only; no desktop adapter, no summary/overdue notifications.

export interface Clock { now(): number; } // UTC epoch ms

export interface SqlTx {
  run(sql: string, params?: unknown[]): Promise<{ changes: number; lastId: number }>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface SqlDriver extends SqlTx {
  open(): Promise<void>;
  /** Commit all changes together, or roll back all of them (TM-SRS-060, 112). Calls are queued, one at a time. */
  transaction<T>(fn: (tx: SqlTx) => Promise<T>): Promise<T>;
  integrityCheck(): Promise<boolean>;
  /** Corrupted file: leave it untouched (never delete, TM-SRS-112) and open a fresh empty database. */
  quarantine(): Promise<void>;
}

export interface ScheduledItem {
  osId: number;                 // stable integer id = alarm id
  fireAt: number;               // epoch ms
  title: string;
  body: string;
  payload: { taskId: number; alarmId: number };
  actions: Array<'snooze' | 'done'>;
  sound: boolean;
}

export interface OsScheduler {
  /** Idempotent: cancel everything, then schedule exactly these items. */
  replaceAll(items: ScheduledItem[]): Promise<void>;
  capacity(): number;
  /** Notification button or tap. Called after the app has started. */
  onAction(cb: (a: { alarmId: number; action: 'snooze' | 'done' | 'open' }) => void): void;
}

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';
export interface OsNotifier {
  permission(): Promise<PermissionState>;
  requestPermission(): Promise<PermissionState>;
}

/** Save a text file for the user (CSV or JSON export). */
export interface FileService { saveText(filename: string, mime: string, text: string): Promise<void>; }
export interface ExactAlarmSetting { status(): Promise<'granted' | 'denied' | 'unsupported'>; open(): Promise<void>; }

/** Everything a device (Android phone, or a web browser while developing) must provide. */
export interface Platform {
  kind: 'android' | 'web';
  sql: SqlDriver;
  clock: Clock;
  scheduler: OsScheduler;
  notifier: OsNotifier;
  files: FileService;
  exactAlarms: ExactAlarmSetting;
}
