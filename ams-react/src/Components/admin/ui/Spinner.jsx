import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';

// Small inline loader for a side panel, drawer or modal section (a whole list or
// table uses a Skeleton instead). Buttons use Button's own `loading` prop.
export default function Spinner({ label = 'Loading…', className = '' }) {
  return (
    <p role="status" className={`m-0 flex items-center justify-center gap-2 py-6 text-label text-slate-500 ${className}`}>
      <FontAwesomeIcon icon={faSpinner} spin className="motion-reduce:animate-none" aria-hidden="true" />
      {label}
    </p>
  );
}
