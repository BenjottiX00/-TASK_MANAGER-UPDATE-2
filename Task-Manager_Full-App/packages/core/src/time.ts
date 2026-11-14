// Date helpers. All "local" values use the DEVICE time zone (never UTC) so that
// "Today" and "Overdue" are right in Cebu from 00:00 to 08:00 too.

export const pad = (n: number): string => String(n).padStart(2, '0');

export function toLocalDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function toLocalTime(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function isValidDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}
export function isValidTime(s: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  return !!m && Number(m[1]) <= 23 && Number(m[2]) <= 59;
}
/** Local date + time -> UTC epoch ms. */
export function localToMs(date: string, time: string): number {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const [h, mi] = time.split(':').map(Number) as [number, number];
  return new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
}
export function addDays(date: string, n: number): string {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  return toLocalDate(new Date(y, mo - 1, d + n, 12, 0, 0, 0).getTime());
}
/** Due moment of a task. No due time = the default due time (TM-SRS-120). */
export function dueMs(dueDate: string, dueTime: string | null, defaultTime: string): number {
  return localToMs(dueDate, dueTime ?? defaultTime);
}
/** Tomorrow at `time` (used by "Snooze until tomorrow"). */
export function tomorrowAt(nowMs: number, time: string): number {
  return localToMs(addDays(toLocalDate(nowMs), 1), time);
}
export function formatDay(date: string): string {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, mo - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
