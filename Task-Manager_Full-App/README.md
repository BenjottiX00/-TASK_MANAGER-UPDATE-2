# Task Manager (Android, offline)

React + TypeScript + Capacitor + SQLite. Built from SRS v1.4, the System Architecture, the HLD and the LLD.

```
packages/core          rules, SQLite data, alarms, notifications, backup. No platform code. 66 tests.
packages/ui            React screens (adaptive: phone bottom bar, tablet side panel + two panes).
packages/shell-mobile  Android adapters: SQLite plugin, local notifications (alarms), share sheet.
docs/                  TESTING.md (what is verified), PHONE_TEST_LIST.md
.github/workflows/     ci.yml (tests) and android-debug.yml (builds an installable APK)
```

## Run it (needs Node 22 or newer)
```
npm install
npm test          # core tests: real SQLite, Manila time zone
npm run dev       # web preview. In Codespaces open port 5173 (Ports tab), on your phone too
npm run typecheck
```
The web preview uses a browser database (sql.js) and alarms ring only while the page is open.
The real thing is the Android app.

## Make the Android app (no Android Studio needed)
1. Push this folder to GitHub (the repo root must contain `package.json`).
2. GitHub -> **Actions** -> **Android debug APK** -> **Run workflow**. It takes about 10 minutes.
   It builds the web app, creates the Android project, adds the permissions (notifications, exact alarms, restart) and builds the APK.
3. Open the finished run -> **Artifacts** -> download `task-manager-debug-apk`, unzip it on the phone, tap `app-debug.apk`,
   and allow "Install unknown apps".
4. Go through `docs/PHONE_TEST_LIST.md`.
SRS 100 says no network: after the app works, you may try removing `INTERNET` from the generated `AndroidManifest.xml`.

## How it fits the documents
| Document | Where in the code |
| --- | --- |
| SRS 010-019, 020-027 tasks and checklists | `core/src/validation`, `services/taskService.ts` |
| SRS 030-034 categories | `services/categoryService.ts` |
| SRS 040-052 views, search, filters | `services/queries.ts`, `ui/screens/TaskList.tsx` |
| SRS 060-071, 090-095, 112 data, export/import, damaged file | `data/`, `services/backup.ts`, `core.ts` |
| SRS 120-138 alarms and notifications | `alarms/alarmService.ts`, `notifications/`, `shell-mobile/src/capacitorOs.ts` |
| SRS 140-147 widgets | `services/dashboard.ts`, `ui/screens/Dashboard.tsx` |
| LLD ports | `core/src/ports.ts` (the core never imports Capacitor or the DOM) |

## Differences from the documents (decide and tell the team)
- State in the UI uses small React hooks (`useLive`) instead of Zustand. It is about 15 lines and can be swapped later.
- The notification's **Snooze** button snoozes 15 minutes. **Mark Done** from a notification keeps unticked steps as they are (there is no screen to ask).
- Alarms whose time has already passed when a task is saved are stored as finished and never ring.
- The last remaining category cannot be deleted (every task needs a category).
- "Overdue" means the due time (or the default 09:00) has passed.
