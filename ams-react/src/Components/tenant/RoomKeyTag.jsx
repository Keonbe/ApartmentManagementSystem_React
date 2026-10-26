// My Room's one bold element: the tenant's room as its key tag, a light fob
// with a punched hole and the room's name in large navy type, on the dark page.
// The facts on it are real text; the hole and the shape are decoration.

// "2F" -> "2nd floor" (as config.php floor_display_name()).
const floorLabel = (floor) => {
  const m = /^(\d+)F$/i.exec(String(floor || '').trim());
  if (!m) return floor ? `Floor ${floor}` : '';
  const n = Number(m[1]);
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  return `${n}${suffix} floor`;
};

const TONE = {
  done: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  action: 'bg-amber-100 text-amber-900 border-amber-300',
  neutral: 'bg-slate-200 text-slate-800 border-slate-300',
};

export default function RoomKeyTag({ room, type, floor, monthlyRent, rentUntil, statusLabel, statusTone = 'done' }) {
  const name = String(room || '?');
  // One or two characters (A, 12) fill the tag; a longer name gets smaller type.
  const nameSize = name.length <= 2 ? 'text-[104px]' : name.length <= 4 ? 'text-7xl' : 'text-5xl';
  const details = [type, floorLabel(floor)].filter(Boolean).join(', ');

  return (
    <section
      aria-labelledby="room-key-tag-name"
      className="relative w-full rounded-t-[72px] rounded-b-3xl bg-slate-100 text-slate-900 px-6 pt-14 pb-6 shadow-2xl shadow-black/50"
    >
      {/* The punched hole the key ring goes through. */}
      <span aria-hidden="true" className="absolute left-1/2 top-5 h-5 w-5 -translate-x-1/2 rounded-full bg-slate-950 ring-4 ring-slate-300" />

      <h2 id="room-key-tag-name" className={`m-0 text-center font-black leading-none tracking-tight text-[#3b4276] tabular-nums break-words ${nameSize}`}>
        <span className="sr-only">Room </span>{name}
      </h2>
      {details && <p className="m-0 mt-3 text-center text-sm font-semibold text-slate-700">{details}</p>}

      <dl className="m-0 mt-5 space-y-2 border-t border-slate-300 pt-4 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-600">Monthly rent</dt>
          <dd className="m-0 font-bold text-slate-900 tabular-nums">{monthlyRent}</dd>
        </div>
        {rentUntil && (
          <div className="flex justify-between gap-3">
            <dt className="text-slate-600">Rent until</dt>
            <dd className="m-0 font-bold text-slate-900 tabular-nums">{rentUntil}</dd>
          </div>
        )}
      </dl>

      {statusLabel && (
        <p className={`m-0 mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${TONE[statusTone] || TONE.neutral}`}>
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />
          {statusLabel}
        </p>
      )}
    </section>
  );
}
