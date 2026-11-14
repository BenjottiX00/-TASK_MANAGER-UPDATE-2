// SQLite for the BROWSER (development in Codespaces). The Android app uses the real SQLite plugin instead.
import initSqlJs, { type Database } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type { SqlDriver, SqlTx } from '@tm/core';

const KEY = 'tm.web.db';
const toB64 = (u: Uint8Array): string => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (b: string): Uint8Array => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));

export class SqlJsDriver implements SqlDriver {
  private db: Database | null = null;
  private SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  async open(): Promise<void> {
    this.SQL ??= await initSqlJs({ locateFile: () => wasmUrl });
    const saved = localStorage.getItem(KEY);
    this.db = saved ? new this.SQL.Database(fromB64(saved)) : new this.SQL.Database();
    this.db.run('PRAGMA foreign_keys = ON');
  }
  private get conn(): Database { if (!this.db) throw new Error('Database is not open.'); return this.db; }
  private save(): void {
    localStorage.setItem(KEY, toB64(this.conn.export()));
    this.conn.run('PRAGMA foreign_keys = ON');   // export() resets this setting
  }
  async run(sql: string, params: unknown[] = []): Promise<{ changes: number; lastId: number }> {
    this.conn.run(sql, params as never[]);
    const changes = this.conn.getRowsModified();
    const id = this.conn.exec('SELECT last_insert_rowid() AS id')[0]?.values[0]?.[0];
    return { changes, lastId: Number(id ?? 0) };
  }
  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const st = this.conn.prepare(sql);
    try { st.bind(params as never[]); const rows: T[] = []; while (st.step()) rows.push(st.getAsObject() as T); return rows; } finally { st.free(); }
  }
  transaction<T>(fn: (tx: SqlTx) => Promise<T>): Promise<T> {
    const job = async (): Promise<T> => {
      this.conn.run('BEGIN');
      try { const r = await fn(this); this.conn.run('COMMIT'); this.save(); return r; }
      catch (e) { this.conn.run('ROLLBACK'); throw e; }
    };
    const p = this.queue.then(job, job);
    this.queue = p.catch(() => undefined);
    return p;
  }
  async integrityCheck(): Promise<boolean> {
    try { const r = await this.all<Record<string, string>>('PRAGMA integrity_check'); return r.length === 1 && Object.values(r[0] ?? {})[0] === 'ok'; } catch { return false; }
  }
  async quarantine(): Promise<void> {
    const old = localStorage.getItem(KEY);
    if (old) localStorage.setItem(`${KEY}.damaged-${Date.now()}`, old);   // keep the damaged copy
    localStorage.removeItem(KEY);
    await this.open();
  }
}
