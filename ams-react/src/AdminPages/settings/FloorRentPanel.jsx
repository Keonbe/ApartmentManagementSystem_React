import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axiosConfig';
import { apiErrorMessage } from '../../utils/apiError';
import { TH, THEAD, btn } from '../../Components/admin/ui/styles';
import askConfirm from '../../utils/askConfirm';

// Floor -> fixed monthly rent. Saved with update_system_settings.php
// (floor_rates). Changing a price never touches occupied units; "Apply to
// vacant units" copies it onto vacant units that have no hand-set rent.
export default function FloorRentPanel() {
  const [rates, setRates] = useState({});      // saved: { '1F': 5000 }
  const [draft, setDraft] = useState({});      // editable strings
  const [floors, setFloors] = useState([]);
  const [newFloor, setNewFloor] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([api.get('get_system_settings.php'), api.get('get_rooms.php')]);
      const saved = s.data?.settings?.floor_rates || {};
      setRates(saved);
      setDraft(Object.fromEntries(Object.entries(saved).map(([k, v]) => [k, String(v)])));
      const fromUnits = (r.data?.data || r.data?.rooms || []).map((u) => String(u.floor || '').trim()).filter(Boolean);
      setFloors([...new Set([...fromUnits, ...Object.keys(saved)])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
    } catch (err) {
      setNotice({ ok: false, text: apiErrorMessage(err, 'Could not load floor rents.') });
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const dirty = floors.some((f) => (draft[f] ?? '') !== (rates[f] !== undefined ? String(rates[f]) : ''));

  const save = async () => {
    const out = {};
    for (const f of floors) {
      const v = (draft[f] ?? '').trim();
      if (v === '') continue;
      if (!(Number(v) > 0)) { setNotice({ ok: false, text: `Floor ${f}: enter a rent above 0, or leave it blank.` }); return; }
      out[f] = Number(v);
    }
    setSaving(true);
    setNotice(null);
    try {
      const res = await api.post('update_system_settings.php', { floor_rates: out });
      if (!res.data.success) throw res;
      setNotice({ ok: true, text: 'Floor rents saved. Existing units are unchanged until you apply them.' });
      await load();
    } catch (err) {
      setNotice({ ok: false, text: apiErrorMessage(err, 'Could not save floor rents.') });
    } finally {
      setSaving(false);
    }
  };

  const apply = async (floor) => {
    try {
      const prev = await api.post('apply_floor_rate.php', { floor, preview: true });
      const p = prev.data;
      if (p.updated === 0) {
        setNotice({ ok: true, text: `Floor ${floor}: no vacant unit needs a change (${p.skippedCustom} with a hand-set rent, ${p.skippedOccupied} occupied or reserved).` });
        return;
      }
      if (!(await askConfirm(`Set ₱${p.rate} on ${p.updated} vacant unit(s) on floor ${floor}? ${p.skippedCustom} with a hand-set rent and ${p.skippedOccupied} occupied or reserved unit(s) stay as they are.`))) return;
      const res = await api.post('apply_floor_rate.php', { floor });
      setNotice({ ok: !!res.data.success, text: res.data.success ? `Updated ${res.data.updated} vacant unit(s) on floor ${floor}.` : res.data.message });
    } catch (err) {
      setNotice({ ok: false, text: apiErrorMessage(err) });
    }
  };

  const addFloor = () => {
    const f = newFloor.trim();
    if (!f || floors.includes(f)) { setNewFloor(''); return; }
    setFloors((p) => [...p, f]);
    setNewFloor('');
  };

  return (
    <section className="space-y-5">
      <div className="rounded-card border border-slate-200 bg-white p-5">
        <h3 className="m-0 text-title font-bold text-slate-800">Floor Rent</h3>
        <p className="m-0 mt-1 text-body text-slate-500">New units start at their floor&apos;s rent, and you can still change any unit&apos;s rent by hand. Changing a floor price does not touch occupied units: they keep the rent their tenant agreed to. Use &quot;Apply to vacant units&quot; to copy a new price onto vacant units that have no hand-set rent.</p>
      </div>
      {notice && <p role={notice.ok ? 'status' : 'alert'} className={`m-0 rounded-card p-3 text-body ${notice.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{notice.text}</p>}
      <div className="overflow-x-auto rounded-card border border-slate-200 bg-white">
        <table className="w-full min-w-[480px] text-left text-body">
          <thead className={THEAD}><tr><th className={TH}>Floor</th><th className={TH}>Monthly rent (₱)</th><th className={TH}>Vacant units</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {floors.length === 0 ? <tr><td colSpan="3" className="px-4 py-8 text-center text-slate-500">No floors yet. Add one below.</td></tr> : floors.map((f) => (
              <tr key={f}>
                <td className="px-4 py-3 font-bold text-slate-800">{f}</td>
                <td className="px-4 py-3"><input type="number" min="0.01" max="1000000" step="0.01" value={draft[f] ?? ''} onChange={(e) => setDraft((p) => ({ ...p, [f]: e.target.value }))} aria-label={`Monthly rent for floor ${f}`} className="w-36 rounded-control border border-slate-300 px-3 py-2" /></td>
                <td className="px-4 py-3"><button type="button" disabled={rates[f] === undefined || dirty} onClick={() => apply(f)} className="cursor-pointer rounded-control border border-indigo-200 bg-white px-3 py-1.5 text-label font-bold text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40">Apply to vacant units</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input value={newFloor} maxLength={50} onChange={(e) => setNewFloor(e.target.value)} placeholder="Add a floor, e.g. 7F" className="rounded-control border border-slate-300 px-3 py-2 text-body" />
        <button type="button" onClick={addFloor} className={btn('secondary', 'md')}>Add floor</button>
        <button type="button" disabled={!dirty || saving} onClick={save} className={btn('primary', 'md', 'ml-auto')}>{saving ? 'Saving…' : 'Save floor rents'}</button>
      </div>
    </section>
  );
}
