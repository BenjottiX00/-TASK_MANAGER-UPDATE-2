import { describe, expect, it } from 'vitest';
import { cleanDraft, validateCategoryName, validateTaskDraft } from '../src/validation/task';
import { cleanLine, cleanText, isVagueTitle } from '../src/validation/text';
import { draft } from '../test-utils/fakes';

const check = (over = {}) => validateTaskDraft(cleanDraft(draft(over)));

describe('task rules (SRS 010-019)', () => {
  it('accepts a good task', () => { const r = check(); expect(r.ok).toBe(true); expect(r.warnings).toHaveLength(0); });
  it('title must be 3-100 characters', () => {
    expect(check({ title: 'ab' }).errors.title).toBeTruthy();
    expect(check({ title: 'a'.repeat(101) }).errors.title).toBeTruthy();
    expect(check({ title: 'abc' }).ok).toBe(true);
    expect(check({ title: 'a'.repeat(100) }).ok).toBe(true);
  });
  it('What, Outcome and Done when are all required', () => {
    expect(check({ what: '  ' }).errors.what).toBeTruthy();
    expect(check({ outcome: '' }).errors.outcome).toBeTruthy();
    expect(check({ doneWhen: '' }).errors.doneWhen).toBeTruthy();
  });
  it('the three parts together need at least 30 characters', () => {
    const r = check({ what: 'Do it', outcome: 'Done', doneWhen: 'Seen' });
    expect(r.ok).toBe(false);
    expect(r.errors.description).toBeTruthy();
  });
  it('needs a category and at least one checklist item', () => {
    expect(check({ categoryId: null }).errors.categoryId).toBeTruthy();
    expect(check({ checklist: [] }).errors.checklist).toBeTruthy();
  });
  it('checklist: up to 50 items, each 1-200 characters', () => {
    const many = Array.from({ length: 51 }, (_, i) => ({ text: `step ${i}`, isDone: false }));
    expect(check({ checklist: many }).errors.checklist).toBeTruthy();
    expect(check({ checklist: [{ text: 'x'.repeat(201), isDone: false }] }).errors.checklist).toBeTruthy();
    expect(check({ checklist: [{ text: '   ', isDone: false }] }).errors.checklist).toBeTruthy();
  });
  it('due time needs a due date; dates must be real', () => {
    expect(check({ dueTime: '10:00' }).errors.dueTime).toBeTruthy();
    expect(check({ dueDate: '2026-02-30' }).errors.dueDate).toBeTruthy();
    expect(check({ dueDate: '2026-10-30', dueTime: '25:00' }).errors.dueTime).toBeTruthy();
  });
  it('at most 5 alarms per task (TM-SRS-121)', () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ type: 'custom' as const, customAt: 1000 + i }));
    expect(check({ dueDate: '2026-10-30', alarms: six }).errors.alarms).toBeTruthy();
    expect(check({ dueDate: '2026-10-30', alarms: six.slice(0, 5) }).ok).toBe(true);
  });
  it('a vague title is a warning, not an error (TM-SRS-016)', () => {
    const r = check({ title: 'Stuff' });
    expect(r.ok).toBe(true);
    expect(r.warnings).toHaveLength(1);
    expect(isVagueTitle('misc.')).toBe(true);
    expect(isVagueTitle('Finish lab report')).toBe(false);
  });
});

describe('cleaning text (TM-SRS-111)', () => {
  it('removes tags and control characters', () => {
    expect(cleanText('<script>alert(1)</script>Hello')).toBe('alert(1)Hello');
    expect(cleanText('a\u0000b\u0007c')).toBe('abc');
    expect(cleanLine('  two   spaces \n here ')).toBe('two spaces here');
    expect(cleanText('javascript:alert(1)')).toBe('alert(1)');
  });
  it('keeps normal comparisons', () => { expect(cleanText('5 < 6 and 7 > 3')).toBe('5 < 6 and 7 > 3'); });
});

describe('category names (TM-SRS-031)', () => {
  it('1-30 characters and unique, ignoring capital letters', () => {
    expect(validateCategoryName('', [])).toBeTruthy();
    expect(validateCategoryName('x'.repeat(31), [])).toBeTruthy();
    expect(validateCategoryName('study', ['Work', 'Study'])).toBeTruthy();
    expect(validateCategoryName('Gym', ['Work', 'Study'])).toBeNull();
  });
});
