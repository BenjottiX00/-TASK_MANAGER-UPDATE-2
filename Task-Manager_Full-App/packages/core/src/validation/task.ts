import {
  CATEGORY_NAME_MAX, CATEGORY_NAME_MIN, CHECKLIST_TEXT_MAX, CHECKLIST_TEXT_MIN, DESCRIPTION_MIN_TOTAL,
  MAX_ALARMS_PER_TASK, MAX_CHECKLIST_ITEMS, TITLE_MAX, TITLE_MIN,
} from '../domain/constants';
import type { FieldErrors, TaskDraft, ValidationResult } from '../domain/types';
import { isValidDate, isValidTime } from '../time';
import { cleanLine, cleanText, isVagueTitle } from './text';

const PRIORITIES = ['High', 'Medium', 'Low'];
const STATUSES = ['To Do', 'In Progress', 'Done'];

/** Returns a cleaned copy of the draft (text cleaned, trimmed). */
export function cleanDraft(d: TaskDraft): TaskDraft {
  return {
    ...d,
    title: cleanLine(d.title),
    what: cleanText(d.what),
    outcome: cleanText(d.outcome),
    doneWhen: cleanText(d.doneWhen),
    checklist: d.checklist.map((c) => ({ ...c, text: cleanLine(c.text) })),
  };
}

/** TM-SRS-010 to 019. Pass an already cleaned draft (see cleanDraft). */
export function validateTaskDraft(d: TaskDraft): ValidationResult {
  const errors: FieldErrors = {};
  const warnings: string[] = [];

  if (d.title.length < TITLE_MIN || d.title.length > TITLE_MAX) errors.title = `Title must be ${TITLE_MIN}-${TITLE_MAX} characters.`;
  if (!d.what) errors.what = 'Write what you will do.';
  if (!d.outcome) errors.outcome = 'Write the outcome you want.';
  if (!d.doneWhen) errors.doneWhen = 'Write how you will know it is done.';
  const total = d.what.length + d.outcome.length + d.doneWhen.length;
  if (d.what && d.outcome && d.doneWhen && total < DESCRIPTION_MIN_TOTAL) {
    errors.description = `What, Outcome and Done when need at least ${DESCRIPTION_MIN_TOTAL} characters together (now ${total}).`;
  }
  if (d.categoryId === null || d.categoryId === undefined) errors.categoryId = 'Choose a category.';

  if (d.checklist.length < 1) errors.checklist = 'Add at least one checklist item.';
  else if (d.checklist.length > MAX_CHECKLIST_ITEMS) errors.checklist = `A task can have at most ${MAX_CHECKLIST_ITEMS} checklist items.`;
  else if (d.checklist.some((c) => c.text.length < CHECKLIST_TEXT_MIN || c.text.length > CHECKLIST_TEXT_MAX)) {
    errors.checklist = `Each checklist item must be ${CHECKLIST_TEXT_MIN}-${CHECKLIST_TEXT_MAX} characters.`;
  }

  if (d.dueDate !== null && !isValidDate(d.dueDate)) errors.dueDate = 'Use a real date.';
  if (d.dueTime !== null) {
    if (d.dueDate === null) errors.dueTime = 'Add a due date before a due time.';
    else if (!isValidTime(d.dueTime)) errors.dueTime = 'Use a time like 14:30.';
  }
  if (!PRIORITIES.includes(d.priority)) errors.title ??= 'Priority is not valid.';
  if (!STATUSES.includes(d.status)) errors.title ??= 'Status is not valid.';

  const alarms = d.alarms ?? [];
  if (alarms.length > MAX_ALARMS_PER_TASK) errors.alarms = `A task can have at most ${MAX_ALARMS_PER_TASK} alarms.`;
  else if (alarms.length > 0 && d.dueDate === null && alarms.some((a) => a.type !== 'custom')) errors.alarms = 'Alarms that depend on the due time need a due date.';
  else if (alarms.some((a) => a.type === 'custom' && !Number.isFinite(a.customAt))) errors.alarms = 'Pick a date and time for the custom alarm.';

  if (isVagueTitle(d.title) && !errors.title) warnings.push('This title is vague. A specific title helps you finish the task.');
  return { ok: Object.keys(errors).length === 0, errors, warnings };
}

/** TM-SRS-031. Existing names are compared without caring about capital letters. */
export function validateCategoryName(name: string, existing: string[]): string | null {
  if (name.length < CATEGORY_NAME_MIN || name.length > CATEGORY_NAME_MAX) return `Name must be ${CATEGORY_NAME_MIN}-${CATEGORY_NAME_MAX} characters.`;
  if (existing.some((n) => n.toLowerCase() === name.toLowerCase())) return 'A category with this name already exists.';
  return null;
}
