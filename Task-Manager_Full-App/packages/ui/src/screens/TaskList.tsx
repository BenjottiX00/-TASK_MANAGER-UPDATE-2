import { useEffect, useState } from 'react';
import type { Priority, Status, TaskFilter, TaskListItem, TaskSort } from '@tm/core';
import { Empty, Fab, TaskRow } from '../components/ui';
import { useApp, useDoneFlow, useLive, useNav } from '../hooks';
import { TaskDetail } from './TaskDetail';

type View = 'today' | 'overdue' | 'all' | 'category';
const TITLE: Record<View, string> = { today: 'Today', overdue: 'Overdue', all: 'All tasks', category: 'Category' };

export function TaskList({ view, categoryId }: { view: View; categoryId?: number }) {
  const { core, platform } = useApp();
  const nav = useNav();
  const { toggleDone, dialog } = useDoneFlow();
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [status, setStatus] = useState<Status | ''>('');
  const [priority, setPriority] = useState<Priority | ''>('');
  const [cat, setCat] = useState<number | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<TaskSort>('due');
  const [selected, setSelected] = useState<number | null>(null);
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 900px)').matches);
  useEffect(() => {
    const m = window.matchMedia('(min-width: 900px)');
    const f = (e: MediaQueryListEvent) => setWide(e.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);

  const filter: TaskFilter = {
    view, categoryId: view === 'category' ? categoryId : cat === '' ? undefined : cat, search, sort,
    status: status || undefined, priority: priority || undefined, dueFrom: from || undefined, dueTo: to || undefined,
  };
  const list = useLive<TaskListItem[]>(() => core.queries.list(filter), [JSON.stringify(filter)]);
  const cats = useLive(() => core.categories.list());
  const title = view === 'category' ? (cats?.find((c) => c.id === categoryId)?.name ?? 'Category') : TITLE[view];
  const activeFilters = [status, priority, cat, from, to].filter((x) => x !== '').length;

  const exportCsv = async () => { if (list) await platform.files.saveText(`tasks-${view}.csv`, 'text/csv', core.backup.exportCsv(list)); };
  const open = (id: number) => (wide ? setSelected(id) : nav.go({ name: 'task', id }));

  const left = (
    <div className="pane-list">
      <h2>{title}</h2>
      <input className="input" type="search" placeholder="Search title, description, checklist…" aria-label="Search tasks" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="row-between tools-row">
        <button className="btn small" onClick={() => setShowFilters(!showFilters)}>Filters{activeFilters ? ` (${activeFilters})` : ''}</button>
        {view === 'all' && (
          <label className="inline">Sort by{' '}
            <select value={sort} onChange={(e) => setSort(e.target.value as TaskSort)}>
              <option value="due">Due date</option><option value="priority">Priority</option><option value="category">Category</option><option value="status">Status</option>
            </select>
          </label>
        )}
        <button className="btn small" onClick={() => void exportCsv()} disabled={!list?.length}>Export CSV</button>
      </div>
      {showFilters && (
        <div className="filters card">
          {view !== 'category' && <label>Category<select value={cat} onChange={(e) => setCat(e.target.value === '' ? '' : Number(e.target.value))}><option value="">All</option>{cats?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
          <label>Status<select value={status} onChange={(e) => setStatus(e.target.value as Status | '')}><option value="">All</option><option>To Do</option><option>In Progress</option><option>Done</option></select></label>
          <label>Priority<select value={priority} onChange={(e) => setPriority(e.target.value as Priority | '')}><option value="">All</option><option>High</option><option>Medium</option><option>Low</option></select></label>
          <label>Due from<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>Due to<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <button className="btn small" onClick={() => { setStatus(''); setPriority(''); setCat(''); setFrom(''); setTo(''); }}>Clear filters</button>
        </div>
      )}
      <p className="count" aria-live="polite">{list ? `${list.length} task${list.length === 1 ? '' : 's'}` : 'Loading…'}{search || activeFilters ? ' match' : ''}</p>
      {list && list.length === 0 && <Empty>{search || activeFilters ? 'No task matches your search and filters.' : view === 'today' ? 'Nothing is due today.' : view === 'overdue' ? 'Nothing is overdue.' : 'No tasks yet. Tap "+ Add task".'}</Empty>}
      <ul className="list">
        {list?.map((i) => <TaskRow key={i.task.id} item={i} onOpen={() => open(i.task.id)} onToggleDone={() => toggleDone(i)} />)}
      </ul>
      {dialog}
      <Fab onClick={() => nav.go({ name: 'form' })} />
    </div>
  );
  if (!wide) return left;
  return (
    <div className="two-pane">
      {left}
      <div className="pane-detail">{selected !== null ? <TaskDetail id={selected} embedded onGone={() => setSelected(null)} /> : <Empty>Select a task to see it here.</Empty>}</div>
    </div>
  );
}
