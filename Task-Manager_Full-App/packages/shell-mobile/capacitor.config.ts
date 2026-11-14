import type { CapacitorConfig } from '@capacitor/cli';

// WBS 1.1.2 (Christian). webDir points at the built UI.
const config: CapacitorConfig = {
  appId: 'ph.usjr.taskmanager',
  appName: 'Task Manager',
  webDir: '../ui/dist',
};

export default config;
