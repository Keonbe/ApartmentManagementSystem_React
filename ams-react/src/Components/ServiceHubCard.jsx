import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRight } from '@fortawesome/free-solid-svg-icons';
import { clickable } from '../utils/clickable';
import '../assets/styles/serviceHubCard.css';

// One card of the tenant Services page. Also rendered by the admin appearance
// modal as its live preview, so the two cannot drift apart.
// colorConfig / icon come from getServiceAppearance() (config/serviceAppearance.js).
export default function ServiceHubCard({ colorConfig, icon, title, description, tag, buttonText, onClick, preview = false }) {
    const interactive = !!onClick && !preview;

    return (
        <div
            {...(interactive ? clickable(onClick) : {})}
            style={{ '--svc': colorConfig.hex }}
            className={`service-hub-card group relative h-full overflow-hidden bg-white rounded-2xl border border-slate-200/90 shadow-sm p-6 sm:p-7 flex flex-col focus-visible:outline-none focus-visible:ring-2 ${colorConfig.ring} ${
                interactive ? 'service-hub-card--interactive cursor-pointer' : ''
            }`}
        >
            {/* Top row: icon tile + category tag */}
            <div className="relative flex items-start justify-between gap-3">
                <div
                    className={`service-hub-card__icon w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-2xl flex items-center justify-center border ${colorConfig.bgLight} ${colorConfig.borderLight} ${colorConfig.text}`}
                >
                    <FontAwesomeIcon icon={icon} className="text-2xl sm:text-[1.75rem]" />
                </div>
                {tag && (
                    <span
                        className={`min-w-0 truncate px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase border ${colorConfig.badge}`}
                    >
                        {tag}
                    </span>
                )}
            </div>

            {/* Title + description */}
            <div className="relative mt-5 flex-1 space-y-2">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 m-0 leading-snug">{title}</h2>
                <p className="text-slate-500 text-sm leading-relaxed m-0 line-clamp-3">{description}</p>
            </div>

            {/* Action row: label in the service colour, round arrow button.
                The label truncates first, so a long Filipino label stays on one line. */}
            <div className="relative mt-6 pt-5 border-t border-slate-100 flex items-center justify-between gap-3">
                <span className={`min-w-0 truncate text-sm font-bold ${colorConfig.text}`}>{buttonText}</span>
                <span
                    aria-hidden="true"
                    className={`service-hub-card__go w-10 h-10 shrink-0 rounded-full flex items-center justify-center shadow-sm ${colorConfig.btn}`}
                >
                    <FontAwesomeIcon icon={faArrowRight} className="text-sm" />
                </span>
            </div>
        </div>
    );
}
