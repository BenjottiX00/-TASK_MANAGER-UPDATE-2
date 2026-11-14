import type { TaskListItem } from '../domain/types';

/** TM-SRS-131: title, category, due date and time, progress and the first unchecked step. */
export function buildMessage(card: TaskListItem, defaultTime: string): { title: string; body: string } {
  const t = card.task;
  const due = t.dueDate ? `Due ${t.dueDate} ${t.dueTime ?? defaultTime}` : 'No due date';
  const lines = [`${card.categoryName} · ${due}`, `Progress: ${card.itemsDone}/${card.itemsTotal} done`];
  if (card.firstUnchecked) lines.push(`Next step: ${card.firstUnchecked}`);
  return { title: t.title, body: lines.join('\n') };
}
