import { CATEGORY_COLORS } from '../domain/constants';
import type { Category } from '../domain/types';
import * as repo from '../data/repos';
import { cleanLine } from '../validation/text';
import { validateCategoryName } from '../validation/task';
import type { Ctx } from './context';

export type CategoryResult = { ok: true; id?: number } | { ok: false; error: string } | { ok: false; needsMove: true; taskCount: number };

export class CategoryService {
  constructor(private ctx: Ctx) {}
  list(): Promise<Category[]> { return this.ctx.sql.transaction((tx) => repo.categories.list(tx)); }

  async create(nameIn: string, color: string = CATEGORY_COLORS[0]): Promise<CategoryResult> {
    const name = cleanLine(nameIn);
    return this.ctx.sql.transaction(async (tx): Promise<CategoryResult> => {
      const err = validateCategoryName(name, (await repo.categories.list(tx)).map((c) => c.name));
      if (err) return { ok: false, error: err };
      const id = await repo.categories.insert(tx, name, color);
      this.ctx.bus.emit({ type: 'data' });
      return { ok: true, id };
    });
  }
  async update(id: number, nameIn: string, color: string): Promise<CategoryResult> {
    const name = cleanLine(nameIn);
    return this.ctx.sql.transaction(async (tx): Promise<CategoryResult> => {
      const others = (await repo.categories.list(tx)).filter((c) => c.id !== id).map((c) => c.name);
      const err = validateCategoryName(name, others);
      if (err) return { ok: false, error: err };
      await repo.categories.update(tx, id, name, color);
      this.ctx.bus.emit({ type: 'data' });
      return { ok: true, id };
    });
  }
  /** TM-SRS-033: a category that has tasks needs a new category for them first. */
  async delete(id: number, moveTo?: number): Promise<CategoryResult> {
    const res = await this.ctx.sql.transaction(async (tx): Promise<CategoryResult> => {
      const all = await repo.categories.list(tx);
      if (all.length <= 1) return { ok: false, error: 'At least one category must remain.' };
      const n = await repo.categories.countTasks(tx, id);
      if (n > 0) {
        if (moveTo === undefined) return { ok: false, needsMove: true, taskCount: n };
        if (moveTo === id || !all.some((c) => c.id === moveTo)) return { ok: false, error: 'Choose a different category for the tasks.' };
        await repo.categories.moveTasks(tx, id, moveTo);
      }
      await repo.categories.delete(tx, id);
      return { ok: true };
    });
    if (res.ok) this.ctx.bus.emit({ type: 'data' });
    return res;
  }
}
