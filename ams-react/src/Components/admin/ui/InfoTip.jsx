import { useEffect, useId, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleInfo } from '@fortawesome/free-solid-svg-icons';

// A small (i) button that shows a note on hover or keyboard focus and keeps it
// open on click (tap on phones). Escape or a click elsewhere closes it.
//   <InfoTip label="About showcase photos">Shown to guests on the Preview page…</InfoTip>
// align: where the note opens relative to the icon (left = its left edge on the icon).
export default function InfoTip({ label, children, align = 'left', className = '' }) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const ref = useRef(null);
  const id = useId();
  const open = hover || pinned;

  useEffect(() => {
    if (!pinned) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setPinned(false); };
    const onKey = (e) => { if (e.key === 'Escape') { setPinned(false); setHover(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [pinned]);

  const side = align === 'right' ? 'right-0' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0';
  return (
    <span
      ref={ref}
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setPinned((p) => !p)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        onKeyDown={(e) => { if (e.key === 'Escape') { setPinned(false); setHover(false); } }}
        className={`touch-compact inline-flex h-6 w-6 items-center justify-center rounded-full border-0 bg-transparent p-0 cursor-pointer transition-colors ${open ? 'text-indigo-600' : 'text-slate-400 hover:text-indigo-600'}`}
      >
        <FontAwesomeIcon icon={faCircleInfo} className="text-sm" aria-hidden="true" />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={`absolute top-full z-40 mt-2 w-72 max-w-[calc(100vw-3rem)] rounded-card border border-slate-200 bg-white p-3 text-left text-label font-normal leading-relaxed text-slate-600 shadow-raised animate-fadeIn ${side}`}
        >
          {children}
        </span>
      )}
    </span>
  );
}
