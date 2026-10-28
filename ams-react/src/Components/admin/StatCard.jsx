import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUp, faArrowDown, faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import { clickable } from '../../utils/clickable';

// One count / KPI card for every admin page. Use it only for a figure no filter
// on the page already shows (a filter pill with its count needs no card above it).
// It lifts on hover and takes focus only when it does something (onClick), so a
// static card never looks clickable. Tailwind 4 only generates classes it finds
// written out, so each colour's tile and bar classes are spelled in full here.
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
  icon, title, value, subtext, trend, isBadTrend = false, color = 'slate',
  progress, tooltip, onClick, className = '', children,
}) {
  const tone = COLORS[color] || COLORS.slate;
  const trendColor = isBadTrend ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700';

  return (
    <div
      className={`bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between relative group ${
        onClick ? 'card-interactive cursor-pointer hover:border-indigo-400 hover:shadow-md transition-all outline-none focus-visible:ring-2 focus-visible:ring-indigo-500' : ''
      } ${className}`}
      {...(onClick ? clickable(onClick) : {})}
    >
      {tooltip && (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[11px] px-2 py-1.5 rounded shadow-lg opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity whitespace-normal w-44 text-center pointer-events-none z-50 flex items-center justify-center gap-1">
          <FontAwesomeIcon icon={faInfoCircle} className="shrink-0 text-slate-400" />
          <span>{tooltip}</span>
        </div>
      )}
      <div className="flex justify-between items-start mb-3">
        {icon && (
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${tone.tile} ${onClick ? 'group-hover:scale-110 transition-transform' : ''}`}>
            <FontAwesomeIcon icon={icon} aria-hidden="true" />
          </div>
        )}
        {trend && (
          <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${trendColor}`}>
            <FontAwesomeIcon icon={trend.includes('+') ? faArrowUp : faArrowDown} className="text-[8px]" aria-hidden="true" />
            {trend}
          </span>
        )}
      </div>
      <div>
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide m-0 mb-1">{title}</p>
        <p className="text-2xl font-bold text-slate-800 m-0 leading-none">{value}</p>
        {subtext && <p className="text-[11px] text-slate-500 m-0 mt-2 font-medium">{subtext}</p>}
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
