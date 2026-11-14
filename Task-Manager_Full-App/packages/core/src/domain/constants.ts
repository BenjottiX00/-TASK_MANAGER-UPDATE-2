// Limits and defaults from SRS v1.4. Keep every magic number here.
export const TITLE_MIN = 3;               // TM-SRS-012
export const TITLE_MAX = 100;
export const DESCRIPTION_MIN_TOTAL = 30;  // TM-SRS-013 (What + Outcome + Done when)
export const CHECKLIST_TEXT_MIN = 1;      // TM-SRS-020
export const CHECKLIST_TEXT_MAX = 200;
export const MAX_CHECKLIST_ITEMS = 50;    // TM-SRS-023
export const MAX_ALARMS_PER_TASK = 5;     // TM-SRS-121
export const CATEGORY_NAME_MIN = 1;       // TM-SRS-031
export const CATEGORY_NAME_MAX = 30;
export const NOTIFICATION_HISTORY_MAX = 50; // TM-SRS-095, 135
export const DEFAULT_DUE_TIME = '09:00';  // TM-SRS-120
export const DEFAULT_CATEGORIES = [
  { name: 'Work', color: '#4A7FD0' },
  { name: 'Study', color: '#7B52AB' },
  { name: 'Home', color: '#E8A33D' },
  { name: 'Personal', color: '#1F9D8F' },
] as const; // TM-SRS-030
export const CATEGORY_COLORS = ['#4A7FD0', '#7B52AB', '#E8A33D', '#1F9D8F', '#C9524F', '#2E8B57', '#D9822B', '#5A5AA0'] as const;
export const SNOOZE_MINUTES = { '5m': 5, '15m': 15, '1h': 60 } as const; // TM-SRS-124 (+ 'tomorrow')
export const NOTIFICATION_ACTION_SNOOZE_MINUTES = 15; // the notification's Snooze button (TM-SRS-132)
export const WIDGET_TODAY_MAX = 5;        // TM-SRS-141
export const WIDGET_OVERDUE_MAX = 5;      // TM-SRS-142
export const WIDGET_UPCOMING_DAYS = 7;    // TM-SRS-143
export const EXPORT_SCHEMA_VERSION = 1;
export const SCHEMA_VERSION = 1;
