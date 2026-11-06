import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalendarDays } from '@fortawesome/free-solid-svg-icons';

// The rent period on My Room, beside the key tag: start and end dates, how far
// along it is, and the days left. MyRoom works out `elapsedPct` and `daysLeft`
// when my_room.php loads (not during render). `onExtend` is omitted when
// extending is not possible right now.
export default function RentTermCard({ start, end, elapsedPct, daysLeft, onExtend }) {
  const ended = daysLeft !== null && daysLeft <= 0;
  const soon = !ended && daysLeft !== null && daysLeft <= 30;
  const bar = ended ? 'bg-slate-400' : soon ? 'bg-amber-500' : 'bg-indigo-600';
  const left = ended ? 'Ended' : daysLeft === null ? '' : daysLeft >= 60 ? `${Math.floor(daysLeft / 30)} months left` : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;

  return (
    <section aria-labelledby="rent-term-heading" className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="rent-term-heading" className="m-0 flex items-center gap-2 text-base font-semibold text-slate-700">
          <FontAwesomeIcon icon={faCalendarDays} className="text-indigo-600" aria-hidden="true" />
          Rent period
        </h2>
        <span className={`text-sm font-bold tabular-nums ${soon ? 'text-amber-700' : ended ? 'text-slate-600' : 'text-slate-900'}`}>{left}</span>
      </div>
      <div
        role="progressbar"
        aria-label="Rent period used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(elapsedPct)}
        className="mt-4 h-2.5 rounded-full bg-slate-200 overflow-hidden"
      >
        <span className={`block h-full rounded-full origin-left my-room-grow ${bar}`} style={{ width: `${Math.max(elapsedPct, 2)}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-sm">
        <span className="text-slate-600">From <strong className="text-slate-900">{start}</strong></span>
        <span className="text-slate-600 text-right">To <strong className="text-slate-900">{end}</strong></span>
      </div>
      {onExtend && (
        <button type="button" onClick={onExtend} className="mt-3 p-0 bg-transparent border-0 text-sm font-bold text-indigo-700 hover:text-indigo-800 underline-offset-4 hover:underline cursor-pointer">
          Extend your rent
        </button>
      )}
    </section>
  );
}
