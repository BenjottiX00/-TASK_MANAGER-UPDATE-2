import type { CSSProperties, ReactNode } from 'react';
import { formatDay, type AlarmType, type TaskListItem } from '@tm/core';

export const ALARM_LABEL: Record<AlarmType, string> = {
  at_due: 'At due time', before_15m: '15 minutes before', before_1h: '1 hour before', before_1d: '1 day before', custom: 'Custom date and time',
};

export function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? 'Checklist progress'}>
      <div className="progress-fill" style={{ width: `${percent}%` }} />
    </div>
  );
}

export function Modal({ title, children, actions, onClose }: { title: string; children?: ReactNode; actions: Array<{ label: string; onClick: () => void; primary?: boolean; danger?: boolean }>; onClose: () => void }) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <div className="modal-body">{children}</div>
        <div className="modal-actions">
          {actions.map((a) => (
            <button key={a.label} className={`btn ${a.primary ? 'primary' : ''} ${a.danger ? 'danger' : ''}`} onClick={a.onClick}>{a.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

export const dueLabel = (t: TaskListItem['task']): string => (t.dueDate ? `${formatDay(t.dueDate)}${t.dueTime ? ' · ' + t.dueTime : ''}` : 'No due date');

export function TaskRow({ item, onOpen, onToggleDone, onTickNext, compact }: { item: TaskListItem; onOpen: () => void; onToggleDone: () => void; onTickNext?: () => void; compact?: boolean }) {
  const t = item.task;
  const done = t.status === 'Done';
  return (
    <li className={`task-row ${done ? 'is-done' : ''}`}>
      <button className={`check ${done ? 'checked' : ''}`} aria-label={done ? `Mark "${t.title}" as not done` : `Mark "${t.title}" as done`} aria-pressed={done} onClick={onToggleDone}>{done ? '✓' : ''}</button>
      <button className="task-main" onClick={onOpen}>
        <span className="task-title">{t.title}</span>
        <span className="task-meta">
          <span className="dot" style={{ background: item.categoryColor }} aria-hidden="true" />{item.categoryName} · {dueLabel(t)}
          {!compact && <> · {t.status}</>}
        </span>
        <span className="badges">
          <span className={`badge prio-${t.priority.toLowerCase()}`}>{t.priority}</span>
          {item.overdue && <span className="badge overdue"><span aria-hidden="true">⚠ </span>OVERDUE</span>}
          <span className="steps">{item.itemsDone}/{item.itemsTotal} steps</span>
        </span>
        <ProgressBar percent={item.percent} />
      </button>
      {onTickNext && item.firstUncheckedId !== null && !done && (
        <button className="mini" onClick={onTickNext} aria-label={`Tick next step: ${item.firstUnchecked}`}>✓ next step</button>
      )}
    </li>
  );
}

/** Simple outline icons (no extra library). */
const PATHS: Record<string, ReactNode> = {
  today: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  overdue: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5v.5" /></>,
  all: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  categories: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
  home: <path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  bell: <path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0" />,
  settings: <><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>,
  back: <path d="M15 5l-7 7 7 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
};
export function Icon({ name }: { name: keyof typeof PATHS }) {
  return <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS[name]}</svg>;
}

/** Round progress ring. `children` goes in the middle. */
export function Ring({ percent, size = 92, label, children, tone }: { percent: number; size?: number; label: string; children?: ReactNode; tone?: 'light' | 'dark' }) {
  const style = { '--p': `${Math.max(0, Math.min(100, percent))}%`, width: size, height: size } as CSSProperties;
  return <div className={`ring ${tone ?? ''}`} role="img" aria-label={label} style={style}><div className="ring-in">{children}</div></div>;
}

export function Fab({ onClick }: { onClick: () => void }) {
  return <button className="fab" onClick={onClick} aria-label="Add task"><Icon name="plus" /></button>;
}

export const Empty = ({ children }: { children: ReactNode }) => <p className="empty">{children}</p>;
export const FieldError = ({ msg }: { msg?: string }) => (msg ? <p className="field-error" role="alert"><span aria-hidden="true">⚠ </span>{msg}</p> : null);
