import { useState } from 'react';
import { CATEGORY_COLORS, CATEGORY_NAME_MAX, type Category } from '@tm/core';
import { FieldError, Modal } from '../components/ui';
import { useCore, useLive, useNav } from '../hooks';

export function Categories() {
  const core = useCore();
  const nav = useNav();
  const cats = useLive(() => core.categories.list());
  const [edit, setEdit] = useState<{ id?: number; name: string; color: string } | null>(null);
  const [err, setErr] = useState<string>();
  const [del, setDel] = useState<{ cat: Category; taskCount: number; moveTo: number | '' } | null>(null);
  const [delErr, setDelErr] = useState<string>();
  if (!cats) return <p className="empty">Loading…</p>;

  const save = async () => {
    if (!edit) return;
    const r = edit.id === undefined ? await core.categories.create(edit.name, edit.color) : await core.categories.update(edit.id, edit.name, edit.color);
    if (r.ok) { setEdit(null); setErr(undefined); } else setErr('error' in r ? r.error : 'Could not save.');
  };
  const tryDelete = async (c: Category) => {
    const r = await core.categories.delete(c.id);
    if (r.ok) return;
    if ('needsMove' in r) { setDel({ cat: c, taskCount: r.taskCount, moveTo: '' }); setDelErr(undefined); }
    else setErr(r.error);
  };
  const confirmMove = async () => {
    if (!del || del.moveTo === '') { setDelErr('Choose the category that will get the tasks.'); return; }
    const r = await core.categories.delete(del.cat.id, del.moveTo);
    if (r.ok) setDel(null); else setDelErr('error' in r ? r.error : 'Could not delete.');
  };

  return (
    <section>
      <div className="row-between"><h2>Categories</h2><button className="btn primary small" onClick={() => { setEdit({ name: '', color: CATEGORY_COLORS[0] }); setErr(undefined); }}>+ Create category</button></div>
      <FieldError msg={err} />
      <ul className="list">
        {cats.map((c) => (
          <li key={c.id} className="item-row">
            <button className="task-main" onClick={() => nav.go({ name: 'category', id: c.id })}><span className="task-title"><span className="dot big" style={{ background: c.color }} aria-hidden="true" />{c.name}</span></button>
            <span className="tools">
              <button className="mini" onClick={() => { setEdit({ id: c.id, name: c.name, color: c.color }); setErr(undefined); }}>Edit</button>
              <button className="mini" onClick={() => void tryDelete(c)}>Delete</button>
            </span>
          </li>
        ))}
      </ul>
      {edit && (
        <Modal title={edit.id === undefined ? 'New category' : 'Edit category'} onClose={() => setEdit(null)} actions={[{ label: 'Save category', primary: true, onClick: () => void save() }, { label: 'Cancel', onClick: () => setEdit(null) }]}>
          <label>Category name<input className="input" value={edit.name} maxLength={CATEGORY_NAME_MAX} autoFocus onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
          <div className="colors" role="radiogroup" aria-label="Color">
            {CATEGORY_COLORS.map((col) => <button key={col} type="button" role="radio" aria-checked={edit.color === col} aria-label={col} className={`swatch ${edit.color === col ? 'on' : ''}`} style={{ background: col }} onClick={() => setEdit({ ...edit, color: col })}>{edit.color === col ? '✓' : ''}</button>)}
          </div>
          <FieldError msg={err} />
        </Modal>
      )}
      {del && (
        <Modal title={`Delete "${del.cat.name}"?`} onClose={() => setDel(null)} actions={[{ label: 'Move tasks and delete', danger: true, onClick: () => void confirmMove() }, { label: 'Cancel', onClick: () => setDel(null) }]}>
          "{del.cat.name}" is used by {del.taskCount} task{del.taskCount === 1 ? '' : 's'}. Move them to another category first.
          <label>Move tasks to<select className="input" value={del.moveTo} onChange={(e) => setDel({ ...del, moveTo: e.target.value === '' ? '' : Number(e.target.value) })}><option value="">Choose category…</option>{cats.filter((c) => c.id !== del.cat.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <FieldError msg={delErr} />
        </Modal>
      )}
    </section>
  );
}
