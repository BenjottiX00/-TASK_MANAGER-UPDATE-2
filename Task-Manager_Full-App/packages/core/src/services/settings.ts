import { DEFAULT_DUE_TIME } from '../domain/constants';
import type { AppSettings, WidgetId, WidgetLayoutItem } from '../domain/types';
import * as repo from '../data/repos';
import type { SqlTx } from '../ports';
import { isValidTime } from '../time';

export const WIDGET_IDS: WidgetId[] = ['today', 'overdue', 'upcoming', 'category_progress'];
export const DEFAULT_SETTINGS: AppSettings = { notificationsEnabled: true, soundEnabled: true, defaultDueTime: DEFAULT_DUE_TIME };

export async function readSettings(tx: SqlTx): Promise<AppSettings> {
  const raw = await repo.settings.all(tx);
  return {
    notificationsEnabled: (raw.notificationsEnabled ?? 'true') === 'true',
    soundEnabled: (raw.soundEnabled ?? 'true') === 'true',
    defaultDueTime: raw.defaultDueTime && isValidTime(raw.defaultDueTime) ? raw.defaultDueTime : DEFAULT_DUE_TIME,
  };
}
export async function writeSettings(tx: SqlTx, s: AppSettings): Promise<void> {
  await repo.settings.set(tx, 'notificationsEnabled', String(s.notificationsEnabled));
  await repo.settings.set(tx, 'soundEnabled', String(s.soundEnabled));
  await repo.settings.set(tx, 'defaultDueTime', s.defaultDueTime);
}
export async function readLayout(tx: SqlTx): Promise<WidgetLayoutItem[]> {
  const saved = await repo.widgets.list(tx);
  const seen = new Set(saved.map((w) => w.widget));
  const missing = WIDGET_IDS.filter((w) => !seen.has(w)).map((widget, i): WidgetLayoutItem => ({ widget, position: saved.length + i, isVisible: true }));
  return [...saved, ...missing].sort((a, b) => a.position - b.position);
}
export async function writeLayout(tx: SqlTx, layout: WidgetLayoutItem[]): Promise<void> {
  const ordered = [...layout].sort((a, b) => a.position - b.position);
  for (const [i, w] of ordered.entries()) await repo.widgets.set(tx, { ...w, position: i });
}
