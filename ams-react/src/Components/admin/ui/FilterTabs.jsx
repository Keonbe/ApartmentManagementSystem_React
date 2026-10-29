import { cx } from './styles';

// One style for every list filter (status pills, tabs above a table):
//   <FilterTabs label="Filter tenants by status" value={filter} onChange={setFilter}
//     options={[{ value: 'all', label: 'All', count: 15 }, { value: 'pending', label: 'Pending', count: 1, dot: true }]} />
// Buttons with aria-pressed in a labelled group (these filter one list; they do
// not switch panels, so they are not ARIA tabs). `dot` marks something needing action.
export default function FilterTabs({ label, value, onChange, options, className = '' }) {
  return (
    <div role="group" aria-label={label} className={cx('inline-flex max-w-full flex-wrap gap-1 rounded-card bg-slate-100 p-1', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-control border-0 px-3 py-1.5 text-label font-medium cursor-pointer transition-colors whitespace-nowrap',
              active ? 'bg-white text-slate-900 shadow-card' : 'bg-transparent text-slate-600 hover:text-slate-900',
            )}
          >
            {o.dot && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />}
            {o.label}
            {o.count !== undefined && o.count !== null && (
              <span className="text-caption text-slate-600">{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
