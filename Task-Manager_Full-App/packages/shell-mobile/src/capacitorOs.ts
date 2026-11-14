import { LocalNotifications } from '@capacitor/local-notifications';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { ExactAlarmSetting, FileService, OsNotifier, OsScheduler, PermissionState, ScheduledItem } from '@tm/core';

const CHANNEL_SOUND = 'alarms';
const CHANNEL_QUIET = 'alarms-quiet';
type Action = { alarmId: number; action: 'snooze' | 'done' | 'open' };

/** Gives the alarms to Android, which rings them even when the app is closed (TM-SRS-102, 103). */
export class CapacitorScheduler implements OsScheduler {
  private ready = false;
  private async setup(): Promise<void> {
    if (this.ready) return;
    await LocalNotifications.createChannel({ id: CHANNEL_SOUND, name: 'Task alarms', description: 'Reminders for tasks', importance: 4, visibility: 1, vibration: true });
    await LocalNotifications.createChannel({ id: CHANNEL_QUIET, name: 'Task alarms (no sound)', description: 'Reminders without sound', importance: 2, visibility: 1, vibration: false });
    await LocalNotifications.registerActionTypes({ types: [{ id: 'ALARM', actions: [{ id: 'snooze', title: 'Snooze' }, { id: 'done', title: 'Mark Done' }] }] });
    this.ready = true;
  }
  async replaceAll(items: ScheduledItem[]): Promise<void> {
    await this.setup();
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    if (!items.length) return;
    await LocalNotifications.schedule({
      notifications: items.map((i) => ({
        id: i.osId, title: i.title, body: i.body, actionTypeId: 'ALARM', channelId: i.sound ? CHANNEL_SOUND : CHANNEL_QUIET,
        schedule: { at: new Date(i.fireAt), allowWhileIdle: true },
        extra: { alarmId: i.payload.alarmId, taskId: i.payload.taskId },
      })),
    });
  }
  capacity(): number { return 200; }
  onAction(cb: (a: Action) => void): void {
    void LocalNotifications.addListener('localNotificationActionPerformed', (ev) => {
      const extra = (ev.notification.extra ?? {}) as { alarmId?: number };
      const alarmId = extra.alarmId ?? ev.notification.id;
      cb({ alarmId, action: ev.actionId === 'snooze' ? 'snooze' : ev.actionId === 'done' ? 'done' : 'open' });
    });
  }
}

const mapPermission = (d: string): PermissionState => (d === 'granted' ? 'granted' : d === 'denied' ? 'denied' : 'prompt');
export const capacitorNotifier: OsNotifier = {
  permission: async () => mapPermission((await LocalNotifications.checkPermissions()).display),
  requestPermission: async () => mapPermission((await LocalNotifications.requestPermissions()).display),
};

/** Android 12+ needs the "Alarms & reminders" permission for exact alarms. */
export const capacitorExactAlarms: ExactAlarmSetting = {
  status: async () => {
    try { const r = await LocalNotifications.checkExactNotificationSetting(); return r.exact_alarm === 'granted' ? 'granted' : 'denied'; } catch { return 'unsupported'; }
  },
  open: async () => { try { await LocalNotifications.changeExactNotificationSetting(); } catch { /* not available on this Android version */ } },
};

/** Writes the file in the app cache, then opens the Android share sheet (Save to Drive, Files, ...). */
export const capacitorFiles: FileService = {
  async saveText(filename, _mime, text) {
    await Filesystem.writeFile({ path: filename, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
    await Share.share({ title: filename, url: uri, dialogTitle: 'Save or share your file' });
  },
};
