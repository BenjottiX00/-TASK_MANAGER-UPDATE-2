import { useEffect, useState } from 'react';
import { Modal } from '../components/ui';
import { useCore, useNav } from '../hooks';

interface Alert { alarmId: number; taskId: number; title: string; body: string; }

/** The in-app alarm alert (TM-SRS-123). It stays until the user chooses an action. */
export function AlertHost() {
  const core = useCore();
  const nav = useNav();
  const [queue, setQueue] = useState<Alert[]>([]);
  const [snoozing, setSnoozing] = useState(false);
  useEffect(() => core.bus.on((e) => {
    if (e.type === 'alert') setQueue((q) => (q.some((a) => a.alarmId === e.alarmId) ? q : [...q, e]));
    if (e.type === 'open-task') nav.go({ name: 'task', id: e.taskId });
  }), [core, nav]);
  const a = queue[0];
  if (!a) return null;
  const next = () => { setSnoozing(false); setQueue((q) => q.slice(1)); };
  if (snoozing) {
    return (
      <Modal title="Snooze for…" onClose={() => setSnoozing(false)}
        actions={[
          { label: '5 minutes', onClick: () => { void core.alarms.snooze(a.alarmId, '5m'); next(); } },
          { label: '15 minutes', onClick: () => { void core.alarms.snooze(a.alarmId, '15m'); next(); } },
          { label: '1 hour', onClick: () => { void core.alarms.snooze(a.alarmId, '1h'); next(); } },
          { label: 'Until tomorrow', onClick: () => { void core.alarms.snooze(a.alarmId, 'tomorrow'); next(); } },
          { label: 'Back', onClick: () => setSnoozing(false) },
        ]}>{a.title}</Modal>
    );
  }
  return (
    <Modal title={`⏰ ${a.title}`} onClose={() => undefined}
      actions={[
        { label: 'Snooze', onClick: () => setSnoozing(true) },
        { label: 'Mark Done', primary: true, onClick: () => { void core.alarms.markDone(a.alarmId); next(); } },
        { label: 'Open Task', onClick: () => { void core.alarms.dismiss(a.alarmId); nav.go({ name: 'task', id: a.taskId }); next(); } },
        { label: 'Dismiss', onClick: () => { void core.alarms.dismiss(a.alarmId); next(); } },
      ]}><span className="pre">{a.body}</span>{queue.length > 1 && <p className="muted">{queue.length - 1} more alarm{queue.length === 2 ? '' : 's'} waiting.</p>}</Modal>
  );
}
