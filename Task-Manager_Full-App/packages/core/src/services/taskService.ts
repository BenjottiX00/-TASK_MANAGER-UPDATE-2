import { MAX_CHECKLIST_ITEMS } from '../domain/constants';
import type { AlarmDraft, Status, Task, TaskDraft, ValidationResult } from '../domain/types';
import * as repo from '../data/repos';
import { defaultAlarms } from '../alarms/planner';
import type { AlarmService } from '../alarms/alarmService';
import { cleanDraft, validateTaskDraft } from '../validation/task';
import { cleanLine } from '../validation/text';
import type { Ctx } from './context';
import { readSettings } from './settings';

export type SaveResult = { ok: true; id: number; warnings: string[] } | ({ ok: false } & Pick<ValidationResult, 'errors' | 'warnings'>) | { ok: false; errors: {}; warnings: string[]; error: string };
export type StatusResult = { ok: true } | { ok: false; needsDecision: true; unchecked: number } | { ok: false; error: string };

export class TaskService {
  constructor(private ctx: Ctx, private alarms: AlarmService) {}

  private async after(): Promise<void> { await this.alarms.scheduleOs(); this.ctx.bus.emit({ type: 'data' }); }

  async create(input: TaskDraft): Promise<SaveResult> {
    const draft = cleanDraft(input);
    const v = validateTaskDraft(draft);
    if (!v.ok) return { ok: false, errors: v.errors, warnings: v.warnings };
    const now = this.ctx.clock.now();
    try {
      const id = await this.ctx.sql.transaction(async (tx) => {
        const s = await readSettings(tx);
        if (!(await repo.categories.get(tx, draft.categoryId as number))) throw new Error('That category no longer exists.');
        const id = await repo.tasks.insert(tx, { categoryId: draft.categoryId as number, title: draft.title, what: draft.what, outcome: draft.outcome, doneWhen: draft.doneWhen, priority: draft.priority, status: draft.status, dueDate: draft.dueDate, dueTime: draft.dueTime, createdAt: now, modifiedAt: now });
        for (const [i, c] of draft.checklist.entries()) await repo.items.insert(tx, id, i + 1, c.text, c.isDone);
        const task = (await repo.tasks.get(tx, id)) as Task;
        await this.alarms.replaceForTask(tx, task, (draft.alarms as AlarmDraft[] | undefined) ?? defaultAlarms(draft.dueDate), now, s.defaultDueTime);
        if (draft.status === 'Done') await repo.alarms.cancelForTask(tx, id);
        return id;
      });
      await this.after();
      return { ok: true, id, warnings: v.warnings };
    } catch (e) { return { ok: false, errors: {}, warnings: [], error: (e as Error).message }; }
  }

  async update(id: number, input: TaskDraft): Promise<SaveResult> {
    const draft = cleanDraft(input);
    const v = validateTaskDraft(draft);
    if (!v.ok) return { ok: false, errors: v.errors, warnings: v.warnings };
    const now = this.ctx.clock.now();
    try {
      await this.ctx.sql.transaction(async (tx) => {
        const old = await repo.tasks.get(tx, id);
        if (!old) throw new Error('This task no longer exists.');
        if (!(await repo.categories.get(tx, draft.categoryId as number))) throw new Error('That category no longer exists.');
        const s = await readSettings(tx);
        const task: Task = { ...old, categoryId: draft.categoryId as number, title: draft.title, what: draft.what, outcome: draft.outcome, doneWhen: draft.doneWhen, priority: draft.priority, status: draft.status, dueDate: draft.dueDate, dueTime: draft.dueTime, modifiedAt: now };
        await repo.tasks.update(tx, task);
        // checklist: keep ids that stay, update them, add new ones, delete removed ones
        const current = await repo.items.forTask(tx, id);
        const keepIds = new Set(draft.checklist.filter((c) => c.id !== undefined).map((c) => c.id as number));
        for (const it of current) if (!keepIds.has(it.id)) await repo.items.delete(tx, it.id);
        for (const [i, c] of draft.checklist.entries()) {
          if (c.id !== undefined && current.some((x) => x.id === c.id)) await repo.items.update(tx, c.id, i + 1, c.text, c.isDone);
          else await repo.items.insert(tx, id, i + 1, c.text, c.isDone);
        }
        const drafts = (draft.alarms as AlarmDraft[] | undefined) ?? (await repo.alarms.forTask(tx, id)).map((a): AlarmDraft => (a.type === 'custom' ? { type: 'custom', customAt: a.triggerAt } : { type: a.type }));
        await this.alarms.replaceForTask(tx, task, drafts, now, s.defaultDueTime);
        if (task.status === 'Done') await repo.alarms.cancelForTask(tx, id);
        else if (old.status === 'Done') await this.alarms.recomputeRelative(tx, task, now, s.defaultDueTime, true);
      });
      await this.after();
      return { ok: true, id, warnings: v.warnings };
    } catch (e) { return { ok: false, errors: {}, warnings: [], error: (e as Error).message }; }
  }

