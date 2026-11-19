import { useEffect, useId, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUsers, faChevronDown } from '@fortawesome/free-solid-svg-icons';
import api from '../../api/axiosConfig';

// "2 occupants" in the Units detail modal: hover, focus or click shows who they
// are (the main tenant plus the household roster from household_members.php,
// loaded the first time it opens). Click keeps it open; Escape or a click
// elsewhere closes it. The parent row must be `relative`: the list opens under
// that row and never wider than it, so it is not clipped by the modal.
//   <div className="relative …"><OccupantsPopover count={3} userId={12} tenantName="Ana Cruz" unitId="A" /></div>
export default function OccupantsPopover({ count, userId, tenantName, unitId }) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [data, setData] = useState(null); // null = not loaded, { error } or the API body
  const ref = useRef(null);
  const leaveTimer = useRef(null);
  const id = useId();
  const open = hover || pinned;
  const label = `${count || 0} occupant${count === 1 ? '' : 's'}`;

  useEffect(() => {
    if (!open || data || !userId) return undefined;
    let active = true;
    api.get(`household_members.php?userId=${encodeURIComponent(userId)}`)
      .then((res) => { if (active) setData(res.data || { error: true }); })
      .catch(() => { if (active) setData({ error: true }); });
    return () => { active = false; };
  }, [open, data, userId]);

  useEffect(() => {
    if (!pinned) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setPinned(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [pinned]);

  useEffect(() => () => clearTimeout(leaveTimer.current), []);

  // Without an account there is no roster to look up: plain text.
  if (!userId) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <FontAwesomeIcon icon={faUsers} className="text-[11px] text-slate-400" aria-hidden="true" />{label}
      </span>
    );
  }

  const enter = () => { clearTimeout(leaveTimer.current); setHover(true); };
  const leave = () => { leaveTimer.current = setTimeout(() => setHover(false), 120); };
  // The roster belongs to the tenant's current rent; ignore one for another unit.
  const roster = data && !data.error && data.hasLease && (!unitId || data.roomName === unitId) ? data : null;
  const members = roster ? (roster.members || []) : [];
  const unnamed = roster ? Math.max(0, (count || 0) - 1 - members.filter((m) => m.status === 'Active').length) : 0;

  return (
    <span ref={ref} className="inline-flex" onMouseEnter={enter} onMouseLeave={leave}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setPinned((p) => !p)}
        onFocus={enter}
        onBlur={leave}
        onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); setPinned(false); setHover(false); } }}
        className={`touch-compact inline-flex items-center gap-1.5 rounded-control border-0 bg-transparent p-0 text-label cursor-pointer underline decoration-dotted underline-offset-4 transition-colors ${open ? 'text-indigo-700 decoration-indigo-400' : 'text-slate-600 decoration-slate-300 hover:text-indigo-700'}`}
      >
        <FontAwesomeIcon icon={faUsers} className="text-[11px] text-slate-400" aria-hidden="true" />
        {label}
        <FontAwesomeIcon icon={faChevronDown} className={`text-[9px] text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        // pt-2 instead of a margin, so moving the mouse down onto the list keeps it open.
        <span className="absolute left-0 top-full z-40 w-full max-w-sm pt-2">
          <span id={id} role="dialog" aria-label="Occupants" className="block rounded-card border border-slate-200 bg-white p-3 text-left shadow-raised animate-fadeIn">
            <span className="mb-2 block text-caption font-semibold text-slate-500">
              Who lives here{roster ? ` · ${roster.occupants} registered${roster.maxOccupants ? `, max ${roster.maxOccupants}` : ''}` : ''}
            </span>
            {!data ? (
              <span className="block py-2 text-label text-slate-500">Loading…</span>
            ) : data.error ? (
              <span className="block py-2 text-label text-red-600">Could not load the household. Try again later.</span>
            ) : !roster ? (
              <span className="block py-2 text-label text-slate-500">No household list yet. It starts once the rent is approved.</span>
            ) : (
              <span className="block divide-y divide-slate-100">
                <OccupantRow name={roster.leaseHolder || tenantName} detail="Main tenant" accent />
                {members.map((m) => (
                  <OccupantRow
                    key={m.id}
                    name={m.fullName}
                    detail={[m.relationship, m.age !== null && m.age !== undefined ? `age ${m.age}` : m.ageCategory].filter(Boolean).join(' · ')}
                    flag={m.status === 'Pending' ? 'Addition pending' : m.removalRequested ? 'Removal pending' : null}
                  />
                ))}
                {unnamed > 0 && (
                  <span className="block pt-2 text-caption text-slate-500">
                    {unnamed} more not named yet (the tenant adds them on My Room).
                  </span>
                )}
                {members.length === 0 && unnamed === 0 && (
                  <span className="block pt-2 text-caption text-slate-500">Lives alone.</span>
                )}
              </span>
            )}
          </span>
        </span>
      )}
    </span>
  );
}

function OccupantRow({ name, detail, accent = false, flag = null }) {
  return (
    <span className="flex items-center justify-between gap-3 py-1.5">
      <span className="min-w-0">
        <span className="block truncate text-label font-semibold text-slate-800">{name}</span>
        {detail && <span className={`block truncate text-caption ${accent ? 'text-indigo-600 font-medium' : 'text-slate-500'}`}>{detail}</span>}
      </span>
      {flag && <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-caption font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">{flag}</span>}
    </span>
  );
}
