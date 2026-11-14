import { useEffect, useState } from 'react';
import { createCore, type Platform, type TaskManagerCore } from '@tm/core';
import { createPlatform } from './platform';
import { Icon } from './components/ui';
import { CoreProvider, NavProvider, useApp, useLive, useNav, type Route } from './hooks';
import { AlertHost } from './screens/AlertHost';
import { Categories } from './screens/Categories';
import { Dashboard } from './screens/Dashboard';
import { Notifications } from './screens/Notifications';
import { Settings } from './screens/Settings';
import { TaskDetail } from './screens/TaskDetail';
import { TaskForm } from './screens/TaskForm';
import { TaskList } from './screens/TaskList';

type Boot =
  | { state: 'loading' }
  | { state: 'ready'; core: TaskManagerCore; platform: Platform }
  | { state: 'corrupt'; core: TaskManagerCore; platform: Platform }
  | { state: 'error'; message: string };

export function App() {
  const [boot, setBoot] = useState<Boot>({ state: 'loading' });
  useEffect(() => {
    void (async () => {
      try {
        const platform = await createPlatform();
        const core = createCore(platform);
        const r = await core.init();
        if (!r.ok) { setBoot(r.reason === 'corrupt' ? { state: 'corrupt', core, platform } : { state: 'error', message: r.message }); return; }
        await core.start();
        setBoot({ state: 'ready', core, platform });
      } catch (e) { setBoot({ state: 'error', message: (e as Error).message }); }
    })();
  }, []);

  if (boot.state === 'loading') return <p className="center">Opening Task Manager…</p>;
  if (boot.state === 'error') return <div className="center"><h1>Something went wrong</h1><p>{boot.message}</p></div>;
  if (boot.state === 'corrupt') {
    const { core, platform } = boot;
    return (
      <div className="center">
        <h1>Your data file is damaged</h1>
        <p>Task Manager found a problem with the saved data. The damaged file has been kept safely and was not deleted.</p>
        <p>You can start with an empty database, then import a JSON backup in Settings.</p>
        <button className="btn primary" onClick={() => void core.recoverWithEmptyDatabase().then(async (r) => { if (r.ok) { await core.start(); setBoot({ state: 'ready', core, platform }); } })}>Start with an empty database</button>
      </div>
    );
  }
  return (
    <CoreProvider value={{ core: boot.core, platform: boot.platform }}>
      <NavProvider><Shell /></NavProvider>
    </CoreProvider>
  );
}

const NAV: Array<{ label: string; route: Route; icon: 'today' | 'overdue' | 'all' | 'categories' }> = [
  { label: 'Today', route: { name: 'list', view: 'today' }, icon: 'today' },
  { label: 'Overdue', route: { name: 'list', view: 'overdue' }, icon: 'overdue' },
  { label: 'All Tasks', route: { name: 'list', view: 'all' }, icon: 'all' },
  { label: 'Categories', route: { name: 'categories' }, icon: 'categories' },
];
const isActive = (cur: Route, r: Route): boolean =>
  cur.name === r.name && (cur.name !== 'list' || r.name !== 'list' || cur.view === r.view) || (r.name === 'categories' && cur.name === 'category');

function Shell() {
  const { core, platform } = useApp();
  const nav = useNav();
  const counts = useLive(() => core.queries.counts());
  const notes = useLive(() => core.notifications());
  const missed = useLive(() => core.alarms.missedList());
  const [perm, setPerm] = useState<string>('');
  const [hideBanner, setHideBanner] = useState(false);

  // The app's own timer: rings alarms while the app is open (Android also rings them when it is closed).
  useEffect(() => {
    const tick = () => { void core.alarms.tick(); };
    const id = window.setInterval(tick, 5000);
    const vis = () => { if (document.visibilityState === 'visible') { tick(); void platform.notifier.permission().then(setPerm); } };
    document.addEventListener('visibilitychange', vis);
    void platform.notifier.permission().then(setPerm);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', vis); };
  }, [core, platform]);

  const r = nav.route;
  const screen = (() => {
    switch (r.name) {
      case 'dashboard': return <Dashboard />;
      case 'list': return <TaskList key={r.view} view={r.view} />;
      case 'category': return <TaskList key={`c${r.id}`} view="category" categoryId={r.id} />;
      case 'categories': return <Categories />;
      case 'task': return <TaskDetail key={r.id} id={r.id} />;
      case 'form': return <TaskForm key={r.id ?? 'new'} id={r.id} />;
      case 'notifications': return <Notifications />;
      case 'settings': return <Settings />;
    }
  })();

  return (
    <div className="app">
      <nav className="nav" aria-label="Main navigation">
        <div className="brand">Task Manager</div>
        {NAV.map((n) => (
          <button key={n.label} className={`nav-btn ${isActive(r, n.route) ? 'active' : ''}`} aria-current={isActive(r, n.route) ? 'page' : undefined} onClick={() => nav.root(n.route)}>
            <Icon name={n.icon} /><span className="nav-label">{n.label}</span>{n.label === 'Overdue' && counts && counts.overdue > 0 ? <span className="count-badge" aria-label={`${counts.overdue} overdue`}>{counts.overdue}</span> : null}
          </button>
        ))}
      </nav>
      <div className="main">
        <header className="topbar">
          {nav.canBack ? <button className="icon" onClick={nav.back} aria-label="Back"><Icon name="back" /></button> : <span className="title">Task Manager</span>}
          <span className="spacer" />
          <button className="icon" onClick={() => nav.root({ name: 'dashboard' })} aria-label="Dashboard"><Icon name="home" /></button>
          <button className="icon" onClick={() => nav.go({ name: 'notifications' })} aria-label={`Notifications${notes?.unread ? `, ${notes.unread} unread` : ''}`}><Icon name="bell" />{notes && notes.unread > 0 ? <span className="count-badge">{notes.unread}</span> : null}</button>
          <button className="icon" onClick={() => nav.go({ name: 'settings' })} aria-label="Settings"><Icon name="settings" /></button>
        </header>
        {perm === 'denied' && !hideBanner && (
          <div className="banner" role="status">Notifications are unavailable. Your tasks are saved on this device; open the app to review reminders. To turn notifications on: Android Settings → Apps → Task Manager → Notifications.
            <button className="btn small" onClick={() => setHideBanner(true)}>Dismiss</button></div>
        )}
        {missed && missed.length > 0 && r.name !== 'notifications' && (
          <div className="banner warn" role="status">{missed.length} missed alarm{missed.length === 1 ? '' : 's'}.
            <button className="btn small" onClick={() => nav.go({ name: 'notifications' })}>View missed alarms</button></div>
        )}
        <main className="content">{screen}</main>
      </div>
      <AlertHost />
    </div>
  );
}
