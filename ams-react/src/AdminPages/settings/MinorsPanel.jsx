import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axiosConfig';
import { apiErrorMessage } from '../../utils/apiError';
import HouseRulesPanel from './HouseRulesPanel';

const BLANK = { label: '', min_age: '', max_age: '', rule: '', rule_fil: '' };

// Age categories (infant / toddler / minor ...) with the rule for each, plus the
// children-and-pets rules list. The categories save with update_system_settings.php
// (age_categories); the rules list saves through house_rules.php (scope 'minors').
export default function MinorsPanel() {
  const [cats, setCats] = useState([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [minAge, setMinAge] = useState('12');

  const load = useCallback(async () => {
    try {
      const res = await api.get('get_system_settings.php');
      setCats((res.data?.settings?.age_categories || []).map((c) => ({ ...c, rule_fil: c.rule_fil || '' })));
      setMinAge(String(res.data?.settings?.min_household_age ?? 12));
      setDirty(false);
    } catch (err) {
      setNotice({ ok: false, text: apiErrorMessage(err, 'Could not load age categories.') });
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const edit = (i, patch) => { setCats((p) => p.map((c, n) => (n === i ? { ...c, ...patch } : c))); setDirty(true); };

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const body = cats.map((c) => ({ ...c, min_age: Number(c.min_age), max_age: Number(c.max_age) }));
      const res = await api.post('update_system_settings.php', { age_categories: body, min_household_age: Number(minAge) });
      if (!res.data.success) throw res;
      setNotice({ ok: true, text: 'Age categories saved.' });
      await load();
    } catch (err) {
      setNotice({ ok: false, text: apiErrorMessage(err, 'Could not save age categories.') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="m-0 text-base font-extrabold text-slate-800">Age Categories</h3>
          <p className="m-0 mt-1 text-sm text-slate-500">Define the age ranges for infants, toddlers and minors and the rule that applies to each. A tenant who adds a child to the household gives the child&apos;s age, and the matching category is recorded.</p>
        </div>
        <label className="block rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700">Youngest age allowed to live in the apartment
          <input type="number" min="0" max="17" value={minAge} onChange={(e) => { setMinAge(e.target.value); setDirty(true); }} className="mt-1 block w-28 rounded-lg border border-slate-300 px-3 py-2 font-normal" />
          <span className="mt-1 block text-xs font-normal text-slate-500">A tenant cannot add a household member younger than this. Pets are not allowed (see the rules below).</span>
        </label>
        {notice && <p role={notice.ok ? 'status' : 'alert'} className={`m-0 rounded-xl p-3 text-sm ${notice.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{notice.text}</p>}
        {cats.map((c, i) => (
          <div key={c.key || i} className="grid grid-cols-12 gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <label className="col-span-12 text-xs font-bold text-slate-600 sm:col-span-6">Name
              <input maxLength={40} value={c.label} onChange={(e) => edit(i, { label: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
            </label>
            <label className="col-span-6 text-xs font-bold text-slate-600 sm:col-span-3">From age
              <input type="number" min="0" max="17" value={c.min_age} onChange={(e) => edit(i, { min_age: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
            </label>
            <label className="col-span-6 text-xs font-bold text-slate-600 sm:col-span-3">To age
              <input type="number" min="0" max="17" value={c.max_age} onChange={(e) => edit(i, { max_age: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
            </label>
            <label className="col-span-12 text-xs font-bold text-slate-600 sm:col-span-6">Rule (English)
              <textarea rows={3} maxLength={500} value={c.rule} onChange={(e) => edit(i, { rule: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
            </label>
            <label className="col-span-12 text-xs font-bold text-slate-600 sm:col-span-6">Rule (Filipino, optional)
              <textarea rows={3} maxLength={500} value={c.rule_fil} onChange={(e) => edit(i, { rule_fil: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
            </label>
            <div className="col-span-12 text-right">
              <button type="button" onClick={() => { setCats((p) => p.filter((_, n) => n !== i)); setDirty(true); }} disabled={cats.length <= 1} className="cursor-pointer border-0 bg-transparent p-0 text-xs font-bold text-rose-600 hover:underline disabled:opacity-40">Remove category</button>
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={cats.length >= 6} onClick={() => { setCats((p) => [...p, { ...BLANK }]); setDirty(true); }} className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40">Add category</button>
          <button type="button" disabled={!dirty || saving} onClick={save} className="ml-auto cursor-pointer rounded-lg border-0 bg-indigo-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save age categories'}</button>
        </div>
      </section>
      <HouseRulesPanel scope="minors" />
    </div>
  );
}
