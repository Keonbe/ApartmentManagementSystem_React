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
  const [minAge, setMinAge] = useState('0');
  // Floors where young children may not live (default 3F, stairs) and the age limit.
  const [floors, setFloors] = useState([]);
  const [restrictedFloors, setRestrictedFloors] = useState([]);
  const [childAge, setChildAge] = useState('5');
  const [errors, setErrors] = useState({});

  const load = useCallback(async () => {
    try {
      const [res, roomsRes] = await Promise.all([
        api.get('get_system_settings.php'),
        api.get('get_rooms.php').catch(() => null),
      ]);
      const s = res.data?.settings || {};
      setCats((s.age_categories || []).map((c) => ({ ...c, rule_fil: c.rule_fil || '' })));
      setMinAge(String(s.min_household_age ?? 0));
      setChildAge(String(s.child_restricted_below_age ?? 5));
      setRestrictedFloors(Array.isArray(s.child_restricted_floors) ? s.child_restricted_floors : ['3F']);
      const roomFloors = [...new Set((roomsRes?.data?.rooms || []).map((r) => r.floor).filter(Boolean))].sort();
      setFloors(roomFloors);
      setErrors({});
      setDirty(false);
    } catch (err) {
      setNotice({ ok: false, text: apiErrorMessage(err, 'Could not load age categories.') });
    }
  }, []);

  // Same rules as update_system_settings.php: whole numbers 0-17.
  const checkAge = (v, label) => (/^\d+$/.test(String(v).trim()) && Number(v) <= 17 ? '' : `${label} must be a whole number from 0 to 17.`);
  const validate = () => {
    const next = {
      minAge: checkAge(minAge, 'Minimum age'),
      childAge: checkAge(childAge, 'Child age limit'),
      floors: restrictedFloors.length > 10 ? 'Choose up to 10 floors.' : '',
    };
    setErrors(next);
    return !next.minAge && !next.childAge && !next.floors;
  };
  const toggleFloor = (f) => {
    setRestrictedFloors((p) => (p.includes(f) ? p.filter((x) => x !== f) : [...p, f]));
    setDirty(true);
  };

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const edit = (i, patch) => { setCats((p) => p.map((c, n) => (n === i ? { ...c, ...patch } : c))); setDirty(true); };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    setNotice(null);
    try {
      const body = cats.map((c) => ({ ...c, min_age: Number(c.min_age), max_age: Number(c.max_age) }));
      const res = await api.post('update_system_settings.php', {
        age_categories: body,
        min_household_age: Number(minAge),
        child_restricted_floors: restrictedFloors,
        child_restricted_below_age: Number(childAge),
      });
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
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
          <p className="m-0 font-semibold text-slate-700">Floors where young children may not live</p>
          <p className="m-0 text-xs text-slate-500">Babies and small children are not accepted on these floors (the 3rd floor, because of the stairs). Other floors have no age limit. Leave every floor unticked for no restriction.</p>
          <div className="flex flex-wrap gap-3" role="group" aria-label="Restricted floors">
            {floors.length === 0 && <span className="text-xs text-slate-400">No floors found.</span>}
            {floors.map((f) => (
              <label key={f} className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                <input type="checkbox" checked={restrictedFloors.includes(f)} onChange={() => toggleFloor(f)} />
                {f}
              </label>
            ))}
          </div>
          {errors.floors && <p role="alert" className="m-0 text-xs font-semibold text-rose-600">{errors.floors}</p>}
          <label className="block font-semibold text-slate-700">Children younger than
            <input type="number" min="0" max="17" step="1" value={childAge} aria-invalid={!!errors.childAge}
              onChange={(e) => { setChildAge(e.target.value); setErrors((p) => ({ ...p, childAge: '' })); setDirty(true); }}
              onBlur={() => setErrors((p) => ({ ...p, childAge: checkAge(childAge, 'Child age limit') }))}
              className={`mt-1 block w-28 rounded-lg border px-3 py-2 font-normal ${errors.childAge ? 'border-rose-400' : 'border-slate-300'}`} />
            <span className="mt-1 block text-xs font-normal text-slate-500">cannot live on the floors ticked above (0 = no limit).</span>
          </label>
          {errors.childAge && <p role="alert" className="m-0 text-xs font-semibold text-rose-600">{errors.childAge}</p>}
        </div>
        <label className="block rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700">Minimum age anywhere in the building (0 = none)
          <input type="number" min="0" max="17" step="1" value={minAge} aria-invalid={!!errors.minAge}
            onChange={(e) => { setMinAge(e.target.value); setErrors((p) => ({ ...p, minAge: '' })); setDirty(true); }}
            onBlur={() => setErrors((p) => ({ ...p, minAge: checkAge(minAge, 'Minimum age') }))}
            className={`mt-1 block w-28 rounded-lg border px-3 py-2 font-normal ${errors.minAge ? 'border-rose-400' : 'border-slate-300'}`} />
          <span className="mt-1 block text-xs font-normal text-slate-500">A tenant cannot add a household member younger than this on any floor. Pets are not allowed (see the rules below).</span>
          {errors.minAge && <span role="alert" className="mt-1 block text-xs font-semibold text-rose-600">{errors.minAge}</span>}
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
          <button type="button" disabled={!dirty || saving} onClick={save} className="ml-auto cursor-pointer rounded-lg border-0 bg-indigo-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save age rules'}</button>
        </div>
      </section>
      <HouseRulesPanel scope="minors" />
    </div>
  );
}
