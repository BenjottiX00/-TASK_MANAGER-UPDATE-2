// Test-only SQLite driver built on Node's own SQLite (Node 22.5 or newer).
// It lets the tests run the REAL SQL of the app without a phone.
import { DatabaseSync } from 'node:sqlite';
import type { SqlDriver, SqlTx } from '../src/ports';

export class NodeSqliteDriver implements SqlDriver {
  private db!: DatabaseSync;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private path: string = ':memory:') {}
  async open(): Promise<void> { this.db = new DatabaseSync(this.path); this.db.exec('PRAGMA foreign_keys = ON'); }
  async run(sql: string, params: unknown[] = []): Promise<{ changes: number; lastId: number }> {
    const r = this.db.prepare(sql).run(...(params as never[]));
    return { changes: Number(r.changes), lastId: Number(r.lastInsertRowid) };
  }
  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> { return this.db.prepare(sql).all(...(params as never[])) as T[]; }
  transaction<T>(fn: (tx: SqlTx) => Promise<T>): Promise<T> {
    const job = async (): Promise<T> => {
      this.db.exec('BEGIN');
      try { const r = await fn(this); this.db.exec('COMMIT'); return r; }
      catch (e) { this.db.exec('ROLLBACK'); throw e; }
    };
    const p = this.queue.then(job, job);
    this.queue = p.catch(() => undefined);
    return p;
  }
  async integrityCheck(): Promise<boolean> {
    try { const r = await this.all<Record<string, string>>('PRAGMA integrity_check'); return r.length === 1 && Object.values(r[0]!)[0] === 'ok'; } catch { return false; }
  }
  async quarantine(): Promise<void> { this.db.close(); this.path = this.path === ':memory:' ? ':memory:' : `${this.path}.recovered`; await this.open(); }
  close(): void { this.db.close(); }
}
