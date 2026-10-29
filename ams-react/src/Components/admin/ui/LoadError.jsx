import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import Button from './Button';

// What a list shows when its data failed to load. It must never look like an
// empty result ("No tenants found", "₱0"): an admin would read that as "nothing
// to do". Same layout as EmptyState, announced as an alert, with a retry.
export default function LoadError({
  title = "Couldn't load this list",
  message = 'This is not an empty result: the data did not load.',
  detail,
  onRetry,
  className = '',
}) {
  return (
    <div role="alert" className={`flex flex-col items-center gap-2 px-6 py-10 text-center ${className}`}>
      <FontAwesomeIcon icon={faTriangleExclamation} className="text-2xl text-amber-600" aria-hidden="true" />
      <p className="m-0 text-body font-semibold text-slate-800">{title}</p>
      <p className="m-0 max-w-sm text-label text-slate-500">{message}</p>
      {detail && <p className="m-0 max-w-sm text-label text-slate-500">{detail}</p>}
      {onRetry && <Button variant="secondary" size="sm" className="mt-2" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

// The same message as a table row, for inside a <tbody> (cols = the table's column count).
export function LoadErrorRow({ cols, ...props }) {
  return <tr><td colSpan={cols}><LoadError {...props} /></td></tr>;
}
