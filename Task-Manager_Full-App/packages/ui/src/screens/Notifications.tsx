import { toLocalDate, toLocalTime } from '@tm/core';
import { Empty } from '../components/ui';
import { useCore, useLive, useNav } from '../hooks';

export function Notifications() {
  const core = useCore();
  const nav = useNav();
  const n = useLive(() => core.notifications());
  const missed = useLive(() => core.alarms.missedList());
  if (!n || !missed) return <p className="empty">Loading…</p>;
  return (
    <section>
      <div className="row-between"><h2>Notifications</h2>{n.unread > 0 && <button className="btn small" onClick={() => void core.markAllNotificationsRead()}>Mark all read ({n.unread})</button>}</div>
      <h3>Missed alarms <span className="muted">({missed.length})</span></h3>
      {missed.length === 0 ? <Empty>No missed alarms.</Empty> : (
        <ul className="list">{missed.map((m) => (
          <li key={m.alarmId} className="card">
            <strong>{m.title.replace(/^Missed: /, '')}</strong>
            <p className="muted">Scheduled {toLocalDate(m.scheduledAt)} {toLocalTime(m.scheduledAt)} · Status: {m.taskStatus}</p>
            <div className="actions"><button className="btn small" onClick={() => { void core.alarms.dismiss(m.alarmId); nav.go({ name: 'task', id: m.taskId }); }}>Open task</button><button className="btn small" onClick={() => void core.alarms.dismiss(m.alarmId)}>Dismiss</button></div>
          </li>))}
        </ul>
      )}
      <h3>History <span className="muted">(last 50)</span></h3>
      {n.items.length === 0 ? <Empty>No notifications yet.</Empty> : (
        <ul className="list">{n.items.map((x) => (
          <li key={x.id} className={`notif ${x.isRead ? '' : 'unread'}`}>
            <button className="task-main" onClick={() => void core.markNotificationRead(x.id)}>
              <span className="task-title">{!x.isRead && <span className="new" aria-label="Unread">● </span>}{x.title}</span>
              <span className="task-meta">{toLocalDate(x.createdAt)} {toLocalTime(x.createdAt)}{x.kind === 'missed' ? ' · Missed' : ''}</span>
              <span className="pre">{x.body}</span>
            </button>
          </li>))}
        </ul>
      )}
    </section>
  );
}
