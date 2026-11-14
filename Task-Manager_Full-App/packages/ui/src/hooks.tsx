import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Platform, TaskListItem, TaskManagerCore } from '@tm/core';
import { Modal } from './components/ui';

// ---------- core + platform ----------
interface AppCtx { core: TaskManagerCore; platform: Platform; }
const Ctx = createContext<AppCtx | null>(null);
export const CoreProvider = ({ value, children }: { value: AppCtx; children: ReactNode }) => <Ctx.Provider value={value}>{children}</Ctx.Provider>;
export function useApp(): AppCtx { const v = useContext(Ctx); if (!v) throw new Error('CoreProvider is missing'); return v; }
export const useCore = (): TaskManagerCore => useApp().core;

/** Loads data and loads it again whenever the core says something changed (TM-SRS-147: live updates). */
export function useLive<T>(load: () => Promise<T>, deps: unknown[] = []): T | undefined {
  const core = useCore();
  const [value, setValue] = useState<T>();
  const [version, setVersion] = useState(0);
  useEffect(() => core.bus.on((e) => { if (e.type === 'data') setVersion((v) => v + 1); }), [core]);
  useEffect(() => {
    let alive = true;
    load().then((v) => { if (alive) setValue(v); }).catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps]);
  return value;
}

// ---------- navigation ----------
export type Route =
  | { name: 'dashboard' }
  | { name: 'list'; view: 'today' | 'overdue' | 'all' }
  | { name: 'category'; id: number }
  | { name: 'categories' }
  | { name: 'task'; id: number }
  | { name: 'form'; id?: number }
  | { name: 'notifications' }
  | { name: 'settings' };
interface NavApi { route: Route; canBack: boolean; go: (r: Route) => void; back: () => void; root: (r: Route) => void; }
const NavCtx = createContext<NavApi | null>(null);
export function NavProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Route[]>([{ name: 'dashboard' }]);
  const go = useCallback((r: Route) => setStack((s) => [...s, r]), []);
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const root = useCallback((r: Route) => setStack([r]), []);
  const api: NavApi = { route: stack[stack.length - 1] as Route, canBack: stack.length > 1, go, back, root };
  return <NavCtx.Provider value={api}>{children}</NavCtx.Provider>;
}
export function useNav(): NavApi { const v = useContext(NavCtx); if (!v) throw new Error('NavProvider is missing'); return v; }

// ---------- "mark Done" with the question about open steps (TM-SRS-026) ----------
export function useDoneFlow(): { toggleDone: (item: TaskListItem) => void; dialog: ReactNode } {
  const core = useCore();
  const [pending, setPending] = useState<{ id: number; unchecked: number } | null>(null);
  const toggleDone = useCallback((item: TaskListItem) => {
    void (async () => {
      if (item.task.status === 'Done') { await core.tasks.setStatus(item.task.id, 'To Do'); return; }
      const r = await core.tasks.setStatus(item.task.id, 'Done');
      if (!r.ok && 'needsDecision' in r) setPending({ id: item.task.id, unchecked: r.unchecked });
    })();
  }, [core]);
  const decide = (choice: 'tick' | 'keep' | null) => {
    const p = pending; setPending(null);
    if (p && choice) void core.tasks.setStatus(p.id, 'Done', choice);
  };
  const dialog = pending ? (
    <Modal title="Some steps are not done" onClose={() => decide(null)}
      actions={[{ label: 'Tick all steps and finish', primary: true, onClick: () => decide('tick') }, { label: 'Finish, keep steps as they are', onClick: () => decide('keep') }, { label: 'Cancel', onClick: () => decide(null) }]}>
      {pending.unchecked} checklist step{pending.unchecked === 1 ? ' is' : 's are'} not ticked. What should happen?
    </Modal>
  ) : null;
  return { toggleDone, dialog };
}
