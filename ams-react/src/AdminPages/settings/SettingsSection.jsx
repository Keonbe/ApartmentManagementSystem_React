import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

// Shared building blocks for the Settings page panels, so every section and
// field looks the same instead of each block carrying its own copy of the
// classes (the page had three different heading styles before).

export const INPUT_BASE =
  'focus-glow px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm';
export const INPUT = `${INPUT_BASE} w-full`;
export const INPUT_MONO = `${INPUT} font-mono`;
// Short numeric inputs that sit next to a unit ("12 months").
export const INPUT_NUMBER = `${INPUT_BASE} text-center font-bold`;
export const CHECKBOX = 'rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-4 w-4';

// Tailwind only ships classes it can see written out, so tones are spelled in full.
const TONES = {
  indigo: 'bg-indigo-50 text-indigo-600',
  violet: 'bg-violet-50 text-violet-600',
  amber: 'bg-amber-50 text-amber-600',
  rose: 'bg-rose-50 text-rose-600',
  blue: 'bg-blue-50 text-blue-600',
  emerald: 'bg-emerald-50 text-emerald-600',
};

export function SettingsSection({ icon, tone = 'indigo', title, description, action, children }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <header className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
        {icon && (
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-base shrink-0 ${TONES[tone] || TONES.indigo}`}>
            <FontAwesomeIcon icon={icon} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-slate-800 m-0">{title}</h3>
          {description && <p className="text-xs text-slate-500 m-0 mt-0.5">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="p-5 space-y-5">{children}</div>
    </section>
  );
}

export function Field({ label, icon, hint, children, className = '' }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          {icon && <FontAwesomeIcon icon={icon} className="text-slate-400 text-xs" />}
          {label}
        </label>
      )}
      {children}
      {hint && <p className="text-[11px] text-slate-500 m-0 leading-relaxed">{hint}</p>}
    </div>
  );
}

// An input with a unit before and/or after it: "₱ [ 500 ] per slot / month".
export function WithUnit({ prefix, suffix, children }) {
  return (
    <div className="flex items-center gap-3">
      {prefix && <span className="text-sm font-semibold text-slate-500">{prefix}</span>}
      {children}
      {suffix && <span className="text-sm text-slate-500">{suffix}</span>}
    </div>
  );
}

export function Switch({ checked, onChange, label, tone = 'indigo' }) {
  const on = tone === 'rose' ? 'bg-rose-500' : 'bg-indigo-600';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 border-0 cursor-pointer ${checked ? on : 'bg-slate-300'}`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0.5'}`}
      />
    </button>
  );
}

// A pill toggle group: one choice (radio-like) or many (checkbox-like).
export function PillOption({ selected, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!selected}
      className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors duration-200 cursor-pointer ${
        selected ? 'bg-indigo-500 border-indigo-500 text-white' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
      }`}
    >
      {children}
    </button>
  );
}

export function Callout({ tone = 'slate', icon, title, children }) {
  const tones = {
    slate: ['bg-slate-50 border-slate-200', 'text-slate-400', 'text-slate-800', 'text-slate-600'],
    rose: ['bg-rose-50 border-rose-100', 'text-rose-400', 'text-rose-800', 'text-rose-700'],
    amber: ['bg-amber-50 border-amber-100', 'text-amber-500', 'text-amber-800', 'text-amber-700'],
    violet: ['bg-violet-50 border-violet-100', 'text-violet-500', 'text-violet-800', 'text-violet-800'],
  };
  const [box, iconCls, titleCls, bodyCls] = tones[tone] || tones.slate;
  return (
    <div className={`border rounded-xl p-4 flex items-start gap-3 ${box}`}>
      {icon && <FontAwesomeIcon icon={icon} className={`mt-0.5 ${iconCls}`} />}
      <div className="min-w-0">
        {title && <p className={`text-xs font-semibold m-0 ${titleCls}`}>{title}</p>}
        <div className={`text-[11px] leading-relaxed ${title ? 'mt-1' : ''} ${bodyCls}`}>{children}</div>
      </div>
    </div>
  );
}
