// Class recipes for the admin UI, built on the index.css @theme tokens
// (text-label, rounded-control, shadow-card…). Components use these, and a page
// that cannot use a component (a Link styled as a button, a <th>) uses them too,
// so every button, badge and table reads the same.
//
// Status colours mean one thing each: red = overdue / failed / destructive,
// amber = waiting on someone, emerald = done, sky = information, violet = billed
// to the tenant, indigo = brand / selected.

const cx = (...parts) => parts.filter(Boolean).join(' ');

const BUTTON_BASE = 'inline-flex items-center justify-center gap-2 rounded-control font-semibold cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const BUTTON_VARIANTS = {
  primary: 'border border-transparent bg-indigo-600 text-white hover:bg-indigo-700',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  danger: 'border border-transparent bg-red-600 text-white hover:bg-red-700',
  'danger-outline': 'border border-red-200 bg-white text-red-700 hover:bg-red-50',
  success: 'border border-transparent bg-emerald-700 text-white hover:bg-emerald-800',
  ghost: 'border border-transparent bg-transparent text-slate-700 hover:bg-slate-100',
  link: 'border-0 bg-transparent p-0 text-indigo-700 hover:text-indigo-900 hover:underline',
};
const BUTTON_SIZES = {
  sm: 'h-8 px-3 text-label',
  md: 'h-10 px-4 text-body',
};

// btn('primary', 'md', 'w-full') → class string for a <button> or a <Link>.
export function btn(variant = 'primary', size = 'md', extra = '') {
  const v = BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.primary;
  const s = variant === 'link' ? 'text-label' : (BUTTON_SIZES[size] || BUTTON_SIZES.md);
  return cx(BUTTON_BASE, v, s, extra);
}

const BADGE_TONES = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  brand: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  info: 'bg-sky-50 text-sky-800 ring-sky-200',
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  violet: 'bg-violet-50 text-violet-800 ring-violet-200',
};

// badge('success') → one badge shape for every status chip.
export function badge(tone = 'neutral', extra = '') {
  return cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-caption font-semibold ring-1 ring-inset', BADGE_TONES[tone] || BADGE_TONES.neutral, extra);
}

// Surfaces.
export const PANEL = 'bg-white rounded-card border border-slate-200 shadow-card';
export const PANEL_HEADER = 'flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-100';
export const PANEL_TITLE = 'm-0 text-title font-semibold text-slate-900';

// Text roles (sentence case; no tiny tracked capitals).
export const LABEL = 'text-label font-medium text-slate-600';       // field and stat labels
export const META = 'text-caption text-slate-500';                 // secondary line under a value
export const SECTION_TITLE = 'm-0 text-section font-semibold text-slate-900';

// Tables.
export const TABLE = 'w-full text-body text-left';
export const THEAD = 'bg-slate-50 border-b border-slate-200';
export const TH = 'px-4 py-3 text-label font-medium text-slate-600';
export const TD = 'px-4 py-3 text-body text-slate-700';
export const TR = 'border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors';

// Form controls.
export const INPUT = 'w-full h-10 rounded-control border border-slate-300 bg-white px-3 text-body text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100';

export { cx };
