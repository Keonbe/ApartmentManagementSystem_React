import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExclamationCircle, faInfoCircle, faTimes } from '@fortawesome/free-solid-svg-icons';

// Replaces window.alert() for action results: shown next to the action that
// failed, on light and dark pages alike. tone 'error' is announced at once
// (role="alert"); 'info' politely (role="status"). Renders nothing without children.
const TONES = {
    error: { cls: 'bg-rose-50 border-rose-200 text-rose-800', icon: faExclamationCircle, iconCls: 'text-rose-600', role: 'alert' },
    info: { cls: 'bg-sky-50 border-sky-200 text-sky-900', icon: faInfoCircle, iconCls: 'text-sky-700', role: 'status' },
};

export default function InlineAlert({ tone = 'error', children, onDismiss, className = '' }) {
    if (!children) return null;
    const t = TONES[tone] || TONES.error;
    return (
        <div role={t.role} className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium text-left ${t.cls} ${className}`}>
            <FontAwesomeIcon icon={t.icon} className={`mt-0.5 shrink-0 ${t.iconCls}`} aria-hidden="true" />
            <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
            {onDismiss && (
                <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 -m-2.5 p-1 min-w-[44px] min-h-[44px] inline-flex items-center justify-center bg-transparent border-0 cursor-pointer opacity-70 hover:opacity-100 text-current">
                    <FontAwesomeIcon icon={faTimes} />
                </button>
            )}
        </div>
    );
}
