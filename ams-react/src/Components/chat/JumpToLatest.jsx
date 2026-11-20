import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowDown } from '@fortawesome/free-solid-svg-icons';

// The "Latest messages" button over a chat scrolled up (hooks/useChatScroll.js).
export default function JumpToLatest({ count = 0, onClick, label = 'Latest messages', className = '' }) {
  return (
    <button
      type="button"
      onClick={() => onClick?.()}
      className={`absolute bottom-3 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 shadow-lg cursor-pointer animate-fade-in-up hover:bg-indigo-50 ${className}`}
    >
      <FontAwesomeIcon icon={faArrowDown} aria-hidden="true" />
      {label}
      {count > 0 && <span className="rounded-full bg-indigo-600 px-1.5 text-[10px] leading-4 text-white">{count > 9 ? '9+' : count}</span>}
    </button>
  );
}
