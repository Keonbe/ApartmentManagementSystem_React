import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown } from '@fortawesome/free-solid-svg-icons';

// A row that opens a panel under it (My Room → "Manage your rent"), on the
// dark tenant pages. The button carries aria-expanded; the panel is a labelled
// region, hidden (not unmounted) while closed so its form keeps what was typed.
export default function Disclosure({ id, icon, title, summary, open, onToggle, children }) {
  return (
    <div className="border-t border-white/10 first:border-t-0">
      <h3 className="m-0">
        <button
          type="button"
          id={`${id}-button`}
          aria-expanded={open}
          aria-controls={id}
          onClick={onToggle}
          className="w-full flex items-center gap-4 min-h-[64px] px-5 sm:px-6 py-3 bg-transparent border-0 text-left cursor-pointer hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-indigo-300"
        >
          {icon && <FontAwesomeIcon icon={icon} className="text-indigo-300 w-5 shrink-0" aria-hidden="true" />}
          <span className="flex-1 min-w-0">
            <span className="block text-base font-semibold text-white">{title}</span>
            {summary && <span className="block text-sm text-slate-300">{summary}</span>}
          </span>
          <FontAwesomeIcon icon={faChevronDown} className={`text-slate-300 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      </h3>
      <div id={id} role="region" aria-labelledby={`${id}-button`} hidden={!open} className="px-5 sm:px-6 pb-6">
        {children}
      </div>
    </div>
  );
}
