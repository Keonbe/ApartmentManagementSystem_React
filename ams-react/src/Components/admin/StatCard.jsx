import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowTrendUp, faArrowTrendDown, faCircleInfo, faArrowRight } from '@fortawesome/free-solid-svg-icons';
import { clickable } from '../../utils/clickable';
import { Skeleton } from './ui/Skeleton';

// One count / KPI card for every admin page. Use it only for a figure no filter
// on the page already shows (a filter pill with its count needs no card above it).
// It lifts on hover and takes focus only when it does something (onClick), so a
// static card never looks clickable. Tailwind 4 only generates classes it finds
// written out, so each colour's classes are spelled in full here.
// status="loading" shows placeholder bars instead of the figure, trend and bar.
const COLORS = {
  emerald: { tile: 'bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-emerald-600/25', bar: 'bg-emerald-500', mark: 'text-emerald-600' },
  red: { tile: 'bg-gradient-to-br from-rose-500 to-red-600 shadow-red-600/25', bar: 'bg-red-500', mark: 'text-red-600' },
  indigo: { tile: 'bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-indigo-600/25', bar: 'bg-indigo-500', mark: 'text-indigo-600' },
  blue: { tile: 'bg-gradient-to-br from-sky-500 to-blue-600 shadow-blue-600/25', bar: 'bg-blue-500', mark: 'text-blue-600' },
  amber: { tile: 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-500/25', bar: 'bg-amber-500', mark: 'text-amber-600' },
  violet: { tile: 'bg-gradient-to-br from-violet-500 to-purple-700 shadow-violet-600/25', bar: 'bg-violet-500', mark: 'text-violet-600' },
  slate: { tile: 'bg-gradient-to-br from-slate-500 to-slate-700 shadow-slate-600/25', bar: 'bg-slate-500', mark: 'text-slate-600' },
};

export default function StatCard({
  icon, title, value, subtext: subtextProp, trend: trendProp, isBadTrend = false, color = 'slate',
  progress: progressProp, tooltip, onClick, className = '', children: childrenProp, status,
}) {
  const loading = status === 'loading';
  const live = !loading;
  const trend = live ? trendProp : null;
  const progress = live ? progressProp : null;
  const children = live ? childrenProp : null;
  const subtext = live ? subtextProp : null;
  const tone = (live && COLORS[color]) || COLORS.slate;
  const trendUp = !!trend && !String(trend).startsWith('-');
  const trendColor = isBadTrend ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200';

  return (
    <div
      className={`bg-white p-4 sm:p-5 rounded-card border border-slate-200 shadow-card flex flex-col gap-3 relative overflow-hidden group ${
        onClick ? 'card-interactive cursor-pointer hover:border-indigo-300 hover:shadow-raised transition-all outline-none focus-visible:ring-2 focus-visible:ring-indigo-500' : ''
      } ${className}`}
      title={tooltip || undefined}
      {...(onClick ? clickable(onClick) : {})}
    >
      {/* Faint oversized icon in the corner: colour and shape at a glance, no text to read. */}
      {icon && (
        <FontAwesomeIcon icon={icon} aria-hidden="true" className={`pointer-events-none absolute -right-4 -bottom-5 text-[4.5rem] sm:text-[5rem] opacity-[0.05] ${tone.mark}`} />
      )}

      <div className="flex flex-col min-[420px]:flex-row items-start gap-2.5 sm:gap-3">
        {icon && (
          <div className={`w-9 h-9 sm:w-11 sm:h-11 shrink-0 rounded-xl flex items-center justify-center text-white text-title shadow-lg ${tone.tile} ${onClick ? 'group-hover:scale-105 transition-transform' : ''}`}>
            <FontAwesomeIcon icon={icon} aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-label font-medium text-slate-600 m-0 flex items-center gap-1.5">
            <span className="min-w-0">{title}</span>
            {tooltip && (
              <>
                <FontAwesomeIcon icon={faCircleInfo} className="text-[11px] text-slate-400 shrink-0" aria-hidden="true" />
                <span className="sr-only">{tooltip}</span>
              </>
            )}
          </p>
          {loading ? (
            <>
              <span className="sr-only">Loading…</span>
              <Skeleton className="h-7 w-24 mt-1.5" />
            </>
          ) : (
            <p className="text-section sm:text-page font-bold text-slate-900 m-0 mt-0.5 tracking-tight break-words">{value}</p>
          )}
        </div>
        {onClick && (
          <FontAwesomeIcon
            icon={faArrowRight}
            aria-hidden="true"
            className="absolute top-4 right-4 sm:static text-xs text-slate-300 sm:mt-1 shrink-0 transition-all group-hover:text-indigo-600 group-hover:translate-x-0.5"
          />
        )}
      </div>

      {(loading || subtext || trend) && (
        <div className="relative flex flex-wrap items-center gap-x-2 gap-y-1">
          {loading && <Skeleton className="h-3 w-32" />}
          {trend && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold ring-1 ring-inset ${trendColor}`}>
              <FontAwesomeIcon icon={trendUp ? faArrowTrendUp : faArrowTrendDown} className="text-[10px]" aria-hidden="true" />
              {trend}
            </span>
          )}
          {subtext && <p className="text-caption text-slate-500 m-0">{subtext}</p>}
        </div>
      )}

      {progress !== undefined && progress !== null && (
        <div className="relative w-full bg-slate-100 rounded-full h-1.5 overflow-hidden" aria-hidden="true">
          <div className={`h-1.5 rounded-full ${tone.bar} transition-[width] duration-700`} style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}></div>
        </div>
      )}
      {children && <div className="relative">{children}</div>}
    </div>
  );
}
