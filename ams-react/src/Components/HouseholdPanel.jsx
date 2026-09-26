import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPeopleRoof, faUserPlus, faUserMinus, faClock } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import PhoneInput from './PhoneInput';
import { checkPhMobile, toPhE164 } from '../utils/validation';

// Household roster on My Room (household_members.php). One shared lease: the
// lease holder signs in; the people living with them are listed here. Adding or
// removing someone is a request that management approves. To replace someone,
// request the removal and the addition.
export default function HouseholdPanel() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ fullName: '', relationship: '', contactNo: '' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

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
    setBusy(true);
    setNotice(null);
    try {
      const res = await api.post('household_members.php', body);
      setNotice({ ok: res.data.success, text: res.data.message });
      if (res.data.success) {
        after?.();
        await load();
      }
    } catch (err) {
      setNotice({ ok: false, text: err.response?.data?.message || 'Request failed.' });
    }
    setBusy(false);
  };

  const submitAdd = (e) => {
    e.preventDefault();
    const phoneError = form.contactNo ? checkPhMobile(form.contactNo) : '';
    if (phoneError) {
      setNotice({ ok: false, text: phoneError });
      return;
    }
    send({ action: 'add', ...form, contactNo: toPhE164(form.contactNo) }, () => setForm({ fullName: '', relationship: '', contactNo: '' }));
  };

  const requestRemove = (m) => {
    const prompt = m.status === 'Pending'
      ? `Withdraw the request to add ${m.fullName}?`
      : `Ask management to remove ${m.fullName} from your household?`;
    if (window.confirm(prompt)) send({ action: 'remove', memberId: m.id });
  };

  const named = 1 + data.members.filter((m) => m.status === 'Active').length;
  const queued = data.members.filter((m) => m.status === 'Pending').length;
  const isSoloOccupant = data.members.length === 0;
  const full = named + queued >= data.maxOccupants;
  const inputCls = 'w-full px-3 py-2 rounded-xl bg-slate-950/40 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 box-border';

  return (
    <div className="bg-slate-900/80 rounded-3xl border border-white/10 shadow-xl p-6 md:p-8 text-left space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-300 flex items-center justify-center shrink-0 border border-indigo-500/20">
            <FontAwesomeIcon icon={faPeopleRoof} className="text-lg" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white m-0">Household</h3>
            <p className="text-[11px] text-slate-400 m-0">
              {isSoloOccupant
                ? "You're currently the only registered occupant of this unit. Add household members below if others live with you."
                : 'You are the lease holder and the only account for this unit. List everyone who lives with you.'}
            </p>
          </div>
        </div>
        <span className="text-[11px] font-semibold text-slate-300 bg-slate-800/80 border border-white/10 rounded-full px-3 py-1 self-start sm:self-auto">
          Registered occupants: {data.occupants} · Named: {named} · Max: {data.maxOccupants}
        </span>
      </div>

      <ul className="list-none m-0 p-0 divide-y divide-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <li className="flex items-center justify-between px-4 py-3 bg-slate-950/30">
          <span className="text-sm font-bold text-white">{data.leaseHolder}</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">Lease holder</span>
        </li>
        {data.members.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-100 m-0 truncate">{m.fullName}</p>
              <p className="text-[11px] text-slate-400 m-0">
                {m.relationship}{m.contactNo ? ` · ${m.contactNo}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {(m.status === 'Pending' || m.removalRequested) && (
                <span className="text-[10px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">
                  <FontAwesomeIcon icon={faClock} className="mr-1" />
                  {m.status === 'Pending' ? 'Awaiting approval' : 'Removal requested'}
                </span>
              )}
              {!m.removalRequested && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => requestRemove(m)}
                  className="text-[11px] font-bold text-rose-300 hover:text-rose-200 bg-transparent border border-rose-500/30 rounded-lg px-2 py-1 cursor-pointer disabled:opacity-50"
                >
                  <FontAwesomeIcon icon={faUserMinus} className="mr-1" />
                  {m.status === 'Pending' ? 'Withdraw' : 'Remove'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {data.occupants > named && (
        <p className="text-[11px] text-slate-400 m-0">
          Your unit is registered for {data.occupants} occupants, but only {named} are named. Adding the others below doesn't change your rent.
        </p>
      )}

      <form onSubmit={submitAdd} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end m-0">
        <label className="flex flex-col gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider sm:col-span-2">
          Full name
          <input required minLength={2} maxLength={150} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className={inputCls} disabled={full} />
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          Relationship
          <select required value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} className={inputCls} disabled={full}>
            <option value="">Select…</option>
            {(data.relationships || []).map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          Mobile (optional)
          <PhoneInput
            value={form.contactNo}
            onChange={(digits) => setForm({ ...form, contactNo: digits })}
            disabled={full}
            prefixClassName="flex items-center gap-1 px-2.5 rounded-l-xl bg-slate-800 border border-white/10 border-r-0 text-slate-200 text-sm font-bold select-none pointer-events-none normal-case tracking-normal"
            inputClassName="w-full px-3 py-2 rounded-r-xl bg-slate-950/40 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 box-border normal-case tracking-normal font-normal disabled:opacity-60"
          />
        </label>
        <div className="sm:col-span-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-[11px] text-slate-400 m-0">
            {full
              ? `Your unit has reached the limit of ${data.maxOccupants} occupants.`
              : 'Requests are reviewed by management. A new person above 4 occupants adds the monthly surcharge.'}
          </p>
          <button
            type="submit"
            disabled={busy || full}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded-xl text-xs border-0 cursor-pointer disabled:opacity-50 shrink-0"
          >
            <FontAwesomeIcon icon={faUserPlus} className="mr-1.5" />
            Request to add
          </button>
        </div>
      </form>

      {notice && (
        <p className={`text-xs font-semibold m-0 ${notice.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{notice.text}</p>
      )}
    </div>
  );
}
