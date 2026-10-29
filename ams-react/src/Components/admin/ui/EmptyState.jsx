import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

// What a list shows when it has nothing: say what is empty and, when there is
// one, the next step (`action`, e.g. a Button).
export default function EmptyState({ icon, iconClassName = 'text-slate-400', title, message, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center gap-2 px-6 py-10 text-center ${className}`}>
      {icon && <FontAwesomeIcon icon={icon} className={`text-2xl ${iconClassName}`} aria-hidden="true" />}
      {title && <p className="m-0 text-body font-semibold text-slate-800">{title}</p>}
      {message && <p className="m-0 max-w-sm text-label text-slate-500">{message}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
