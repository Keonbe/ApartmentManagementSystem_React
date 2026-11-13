// The legal ground for flagging a rent contract for eviction or terminating it
// (RA 9653 Sec. 9; list in ejectmentGrounds.js). The server re-checks every
// rule (arrears must total three months of rent; the owner's own use needs an
// expired term and a formal notice at least three months old).
// Controlled: the caller keeps { ground, noticeDate }.
import { EJECTMENT_GROUNDS, TERMINATION_EXTRA_GROUNDS } from './ejectmentGrounds';

const SELECT = 'mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

export default function EjectmentGroundFields({ value, onChange, allowMutual = false, arrearsMonths = 0 }) {
  const grounds = allowMutual ? [...EJECTMENT_GROUNDS, ...TERMINATION_EXTRA_GROUNDS] : EJECTMENT_GROUNDS;
  const set = (patch) => onChange({ ...value, ...patch });
  return (
    <div className="mt-4 space-y-3">
      <div>
        <label htmlFor="ejectment-ground" className="block text-sm font-semibold text-slate-700">
          Legal ground (RA 9653 Sec. 9)<span className="text-red-600"> *</span>
        </label>
        <select id="ejectment-ground" name="ground" value={value.ground || ''} onChange={(e) => set({ ground: e.target.value })} className={SELECT} required>
          <option value="" disabled>Choose a ground…</option>
          {grounds.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
        {value.ground === 'arrears' && (
          <p className={`m-0 mt-1 text-xs ${arrearsMonths >= 3 ? 'text-slate-500' : 'text-red-600'}`}>
            Unpaid rent comes to {Number(arrearsMonths || 0).toFixed(2)} month(s). This ground needs three months in total.
          </p>
        )}
        {(value.ground === 'sublease' || value.ground === 'condemnation') && (
          <p className="m-0 mt-1 text-xs text-slate-500">
            {value.ground === 'condemnation' ? "Put the condemnation order's reference in the details." : 'Describe the sublease or assignment in the details.'}
          </p>
        )}
      </div>
      {value.ground === 'owner_use' && (
        <div>
          <label htmlFor="ejectment-notice-date" className="block text-sm font-semibold text-slate-700">
            Date the formal notice was given<span className="text-red-600"> *</span>
          </label>
          <input id="ejectment-notice-date" name="noticeDate" type="date" value={value.noticeDate || ''} onChange={(e) => set({ noticeDate: e.target.value })} className={SELECT} required />
          <p className="m-0 mt-1 text-xs text-slate-500">At least three months before today. The unit may not be rented to anyone else for a year after you take it back.</p>
        </div>
      )}
      <p className="m-0 text-xs text-slate-500">
        If the tenant does not agree to leave, only a court can order it. Never lock the tenant out or cut a utility.
      </p>
    </div>
  );
}
