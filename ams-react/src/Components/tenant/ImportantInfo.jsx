import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleExclamation } from '@fortawesome/free-solid-svg-icons';

// My Room's "Important info": what needs the tenant's attention, most urgent
// first. MyRoom builds the items; each is { key, tone, icon, title, text,
// action?: { label, onClick } }. The tone decides the order and the label
// beside the title, so the priority is in words, not only in colour.
const TONES = {
  urgent: { rank: 0, label: 'Urgent', bar: 'bg-rose-600', tile: 'bg-rose-100 text-rose-700', chip: 'bg-rose-100 text-rose-800 border-rose-200', btn: 'bg-rose-600 hover:bg-rose-700' },
  action: { rank: 1, label: 'Action needed', bar: 'bg-amber-500', tile: 'bg-amber-100 text-amber-700', chip: 'bg-amber-100 text-amber-800 border-amber-200', btn: 'bg-amber-600 hover:bg-amber-700' },
  pending: { rank: 2, label: 'In review', bar: 'bg-sky-500', tile: 'bg-sky-100 text-sky-700', chip: 'bg-sky-100 text-sky-800 border-sky-200', btn: 'bg-sky-600 hover:bg-sky-700' },
  info: { rank: 3, label: 'Good to know', bar: 'bg-indigo-400', tile: 'bg-indigo-100 text-indigo-700', chip: 'bg-slate-100 text-slate-700 border-slate-200', btn: 'bg-indigo-600 hover:bg-indigo-500' },
};

export default function ImportantInfo({ items }) {
  if (!items.length) return null;
  const sorted = [...items].sort((a, b) => TONES[a.tone].rank - TONES[b.tone].rank);
  const needAction = items.filter((i) => i.tone === 'urgent' || i.tone === 'action').length;

  return (
    <section aria-labelledby="important-info-heading" className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-slate-200">
        <h2 id="important-info-heading" className="m-0 flex items-center gap-2 text-base font-bold text-slate-900">
          <FontAwesomeIcon icon={faCircleExclamation} className={needAction ? 'text-rose-600' : 'text-indigo-600'} aria-hidden="true" />
          Important info
        </h2>
        <span className={`text-xs font-bold rounded-full border px-2.5 py-1 ${needAction ? TONES.urgent.chip : TONES.info.chip}`}>
          {needAction ? `${needAction} need${needAction === 1 ? 's' : ''} your attention` : 'Nothing urgent'}
        </span>
      </div>
      <ul className="list-none m-0 p-0 divide-y divide-slate-200 stagger-children">
        {sorted.map((item) => {
          const tone = TONES[item.tone];
          return (
            <li key={item.key} className="relative flex flex-col sm:flex-row sm:items-center gap-3 pl-6 pr-5 sm:pr-6 py-4">
              <span aria-hidden="true" className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${tone.bar}`} />
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <span aria-hidden="true" className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ${tone.tile}`}>
                  <FontAwesomeIcon icon={item.icon} />
                </span>
                <div className="min-w-0">
                  <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <strong className="text-sm text-slate-900">{item.title}</strong>
                    <span className={`text-[11px] font-bold uppercase tracking-wide rounded-full border px-2 py-0.5 ${tone.chip}`}>{tone.label}</span>
                  </p>
                  <p className="m-0 mt-1 text-sm leading-relaxed text-slate-600">{item.text}</p>
                </div>
              </div>
              {item.action && (
                <button
                  type="button"
                  onClick={item.action.onClick}
                  className={`self-start sm:self-center inline-flex items-center justify-center min-h-[40px] px-4 rounded-xl text-white text-sm font-bold border-0 cursor-pointer shrink-0 transition-[background-color,transform] active:scale-[0.97] ${tone.btn}`}
                >
                  {item.action.label}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
