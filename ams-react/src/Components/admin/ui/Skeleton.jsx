import { TD } from './styles';

// Placeholders shown while a page's data loads for the first time, shaped like
// the content that replaces them, so the layout does not jump and an empty
// message ("No tenants found") never shows before the data has arrived. Each
// group is one role="status" with a hidden label: screen readers hear
// "Loading tenants…" once, not every grey bar. Pulse stops under reduced motion.
//
//   <tbody>{loading ? <SkeletonRows cols={5} label="Loading tenants…" /> : rows}</tbody>
//   {loading ? <SkeletonCards count={8} className="grid …" /> : cards}
export function Skeleton({ className = '' }) {
  return <span aria-hidden="true" className={`block rounded-control bg-slate-200 animate-pulse motion-reduce:animate-none ${className}`} />;
}

const Hidden = ({ label }) => <span className="sr-only">{label}</span>;

// Bar widths cycle so the rows do not look like a solid block.
const WIDTHS = ['w-3/4', 'w-1/2', 'w-2/3', 'w-5/12', 'w-7/12'];

// Rows for inside an existing <tbody>, so the real table header stays. The
// status label sits in the first cell: a role on the <tr> would break the table.
export function SkeletonRows({ rows = 6, cols = 4, label = 'Loading…' }) {
  return Array.from({ length: rows }, (_, r) => (
    <tr key={r} className="border-b border-slate-100 last:border-0">
      {Array.from({ length: cols }, (_, c) => (
        <td key={c} className={TD}>
          {r === 0 && c === 0 && <span role="status" className="sr-only">{label}</span>}
          <Skeleton className={`h-3.5 ${WIDTHS[(r + c) % WIDTHS.length]}`} />
        </td>
      ))}
    </tr>
  ));
}

// Card placeholders; pass the real grid classes in `className`.
export function SkeletonCards({ count = 6, className = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3', label = 'Loading…' }) {
  return (
    <div role="status" className={className}>
      <Hidden label={label} />
      {Array.from({ length: count }, (_, i) => (
        <div key={i} aria-hidden="true" className="rounded-card border border-slate-200 bg-white p-5 shadow-card space-y-3">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-8 w-full mt-4" />
        </div>
      ))}
    </div>
  );
}

// Avatar + two lines, for left-hand lists (ledgers, conversations, notifications).
export function SkeletonList({ rows = 5, className = '', label = 'Loading…' }) {
  return (
    <div role="status" className={`divide-y divide-slate-100 ${className}`}>
      <Hidden label={label} />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden="true" className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className={`h-3.5 ${WIDTHS[i % WIDTHS.length]}`} />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Free-form block group (charts, forms, detail panels): `children` are Skeletons.
export function SkeletonBlock({ label = 'Loading…', className = '', children }) {
  return (
    <div role="status" className={className}>
      <Hidden label={label} />
      {children}
    </div>
  );
}
