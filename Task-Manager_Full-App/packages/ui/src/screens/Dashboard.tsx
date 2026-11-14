import { useState } from 'react';
import { formatDay, type DashboardData, type TaskListItem, type WidgetId, type WidgetLayoutItem } from '@tm/core';
import { Empty, Fab, ProgressBar, Ring, TaskRow } from '../components/ui';
import { useApp, useDoneFlow, useLive, useNav } from '../hooks';

const TITLES: Record<WidgetId, string> = { today: 'Today', overdue: 'Overdue', upcoming: 'Upcoming (next 7 days)', category_progress: 'Category progress' };

export function Dashboard() {
  const { core, platform } = useApp();
  const nav = useNav();
  const data = useLive<DashboardData>(() => core.dashboard.load());
  const { toggleDone, dialog } = useDoneFlow();
  const [editing, setEditing] = useState(false);
  if (!data) return <p className="empty">Loading…</p>;

  const tickNext = (i: TaskListItem) => { if (i.firstUncheckedId !== null) void core.tasks.setItemDone(i.firstUncheckedId, true); };
  const rows = (items: TaskListItem[]) => (
    <ul className="list">{items.map((i) => <TaskRow key={i.task.id} item={i} compact onOpen={() => nav.go({ name: 'task', id: i.task.id })} onToggleDone={() => toggleDone(i)} onTickNext={() => tickNext(i)} />)}</ul>
  );
  const save = (layout: WidgetLayoutItem[]) => void core.dashboard.setLayout(layout);
  const move = (idx: number, dir: -1 | 1) => {
    const l = [...data.layout]; const j = idx + dir; if (j < 0 || j >= l.length) return;
    [l[idx], l[j]] = [l[j] as WidgetLayoutItem, l[idx] as WidgetLayoutItem]; save(l.map((w, p) => ({ ...w, position: p })));
  };
  const toggle = (idx: number) => save(data.layout.map((w, p) => (p === idx ? { ...w, isVisible: !w.isVisible } : w)));

  const body = (w: WidgetId) => {
    if (w === 'today') return data.today.total === 0 ? <Empty>Nothing is due today.</Empty> : <>{rows(data.today.items)}<button className="link" onClick={() => nav.go({ name: 'list', view: 'today' })}>See all {data.today.total} →</button></>;
    if (w === 'overdue') return data.overdue.total === 0 ? <Empty>Nothing is overdue.</Empty> : <>{rows(data.overdue.items)}<button className="link" onClick={() => nav.go({ name: 'list', view: 'overdue' })}>See all {data.overdue.total} →</button></>;
    if (w === 'upcoming') return data.upcoming.length === 0 ? <Empty>Nothing due in the next 7 days.</Empty> : <>{data.upcoming.map((d) => <div key={d.date}><h4 className="day">{formatDay(d.date)}</h4>{rows(d.items)}</div>)}</>;
    return (
      <ul className="list">
        {data.categoryProgress.map((c) => (
          <li key={c.category.id} className="cat-progress">
            <button className="task-main" onClick={() => nav.go({ name: 'category', id: c.category.id })}>
              <span className="task-title"><span className="dot" style={{ background: c.category.color }} aria-hidden="true" />{c.category.name}</span>
              <span className="task-meta">{c.openTasks} open task{c.openTasks === 1 ? '' : 's'} · {c.percent}% of steps done</span>
              <ProgressBar percent={c.percent} label={`${c.category.name} progress`} />
            </button>
          </li>
        ))}
      </ul>
    );
  };

  const hour = new Date(platform.clock.now()).getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const dueToday = data.today.total + data.todayDone;
  const pct = dueToday === 0 ? 0 : Math.round((data.todayDone / dueToday) * 100);
  const todayLabel = new Date(platform.clock.now()).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <section>
      <p className="muted">{todayLabel}</p>
      <h1 className="greeting">{greeting}</h1>
      <div className="hero">
        <Ring percent={pct} size={92} tone="dark" label={`${data.todayDone} of ${dueToday} tasks due today are done`}><strong>{data.todayDone}/{dueToday}</strong></Ring>
        <div>
          <div className="hero-title">{dueToday === 0 ? 'Nothing is due today' : data.today.total === 0 ? 'All done for today' : `${data.today.total} task${data.today.total === 1 ? '' : 's'} left today`}</div>
          <div className="hero-sub">{data.overdue.total === 0 ? 'Nothing is overdue' : `${data.overdue.total} task${data.overdue.total === 1 ? ' is' : 's are'} overdue`}</div>
        </div>
      </div>
      <div className="stats">
        <button className="stat" onClick={() => nav.go({ name: 'list', view: 'today' })}><strong>{data.today.total}</strong><span>Today</span></button>
        <button className="stat bad" onClick={() => nav.go({ name: 'list', view: 'overdue' })}><strong>{data.overdue.total}</strong><span>Overdue</span></button>
        <button className="stat info" onClick={() => nav.go({ name: 'list', view: 'all' })}><strong>{data.upcoming.reduce((n, d) => n + d.items.length, 0)}</strong><span>Upcoming</span></button>
      </div>
      <div className="row-between"><h2>Dashboard</h2><button className="btn small" onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Customize'}</button></div>
      {data.layout.map((w, idx) => (editing || w.isVisible) && (
        <article key={w.widget} className={`card ${w.isVisible ? '' : 'faded'}`}>
          <div className="row-between"><h3>{TITLES[w.widget]}</h3>
            {editing && <span className="tools">
              <button className="mini" onClick={() => move(idx, -1)} aria-label={`Move ${TITLES[w.widget]} up`}>↑</button>
              <button className="mini" onClick={() => move(idx, 1)} aria-label={`Move ${TITLES[w.widget]} down`}>↓</button>
              <button className="mini" onClick={() => toggle(idx)}>{w.isVisible ? 'Hide' : 'Show'}</button>
            </span>}
          </div>
          {w.isVisible && body(w.widget)}
        </article>
      ))}
      {dialog}
      <Fab onClick={() => nav.go({ name: 'form' })} />
    </section>
  );
}
