import type { Platform } from '@tm/core';
import { CapacitorSqlDriver } from './capacitorSql';
import { CapacitorScheduler, capacitorExactAlarms, capacitorFiles, capacitorNotifier } from './capacitorOs';

export function createAndroidPlatform(): Platform {
  return {
    kind: 'android',
    sql: new CapacitorSqlDriver(),
    clock: { now: () => Date.now() },
    scheduler: new CapacitorScheduler(),
    notifier: capacitorNotifier,
    files: capacitorFiles,
    exactAlarms: capacitorExactAlarms,
  };
}
