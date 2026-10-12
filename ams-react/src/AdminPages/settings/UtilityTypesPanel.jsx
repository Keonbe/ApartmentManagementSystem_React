import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axiosConfig';
import { apiErrorMessage } from '../../utils/apiError';

const EMPTY = { name: '', unit_label: '', billing_mode: 'flat', default_rate: '', is_active: 1 };

// Utility types beyond water and electricity (internet, gas, ...). Water and
// electricity stay built in. Active types appear on the Record Reading form.
export default function UtilityTypesPanel() {
  const [types, setTypes] = useState([]);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get('manage_utility_types.php', { params: { all: 1 } });
      setTypes(res.data?.types || []);
    } catch (err) {
      setNotice({ ok: false, text: apiErrorMessage(err, 'Could not load utility types.') });
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const body = { ...editing, default_rate: Number(editing.default_rate) };
      const res = editing.id ? await api.put('manage_utility_types.php', body) : await api.post('manage_utility_types.php', body);
      if (!res.data.success) throw res;
      setEditing(null);
      setNotice({ ok: true, text: 'Utility type saved.' });
      await load();
    } catch (err) {
      setNotice({ ok: false, text: apiErrorMessage(err, 'Could not save the utility type.') });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (t) => {
    try {
      const res = await api.put('manage_utility_types.php', { ...t, default_rate: Number(t.default_rate), is_active: Number(t.is_active) ? 0 : 1 });
      if (!res.data.success) throw res;
      await load();
    } catch (err) {
      setNotice({ ok: false, text: apiErrorMessage(err) });
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5">
        <div>
          <h3 className="m-0 text-base font-extrabold text-slate-800">Other Utilities</h3>
          <p className="m-0 mt-1 text-sm text-slate-500">Add utilities beyond water and electricity, billed per reading as a flat fee or as a meter reading times a rate. Their charge is added to the tenant&apos;s invoice under Services.</p>
        </div>
        <button type="button" onClick={() => setEditing({ ...EMPTY })} className="cursor-pointer rounded-xl border-0 bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700">Add utility</button>
      </div>
      {notice && <p role={notice.ok ? 'status' : 'alert'} className={`m-0 rounded-xl p-3 text-sm ${notice.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{notice.text}</p>}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{['Name', 'Billing', 'Rate / fee', 'Status', ''].map((h) => <th key={h} className="px-4 py-3 font-bold">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {types.length === 0 ? <tr><td colSpan="5" className="px-4 py-8 text-center text-slate-500">No other utilities yet.</td></tr> : types.map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-3 font-bold text-slate-800">{t.name}</td>
                <td className="px-4 py-3 text-slate-600">{t.billing_mode === 'metered' ? `Metered${t.unit_label ? ` (${t.unit_label})` : ''}` : 'Flat fee'}</td>
                <td className="px-4 py-3 text-slate-600">₱{Number(t.default_rate).toFixed(2)}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${Number(t.is_active) ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{Number(t.is_active) ? 'Active' : 'Inactive'}</span></td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEditing({ ...t, unit_label: t.unit_label || '' })} className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700">Edit</button>
                    <button type="button" onClick={() => toggle(t)} className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700">{Number(t.is_active) ? 'Deactivate' : 'Activate'}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) setEditing(null); }}>
          <form onSubmit={save} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="m-0 text-lg font-extrabold text-slate-800">{editing.id ? 'Edit utility' : 'Add utility'}</h3>
            <label className="block text-sm font-semibold text-slate-700">Name
              <input required maxLength={60} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
            <label className="block text-sm font-semibold text-slate-700">Billing
              <select value={editing.billing_mode} onChange={(e) => setEditing({ ...editing, billing_mode: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal">
                <option value="flat">Flat fee per reading</option>
                <option value="metered">Metered (reading × rate)</option>
              </select>
            </label>
            {editing.billing_mode === 'metered' && (
              <label className="block text-sm font-semibold text-slate-700">Unit label (e.g. kg, m³)
                <input maxLength={20} value={editing.unit_label} onChange={(e) => setEditing({ ...editing, unit_label: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
            )}
            <label className="block text-sm font-semibold text-slate-700">{editing.billing_mode === 'metered' ? 'Default rate per unit (₱)' : 'Default fee (₱)'}
              <input required type="number" min="0" max="100000" step="0.01" value={editing.default_rate} onChange={(e) => setEditing({ ...editing, default_rate: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" disabled={saving} onClick={() => setEditing(null)} className="cursor-pointer rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
              <button type="submit" disabled={saving} className="cursor-pointer rounded-lg border-0 bg-indigo-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
