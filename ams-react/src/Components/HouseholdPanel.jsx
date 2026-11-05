import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPeopleRoof, faUserPlus, faUserMinus, faClock, faPhone, faCrown, faXmark } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import PhoneInput from './PhoneInput';
import useDialog from '../hooks/useDialog';
import { LIMITS, checkPersonName, checkPhMobile, toPhE164 } from '../utils/validation';
import { apiErrorMessage } from '../utils/apiError';
import useFieldErrors from '../hooks/useFieldErrors';
import FieldError from './form/FieldError';
import { invalidCls } from './form/formHelpers';

const EMPTY = { fullName: '', relationship: '', contactNo: '', age: '' };

const initials = (name) => String(name || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

// Household roster on My Room. MyRoom reads household_members.php (it also
// feeds the page's Important info) and passes it in as `data`; `onChanged`
// reads it again after a request. One shared lease: the lease holder signs in;
// the people living with them are listed here as cards. Adding someone opens a
// dialog (`addOpen`, lifted so Important info can open it too). Adding or
// removing someone is a request that management approves. To replace someone,
// request the removal and the addition.
export default function HouseholdPanel({ data, error, onChanged, addOpen, onAddOpenChange }) {
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

  // Not closable while the request is being sent.
  const closeAdd = () => { if (!busy) onAddOpenChange(false); };
  const dialogRef = useDialog(addOpen, closeAdd);

  if (!data) {
    return error ? (
      <section aria-labelledby="household-heading" className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 text-left">
        <h2 id="household-heading" className="m-0 text-xl font-bold text-slate-900">Household</h2>
        <p role="alert" className="m-0 mt-2 text-sm font-semibold text-rose-700">{error}</p>
      </section>
    ) : null;
  }
  if (!data.hasLease) return null;

  const categoryFor = (age) => (data.ageCategories || []).find((c) => age >= Number(c.min_age) && age <= Number(c.max_age));
  const categoryLabel = (key) => (data.ageCategories || []).find((c) => c.key === key)?.label || key;

  const send = async (body, after) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await api.post('household_members.php', body);
      if (res.data.success) {
        setNotice({ ok: true, text: res.data.message });
        after?.();
        await onChanged();
      } else if (!fields.applyServerErrors(res)) {
        setNotice({ ok: false, text: res.data.message, inDialog: body.action === 'add' });
      }
    } catch (err) {
      if (!fields.applyServerErrors(err)) setNotice({ ok: false, text: apiErrorMessage(err, 'Request failed.'), inDialog: body.action === 'add' });
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

  const openAdd = () => {
    setNotice(null);
    onAddOpenChange(true);
  };

  const submitAdd = (e) => {
    e.preventDefault();
    // ...form used to be sent untrimmed.
    const clean = { ...form, fullName: form.fullName.trim() };
    setForm(clean);
    if (!fields.validateAll(clean)) return;
    send({ action: 'add', ...clean, age: clean.age === '' ? null : Number(clean.age), contactNo: toPhE164(clean.contactNo) }, () => {
      setForm(EMPTY);
      onAddOpenChange(false);
    });
  };

  // Asked in the member's card (was window.confirm).
  const requestRemove = (m) => {
    setConfirmRemove(null);
    send({ action: 'remove', memberId: m.id });
  };

  const named = 1 + data.members.filter((m) => m.status === 'Active').length;
  const queued = data.members.filter((m) => m.status === 'Pending').length;
  const isSoloOccupant = data.members.length === 0;
  const full = named + queued >= data.maxOccupants;
  const inputCls = 'w-full min-h-[44px] px-3 rounded-xl bg-white border border-slate-200 text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 box-border';
  const labelCls = 'flex flex-col gap-1.5 text-sm font-bold text-slate-700';
  const ageCategory = form.age !== '' ? categoryFor(Number(form.age)) : null;
  // One segment per allowed occupant: named, awaiting approval, free.
  const seats = Array.from({ length: data.maxOccupants }, (_, i) => (i < named ? 'named' : i < named + queued ? 'queued' : 'free'));
  const SEAT = { named: 'bg-indigo-600', queued: 'bg-amber-400', free: 'bg-slate-200' };

  return (
    <section aria-labelledby="household-heading" className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 text-left flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-10 h-10 shrink-0 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center" aria-hidden="true">
            <FontAwesomeIcon icon={faPeopleRoof} />
          </span>
          <div className="min-w-0">
            <h2 id="household-heading" className="m-0 text-xl font-bold text-slate-900">Household</h2>
            <p className="m-0 mt-1 text-sm text-slate-600">
              {isSoloOccupant
                ? "You're the only registered occupant of this room. Add the people who live with you."
                : 'Everyone who lives in your room. You are the main tenant and the only account.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={openAdd}
          disabled={busy || full}
          title={full ? `Your unit has reached the limit of ${data.maxOccupants} occupants.` : undefined}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold border-0 cursor-pointer transition-[background-color,transform] active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          <FontAwesomeIcon icon={faUserPlus} aria-hidden="true" />
          Add a member
        </button>
      </div>

      {/* Occupancy at a glance. The text carries the numbers; the bar is decoration. */}
      <div>
        <div aria-hidden="true" className="flex gap-1">
          {seats.map((s, i) => <span key={i} className={`h-2 flex-1 rounded-full transition-colors duration-500 ${SEAT[s]}`} />)}
        </div>
        <p className="m-0 mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
          <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-indigo-600" /><strong className="text-slate-900">{named}</strong> named</span>
          {queued > 0 && <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-400" /><strong className="text-slate-900">{queued}</strong> awaiting approval</span>}
          <span>Registered for <strong className="text-slate-900">{data.occupants}</strong></span>
          <span>Limit <strong className="text-slate-900">{data.maxOccupants}</strong></span>
        </p>
      </div>

      <ul className="list-none m-0 p-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 stagger-children">
        <li className="flex items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
          <span aria-hidden="true" className="w-11 h-11 shrink-0 rounded-full bg-indigo-600 text-white text-sm font-black flex items-center justify-center">{initials(data.leaseHolder)}</span>
          <div className="min-w-0">
            <p className="m-0 text-sm font-bold text-slate-900 truncate">{data.leaseHolder}</p>
            <p className="m-0 mt-1 inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700">
              <FontAwesomeIcon icon={faCrown} aria-hidden="true" /> Main tenant
            </p>
          </div>
        </li>
        {data.members.map((m) => {
          const waiting = m.status === 'Pending' || m.removalRequested;
          const confirming = confirmRemove === m.id;
          return (
            <li key={m.id} className={`flex flex-col gap-3 rounded-xl border p-4 transition-shadow hover:shadow-md ${waiting ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
              <div className="flex items-start gap-3 min-w-0">
                <span aria-hidden="true" className={`w-11 h-11 shrink-0 rounded-full text-sm font-black flex items-center justify-center ${waiting ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{initials(m.fullName)}</span>
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-sm font-bold text-slate-900 truncate">{m.fullName}</p>
                  <p className="m-0 mt-0.5 text-sm text-slate-600">
                    {m.relationship}
                    {m.age !== null && m.age !== undefined ? ` · ${m.age} yrs` : ''}
                    {m.ageCategory ? ` · ${categoryLabel(m.ageCategory)}` : ''}
                  </p>
                  {m.contactNo && (
                    <p className="m-0 mt-0.5 inline-flex items-center gap-1.5 text-sm text-slate-600 tabular-nums">
                      <FontAwesomeIcon icon={faPhone} className="text-xs text-slate-400" aria-hidden="true" />{m.contactNo}
                    </p>
                  )}
                </div>
              </div>
              {(waiting || !m.removalRequested) && (
                <div className="flex flex-wrap items-center justify-between gap-2 mt-auto">
                  {waiting ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 bg-amber-100 border border-amber-200 rounded-full px-2.5 py-1">
                      <FontAwesomeIcon icon={faClock} aria-hidden="true" />
                      {m.status === 'Pending' ? 'Awaiting approval' : 'Removal requested'}
                    </span>
                  ) : <span />}
                  {!m.removalRequested && !confirming && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmRemove(m.id)}
                      className="inline-flex items-center gap-1.5 min-h-[40px] px-3 text-sm font-bold text-rose-700 hover:bg-rose-50 bg-transparent border border-rose-200 rounded-lg cursor-pointer transition-colors disabled:opacity-50"
                    >
                      <FontAwesomeIcon icon={faUserMinus} aria-hidden="true" />
                      {m.status === 'Pending' ? 'Withdraw' : 'Remove'}
                    </button>
                  )}
                </div>
              )}
              {confirming && (
                <div role="group" aria-label={`Confirm for ${m.fullName}`} className="flex flex-col gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 animate-fade-in">
                  <span className="text-sm font-semibold text-slate-800">{m.status === 'Pending' ? 'Withdraw this request?' : 'Ask management to remove them?'}</span>
                  <span className="flex flex-wrap gap-2">
                    <button type="button" disabled={busy} onClick={() => requestRemove(m)}
                      className="min-h-[40px] px-3 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-sm font-bold border-0 cursor-pointer disabled:opacity-50">
                      {m.status === 'Pending' ? 'Withdraw' : 'Yes, remove'}
                    </button>
                    <button type="button" onClick={() => setConfirmRemove(null)}
                      className="min-h-[40px] px-3 rounded-lg bg-transparent border border-slate-300 text-slate-700 text-sm font-semibold cursor-pointer hover:bg-slate-100">
                      Keep
                    </button>
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {notice && !notice.inDialog && (
        <p role={notice.ok ? 'status' : 'alert'} className={`text-sm font-semibold m-0 animate-fade-in ${notice.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{notice.text}</p>
      )}

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 modal-overlay-anim" onClick={closeAdd}>
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="household-add-title" tabIndex={-1}
            className="modal-card-anim sheet-mobile bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[92vh] overflow-y-auto outline-none text-left"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-200">
              <span className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0" aria-hidden="true">
                <FontAwesomeIcon icon={faUserPlus} />
              </span>
              <div className="flex-1 min-w-0">
                <h3 id="household-add-title" className="m-0 text-base font-bold text-slate-900">Add a household member</h3>
                <p className="m-0 mt-0.5 text-sm text-slate-600">Management reviews the request before they're added.</p>
              </div>
              <button type="button" onClick={closeAdd} disabled={busy} aria-label="Close"
                className="w-10 h-10 shrink-0 rounded-full bg-transparent border-0 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer disabled:opacity-50">
                <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={submitAdd} className="m-0" noValidate>
              <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className={`${labelCls} sm:col-span-2`}>
                  Full name
                  <input {...fields.fieldA11y('fullName')} data-autofocus autoComplete="off" required maxLength={LIMITS.fullName} value={form.fullName}
                    onChange={(e) => change('fullName', e.target.value)} onBlur={() => form.fullName && blur('fullName')}
                    className={inputCls + invalidCls(fields.errors.fullName)} />
                  <FieldError id="household-fullName" error={fields.errors.fullName} className="m-0 font-normal" />
                </label>
                <label className={labelCls}>
                  Relationship
                  <select {...fields.fieldA11y('relationship')} required value={form.relationship} onChange={(e) => change('relationship', e.target.value)}
                    className={inputCls + invalidCls(fields.errors.relationship)}>
                    <option value="" disabled>Select…</option>
                    {(data.relationships || []).map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <FieldError id="household-relationship" error={fields.errors.relationship} className="m-0 font-normal" />
                </label>
                <label className={labelCls}>
                  {form.relationship === 'Child' ? 'Age (required)' : 'Age (optional)'}
                  {/* Text, not type="number": that accepted e, -, . and 1e3. Digits only, at most 3. */}
                  <input {...fields.fieldA11y('age')} type="text" inputMode="numeric" pattern="[0-9]*" maxLength={3} autoComplete="off" value={form.age}
                    onChange={(e) => change('age', e.target.value.replace(/\D/g, '').slice(0, 3))} onBlur={() => blur('age')}
                    placeholder="0–120" className={inputCls + invalidCls(fields.errors.age)} />
                  {ageCategory && (
                    <span className="font-normal text-indigo-700">{ageCategory.label}: {ageCategory.rule}</span>
                  )}
                  <FieldError id="household-age" error={fields.errors.age} className="m-0 font-normal" />
                </label>
                <label className={`${labelCls} sm:col-span-2`}>
                  Mobile (optional)
                  <PhoneInput
                    id="household-contactNo"
                    name="contactNo"
                    value={form.contactNo}
                    onChange={(digits) => change('contactNo', digits)}
                    onBlur={() => blur('contactNo')}
                    error={fields.errors.contactNo}
                    prefixClassName="flex items-center gap-1 px-2.5 rounded-l-xl bg-slate-100 border border-slate-200 border-r-0 text-slate-700 text-sm font-bold select-none pointer-events-none"
                    inputClassName={`w-full min-h-[44px] px-3 rounded-r-xl bg-white border border-slate-200 text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 box-border font-normal${invalidCls(fields.errors.contactNo)}`}
                  />
                </label>
                <p className="sm:col-span-2 m-0 rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm text-slate-600">
                  {data.minAge ? `Children under ${data.minAge} are not allowed. ` : ''}
                  {data.childFloorRule ? `Children under ${data.childFloorRule.belowAge} cannot live on the ${data.childFloorRule.floorLabel} (stairs). ` : ''}
                  Pets are not allowed. A new person above 4 occupants adds the monthly surcharge.
                </p>
                {notice?.inDialog && (
                  <p role="alert" className="sm:col-span-2 m-0 text-sm font-semibold text-rose-700">{notice.text}</p>
                )}
              </div>

              <div className="my-room-modal-actions flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-200">
                <button type="button" onClick={closeAdd} disabled={busy}
                  className="min-h-[44px] px-4 text-sm text-slate-700 font-bold hover:text-slate-900 rounded-xl border-0 bg-transparent cursor-pointer disabled:opacity-50">
                  Cancel
                </button>
                <button type="submit" disabled={busy}
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold border-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                  <FontAwesomeIcon icon={faUserPlus} aria-hidden="true" />
                  {busy ? 'Sending…' : 'Request to add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
