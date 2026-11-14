import { useState } from 'react';
import { toLocalDate, toLocalTime, type Alarm } from '@tm/core';
import { ALARM_LABEL, FieldError, Modal, Ring, dueLabel } from '../components/ui';
import { useCore, useDoneFlow, useLive, useNav } from '../hooks';

const stateLabel: Record<Alarm['state'], string> = { pending: 'Waiting', fired: 'Rang', snoozed: 'Snoozed', dismissed: 'Finished' };

export function TaskDetail({ id, embedded, onGone }: { id: number; embedded?: boolean; onGone?: () => void }) {
  const core = useCore();
  const nav = useNav();
  const d = useLive(() => core.queries.detail(id), [id]);
  const { toggleDone, dialog } = useDoneFlow();
  const [newItem, setNewItem] = useState('');
  const [err, setErr] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [offerDone, setOfferDone] = useState(false);
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);

  if (d === undefined) return <p className="empty">Loading…</p>;
  if (d === null) return <p className="empty">This task no longer exists. <button className="link" onClick={onGone ?? nav.back}>Go back</button></p>;
  const { card, items, alarms } = d;
  const t = card.task;

  const tick = async (itemId: number, done: boolean) => { const r = await core.tasks.setItemDone(itemId, done); if (r?.allDone) setOfferDone(true); };
  const add = async () => { const r = await core.tasks.addItem(id, newItem); if (r.ok) { setNewItem(''); setErr(undefined); } else setErr(r.error); };

  return (
    <article className="detail">
      <div className="chips"><span className="chip" style={{ borderColor: card.categoryColor }}>{card.categoryName}</span><span className={`badge prio-${t.priority.toLowerCase()}`}>{t.priority} priority</span><span className="chip">{t.status}</span>{card.overdue && <span className="badge overdue"><span aria-hidden="true">⚠ </span>OVERDUE</span>}</div>
      <h2>{t.title}</h2>
      <p className="muted">Due: {dueLabel(t)}</p>
      <div className="ring-wrap"><Ring percent={card.percent} size={150} label={`Checklist progress: ${card.itemsDone} of ${card.itemsTotal} steps done`}><strong className="ring-big">{card.percent}%</strong><span className="ring-small">{card.itemsDone} / {card.itemsTotal} done</span></Ring></div>
      <dl className="three"><dt>What</dt><dd>{t.what}</dd><dt>Outcome</dt><dd>{t.outcome}</dd><dt>Done when</dt><dd>{t.doneWhen}</dd></dl>

      <h3>Checklist</h3>
      <ul className="list">
        {items.map((it, idx) => (
          <li key={it.id} className="item-row">
            <button className={`check ${it.isDone ? 'checked' : ''}`} aria-pressed={it.isDone} aria-label={`${it.isDone ? 'Untick' : 'Tick'} ${it.text}`} onClick={() => void tick(it.id, !it.isDone)}>{it.isDone ? '✓' : ''}</button>
            {editing?.id === it.id ? (
              <input className="input" value={editing.text} autoFocus aria-label="Step text" onChange={(e) => setEditing({ id: it.id, text: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') void core.tasks.renameItem(it.id, editing.text).then((r) => { if (r.ok) setEditing(null); else setErr(r.error); }); }} />
            ) : <span className={it.isDone ? 'struck' : ''}>{it.text}</span>}
            <span className="tools">
              {editing?.id === it.id
                ? <button className="mini" onClick={() => void core.tasks.renameItem(it.id, editing.text).then((r) => { if (r.ok) setEditing(null); else setErr(r.error); })}>Save</button>
                : <button className="mini" onClick={() => setEditing({ id: it.id, text: it.text })} aria-label={`Edit ${it.text}`}>Edit</button>}
              <button className="mini" disabled={idx === 0} onClick={() => void core.tasks.moveItem(it.id, -1)} aria-label="Move up">↑</button>
              <button className="mini" disabled={idx === items.length - 1} onClick={() => void core.tasks.moveItem(it.id, 1)} aria-label="Move down">↓</button>
              <button className="mini" onClick={() => void core.tasks.deleteItem(it.id).then((r) => setErr(r.ok ? undefined : r.error))} aria-label={`Delete ${it.text}`}>Delete</button>
            </span>
          </li>
        ))}
      </ul>
      <div className="add-row"><input className="input" placeholder="Add a step" aria-label="New checklist step" value={newItem} maxLength={200} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add(); }} /><button className="btn" onClick={() => void add()}>Add</button></div>
      <FieldError msg={err} />

      <h3>Alarms</h3>
      {alarms.length === 0 ? <p className="muted">No alarms. Edit the task to add up to 5.</p> : (
        <ul className="list">{alarms.map((a) => {
          const at = a.state === 'snoozed' && a.snoozeUntil !== null ? a.snoozeUntil : a.triggerAt;
          return <li key={a.id} className="alarm-row"><span>{ALARM_LABEL[a.type]}</span><span className="muted">{toLocalDate(at)} {toLocalTime(at)} · {stateLabel[a.state]}</span></li>;
        })}</ul>
      )}

      <div className="actions">
        <button className="btn" onClick={() => nav.go({ name: 'form', id })}>Edit task</button>
        <button className="btn primary" onClick={() => toggleDone(card)}>{t.status === 'Done' ? 'Reopen task' : 'Mark Done'}</button>
        <button className="btn danger" onClick={() => setConfirmDelete(true)}>Delete</button>
      </div>
      {confirmDelete && <Modal title="Delete this task?" onClose={() => setConfirmDelete(false)} actions={[{ label: 'Delete', danger: true, onClick: () => { setConfirmDelete(false); void core.tasks.delete(id).then(() => (onGone ?? nav.back)()); } }, { label: 'Cancel', onClick: () => setConfirmDelete(false) }]}>"{t.title}", its checklist and its alarms will be removed. This cannot be undone.</Modal>}
      {offerDone && <Modal title="All steps are done" onClose={() => setOfferDone(false)} actions={[{ label: 'Mark task Done', primary: true, onClick: () => { setOfferDone(false); void core.tasks.setStatus(id, 'Done', 'keep'); } }, { label: 'Not yet', onClick: () => setOfferDone(false) }]}>Every step is ticked. Do you want to mark the whole task as Done?</Modal>}
      {dialog}
      {embedded ? null : null}
    </article>
  );
}
