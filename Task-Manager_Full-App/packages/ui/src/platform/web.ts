import type { Platform } from '@tm/core';
import { SqlJsDriver } from './sqljsDriver';

/** Browser stand-in used while developing. Alarms ring only while the page is open (the in-app timer). */
export function createWebPlatform(): Platform {
  return {
    kind: 'web',
    sql: new SqlJsDriver(),
    clock: { now: () => Date.now() },
    scheduler: { replaceAll: async () => undefined, capacity: () => 0, onAction: () => undefined },
    notifier: { permission: async () => 'unsupported', requestPermission: async () => 'unsupported' },
    files: {
      async saveText(filename, mime, text) {
        const url = URL.createObjectURL(new Blob([text], { type: mime }));
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
    },
    exactAlarms: { status: async () => 'unsupported', open: async () => undefined },
  };
}
