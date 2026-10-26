import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPeopleRoof, faUserPlus, faUserMinus, faClock } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import PhoneInput from './PhoneInput';
import { LIMITS, checkPersonName, checkPhMobile, toPhE164 } from '../utils/validation';
import { apiErrorMessage } from '../utils/apiError';
import useFieldErrors from '../hooks/useFieldErrors';
import FieldError from './form/FieldError';
import { invalidCls } from './form/formHelpers';

const EMPTY = { fullName: '', relationship: '', contactNo: '', age: '' };

// Household roster on My Room (household_members.php). One shared lease: the
// lease holder signs in; the people living with them are listed here. Adding or
// removing someone is a request that management approves. To replace someone,
// request the removal and the addition.
export default function HouseholdPanel() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null); // member id being confirmed
  // Keys match household_members.php's `add` body.
  const fields = useFieldErrors({
    fullName: (v) => checkPersonName(v, { label: 'Full name', max: LIMITS.fullName }),
    relationship: (v) => ((data?.relationships || []).includes(v) ? '' : 'Please choose a relationship.'),
    contactNo: (v) => (v ? checkPhMobile(v) : ''),
    // A child needs an age (0-17) so the matching age-category rule applies.
    age: (v, all) => {
      if (v === '' || v === undefined) return all.relationship === 'Child' ? "Enter the child's age." : '';
      const n = Number(v);
      if (!/^\d{1,3}$/.test(String(v)) || n > 120) return 'Enter an age from 0 to 120, in whole years.';
      if (data?.minAge && n < data.minAge) return `Children under ${data.minAge} are not allowed to live in the apartment.`;
      const floorRule = data?.childFloorRule;
      if (floorRule && n < floorRule.belowAge) return `Children under ${floorRule.belowAge} cannot live on the ${floorRule.floorLabel} because of the stairs.`;
      if (all.relationship === 'Child' && n > 17) return 'A child must be 17 or younger.';
      return '';
    },
  }, { idPrefix: 'household-' });

  const categoryFor = (age) => (data?.ageCategories || []).find((c) => age >= Number(c.min_age) && age <= Number(c.max_age));

  const load = async () => {
    try {
      const res = await api.get('household_members.php');
      setData(res.data);
    } catch (err) {
      setNotice({ ok: false, text: err.response?.data?.message || 'Could not load your household.' });
    }
  };

  useEffect(() => {
    let active = true;
    api.get('household_members.php')
      .then((res) => { if (active) setData(res.data); })
      .catch((err) => { if (active) setNotice({ ok: false, text: err.response?.data?.message || 'Could not load your household.' }); });
    return () => { active = false; };
  }, []);

  if (!data || !data.hasLease) return null;

  const send = async (body, after) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await api.post('household_members.php', body);
      if (res.data.success) {
        setNotice({ ok: true, text: res.data.message });
        after?.();
        await load();
      } else if (!fields.applyServerErrors(res)) {
        setNotice({ ok: false, text: res.data.message });
      }
    } catch (err) {
      if (!fields.applyServerErrors(err)) setNotice({ ok: false, text: apiErrorMessage(err, 'Request failed.') });
    }
    setBusy(false);
  };

  const change = (key, value) => {
    setForm({ ...form, [key]: value });
    fields.clearError(key);
  };
  const blur = (key) => {
    const v = key === 'fullName' ? form.fullName.trim() : form[key];
    if (v !== form[key]) setForm({ ...form, [key]: v });
    fields.validateField(key, { ...form, [key]: v });
  };

  const submitAdd = (e) => {
    e.preventDefault();
    // ...form used to be sent untrimmed.
    const clean = { ...form, fullName: form.fullName.trim() };
    setForm(clean);
    if (!fields.validateAll(clean)) return;
    send({ action: 'add', ...clean, age: clean.age === '' ? null : Number(clean.age), contactNo: toPhE164(clean.contactNo) }, () => setForm(EMPTY));
  };

  // Asked in the member's row (was window.confirm).
  const requestRemove = (m) => {
    setConfirmRemove(null);
    send({ action: 'remove', memberId: m.id });
  };

  const named = 1 + data.members.filter((m) => m.status === 'Active').length;
  const queued = data.members.filter((m) => m.status === 'Pending').length;
  const isSoloOccupant = data.members.length === 0;
  const full = named + queued >= data.maxOccupants;
  const inputCls = 'w-full min-h-[44px] px-3 rounded-xl bg-slate-950/60 border border-white/15 text-white text-base focus:outline-none focus:ring-2 focus:ring-indigo-300 box-border';

  return (
    <section aria-labelledby="household-heading" className="bg-slate-900/80 backdrop-blur-md rounded-2xl border border-white/10 p-5 sm:p-6 text-left flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <FontAwesomeIcon icon={faPeopleRoof} className="mt-1 text-lg text-indigo-300" aria-hidden="true" />
          <div>
            <h2 id="household-heading" className="m-0 text-xl font-bold text-white">Household</h2>
            <p className="m-0 mt-1 text-sm text-slate-300">
              {isSoloOccupant
                ? "You're the only registered occupant of this room. Add the people who live with you."
                : 'You are the main tenant and the only account for this room. List everyone who lives with you.'}
            </p>
          </div>
        </div>
        <p className="m-0 text-sm font-semibold text-slate-200 bg-white/5 border border-white/15 rounded-full px-3 py-1 self-start shrink-0">
          {data.occupants} registered, {named} named, at most {data.maxOccupants}
        </p>
      </div>

      <ul className="list-none m-0 p-0 divide-y divide-white/10 border border-white/10 rounded-xl overflow-hidden">
        <li className="flex items-center justify-between gap-3 px-4 py-3 bg-white/5">
          <span className="text-sm font-bold text-white">{data.leaseHolder}</span>
          <span className="text-sm font-semibold text-indigo-300">Main tenant</span>
        </li>
        {data.members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-100 m-0 truncate">{m.fullName}</p>
              <p className="text-sm text-slate-300 m-0">
                {m.relationship}{m.age !== null && m.age !== undefined ? `, age ${m.age}` : ''}{m.ageCategory ? ` (${(data.ageCategories || []).find((c) => c.key === m.ageCategory)?.label || m.ageCategory})` : ''}{m.contactNo ? `, ${m.contactNo}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {(m.status === 'Pending' || m.removalRequested) && (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-200 bg-amber-400/10 border border-amber-400/30 rounded-full px-2.5 py-1">
                  <FontAwesomeIcon icon={faClock} aria-hidden="true" />
                  {m.status === 'Pending' ? 'Awaiting approval' : 'Removal requested'}
                </span>
              )}
              {!m.removalRequested && (confirmRemove === m.id ? (
                <span role="group" aria-label={`Confirm for ${m.fullName}`} className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-slate-200">{m.status === 'Pending' ? 'Withdraw this request?' : 'Ask management to remove them?'}</span>
                  <button type="button" disabled={busy} onClick={() => requestRemove(m)}
                    className="min-h-[44px] px-3 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-sm font-bold border-0 cursor-pointer disabled:opacity-50">
                    {m.status === 'Pending' ? 'Withdraw' : 'Yes, remove'}
                  </button>
                  <button type="button" onClick={() => setConfirmRemove(null)}
                    className="min-h-[44px] px-3 rounded-lg bg-transparent border border-white/20 text-slate-200 text-sm font-semibold cursor-pointer hover:bg-white/10">
                    Keep
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmRemove(m.id)}
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-3 text-sm font-bold text-rose-300 hover:text-rose-200 bg-transparent border border-rose-400/30 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  <FontAwesomeIcon icon={faUserMinus} aria-hidden="true" />
                  {m.status === 'Pending' ? 'Withdraw' : 'Remove'}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>

      {data.occupants > named && (
        <p className="text-sm text-slate-300 m-0">
          Your room is registered for {data.occupants} occupants, but only {named} are named. Adding the others below doesn't change your rent.
        </p>
      )}

      <form onSubmit={submitAdd} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-start m-0" noValidate>
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-300 sm:col-span-2">
          Full name
          <input {...fields.fieldA11y('fullName')} autoComplete="off" required maxLength={LIMITS.fullName} value={form.fullName}
            onChange={(e) => change('fullName', e.target.value)} onBlur={() => form.fullName && blur('fullName')}
            className={inputCls + invalidCls(fields.errors.fullName)} disabled={full} />
          <FieldError id="household-fullName" error={fields.errors.fullName} className="m-0 normal-case tracking-normal font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-300">
          Relationship
          <select {...fields.fieldA11y('relationship')} required value={form.relationship} onChange={(e) => change('relationship', e.target.value)}
            className={inputCls + invalidCls(fields.errors.relationship)} disabled={full}>
            <option value="" disabled>Select…</option>
            {(data.relationships || []).map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <FieldError id="household-relationship" error={fields.errors.relationship} className="m-0 normal-case tracking-normal font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-300">
          {form.relationship === 'Child' ? 'Age (required)' : 'Age (optional)'}
          {/* Text, not type="number": that accepted e, -, . and 1e3. Digits only, at most 3. */}
          <input {...fields.fieldA11y('age')} type="text" inputMode="numeric" pattern="[0-9]*" maxLength={3} autoComplete="off" value={form.age}
            onChange={(e) => change('age', e.target.value.replace(/\D/g, '').slice(0, 3))} onBlur={() => blur('age')}
            placeholder="0–120" className={inputCls + invalidCls(fields.errors.age)} disabled={full} />
          {form.age !== '' && categoryFor(Number(form.age)) && (
            <span className="normal-case tracking-normal font-normal text-indigo-300">{categoryFor(Number(form.age)).label}: {categoryFor(Number(form.age)).rule}</span>
          )}
          <FieldError id="household-age" error={fields.errors.age} className="m-0 normal-case tracking-normal font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-300">
          Mobile (optional)
          <PhoneInput
            id="household-contactNo"
            name="contactNo"
            value={form.contactNo}
            onChange={(digits) => change('contactNo', digits)}
            onBlur={() => blur('contactNo')}
            error={fields.errors.contactNo}
            disabled={full}
            prefixClassName="flex items-center gap-1 px-2.5 rounded-l-xl bg-slate-800 border border-white/15 border-r-0 text-slate-200 text-sm font-bold select-none pointer-events-none normal-case tracking-normal"
            inputClassName={`w-full min-h-[44px] px-3 rounded-r-xl bg-slate-950/60 border border-white/15 text-white text-base focus:outline-none focus:ring-2 focus:ring-indigo-300 box-border normal-case tracking-normal font-normal disabled:opacity-60${invalidCls(fields.errors.contactNo)}`}
          />
        </label>
        <div className="sm:col-span-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-sm text-slate-300 m-0">
            {data.minAge ? `Children under ${data.minAge} are not allowed. ` : ''}
            {data.childFloorRule ? `Children under ${data.childFloorRule.belowAge} cannot live on the ${data.childFloorRule.floorLabel} (stairs). ` : ''}
            Pets are not allowed. {full
              ? `Your unit has reached the limit of ${data.maxOccupants} occupants.`
              : 'Requests are reviewed by management. A new person above 4 occupants adds the monthly surcharge.'}
          </p>
          <button
            type="submit"
            disabled={busy || full}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold border-0 cursor-pointer disabled:opacity-50 shrink-0"
          >
            <FontAwesomeIcon icon={faUserPlus} aria-hidden="true" />
            {busy ? 'Sending…' : 'Request to add'}
          </button>
        </div>
      </form>

      {notice && (
        <p role={notice.ok ? 'status' : 'alert'} className={`text-sm font-semibold m-0 ${notice.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{notice.text}</p>
      )}
    </section>
  );
}
