import { describe, expect, it } from 'vitest';
import { addDays, dueMs, isValidDate, isValidTime, localToMs, toLocalDate, toLocalTime, tomorrowAt } from '../src/time';

// Thu 29 Oct 2026, 18:00 UTC = Fri 30 Oct 2026, 02:00 in Manila (UTC+8)
const UTC_EVENING = Date.UTC(2026, 9, 29, 18, 0, 0);

describe('time helpers (device local time, not UTC)', () => {
  it('uses the local date: 02:00 on 30 Oct in Manila is 30 Oct, not 29 Oct', () => {
    expect(process.env.TZ).toBe('Asia/Manila');
    expect(toLocalDate(UTC_EVENING)).toBe('2026-10-30');
    expect(toLocalTime(UTC_EVENING)).toBe('02:00');
  });
  it('turns a local date and time into the right moment', () => {
    expect(localToMs('2026-10-30', '02:00')).toBe(UTC_EVENING);
  });
  it('adds days across month and year ends', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('checks dates and times', () => {
    expect(isValidDate('2026-02-29')).toBe(false);
    expect(isValidDate('2026-10-30')).toBe(true);
    expect(isValidDate('30/10/2026')).toBe(false);
    expect(isValidTime('23:59')).toBe(true);
    expect(isValidTime('24:00')).toBe(false);
  });
  it('uses the default due time when a task has no due time (TM-SRS-120)', () => {
    expect(dueMs('2026-10-30', null, '09:00')).toBe(localToMs('2026-10-30', '09:00'));
    expect(dueMs('2026-10-30', '14:30', '09:00')).toBe(localToMs('2026-10-30', '14:30'));
  });
  it('snooze until tomorrow = tomorrow at the default time', () => {
    expect(tomorrowAt(UTC_EVENING, '09:00')).toBe(localToMs('2026-10-31', '09:00'));
  });
});
