import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faXmark, faCheck, faUser } from '@fortawesome/free-solid-svg-icons';
import PersonAvatar from './PersonAvatar';

// Search-as-you-type picker for a tenant account (Units → Assign Tenant).
// users: [{ id, name, email, phone?, avatar?, room?, roomStatus? }] from get_users.php;
// someone who already rents or has an open application elsewhere is listed but
// can't be picked (update_room.php refuses them too).
//   <TenantPicker users={users} value={userId} onChange={(user) => …} unitId="I"
//     inputProps={fieldA11y('userId')} invalid={!!errors.userId} />
// A WAI-ARIA combobox: arrows move, Enter picks, Escape closes.

const MAX_SHOWN = 50;
const STATUS_WORDS = {
  'Pending Review': 'application in review', Pending: 'application in review', 'Action Required': 'application needs action',
  Approved: 'approved, moving in', active: 'renting', 'pending-move-out': 'moving out',
};

// The matched part of a text in bold.
function Highlight({ text, query }) {
  const t = String(text || '');
  const i = query ? t.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (i < 0) return t;
  return <>{t.slice(0, i)}<mark className="bg-transparent font-bold text-indigo-700 p-0">{t.slice(i, i + query.length)}</mark>{t.slice(i + query.length)}</>;
}

export default function TenantPicker({ users, value, onChange, unitId, inputProps = {}, invalid = false }) {
  const selected = users.find((u) => String(u.id) === String(value)) || null;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [editing, setEditing] = useState(!selected);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const listId = useId();

  const blocked = (u) => !!u.room && u.room !== unitId;
  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    const list = q
      ? users.filter((u) => [u.name, u.email, u.phone].some((f) => String(f || '').toLowerCase().includes(q)))
      : users;
    // Assignable people first, then the rest, each alphabetically (the server sorts by name).
    return [...list.filter((u) => !blocked(u)), ...list.filter(blocked)].slice(0, MAX_SHOWN);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, q, unitId]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const pick = (u) => {
    if (!u || blocked(u)) return;
    onChange(u);
    setQuery('');
    setOpen(false);
    setEditing(false);
  };
  const startChange = () => {
    setEditing(true);
    setOpen(true);
    setActive(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      if (!matches.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (a + step + matches.length) % matches.length);
    } else if (e.key === 'Enter') {
      if (open && matches[active]) { e.preventDefault(); pick(matches[active]); }
    } else if (e.key === 'Escape') {
      if (open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
      else if (selected) { setEditing(false); setQuery(''); }
    }
  };

  // The picked tenant, as a card with a Change button (keeps the field id so a
  // validation error can still focus it).
  if (selected && !editing) {
    return (
      <div className={`flex items-center gap-3 rounded-control border bg-indigo-50/60 px-3 py-2.5 ${invalid ? 'border-red-400' : 'border-indigo-200'}`}>
        <PersonAvatar name={selected.name} src={selected.avatar} size="md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-semibold text-slate-900">{selected.name}</span>
          <span className="block truncate text-caption text-slate-500">{[selected.email, selected.phone].filter(Boolean).join(' · ')}</span>
        </span>
        <button
          type="button"
          {...inputProps}
          onClick={startChange}
          className="shrink-0 rounded-control border border-slate-200 bg-white px-3 py-1.5 text-label font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          Change
        </button>
      </div>
    );
  }

  const activeId = open && matches[active] ? `${listId}-opt-${matches[active].id}` : undefined;
  return (
    <div ref={wrapRef} className="relative">
      <div className={`flex items-center gap-2 rounded-control border bg-white px-3 py-2.5 transition-colors focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 ${invalid ? 'border-red-400' : 'border-slate-200'}`}>
        <FontAwesomeIcon icon={faSearch} className="text-slate-400 text-sm" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={activeId}
          placeholder="Search by name, email or phone"
          {...inputProps}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-body text-slate-800 placeholder-slate-400 outline-none focus-visible:outline-none focus-visible:ring-0"
        />
        {query && (
          <button type="button" aria-label="Clear search" onClick={() => { setQuery(''); inputRef.current?.focus(); }} className="touch-compact flex h-6 w-6 items-center justify-center rounded-full border-0 bg-transparent p-0 text-slate-400 hover:text-slate-700 cursor-pointer">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        )}
        {selected && (
          <button type="button" onClick={() => { setEditing(false); setQuery(''); setOpen(false); }} className="shrink-0 border-0 bg-transparent p-0 text-label font-semibold text-indigo-700 hover:underline cursor-pointer">
            Keep {selected.name.split(' ')[0]}
          </button>
        )}
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Tenant accounts"
          className="absolute left-0 right-0 top-full z-30 m-0 mt-1.5 max-h-64 list-none overflow-y-auto rounded-card border border-slate-200 bg-white p-1 shadow-raised"
        >
          {matches.length === 0 ? (
            <li className="flex items-center gap-2 px-3 py-4 text-label text-slate-500">
              <FontAwesomeIcon icon={faUser} className="text-slate-300" aria-hidden="true" />
              {users.length ? `No tenant account matches “${query.trim()}”.` : 'No tenant accounts yet. The tenant has to register first.'}
            </li>
          ) : matches.map((u, i) => {
            const isBlocked = blocked(u);
            const isActive = i === active;
            const isSelected = selected && selected.id === u.id;
            return (
              <li
                key={u.id}
                id={`${listId}-opt-${u.id}`}
                role="option"
                aria-selected={!!isSelected}
                aria-disabled={isBlocked || undefined}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(u)}
                className={`flex items-center gap-3 rounded-control px-2.5 py-2 ${isBlocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${isActive && !isBlocked ? 'bg-indigo-50' : isActive ? 'bg-slate-50' : ''}`}
              >
                <PersonAvatar name={u.name} src={u.avatar} size="sm" tone={isBlocked ? 'slate' : 'soft'} className={isBlocked ? 'grayscale' : ''} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-medium text-slate-800"><Highlight text={u.name} query={query.trim()} /></span>
                  <span className="block truncate text-caption text-slate-500">
                    <Highlight text={u.email} query={query.trim()} />
                    {u.phone && <> · <Highlight text={u.phone} query={query.trim()} /></>}
                  </span>
                </span>
                {isBlocked ? (
                  <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-caption font-semibold text-amber-800 ring-1 ring-inset ring-amber-200" title="Already has a unit or an open application">
                    Unit {u.room} · {STATUS_WORDS[u.roomStatus] || u.roomStatus}
                  </span>
                ) : isSelected ? (
                  <FontAwesomeIcon icon={faCheck} className="shrink-0 text-indigo-600" aria-hidden="true" />
                ) : null}
              </li>
            );
          })}
          {matches.length === MAX_SHOWN && (
            <li className="px-3 py-2 text-caption text-slate-500">Showing the first {MAX_SHOWN}. Type more of the name to narrow it down.</li>
          )}
        </ul>
      )}
    </div>
  );
}
