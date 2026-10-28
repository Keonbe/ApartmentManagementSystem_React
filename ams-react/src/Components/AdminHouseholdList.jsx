import { useEffect, useState } from 'react';
import api from '../api/axiosConfig';

// Read-only household roster for an admin (household_members.php?userId=).
// Changes are requested by the tenant and approved in Notifications.
export default function AdminHouseholdList({ userId }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    let active = true;
    if (!userId) return undefined;
    api.get(`household_members.php?userId=${userId}`)
      .then((res) => { if (active) setData(res.data); })
      .catch(() => { if (active) setData({ hasLease: false }); });
    return () => { active = false; };
  }, [userId]);

  if (!data || !data.hasLease) return null;

  return (
    <div className="border-t border-slate-100 pt-4">
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2 m-0">
        Household · {data.occupants} registered occupant(s), max {data.maxOccupants}
      </p>
      <ul className="list-none m-0 p-0 border border-slate-100 rounded-lg divide-y divide-slate-100">
        <li className="flex justify-between px-3 py-2 text-sm">
          <span className="font-semibold text-slate-700">{data.leaseHolder}</span>
          <span className="text-[10px] font-bold uppercase text-indigo-600">Main tenant</span>
        </li>
        {data.members.map((m) => (
          <li key={m.id} className="flex justify-between gap-3 px-3 py-2 text-sm">
            <span className="text-slate-700">
              {m.fullName} <span className="text-xs text-slate-500">· {m.relationship}{m.age !== null && m.age !== undefined ? ` · age ${m.age}` : ''}{m.ageCategory ? ` (${m.ageCategory})` : ''}{m.contactNo ? ` · ${m.contactNo}` : ''}</span>
            </span>
            {(m.status === 'Pending' || m.removalRequested) && (
              <span className="text-[10px] font-bold text-amber-700 shrink-0">
                {m.status === 'Pending' ? 'Addition pending' : 'Removal pending'}
              </span>
            )}
          </li>
        ))}
        {data.members.length === 0 && (
          <li className="px-3 py-2 text-xs text-slate-500">No other household members named.</li>
        )}
      </ul>
    </div>
  );
}
