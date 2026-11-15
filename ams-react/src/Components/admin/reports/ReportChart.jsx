import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChartColumn } from '@fortawesome/free-solid-svg-icons';
import { formatValue, formatShort } from '../../../utils/reportFormat';
import { Skeleton, SkeletonBlock } from '../ui/Skeleton';

// The report's periods as bars (grouped per period) or lines, in the
// Dashboard's income chart style: dashed grid, a zero line, a dark tooltip
// per period on hover or focus. Negative values (a loss) hang below zero.
// The same figures are in the "By …" table under it.

// Tailwind only keeps classes written out in full.
// A series names its tone (get_reports.php); the order is the fallback.
const TONES = {
  indigo: { bar: 'bg-indigo-500', hex: '#6366f1', text: 'text-indigo-300' },
  emerald: { bar: 'bg-emerald-500', hex: '#10b981', text: 'text-emerald-300' },
  amber: { bar: 'bg-amber-400', hex: '#fbbf24', text: 'text-amber-300' },
  rose: { bar: 'bg-rose-500', hex: '#f43f5e', text: 'text-rose-300' },
  sky: { bar: 'bg-sky-500', hex: '#0ea5e9', text: 'text-sky-300' },
  violet: { bar: 'bg-violet-500', hex: '#8b5cf6', text: 'text-violet-300' },
};
const FALLBACK = ['indigo', 'emerald', 'amber', 'rose'];
const toneOf = (s, i) => TONES[s.tone] || TONES[FALLBACK[i % FALLBACK.length]];

// Round axis ends: 0 to a "nice" top (and bottom, when something is negative).
function niceScale(min, max) {
  const span = Math.max(max - min, 1e-9);
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  return { lo: Math.floor(min / step) * step, hi: Math.ceil(max / step) * step, step };
}

