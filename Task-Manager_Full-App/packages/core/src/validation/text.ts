// TM-SRS-111: clean all typed or imported text.
export function cleanText(input: unknown): string {
  let s = typeof input === 'string' ? input : '';
  s = s.normalize('NFC');
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ''); // control characters (keep \n and \t)
  s = s.replace(/<\/?[a-zA-Z!][^>]*>/g, '');                              // HTML / script tags
  s = s.replace(/javascript\s*:/gi, '');
  return s.trim();
}
/** Single-line variant for titles, names and checklist text. */
export function cleanLine(input: unknown): string {
  return cleanText(input).replace(/\s+/g, ' ');
}
const VAGUE = new Set(['stuff', 'misc', 'things', 'thing', 'todo', 'task', 'tasks', 'work', 'homework', 'project', 'assignment', 'errand', 'errands', 'other', 'na', 'n/a', 'test', 'tbd', 'various', 'etc', 'misc stuff', 'do stuff', 'do work', 'work stuff']);
/** TM-SRS-016: warn (never block) about vague titles. */
export function isVagueTitle(title: string): boolean {
  const t = title.trim().toLowerCase().replace(/[.!?]+$/, '');
  return VAGUE.has(t);
}
