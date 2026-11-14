import type { AlarmDraft, AlarmType } from '../domain/types';
import { dueMs } from '../time';

const OFFSET_MS: Record<Exclude<AlarmType, 'custom'>, number> = {
  at_due: 0,
  before_15m: 15 * 60_000,
  before_1h: 60 * 60_000,
  before_1d: 24 * 60 * 60_000,
};

/** When an alarm rings (UTC ms), or null if it cannot be worked out. Exact timestamps (TM-SRS-122). */
export function triggerFor(type: AlarmType, customAt: number | undefined, dueDate: string | null, dueTime: string | null, defaultTime: string): number | null {
  if (type === 'custom') return Number.isFinite(customAt) ? (customAt as number) : null;
  if (dueDate === null) return null;
  return dueMs(dueDate, dueTime, defaultTime) - OFFSET_MS[type];
}

/** A task with a due date gets one "at due time" alarm by default (TM-SRS-120). */
export function defaultAlarms(dueDate: string | null): AlarmDraft[] {
  return dueDate === null ? [] : [{ type: 'at_due' }];
}

export const alarmKey = (type: AlarmType, triggerAt: number | undefined): string => (type === 'custom' ? `custom:${triggerAt}` : type);
