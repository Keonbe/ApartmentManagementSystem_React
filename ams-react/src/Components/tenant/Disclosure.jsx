import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown } from '@fortawesome/free-solid-svg-icons';

// A row that opens a panel under it (My Room → "Manage your rent"), on the
// tenant pages. The button carries aria-expanded; the panel is a labelled
// region, hidden (not unmounted) while closed so its form keeps what was typed.
export default function Disclosure({ id, icon, title, summary, open, onToggle, children }) {
  return (
    <div className="border-t border-slate-200 first:border-t-0">
      <h3 className="m-0">
        <button
          type="button"
          id={`${id}-button`}
          aria-expanded={open}
          aria-controls={id}
          onClick={onToggle}
          className={`w-full flex items-center gap-4 min-h-[64px] px-5 sm:px-6 py-3 border-0 text-left cursor-pointer transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-500 ${open ? 'bg-slate-50' : 'bg-transparent'}`}
        >
          {icon && (
            <span aria-hidden="true" className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center transition-colors ${open ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-600'}`}>
              <FontAwesomeIcon icon={icon} />
            </span>
          )}
          <span className="flex-1 min-w-0">
            <span className="block text-base font-semibold text-slate-900">{title}</span>
            {summary && <span className="block text-sm text-slate-600">{summary}</span>}
          </span>
          <FontAwesomeIcon icon={faChevronDown} className={`text-slate-500 transition-[rotate] duration-300 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      </h3>
      {/* Shown again from display:none, so the fade replays on each open. */}
      <div id={id} role="region" aria-labelledby={`${id}-button`} hidden={!open} className="px-5 sm:px-6 pt-4 pb-6 animate-fade-in-up">
        {children}
      </div>
    </div>
  );
}
