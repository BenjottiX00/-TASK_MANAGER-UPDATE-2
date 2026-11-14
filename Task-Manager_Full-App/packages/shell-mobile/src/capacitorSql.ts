import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { SqlDriver, SqlTx } from '@tm/core';

const BASE_NAME = 'taskmanager';
const NAME_KEY = 'tm.dbname';

/** SQLite on the phone (LLD section 5). One connection; transactions are queued one at a time. */
export class CapacitorSqlDriver implements SqlDriver {
  private sqlite = new SQLiteConnection(CapacitorSQLite);
  private db: SQLiteDBConnection | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private name = localStorage.getItem(NAME_KEY) ?? BASE_NAME;

  async open(): Promise<void> {
    const consistent = (await this.sqlite.checkConnectionsConsistency()).result;
    const exists = (await this.sqlite.isConnection(this.name, false)).result;
    this.db = consistent && exists
      ? await this.sqlite.retrieveConnection(this.name, false)
      : await this.sqlite.createConnection(this.name, false, 'no-encryption', 1, false);
    await this.db.open();
    await this.db.execute('PRAGMA foreign_keys = ON;', false);
  }
  private get conn(): SQLiteDBConnection { if (!this.db) throw new Error('Database is not open.'); return this.db; }

  async run(sql: string, params: unknown[] = []): Promise<{ changes: number; lastId: number }> {
    // The plugin's run() is for INSERT/UPDATE/DELETE. Table changes and PRAGMA go through execute().
    if (/^\s*(CREATE|DROP|ALTER|PRAGMA)\b/i.test(sql)) { await this.conn.execute(sql, false); return { changes: 0, lastId: 0 }; }
    const r = await this.conn.run(sql, params as never[], false);
    return { changes: r.changes?.changes ?? 0, lastId: r.changes?.lastId ?? 0 };
  }
  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return ((await this.conn.query(sql, params as never[])).values ?? []) as T[];
  }
  transaction<T>(fn: (tx: SqlTx) => Promise<T>): Promise<T> {
    const job = async (): Promise<T> => {
      await this.conn.beginTransaction();
      try { const r = await fn(this); await this.conn.commitTransaction(); return r; }
      catch (e) { await this.conn.rollbackTransaction(); throw e; }
    };
    const p = this.queue.then(job, job);
    this.queue = p.catch(() => undefined);
    return p;
  }
  async integrityCheck(): Promise<boolean> {
    try { const r = await this.all<Record<string, string>>('PRAGMA integrity_check'); return r.length === 1 && Object.values(r[0] ?? {})[0] === 'ok'; } catch { return false; }
  }
  /** TM-SRS-112: the damaged file is NOT deleted. A new database with another name is used from now on. */
  async quarantine(): Promise<void> {
    try { await this.sqlite.closeConnection(this.name, false); } catch { /* already closed */ }
    this.name = `${BASE_NAME}-recovered-${Date.now()}`;
    localStorage.setItem(NAME_KEY, this.name);
    this.db = null;
    await this.open();
  }
}
