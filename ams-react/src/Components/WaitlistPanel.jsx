import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faListOl, faTrashAlt, faBell } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';

// Basic unit waitlist (manage_waitlist.php). Entries are added from an inquiry's
// detail view. When a unit frees up, the first entry is marked Notified and an
// admin queue item appears; the admin then reserves the unit from the inquiry
// and removes the entry. Re-mount (change `key`) to refresh.
export default function WaitlistPanel({ onOpenInquiry }) {
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      const res = await api.get('manage_waitlist.php');
      setEntries(res.data.entries || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load the waitlist.');
    }
  };

  useEffect(() => {
    let active = true;
    api.get('manage_waitlist.php')
      .then((res) => { if (active) setEntries(res.data.entries || []); })
      .catch((err) => { if (active) setError(err.response?.data?.message || 'Could not load the waitlist.'); });
    return () => { active = false; };
  }, []);

  const remove = async (entry) => {
    if (!window.confirm(`Remove ${entry.fullName} from the waitlist for Unit ${entry.roomName}?`)) return;
    setError(null);
    try {
      await api.post('manage_waitlist.php', { action: 'remove', id: entry.id });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not remove the entry.');
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-slate-800 m-0 flex items-center gap-2">
          <FontAwesomeIcon icon={faListOl} className="text-indigo-600" />
          Unit Waitlist ({entries.length})
        </h3>
        <p className="text-[11px] text-slate-500 m-0 hidden sm:block">
          First come, first served. The first person is flagged when a unit frees up — no hold is placed automatically.
        </p>
      </div>
      {error && <p className="px-5 py-3 text-xs font-semibold text-rose-600 m-0">{error}</p>}
      {entries.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-400 text-center m-0">
          Nobody is waiting. Open an inquiry for an occupied unit and choose “Add to waitlist”.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Unit</th>
                <th className="px-5 py-3">Position</th>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Contact</th>
                <th className="px-5 py-3">Added</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((e) => (
                <tr key={e.id} className={e.status === 'Notified' ? 'bg-amber-50/60' : ''}>
                  <td className="px-5 py-3 font-bold text-slate-800">
                    {e.roomName}
                    <span className="ml-2 text-[10px] font-semibold uppercase text-slate-400">{e.roomStatus || '—'}</span>
                  </td>
                  <td className="px-5 py-3">
                    {e.status === 'Notified' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                        <FontAwesomeIcon icon={faBell} /> Unit available — contact
                      </span>
                    ) : (
                      <span className="text-slate-600 font-semibold">#{e.position}</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-800">
                    {e.inquiryId && onOpenInquiry ? (
                      <button type="button" onClick={() => onOpenInquiry(e.inquiryId)} className="bg-transparent border-0 p-0 text-indigo-600 hover:underline cursor-pointer font-semibold">
                        {e.fullName}
                      </button>
                    ) : e.fullName}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500">{[e.contactNo, e.email].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{e.createdAt ? new Date(e.createdAt.replace(' ', 'T')).toLocaleDateString() : '—'}</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => remove(e)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 cursor-pointer"
                    >
                      <FontAwesomeIcon icon={faTrashAlt} /> Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