export default function ReportChart({ chart, rows, loading }) {
  const [active, setActive] = useState(null);
  if (loading) {
    return (
      <SkeletonBlock label="Loading the chart…" className="h-64 flex items-end gap-3 px-2">
        {['h-1/3', 'h-1/2', 'h-2/5', 'h-3/4', 'h-3/5', 'h-5/6', 'h-2/3', 'h-1/2'].map((h, i) => <Skeleton key={i} className={`flex-1 ${h}`} />)}
      </SkeletonBlock>
    );
  }
  const series = chart?.series || [];
  const values = (rows || []).flatMap((r) => series.map((s) => r[s.key])).filter((v) => v !== null && v !== undefined).map(Number);
  if (!chart || !rows?.length || !values.length || values.every((v) => v === 0)) {
    return (
      <div className="h-64 flex flex-col items-center justify-center gap-1 text-center text-slate-500">
        <FontAwesomeIcon icon={faChartColumn} className="text-3xl text-slate-300" aria-hidden="true" />
        <p className="m-0 text-body font-medium text-slate-600">Nothing to chart in this range</p>
        <p className="m-0 text-label">Pick another range or report above.</p>
      </div>
    );
  }

  const { lo, hi: top, step } = niceScale(Math.min(0, ...values), Math.max(0, ...values));
  const span = top - lo || 1;
  const ticks = [];
  for (let v = top; v >= lo - step / 2; v -= step) ticks.push(Math.round(v * 100) / 100);
  const pct = (v) => ((top - v) / span) * 100; // distance from the top, in %
  const zero = pct(0);
  const count = rows.length;
  const labelEvery = Math.max(1, Math.ceil(count / 12));
  const phoneEvery = Math.max(1, Math.ceil(count / 6));
  const tipAlign = (i) => (i < count / 4 ? 'left-0' : i > (count * 3) / 4 ? 'right-0' : 'left-1/2 -translate-x-1/2');
  const tooltip = (r, i) => (
    <div className={`absolute bottom-full mb-2 ${tipAlign(i)} z-30 w-48 admin-native rounded-control bg-slate-900 text-white text-caption p-2.5 shadow-raised pointer-events-none transition-opacity ${active === i ? 'opacity-100' : 'opacity-0'}`}>
      <p className="m-0 mb-1.5 pb-1 border-b border-slate-700 font-bold text-slate-100">{r.period}</p>
      {series.map((s, si) => (
        <p key={s.key} className="m-0 flex justify-between gap-2">
          <span className="text-slate-400">{s.label}</span>
          <span className={`font-bold ${toneOf(s, si).text}`}>{formatValue(r[s.key], chart.format)}</span>
        </p>
      ))}
    </div>
  );
  const describe = (r) => `${r.period}: ${series.map((s) => `${s.label} ${formatValue(r[s.key], chart.format)}`).join(', ')}`;

  return (
    <div className="flex flex-col min-w-0">
      <div className="flex flex-wrap justify-end items-center gap-x-4 gap-y-1 text-label text-slate-500 mb-3">
        {series.map((s, si) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className={`inline-block ${chart.kind === 'line' ? 'w-4 h-1 rounded-full' : 'w-3 h-3 rounded-[3px]'} ${toneOf(s, si).bar}`} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="flex gap-2 min-w-0">
        <div className="h-64 flex flex-col justify-between text-right text-caption text-slate-400 shrink-0 w-12 sm:w-14 -mt-1.5" aria-hidden="true">
          {ticks.map((v) => <span key={v} className="leading-3">{formatShort(v, chart.format)}</span>)}
        </div>
        <div className="relative flex-1 min-w-0">
          <div className="absolute inset-x-0 top-0 h-64 flex flex-col justify-between pointer-events-none" aria-hidden="true">
            {ticks.map((v) => <div key={v} className={`border-t ${v === 0 ? 'border-slate-300' : 'border-dashed border-slate-200'}`} />)}
          </div>

          {chart.kind === 'line' ? (
            <div className="relative h-64" onMouseLeave={() => setActive(null)}>
              <svg className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100" aria-hidden="true">
                {series.map((s, si) => {
                  // A gap (a period still to come) breaks the line.
                  const segs = [];
                  let cur = [];
                  rows.forEach((r, i) => {
                    const v = r[s.key];
                    if (v === null || v === undefined) { if (cur.length) segs.push(cur); cur = []; return; }
                    cur.push(`${count > 1 ? (i / (count - 1)) * 100 : 50},${pct(Number(v))}`);
                  });
                  if (cur.length) segs.push(cur);
                  return segs.map((seg, k) => <path key={`${s.key}-${k}`} d={`M ${seg.join(' L ')}`} fill="none" stroke={toneOf(s, si).hex} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />);
                })}
              </svg>
              {rows.map((r, i) => {
                const v = r[series[0].key];
                if (v === null || v === undefined) return null;
                return (
                  <div key={r._key || i} className="absolute -translate-x-1/2 -translate-y-1/2 z-10" style={{ left: `${count > 1 ? (i / (count - 1)) * 100 : 50}%`, top: `${pct(Number(v))}%` }}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onFocus={() => setActive(i)}
                      onBlur={() => setActive(null)}
                      aria-label={describe(r)}
                      className={`touch-compact block rounded-full bg-white border-2 border-indigo-600 cursor-default p-0 transition-transform hover:scale-150 ${count > 31 ? 'w-2 h-2' : 'w-3 h-3'}`}
                    />
                    {tooltip(r, i)}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={`relative h-64 flex ${count > 40 ? 'gap-px' : count > 16 ? 'gap-0.5 sm:gap-1' : 'gap-1.5 sm:gap-3'}`} onMouseLeave={() => setActive(null)}>
              {rows.map((r, i) => (
                <div
                  key={r._key || i}
                  role="img"
                  tabIndex={0}
                  aria-label={describe(r)}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className={`relative flex-1 min-w-0 h-full flex justify-center gap-px outline-none rounded-sm focus-visible:ring-2 focus-visible:ring-indigo-500 ${active === i ? 'bg-indigo-50/60' : ''}`}
                >
                  {tooltip(r, i)}
                  {series.map((s, si) => {
                    const v = Number(r[s.key]) || 0;
                    const from = Math.min(pct(v), zero);
                    const height = Math.abs(pct(v) - zero);
                    return (
                      <div key={s.key} className="relative flex-1 max-w-[2.25rem] min-w-0 h-full">
                        {v !== 0 && (
                          <div
                            className={`absolute inset-x-0 ${toneOf(s, si).bar} ${v >= 0 ? 'rounded-t-[3px]' : 'rounded-b-[3px] opacity-80'} transition-[top,height] duration-500`}
                            style={{ top: `${from}%`, height: `${Math.max(height, 0.6)}%` }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          <div className={`flex mt-2 ${chart.kind === 'line' ? 'justify-between' : count > 40 ? 'gap-px' : count > 16 ? 'gap-0.5 sm:gap-1' : 'gap-1.5 sm:gap-3'}`} aria-hidden="true">
            {rows.map((r, i) => (
              <span
                key={r._key || i}
                className={`${chart.kind === 'line' ? 'w-0 flex justify-center' : 'flex-1 min-w-0 text-center'} text-caption font-semibold whitespace-nowrap ${active === i ? 'text-indigo-700' : 'text-slate-500'} ${i % labelEvery === 0 ? (i % phoneEvery === 0 ? '' : 'invisible sm:visible') : 'invisible'}`}
              >
                {r._short || r.period}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
