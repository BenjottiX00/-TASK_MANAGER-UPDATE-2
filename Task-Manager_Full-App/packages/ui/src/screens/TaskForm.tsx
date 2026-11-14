import { useEffect, useState } from 'react';
import { localToMs, toLocalDate, toLocalTime, MAX_ALARMS_PER_TASK, MAX_CHECKLIST_ITEMS, type AlarmDraft, type AlarmType, type FieldErrors, type Priority, type Status } from '@tm/core';
import { ALARM_LABEL, FieldError, Modal } from '../components/ui';
import { useApp, useLive, useNav } from '../hooks';

interface Step { key: number; id?: number; text: string; isDone: boolean; }
let keySeed = 1;
const newStep = (text = '', id?: number, isDone = false): Step => ({ key: keySeed++, id, text, isDone });
const PRESETS: AlarmType[] = ['at_due', 'before_15m', 'before_1h', 'before_1d', 'custom'];
const toInput = (ms: number) => `${toLocalDate(ms)}T${toLocalTime(ms)}`;
const fromInput = (v: string): number | undefined => (v ? localToMs(v.slice(0, 10), v.slice(11, 16)) : undefined);

export function TaskForm({ id }: { id?: number }) {
  const { core, platform } = useApp();
  const nav = useNav();
  const cats = useLive(() => core.categories.list());
  const existing = useLive(() => (id === undefined ? Promise.resolve(undefined) : core.queries.detail(id)), [id]);

  const [title, setTitle] = useState('');
  const [what, setWhat] = useState('');
  const [outcome, setOutcome] = useState('');
  const [doneWhen, setDoneWhen] = useState('');
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [status, setStatus] = useState<Status>('To Do');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [steps, setSteps] = useState<Step[]>([newStep()]);
  const [alarms, setAlarms] = useState<AlarmDraft[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [formError, setFormError] = useState<string>();
  const [loaded, setLoaded] = useState(id === undefined);
  const [askPermission, setAskPermission] = useState(false);

  useEffect(() => { if (id === undefined && categoryId === '' && cats?.[0]) setCategoryId(cats[0].id); }, [cats, id, categoryId]);
  useEffect(() => {
    if (!existing || loaded) return;
    const t = existing.card.task;
    setTitle(t.title); setWhat(t.what); setOutcome(t.outcome); setDoneWhen(t.doneWhen); setCategoryId(t.categoryId);
    setPriority(t.priority); setStatus(t.status); setDueDate(t.dueDate ?? ''); setDueTime(t.dueTime ?? '');
    setSteps(existing.items.map((i) => newStep(i.text, i.id, i.isDone)));
    setAlarms(existing.alarms.map((a): AlarmDraft => (a.type === 'custom' ? { type: 'custom', customAt: a.triggerAt } : { type: a.type })));
    setLoaded(true);
  }, [existing, loaded]);

  // messages go away as soon as the user changes something
  useEffect(() => { setErrors({}); setWarnings([]); setFormError(undefined); }, [title, what, outcome, doneWhen, categoryId, priority, status, dueDate, dueTime, steps, alarms]);

  const setDue = (v: string) => {
    // TM-SRS-120: a task with a due date gets one "at due time" alarm by default
    if (v && !dueDate && alarms.length === 0 && id === undefined) setAlarms([{ type: 'at_due' }]);
    setDueDate(v);
    if (!v) { setDueTime(''); setAlarms((a) => a.filter((x) => x.type === 'custom')); }   // alarms that depend on a due date go away
  };
  const changeStep = (key: number, text: string) => setSteps((s) => s.map((x) => (x.key === key ? { ...x, text } : x)));
  const moveStep = (i: number, d: -1 | 1) => setSteps((s) => { const j = i + d; if (j < 0 || j >= s.length) return s; const c = [...s]; [c[i], c[j]] = [c[j] as Step, c[i] as Step]; return c; });

  const submit = async () => {
    setFormError(undefined);
    const draft = {
      title, what, outcome, doneWhen, categoryId: categoryId === '' ? null : categoryId, priority, status,
      dueDate: dueDate || null, dueTime: dueTime || null,
      checklist: steps.filter((s) => s.text.trim() !== '').map((s) => ({ id: s.id, text: s.text, isDone: s.isDone })),
      alarms,
    };
    const r = id === undefined ? await core.tasks.create(draft) : await core.tasks.update(id, draft);
    if (!r.ok) { setErrors('errors' in r ? r.errors : {}); setWarnings(r.warnings); if ('error' in r) setFormError(r.error); return; }
    setErrors({});
    // TM-SRS-130: ask for notification permission when the first alarm is saved, with a reason first
    if (alarms.length > 0 && (await platform.notifier.permission()) === 'prompt') { setAskPermission(true); return; }
    nav.back();
  };

  if (!loaded || !cats) return <p className="empty">Loading…</p>;
  const hasDue = dueDate !== '';
  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
      <h2>{id === undefined ? 'New task' : 'Edit task'}</h2>
      <label>Title *<input className="input title-input" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} placeholder="Example: Finish lab report" aria-invalid={!!errors.title} /></label>
      <FieldError msg={errors.title} />
      {warnings.map((w) => <p key={w} className="field-warning"><span aria-hidden="true">ℹ </span>{w}</p>)}
      <label>What *<textarea className="input" rows={2} value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Example: Write the budget summary section" aria-invalid={!!errors.what} /></label>
      <FieldError msg={errors.what} />
      <label>Outcome *<textarea className="input" rows={2} value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="Example: A one-page summary with monthly totals" aria-invalid={!!errors.outcome} /></label>
      <FieldError msg={errors.outcome} />
      <label>Done when *<textarea className="input" rows={2} value={doneWhen} onChange={(e) => setDoneWhen(e.target.value)} placeholder="Example: Totals match the spreadsheet and the PDF is saved" aria-invalid={!!errors.doneWhen} /></label>
      <FieldError msg={errors.doneWhen} />
      <FieldError msg={errors.description} />

      <div className="grid2">
        <label>Category *<select className="input" value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Priority<select className="input" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}><option>High</option><option>Medium</option><option>Low</option></select></label>
        <label>Status<select className="input" value={status} onChange={(e) => setStatus(e.target.value as Status)}><option>To Do</option><option>In Progress</option><option>Done</option></select></label>
        <label>Due date (optional)<input className="input" type="date" value={dueDate} onChange={(e) => setDue(e.target.value)} /></label>
        <label>Due time (optional)<input className="input" type="time" value={dueTime} disabled={!hasDue} onChange={(e) => setDueTime(e.target.value)} /></label>
      </div>
      <FieldError msg={errors.categoryId} /><FieldError msg={errors.dueDate} /><FieldError msg={errors.dueTime} />

      <h3>Checklist * <span className="muted">(at least 1, up to {MAX_CHECKLIST_ITEMS})</span></h3>
      {steps.map((s, i) => (
        <div key={s.key} className="step-row">
          <input className="input" value={s.text} maxLength={200} placeholder={`Step ${i + 1}`} aria-label={`Step ${i + 1}`} onChange={(e) => changeStep(s.key, e.target.value)} />
          <button type="button" className="mini" onClick={() => moveStep(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
          <button type="button" className="mini" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} aria-label="Move down">↓</button>
          <button type="button" className="mini" onClick={() => setSteps((x) => (x.length > 1 ? x.filter((y) => y.key !== s.key) : x))} disabled={steps.length === 1} aria-label={`Remove step ${i + 1}`}>✕</button>
        </div>
      ))}
      <button type="button" className="btn small" onClick={() => setSteps((s) => [...s, newStep()])} disabled={steps.length >= MAX_CHECKLIST_ITEMS}>+ Add step</button>
      <FieldError msg={errors.checklist} />

      <h3>Alarms <span className="muted">(up to {MAX_ALARMS_PER_TASK})</span></h3>
      {alarms.map((a, i) => (
        <div key={i} className="step-row">
          <select className="input" value={a.type} aria-label={`Alarm ${i + 1} type`} onChange={(e) => setAlarms((x) => x.map((y, k) => (k === i ? { type: e.target.value as AlarmType, customAt: e.target.value === 'custom' ? y.customAt : undefined } : y)))}>
            {PRESETS.map((p) => <option key={p} value={p} disabled={p !== 'custom' && !hasDue}>{ALARM_LABEL[p]}</option>)}
          </select>
          {a.type === 'custom' && <input className="input" type="datetime-local" aria-label={`Alarm ${i + 1} date and time`} value={a.customAt ? toInput(a.customAt) : ''} onChange={(e) => setAlarms((x) => x.map((y, k) => (k === i ? { ...y, customAt: fromInput(e.target.value) } : y)))} />}
          <button type="button" className="mini" onClick={() => setAlarms((x) => x.filter((_, k) => k !== i))} aria-label={`Remove alarm ${i + 1}`}>✕</button>
        </div>
      ))}
      <button type="button" className="btn small" disabled={alarms.length >= MAX_ALARMS_PER_TASK} onClick={() => setAlarms((x) => [...x, { type: hasDue ? 'before_15m' : 'custom' }])}>+ Add alarm ({MAX_ALARMS_PER_TASK - alarms.length} left)</button>
      {!hasDue && <p className="muted">Add a due date to use "at due time" and "before" alarms.</p>}
      <FieldError msg={errors.alarms} /><FieldError msg={formError} />

      <div className="actions"><button type="submit" className="btn primary">Save task</button><button type="button" className="btn" onClick={nav.back}>Cancel</button></div>
      {askPermission && (
        <Modal title="Allow notifications?" onClose={() => { setAskPermission(false); nav.back(); }}
          actions={[{ label: 'Allow notifications', primary: true, onClick: () => { void platform.notifier.requestPermission().then(() => { setAskPermission(false); nav.back(); }); } }, { label: 'Not now', onClick: () => { setAskPermission(false); nav.back(); } }]}>
          Task Manager uses Android notifications to remind you about scheduled tasks. Allow notifications to receive alarm alerts, even when the app is closed.
        </Modal>
      )}
    </form>
  );
}
