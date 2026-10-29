import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faListOl, faTrashAlt, faBell } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { TH, THEAD } from './admin/ui/styles';

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
    <div className="overflow-hidden rounded-card border border-slate-200 bg-white shadow-card">
      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
        <h3 className="text-body font-bold text-slate-800 m-0 flex items-center gap-2">
          <FontAwesomeIcon icon={faListOl} className="text-indigo-600" />
          Unit Waitlist ({entries.length})
        </h3>
        <p className="text-[11px] text-slate-500 m-0 hidden sm:block">
          First come, first served. The first person is flagged when a unit frees up — no hold is placed automatically.
        </p>
      </div>
      {error && <p className="px-5 py-3 text-label font-semibold text-red-600 m-0">{error}</p>}
      {entries.length === 0 ? (
        <p className="px-5 py-6 text-body text-slate-500 text-center m-0">
          Nobody is waiting. Open an inquiry for an occupied unit and choose “Add to waitlist”.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-body">
            <thead className={THEAD}>
              <tr>
                <th className={TH}>Unit</th>
                <th className={TH}>Position</th>
                <th className={TH}>Name</th>
                <th className={TH}>Contact</th>
                <th className={TH}>Added</th>
                <th className={`${TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((e) => (
                <tr key={e.id} className={e.status === 'Notified' ? 'bg-amber-50/60' : ''}>
                  <td className="px-5 py-3 font-bold text-slate-800">
                    {e.roomName}
                    <span className="ml-2 text-label font-medium text-slate-600 capitalize">{e.roomStatus || '—'}</span>
                  </td>
                  <td className="px-5 py-3">
                    {e.status === 'Notified' ? (
                      <span className="rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap inline-flex items-center gap-1 bg-amber-100 text-amber-700">
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
                  <td className="px-5 py-3 text-label text-slate-500">{[e.contactNo, e.email].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="px-5 py-3 text-label text-slate-500">{e.createdAt ? new Date(e.createdAt.replace(' ', 'T')).toLocaleDateString() : '—'}</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => remove(e)}
                      className="inline-flex items-center gap-1.5 rounded-control border border-red-200 bg-white px-2.5 py-1.5 text-label font-bold text-red-600 hover:bg-red-50 cursor-pointer"
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