  /** TM-SRS-019: delete. Steps and alarms go with it (foreign keys, ON DELETE CASCADE). */
  async delete(id: number): Promise<void> { await this.ctx.sql.transaction((tx) => repo.tasks.delete(tx, id)); await this.after(); }

  /** TM-SRS-026: setting Done with unchecked steps needs a decision: 'tick' all steps or 'keep' them. */
  async setStatus(id: number, status: Status, unchecked?: 'tick' | 'keep'): Promise<StatusResult> {
    const now = this.ctx.clock.now();
    const res = await this.ctx.sql.transaction(async (tx): Promise<StatusResult> => {
      const old = await repo.tasks.get(tx, id);
      if (!old) return { ok: false, error: 'This task no longer exists.' };
      const its = await repo.items.forTask(tx, id);
      const open = its.filter((i) => !i.isDone).length;
      if (status === 'Done' && old.status !== 'Done' && open > 0 && unchecked === undefined) return { ok: false, needsDecision: true, unchecked: open };
      if (status === 'Done' && unchecked === 'tick') await repo.items.setAllDone(tx, id, true);
      await repo.tasks.setStatus(tx, id, status, now);
      const s = await readSettings(tx);
      const task = (await repo.tasks.get(tx, id)) as Task;
      if (status === 'Done') await repo.alarms.cancelForTask(tx, id);              // TM-SRS-127
      else if (old.status === 'Done') await this.alarms.recomputeRelative(tx, task, now, s.defaultDueTime, true);
      return { ok: true };
    });
    if (res.ok) await this.after();
    return res;
  }
  /** Used by the notification's Mark Done button: no screen to ask, so steps are kept as they are. */
  async markDoneKeepingSteps(id: number): Promise<void> { await this.setStatus(id, 'Done', 'keep'); }

  // ---------- checklist (TM-SRS-020 to 027) ----------
  /** Ticking the last open step returns allDone = true so the screen can offer "Mark task Done". */
  async setItemDone(itemId: number, done: boolean): Promise<{ allDone: boolean; taskId: number } | null> {
    const res = await this.ctx.sql.transaction(async (tx) => {
      const it = await repo.items.get(tx, itemId);
      if (!it) return null;
      await repo.items.setDone(tx, itemId, done);
      const all = await repo.items.forTask(tx, it.taskId);
      const task = await repo.tasks.get(tx, it.taskId);
      return { allDone: all.length > 0 && all.every((x) => x.isDone) && task?.status !== 'Done', taskId: it.taskId };
    });
    await this.after();
    return res;
  }
  async addItem(taskId: number, text: string): Promise<{ ok: boolean; error?: string }> {
    const t = cleanLine(text);
    if (t.length < 1 || t.length > 200) return { ok: false, error: 'An item must be 1-200 characters.' };
    const res = await this.ctx.sql.transaction(async (tx) => {
      const its = await repo.items.forTask(tx, taskId);
      if (its.length >= MAX_CHECKLIST_ITEMS) return { ok: false, error: `A task can have at most ${MAX_CHECKLIST_ITEMS} items.` };
      await repo.items.insert(tx, taskId, its.length + 1, t, false);
      return { ok: true };
    });
    if (res.ok) await this.after();
    return res;
  }
  async renameItem(itemId: number, text: string): Promise<{ ok: boolean; error?: string }> {
    const t = cleanLine(text);
    if (t.length < 1 || t.length > 200) return { ok: false, error: 'An item must be 1-200 characters.' };
    await this.ctx.sql.transaction(async (tx) => { const it = await repo.items.get(tx, itemId); if (it) await repo.items.update(tx, itemId, it.position, t, it.isDone); });
    await this.after();
    return { ok: true };
  }
  /** TM-SRS-027: the last item cannot be deleted. */
  async deleteItem(itemId: number): Promise<{ ok: boolean; error?: string }> {
    const res = await this.ctx.sql.transaction(async (tx) => {
      const it = await repo.items.get(tx, itemId);
      if (!it) return { ok: true };
      const all = await repo.items.forTask(tx, it.taskId);
      if (all.length <= 1) return { ok: false, error: 'A task must keep at least one checklist item.' };
      await repo.items.delete(tx, itemId);
      for (const [i, x] of (await repo.items.forTask(tx, it.taskId)).entries()) await repo.items.update(tx, x.id, i + 1, x.text, x.isDone);
      return { ok: true };
    });
    if (res.ok) await this.after();
    return res;
  }
  async moveItem(itemId: number, direction: -1 | 1): Promise<void> {
    await this.ctx.sql.transaction(async (tx) => {
      const it = await repo.items.get(tx, itemId);
      if (!it) return;
      const all = await repo.items.forTask(tx, it.taskId);
      const i = all.findIndex((x) => x.id === itemId);
      const j = i + direction;
      if (i < 0 || j < 0 || j >= all.length) return;
      const reordered = [...all]; [reordered[i], reordered[j]] = [reordered[j]!, reordered[i]!];
      for (const [k, x] of reordered.entries()) await repo.items.update(tx, x.id, k + 1, x.text, x.isDone);
    });
    await this.after();
  }
}
