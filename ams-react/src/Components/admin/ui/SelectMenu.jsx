import { useEffect, useId, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faChevronDown } from '@fortawesome/free-solid-svg-icons';
import { cx } from './styles';

// A small styled dropdown (a native <select> opens an unstyled OS list).
//   <SelectMenu label="Sort inquiries" value={sort} onChange={setSort}
//     options={[{ value: 'oldest', label: 'Oldest first', hint: 'Longest waiting at the top', icon: faArrowDownShortWide }, …]} />
// The button shows the picked option (its icon, else `icon`). A listbox:
// arrows / Home / End move, Enter or Space picks, Escape or a click elsewhere
// closes (Escape does not close a dialog around it).
export default function SelectMenu({ label, value, onChange, options, icon = null, align = 'right', className = '' }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();
  const current = options.find((o) => o.value === value) || options[0];

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    listRef.current?.focus();
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const openMenu = () => {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const pick = (o) => {
    if (o) onChange(o.value);
    setOpen(false);
    buttonRef.current?.focus();
  };
  const onListKey = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (a + step + options.length) % options.length);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setActive(e.key === 'Home' ? 0 : options.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(options[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const shownIcon = current?.icon || icon;
  return (
    <div ref={wrapRef} className={cx('relative', className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${current?.label || ''}`}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={(e) => { if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !open) { e.preventDefault(); openMenu(); } }}
        className={cx(
          'inline-flex h-10 w-full items-center gap-2 rounded-control border bg-white px-3 text-label font-semibold text-slate-700 cursor-pointer transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-100',
          open ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-slate-200',
        )}
      >
        {shownIcon && <FontAwesomeIcon icon={shownIcon} className="text-slate-400" aria-hidden="true" />}
        <span className="flex-1 truncate text-left">{current?.label}</span>
        <FontAwesomeIcon icon={faChevronDown} className={`text-[10px] text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${listId}-${active}`}
          onKeyDown={onListKey}
          className={cx(
            'absolute top-full z-30 m-0 mt-1.5 w-64 max-w-[calc(100vw-2rem)] list-none rounded-card border border-slate-200 bg-white p-1 shadow-raised outline-none animate-fadeIn',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {options.map((o, i) => {
            const selected = o.value === value;
            return (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                className={cx(
                  'flex items-start gap-2.5 rounded-control px-2.5 py-2 cursor-pointer',
                  i === active ? 'bg-indigo-50' : '',
                )}
              >
                <span className={cx('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center', selected ? 'text-indigo-600' : 'text-slate-400')}>
                  {o.icon ? <FontAwesomeIcon icon={o.icon} className="text-label" aria-hidden="true" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cx('block text-label', selected ? 'font-semibold text-indigo-700' : 'font-medium text-slate-800')}>{o.label}</span>
                  {o.hint && <span className="block text-caption text-slate-500">{o.hint}</span>}
                </span>
                {selected && <FontAwesomeIcon icon={faCheck} className="mt-0.5 text-label text-indigo-600" aria-hidden="true" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
