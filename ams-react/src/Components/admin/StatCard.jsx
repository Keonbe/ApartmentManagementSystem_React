import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUp, faArrowDown, faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import { clickable } from '../../utils/clickable';
import { Skeleton } from './ui/Skeleton';

// One count / KPI card for every admin page. Use it only for a figure no filter
// on the page already shows (a filter pill with its count needs no card above it).
// It lifts on hover and takes focus only when it does something (onClick), so a
// static card never looks clickable. Tailwind 4 only generates classes it finds
// written out, so each colour's tile and bar classes are spelled in full here.
// status="loading" shows placeholder bars instead of the figure, trend and bar.
const COLORS = {
  emerald: { tile: 'bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500' },
  red: { tile: 'bg-red-50 text-red-600', bar: 'bg-red-500' },
  indigo: { tile: 'bg-indigo-50 text-indigo-600', bar: 'bg-indigo-500' },
  blue: { tile: 'bg-blue-50 text-blue-600', bar: 'bg-blue-500' },
  amber: { tile: 'bg-amber-50 text-amber-700', bar: 'bg-amber-500' },
  violet: { tile: 'bg-violet-50 text-violet-700', bar: 'bg-violet-500' },
  slate: { tile: 'bg-slate-100 text-slate-600', bar: 'bg-slate-500' },
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
  const trendColor = isBadTrend ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700';

  return (
    <div
      className={`bg-white p-5 rounded-card border border-slate-200 shadow-card flex flex-col justify-between relative group ${
        onClick ? 'card-interactive cursor-pointer hover:border-indigo-400 hover:shadow-raised transition-all outline-none focus-visible:ring-2 focus-visible:ring-indigo-500' : ''
      } ${className}`}
      {...(onClick ? clickable(onClick) : {})}
    >
      {tooltip && (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-caption px-2 py-1.5 rounded-control shadow-raised opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity whitespace-normal w-44 text-center pointer-events-none z-50 flex items-center justify-center gap-1">
          <FontAwesomeIcon icon={faInfoCircle} className="shrink-0 text-slate-400" />
          <span>{tooltip}</span>
        </div>
      )}
      <div className="flex justify-between items-start mb-3">
        {icon && (
          <div className={`w-10 h-10 rounded-control flex items-center justify-center text-title ${tone.tile} ${onClick ? 'group-hover:scale-110 transition-transform' : ''}`}>
            <FontAwesomeIcon icon={icon} aria-hidden="true" />
          </div>
        )}
        {trend && (
          <span className={`text-caption font-semibold px-1.5 py-0.5 rounded-control flex items-center gap-1 ${trendColor}`}>
            <FontAwesomeIcon icon={trend.includes('+') ? faArrowUp : faArrowDown} className="text-[8px]" aria-hidden="true" />
            {trend}
          </span>
        )}
      </div>
      <div>
        <p className="text-label font-medium text-slate-600 m-0 mb-1">{title}</p>
        {loading ? (
          <>
            <span className="sr-only">Loading…</span>
            <Skeleton className="h-7 w-24 mt-1" />
            <Skeleton className="h-3 w-32 mt-2.5" />
          </>
        ) : (
          <p className="text-page font-semibold text-slate-900 m-0">{value}</p>
        )}
        {subtext && <p className="text-caption text-slate-500 m-0 mt-1.5">{subtext}</p>}
        {progress !== undefined && progress !== null && (
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3 overflow-hidden" aria-hidden="true">
            <div className={`h-1.5 rounded-full ${tone.bar}`} style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}></div>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
