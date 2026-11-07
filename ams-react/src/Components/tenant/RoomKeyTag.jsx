import { useTheme } from '../../config/theme';

// My Room's one bold element: the tenant's room as its key tag, a fob with a
// punched hole and the room's name in large type. ut-native (no automatic
// Dark/Glass colour remap): each theme has its own fob below, a light one on
// Light, a deep navy one on Dark, a frosted tinted one on Glass.
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
// The status pill on a dark fob.
const TONE_ON_DARK = {
  done: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
  action: 'bg-amber-400/15 text-amber-200 border-amber-400/30',
  neutral: 'bg-white/10 text-slate-200 border-white/20',
};

// Full class strings per theme (Tailwind only keeps classes it sees written out).
const LOOK = {
  light: {
    fob: 'bg-slate-100 text-slate-900 shadow-2xl shadow-slate-900/30 ring-1 ring-slate-900/5',
    hole: 'bg-slate-950 ring-slate-300',
    name: 'text-brand',
    details: 'text-slate-700',
    rule: 'border-slate-300',
    term: 'text-slate-600',
    value: 'text-slate-900',
  },
  dark: {
    fob: 'bg-gradient-to-b from-[#2b3270] via-[#1e2452] to-[#171c40] text-white shadow-2xl shadow-black/50 ring-1 ring-indigo-300/20',
    hole: 'bg-[#0b0f24] ring-indigo-300/30',
    name: 'text-indigo-100',
    details: 'text-indigo-200/80',
    rule: 'border-white/10',
    term: 'text-slate-400',
    value: 'text-white',
  },
  glass: {
    fob: 'bg-gradient-to-b from-indigo-500/35 to-slate-950/60 backdrop-blur-xl text-white shadow-2xl shadow-black/40 ring-1 ring-white/25',
    hole: 'bg-slate-950/80 ring-white/40',
    name: 'text-white',
    details: 'text-white/75',
    rule: 'border-white/20',
    term: 'text-white/60',
    value: 'text-white',
  },
};

export default function RoomKeyTag({ room, type, floor, monthlyRent, rentUntil, statusLabel, statusTone = 'done' }) {
  const name = String(room || '?');
  // One or two characters (A, 12) fill the tag; a longer name gets smaller type.
  const nameSize = name.length <= 2 ? 'text-4xl md:text-7xl' : name.length <= 4 ? 'text-4xl md:text-6xl' : 'text-3xl md:text-5xl';
  const details = [type, floorLabel(floor)].filter(Boolean).join(', ');
  const { theme } = useTheme();
  const look = LOOK[theme] || LOOK.light;
  const tone = (theme === 'light' ? TONE : TONE_ON_DARK)[statusTone] || (theme === 'light' ? TONE.neutral : TONE_ON_DARK.neutral);

  return (
    <section
      aria-labelledby="room-key-tag-name"
      className={`ut-native relative mx-auto w-full max-w-[220px] h-auto md:mx-0 md:max-w-none md:h-full flex flex-col items-center md:items-stretch gap-1 md:gap-0 rounded-t-[3rem] rounded-b-2xl md:rounded-t-[72px] md:rounded-b-3xl p-3 md:px-6 md:pt-12 md:pb-6 transition-colors duration-300 ${look.fob}`}
    >
      {/* The punched hole the key ring goes through. */}
      <span aria-hidden="true" className={`absolute left-1/2 top-2 md:top-5 h-3 w-3 md:h-5 md:w-5 -translate-x-1/2 rounded-full ring-2 md:ring-4 ${look.hole}`} />

      {/* Takes the spare height when the cards beside the tag are taller, so the name stays centred. */}
      <div className="min-w-0 flex-1 flex flex-col items-center justify-center gap-1 md:gap-0">
      <h2 id="room-key-tag-name" className={`m-0 mt-1 md:mt-0 w-12 h-12 md:w-24 md:h-24 shrink-0 flex items-center justify-center overflow-hidden rounded-full bg-transparent ${nameSize} text-center font-extrabold md:font-black leading-none tracking-tight ${look.name} tabular-nums break-words`}>
        <span className="sr-only">Room </span>{name}
      </h2>
      <div className="min-w-0 w-full flex flex-col items-center md:contents">
        {details && <p className={`m-0 md:mt-3 text-center text-xs md:text-sm font-semibold ${look.details}`}>{details}</p>}
        {statusLabel && (
          <p className={`m-0 mt-1 md:hidden inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-bold ${tone}`}>
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />
            {statusLabel}
          </p>
        )}
      </div>
      </div>

      <dl className={`m-0 w-full mt-2 md:mt-5 space-y-1 md:space-y-2 border-t ${look.rule} pt-2 md:pt-4 text-center md:text-sm`}>
        <div className="flex justify-center md:justify-between gap-1 md:gap-3 items-baseline">
          <dt className={`${look.term} shrink-0 text-[10px] md:text-sm`}>Monthly rent</dt>
          <dd className={`m-0 text-base md:text-base font-bold ${look.value} tabular-nums`}>{monthlyRent}</dd>
        </div>
        {rentUntil && (
          <div className="flex justify-center md:justify-between gap-1 md:gap-3 items-baseline text-xs md:text-sm">
            <dt className={`${look.term} shrink-0 text-[10px] md:text-sm`}>Rent until</dt>
            <dd className={`m-0 font-bold ${look.value} tabular-nums`}>{rentUntil}</dd>
          </div>
        )}
      </dl>

      {statusLabel && (
        <p className={`hidden md:inline-flex m-0 mt-4 self-start items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${tone}`}>
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />
          {statusLabel}
        </p>
      )}
    </section>
  );
}
