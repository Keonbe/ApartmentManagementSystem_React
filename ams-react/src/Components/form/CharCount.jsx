// "12 / 255 characters" under a textarea; amber from 90% of the limit.
export default function CharCount({ value, max, className = '' }) {
  const n = String(value ?? '').length;
  const near = n >= max * 0.9;
  return (
    <p className={`text-xs mt-1 text-right ${near ? 'text-amber-700' : 'text-slate-600'} ${className}`} aria-live="polite">
      {n} / {max} characters
    </p>
  );
}
