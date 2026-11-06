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

  emerald: { tile: 'bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-emerald-600/25', bar: 'bg-emerald-500', mark: 'text-emerald-500 dark:text-emerald-400' },

  red: { tile: 'bg-gradient-to-br from-rose-500 to-red-600 shadow-red-600/25', bar: 'bg-red-500', mark: 'text-rose-500 dark:text-rose-400' },

  indigo: { tile: 'bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-indigo-600/25', bar: 'bg-indigo-500', mark: 'text-indigo-600' },

  blue: { tile: 'bg-gradient-to-br from-sky-500 to-blue-600 shadow-blue-600/25', bar: 'bg-blue-500', mark: 'text-blue-500 dark:text-blue-400' },

  amber: { tile: 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-500/25', bar: 'bg-amber-500', mark: 'text-orange-500 dark:text-orange-400' },

  violet: { tile: 'bg-gradient-to-br from-violet-500 to-purple-700 shadow-violet-600/25', bar: 'bg-violet-500', mark: 'text-violet-500/40' },

  slate: { tile: 'bg-gradient-to-br from-slate-500 to-slate-700 shadow-slate-600/25', bar: 'bg-slate-500', mark: 'text-slate-500/40' },

};


export default function StatCard({

  icon, title, value, subtext: subtextProp, trend: trendProp, isBadTrend = false, color = 'slate',

  progress: progressProp, tooltip, onClick, className = '', children: childrenProp, status, showIconBadge = true,

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

      className={`admin-stat-card bg-white p-4 sm:p-5 rounded-card border border-slate-200 shadow-card flex min-h-40 flex-col gap-3 relative overflow-hidden group ${

        onClick ? 'card-interactive cursor-pointer hover:border-indigo-300 hover:shadow-raised transition-all outline-none focus-visible:ring-2 focus-visible:ring-indigo-500' : ''

      } ${className}`}

      title={tooltip || undefined}

      {...(onClick ? clickable(onClick) : {})}

    >

      {/* Faint oversized icon in the corner: colour and shape at a glance, no text to read. */}

      {icon && (

        <div aria-hidden="true" className={`pointer-events-none select-none absolute -bottom-4 -right-3 text-[5.5rem] leading-none transition-none transform-none z-0 ${tone.mark}`} style={{ willChange: 'auto', transform: 'none' }}>
          <FontAwesomeIcon className="block transition-none" icon={icon} />
        </div>

      )}


      <div className="relative z-10 flex w-full items-start gap-3">

        {icon && showIconBadge && (

          <div className={`w-9 h-9 sm:w-11 sm:h-11 shrink-0 rounded-xl flex items-center justify-center text-white text-title shadow-lg ${tone.tile} ${onClick ? 'group-hover:scale-105 transition-transform' : ''}`}>

            <FontAwesomeIcon icon={icon} aria-hidden="true" />

          </div>

        )}

        <div className="min-w-0 flex-1 pt-0.5">

          <div className="mb-2 flex min-h-[2.25rem] sm:min-h-[1.5rem] w-full items-start justify-between gap-1">

            <p className="text-label font-medium text-slate-600 m-0 flex min-w-0 items-center gap-1.5">

              <span className="min-w-0 leading-tight">{title}</span>

              {tooltip && (

                <>

                  <FontAwesomeIcon icon={faCircleInfo} className="text-[11px] text-slate-400 shrink-0" aria-hidden="true" />

                  <span className="sr-only">{tooltip}</span>

                </>

              )}

            </p>

            {onClick ? (

              <FontAwesomeIcon

                icon={faArrowRight}

                aria-hidden="true"

                className="shrink-0 text-xs text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-indigo-600"

              />

            ) : <span aria-hidden="true" className="w-3 shrink-0" />}

          </div>

          {loading ? (

            <>

              <span className="sr-only">Loading…</span>

              <Skeleton className="h-7 w-24 mt-1.5" />

            </>

          ) : (

            <p className="relative z-10 text-xl sm:text-2xl font-bold text-slate-900 m-0 mt-0.5 tracking-tight break-words">{value}</p>

          )}

          {progress !== undefined && progress !== null && (

            <div className={`${color === 'blue' && title === 'Occupancy' ? 'my-2 h-2 w-full max-w-[200px] sm:max-w-[180px] lg:max-w-[160px] xl:max-w-[180px] overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800/80 border border-slate-200/50 dark:border-white/5' : 'my-2 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/60'}`} aria-hidden="true">

              <div className={`h-full rounded-full ${color === 'blue' && title === 'Occupancy' ? 'bg-blue-600 dark:bg-blue-500 transition-[width] duration-500 ease-out' : `${tone.bar} transition-all duration-500`}`} style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />

            </div>

          )}

        </div>

      </div>


      {(loading || subtext || trend) && (

        <div className="relative z-10 mt-auto pt-2 flex items-center gap-2">

          {loading && <Skeleton className="h-3 w-32" />}

          {trend && (

            <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] sm:text-xs font-semibold ring-1 ring-inset ${trendColor}`}>

              <FontAwesomeIcon icon={trendUp ? faArrowTrendUp : faArrowTrendDown} className="text-[10px]" aria-hidden="true" />

              {trend}

            </span>

          )}

          {subtext && <p className="relative z-10 text-xs text-slate-500 dark:text-slate-400 m-0">{subtext}</p>}

        </div>

      )}


      {children && <div className="relative z-10">{children}</div>}

    </div>

  );

}