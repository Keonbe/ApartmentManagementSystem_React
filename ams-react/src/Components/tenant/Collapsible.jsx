import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown } from '@fortawesome/free-solid-svg-icons';

// A <details> section with a chevron that turns when it opens (Payment History
// → Cancelled bills, My Requests → closed requests, the Inquiry page's house
// rules on phones). The summary is styled as
// flex, which drops the browser's own triangle, so the chevron replaces it.
// The content mounts on open, so its fade-in plays every time. `fill` stretches
// the summary across the box with the chevron at the far end (a card header).
export default function Collapsible({ summary, summaryClassName = '', className = '', defaultOpen = false, fill = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className={className}>
      <summary className={`flex ${fill ? 'w-full justify-between' : 'w-fit'} list-none items-center gap-2 min-h-[44px] cursor-pointer select-none [&::-webkit-details-marker]:hidden ${summaryClassName}`}>
        {summary}
        <span aria-hidden="true" className={`flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-[background-color,rotate] duration-300 ${open ? 'rotate-180 bg-slate-200' : ''}`}>
          <FontAwesomeIcon icon={faChevronDown} className="text-xs" />
        </span>
      </summary>
      {open && <div className="animate-fade-in-up">{children}</div>}
    </details>
  );
}
