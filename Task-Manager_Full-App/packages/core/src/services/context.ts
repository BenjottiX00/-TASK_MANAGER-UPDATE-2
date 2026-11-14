import type { Clock, OsNotifier, OsScheduler, SqlDriver } from '../ports';
import type { EventBus } from '../bus/events';

export interface Deps { sql: SqlDriver; clock: Clock; scheduler: OsScheduler; notifier: OsNotifier; }
export interface Ctx extends Deps { bus: EventBus; }
export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
