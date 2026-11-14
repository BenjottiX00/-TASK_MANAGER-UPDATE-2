import { useEffect, useRef, useState } from 'react';
import { Modal } from '../components/ui';
import { useApp, useLive, useNav } from '../hooks';

export function Settings() {
  const { core, platform } = useApp();
  const nav = useNav();
  const s = useLive(() => core.getSettings());
  const [perm, setPerm] = useState<string>('…');
  const [exact, setExact] = useState<string>('…');
  const [msg, setMsg] = useState<string>();
  const [pendingImport, setPendingImport] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { void platform.notifier.permission().then(setPerm); void platform.exactAlarms.status().then(setExact); }, [platform]);
  if (!s) return <p className="empty">Loading…</p>;

  const doExport = async () => { await platform.files.saveText('task-manager-backup.json', 'application/json', await core.backup.exportJson()); setMsg('Backup file ready.'); };
  const doExportCsv = async () => { const all = await core.queries.list({ view: 'all' }); await platform.files.saveText('tasks.csv', 'text/csv', core.backup.exportCsv(all)); setMsg('CSV file ready.'); };
  const pick = (f: File | undefined) => { if (!f) return; const r = new FileReader(); r.onload = () => setPendingImport(String(r.result)); r.readAsText(f); };
  const doImport = async () => { const text = pendingImport; setPendingImport(null); if (text === null) return; const r = await core.backup.importJson(text); setMsg(r.ok ? 'Import finished.' : r.error); };

  return (
    <section>
      <h2>Settings</h2>
      <h3>Notifications</h3>
      <div className="card">
        <label className="switch"><input type="checkbox" checked={s.notificationsEnabled} onChange={(e) => void core.updateSettings({ notificationsEnabled: e.target.checked })} />All notifications <strong>{s.notificationsEnabled ? 'ON' : 'OFF'}</strong></label>
        <label className="switch"><input type="checkbox" checked={s.soundEnabled} onChange={(e) => void core.updateSettings({ soundEnabled: e.target.checked })} />Alarm sound <strong>{s.soundEnabled ? 'ON' : 'OFF'}</strong></label>
        <label>Default due time<input className="input" type="time" value={s.defaultDueTime} onChange={(e) => { if (e.target.value) void core.updateSettings({ defaultDueTime: e.target.value }); }} /></label>
        <p className="muted">Used for tasks that have a due date but no time.</p>
        <p>Android permission: <strong>{perm}</strong>
          {(perm === 'prompt' || perm === 'denied') && <> <button className="btn small" onClick={() => void platform.notifier.requestPermission().then(setPerm)}>Allow notifications</button></>}
        </p>
        {perm === 'denied' && <p className="field-warning">Notifications are blocked. Open Android Settings, then Apps, then Task Manager, then Notifications, and turn them on.</p>}
        {exact === 'denied' && <p className="field-warning">Android needs the "Alarms &amp; reminders" permission so alarms ring on time. <button className="btn small" onClick={() => void platform.exactAlarms.open()}>Open setting</button></p>}
        <div className="actions"><button className="btn small" onClick={() => nav.go({ name: 'notifications' })}>View missed alarms</button></div>
      </div>
      <h3>Data and backup</h3>
      <div className="card">
        <p className="muted">All tasks stay on this device. Export all data as JSON, export the task list as CSV, or import a Task Manager JSON backup.</p>
        <div className="actions"><button className="btn" onClick={() => void doExport()}>Export JSON</button><button className="btn" onClick={() => void doExportCsv()}>Export CSV</button><button className="btn" onClick={() => file.current?.click()}>Import JSON</button></div>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        {msg && <p role="status">{msg}</p>}
      </div>
      {pendingImport !== null && <Modal title="Replace all data?" onClose={() => setPendingImport(null)} actions={[{ label: 'Replace with backup', danger: true, onClick: () => void doImport() }, { label: 'Cancel', onClick: () => setPendingImport(null) }]}>Importing replaces ALL tasks, categories and settings on this device with the backup file. If the file has a problem, nothing changes.</Modal>}
    </section>
  );
}
