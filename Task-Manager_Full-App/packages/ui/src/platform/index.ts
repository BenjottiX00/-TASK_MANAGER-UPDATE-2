import { Capacitor } from '@capacitor/core';
import type { Platform } from '@tm/core';

/** Android app -> real SQLite + Android alarms. Browser -> development stand-ins. */
export async function createPlatform(): Promise<Platform> {
  if (Capacitor.isNativePlatform()) return (await import('@tm/shell-mobile')).createAndroidPlatform();
  return (await import('./web')).createWebPlatform();
}
