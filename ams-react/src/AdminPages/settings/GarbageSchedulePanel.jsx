import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import api from '../../api/axiosConfig';
import { apiErrorMessage } from '../../utils/apiError';
import { btn } from '../../Components/admin/ui/styles';

const DAYS = ['Every day', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MAX_ROWS = 14;
const FIELD = 'w-full rounded-control border border-slate-300 bg-white px-3 py-2 text-body text-slate-800';

// Settings -> House Rules: the garbage and housekeeping schedule tenants see on /housekeeping.
// Saves on its own through update_system_settings.php (garbage_schedule, a JSON list).
export default function GarbageSchedulePanel() {
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let alive = true;
    api.get('get_system_settings.php')
      .then(({ data }) => {
        if (!alive) return;
        let list;
        try { list = JSON.parse(data?.settings?.garbage_schedule || data?.garbage_schedule || '[]'); } catch { list = []; }
        setRows(Array.isArray(list) ? list : []);
        setLoaded(true);
      })
      .catch(() => { if (alive) { setNotice({ ok: false, text: 'Could not load the schedule.' }); setLoaded(true); } });
    return () => { alive = false; };
  }, []);

  const update = (i, patch) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const res = await api.post('update_system_settings.php', { garbage_schedule: JSON.stringify(rows.map((r) => ({ day: r.day, what: (r.what || '').trim(), time: (r.time || '').trim() }))) });
      setNotice({ ok: !!res.data.success, text: res.data.message || (res.data.success ? 'Saved.' : 'Could not save.') });
    } catch (err) {
      setNotice({ ok: false, text: apiErrorMessage(err, 'Could not save the schedule.') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="garbage-schedule-title" className="mt-8 rounded-card border border-slate-200 bg-white p-5">
      <h3 id="garbage-schedule-title" className="m-0 text-title font-bold text-slate-800">Garbage and Housekeeping Schedule</h3>
      <p className="m-0 mt-1 mb-4 text-body text-slate-600">Tenants see this on the Housekeeping page. Add one row for each collection or cleaning day.</p>
      {!loaded ? <p className="m-0 text-body text-slate-600">Loading…</p> : (
        <>
          {rows.length === 0 && <p className="m-0 mb-3 text-body text-slate-600">No schedule yet. Tenants will see a note that none has been posted.</p>}
          <ul className="m-0 list-none space-y-3 p-0">
            {rows.map((row, i) => (
              <li key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[10rem_1fr_9rem_auto] sm:items-end">
                <label className="text-label font-medium text-slate-600">Day
                  <select className={FIELD} value={row.day} onChange={(e) => update(i, { day: e.target.value })}>
                    {DAYS.map((d) => <option key={d}>{d}</option>)}
                  </select>
                </label>
                <label className="text-label font-medium text-slate-600">What
                  <input className={FIELD} maxLength={60} value={row.what} placeholder="Biodegradable waste" onChange={(e) => update(i, { what: e.target.value })} />
                </label>
                <label className="text-label font-medium text-slate-600">Time (optional)
                  <input className={FIELD} maxLength={30} value={row.time} placeholder="6:00 AM" onChange={(e) => update(i, { time: e.target.value })} />
                </label>
                <button type="button" aria-label={`Remove row ${i + 1}`} onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))} className={btn('secondary', 'md')}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" disabled={rows.length >= MAX_ROWS} onClick={() => setRows((r) => [...r, { day: 'Monday', what: '', time: '' }])} className={btn('secondary', 'md')}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Add a row
            </button>
            <button type="button" disabled={saving} onClick={save} className={btn('primary', 'md')}>{saving ? 'Saving…' : 'Save schedule'}</button>
            {notice && <span role="status" className={`text-label font-semibold ${notice.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{notice.text}</span>}
          </div>
        </>
      )}
    </section>
  );
}
