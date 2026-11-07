// My Room's one bold element: the tenant's room as its key tag, a light fob
// with a punched hole and the room's name in large navy type. It stays a light
// fob in every theme (ut-native: no Dark/Glass colour remap).
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
  const nameSize = name.length <= 2 ? 'text-4xl md:text-7xl' : name.length <= 4 ? 'text-4xl md:text-6xl' : 'text-3xl md:text-5xl';
  const details = [type, floorLabel(floor)].filter(Boolean).join(', ');

  return (
    <section
      aria-labelledby="room-key-tag-name"
      className="ut-native relative mx-auto w-full max-w-[220px] h-auto md:mx-0 md:max-w-none md:h-full flex flex-col items-center md:items-stretch gap-1 md:gap-0 rounded-t-[3rem] rounded-b-2xl md:rounded-t-[72px] md:rounded-b-3xl bg-slate-100 text-slate-900 p-3 md:px-6 md:pt-12 md:pb-6 shadow-2xl shadow-slate-900/30 ring-1 ring-slate-900/5"
    >
      {/* The punched hole the key ring goes through. */}
      <span aria-hidden="true" className="absolute left-1/2 top-2 md:top-5 h-3 w-3 md:h-5 md:w-5 -translate-x-1/2 rounded-full bg-slate-950 ring-2 md:ring-4 ring-slate-300" />

      {/* Takes the spare height when the cards beside the tag are taller, so the name stays centred. */}
      <div className="min-w-0 flex-1 flex flex-col items-center justify-center gap-1 md:gap-0">
      <h2 id="room-key-tag-name" className={`m-0 mt-1 md:mt-0 w-12 h-12 md:w-24 md:h-24 shrink-0 flex items-center justify-center overflow-hidden rounded-full bg-transparent ${nameSize} text-center font-extrabold md:font-black leading-none tracking-tight text-brand tabular-nums break-words`}>
        <span className="sr-only">Room </span>{name}
      </h2>
      <div className="min-w-0 w-full flex flex-col items-center md:contents">
        {details && <p className="m-0 md:mt-3 text-center text-xs md:text-sm font-semibold text-slate-700">{details}</p>}
        {statusLabel && (
          <p className={`m-0 mt-1 md:hidden inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-bold ${TONE[statusTone] || TONE.neutral}`}>
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />
            {statusLabel}
          </p>
        )}
      </div>
      </div>

      <dl className="m-0 w-full mt-2 md:mt-5 space-y-1 md:space-y-2 border-t border-slate-300 pt-2 md:pt-4 text-center md:text-sm">
        <div className="flex justify-center md:justify-between gap-1 md:gap-3 items-baseline">
          <dt className="text-slate-600 shrink-0 text-[10px] md:text-sm">Monthly rent</dt>
          <dd className="m-0 text-base md:text-base font-bold text-slate-900 tabular-nums">{monthlyRent}</dd>
        </div>
        {rentUntil && (
          <div className="flex justify-center md:justify-between gap-1 md:gap-3 items-baseline text-xs md:text-sm">
            <dt className="text-slate-600 shrink-0 text-[10px] md:text-sm">Rent until</dt>
            <dd className="m-0 font-bold text-slate-900 tabular-nums">{rentUntil}</dd>
          </div>
        )}
      </dl>

      {statusLabel && (
        <p className={`hidden md:inline-flex m-0 mt-4 self-start items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${TONE[statusTone] || TONE.neutral}`}>
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />
          {statusLabel}
        </p>
      )}
    </section>
  );
}
