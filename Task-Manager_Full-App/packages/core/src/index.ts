// Public API of the core package. The UI imports only from here.
export * from './domain/constants';
export * from './domain/types';
export * from './ports';
export * from './time';
export { createCore, TaskManagerCore } from './core';
export type { InitResult } from './core';
export type { Result } from './services/context';
export type { SaveResult, StatusResult } from './services/taskService';
export type { CategoryResult } from './services/categoryService';
export type { DashboardData } from './services/dashboard';
export type { CoreEvent } from './bus/events';
export { isOverdue } from './services/queries';
export { isVagueTitle, cleanLine, cleanText } from './validation/text';
export { validateTaskDraft, cleanDraft } from './validation/task';
export { triggerFor, defaultAlarms } from './alarms/planner';
export { parseImport } from './services/backup';
