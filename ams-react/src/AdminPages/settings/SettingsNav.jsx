import { useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

// Vertical section menu on md+; a horizontally scrolling pill row on phones.
export default function SettingsNav({ tabs, active, onSelect, dirtyTabs }) {
  const navRef = useRef(null);

  // On phones the row scrolls sideways; keep the open tab in view, otherwise
  // opening ?tab=notifications shows a row that starts at Account. Only the
  // row's own scrollLeft moves, never the page.
  useEffect(() => {
    const nav = navRef.current;
    const item = nav?.querySelector('[aria-current="page"]');
    if (!nav || !item || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollLeft = item.offsetLeft - (nav.clientWidth - item.offsetWidth) / 2;
  }, [active]);

  return (
    <nav
      ref={navRef}
      aria-label="Settings sections"
      className="relative flex md:flex-col gap-1 overflow-x-auto md:overflow-visible scrollbar-none [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        const isDirty = dirtyTabs.has(tab.id);
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            aria-current={isActive ? 'page' : undefined}
            className={`shrink-0 flex items-center gap-3 px-3.5 py-2.5 rounded-control text-body font-semibold text-left whitespace-nowrap border-0 cursor-pointer transition-colors duration-150 ${
              isActive
                ? 'bg-indigo-50 text-indigo-700'
                : 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-800'
            }`}
          >
            <FontAwesomeIcon icon={tab.icon} className={`w-4 ${isActive ? 'text-indigo-600' : 'text-slate-500'}`} />
            <span className="flex-1">{tab.label}</span>
            {isDirty && (
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" title="Unsaved changes" aria-label="Unsaved changes" />
            )}
          </button>
        );
      })}
    </nav>
  );
}
