import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChartLine, faChartColumn, faTable, faArrowRight, faCalendarDays, faXmark } from '@fortawesome/free-solid-svg-icons';
import api from '../../../api/axiosConfig';
import { clickable } from '../../../utils/clickable';
import { TH, THEAD, btn, PANEL } from '../ui/styles';
import { Skeleton, SkeletonBlock } from '../ui/Skeleton';

// Income chart for a chosen period (dashboard_stats.php ?section=income&from=&to=).
// The first period comes with the dashboard's own request; changing it asks for
// the chart alone. The server buckets per day up to 62 days, per month beyond.

const peso = (n) => `₱${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const pesoShort = (n) => `₱${Number(n || 0).toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 })}`;
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
// A period never runs past today: future days would only add empty bars.
const capToday = (d) => (d > today() ? today() : d);
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const longDate = (s) => parse(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

const PRESETS = [
  { id: '6m', label: 'Last 6 months' },
  { id: '12m', label: 'Last 12 months' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'ytd', label: 'This year' },
  { id: 'month', label: 'A specific month…' },
  { id: 'year', label: 'A specific year…' },
  { id: 'custom', label: 'Custom dates…' },
];
const thisYear = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => thisYear - i);

// { from, to } for a preset, or null when the preset still needs input.
function periodFor(preset, { month, year, from, to }) {
  const t = today();
  switch (preset) {
    case '6m': return { from: ymd(new Date(t.getFullYear(), t.getMonth() - 5, 1)), to: ymd(t) };
    case '12m': return { from: ymd(new Date(t.getFullYear(), t.getMonth() - 11, 1)), to: ymd(t) };
    case '30d': { const f = new Date(t); f.setDate(f.getDate() - 29); return { from: ymd(f), to: ymd(t) }; }
    case 'ytd': return { from: `${t.getFullYear()}-01-01`, to: ymd(t) };
    case 'month': {
      if (!/^\d{4}-\d{2}$/.test(month || '')) return null;
      const [y, m] = month.split('-').map(Number);
      const first = new Date(y, m - 1, 1);
      if (first > t) return null;
      return { from: ymd(first), to: ymd(capToday(new Date(y, m, 0))) };
    }
    case 'year': {
      const y = Number(year);
      if (!y || y > t.getFullYear()) return null;
      return { from: `${y}-01-01`, to: ymd(capToday(new Date(y, 11, 31))) };
    }
    case 'custom': return from && to ? { from, to } : null;
    default: return null;
  }
}

function customError(from, to) {
  if (!from || !to) return 'Pick both a start and an end date.';
  if (from > to) return 'The start date must be on or before the end date.';
  if ((parse(to) - parse(from)) / 86400000 > 1096) return 'Choose a period of three years or less.';
  return '';
}

// Y-axis: a rounded top and four gridlines.
function niceMax(v) {
  if (v <= 0) return 1000;
  const mag = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * mag >= v / 4) * mag;
  return step * 4;
}

const VIEWS = [
  { id: 'bar', icon: faChartColumn, label: 'Bar chart' },
  { id: 'line', icon: faChartLine, label: 'Line chart' },
  { id: 'table', icon: faTable, label: 'Table' },
];

export default function IncomePanel({ initialData, initialRange, loading: parentLoading }) {
  const navigate = useNavigate();
  const [view, setView] = useState('bar');
  const [preset, setPreset] = useState('6m');
  const [month, setMonth] = useState(`${thisYear}-${pad(new Date().getMonth() + 1)}`);
  const [year, setYear] = useState(String(thisYear));
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [customMsg, setCustomMsg] = useState('');
  const [own, setOwn] = useState(null); // { data, range } once this panel has fetched a period
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [selectedKey, setSelectedKey] = useState(null);
  const requestId = useRef(0);

  const data = own ? own.data : initialData || [];
  const range = own ? own.range : initialRange;
  const loading = parentLoading || fetching;

  const load = async (period) => {
    if (!period) return;
    const id = ++requestId.current;
    setFetching(true);
    setError('');
    setSelectedKey(null);
    try {
      const res = await api.get('dashboard_stats.php', { params: { section: 'income', ...period } });
      if (id !== requestId.current) return; // a newer period was asked for meanwhile
      if (res.data?.success) setOwn({ data: res.data.income_data || [], range: res.data.range });
      else setError(res.data?.message || 'Could not load this period.');
    } catch (e) {
      if (id !== requestId.current) return;
      setError(e?.response?.data?.message || 'Could not load this period.');
    } finally {
      if (id === requestId.current) setFetching(false);
    }
  };

  const choosePreset = (id) => {
    setPreset(id);
    setCustomMsg('');
    if (id === 'custom') {
      // Start the custom fields from the period on screen.
      if (range) { setCustomFrom(range.from); setCustomTo(range.to); }
      return;
    }
    load(periodFor(id, { month, year }));
  };

  const applyCustom = (e) => {
    e.preventDefault();
    const msg = customError(customFrom, customTo);
    setCustomMsg(msg);
    if (!msg) load({ from: customFrom, to: customTo });
  };

  const byDay = range?.granularity === 'day';
  const count = data.length;
  const totalOf = (d) => Math.max((d.collected || 0) + (d.pending || 0), d.billed || 0);
  const top = niceMax(Math.max(0, ...data.map(totalOf)));
  const ticks = [4, 3, 2, 1, 0].map((i) => (top / 4) * i);
  // Every n-th x label, so labels never collide (about 12 on wide screens, 6 on phones).
  const step = Math.max(1, Math.ceil(count / 12));
  const showLabel = (i) => i % step === 0 || i === count - 1;
  const phoneLabel = (i) => i % (step * 2) === 0 || i === count - 1;
  const selected = data.find((d) => d.key === selectedKey);
  const rate = range?.collection_rate;
  const rateTone = rate == null ? 'text-slate-500' : rate >= 90 ? 'text-emerald-700' : rate >= 70 ? 'text-amber-700' : 'text-red-600';
  const toggle = (key) => setSelectedKey((k) => (k === key ? null : key));
  const tipAlign = (i) => (i < count / 4 ? 'left-0' : i > (count * 3) / 4 ? 'right-0' : 'left-1/2 -translate-x-1/2');

  const linePoints = (field) => data.map((d, i) => `${count > 1 ? (i / (count - 1)) * 100 : 50},${100 - ((d[field] || 0) / top) * 100}`);

  return (
    <section aria-labelledby="income-title" className={`${PANEL} flex flex-col min-w-0`}>
      {/* Title, period and view */}
      <div className="px-4 sm:px-5 pt-4 pb-3 border-b border-slate-100 flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="income-title" className="m-0 text-title font-semibold text-slate-900 flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-label" aria-hidden="true">
                <FontAwesomeIcon icon={faChartLine} />
              </span>
              Income
            </h2>
            <p className="text-label text-slate-500 m-0 mt-1">
              {range ? <>Bills issued {longDate(range.from)} – {longDate(range.to)}, {byDay ? 'per day' : 'per month'}</> : 'Bills issued, collected vs still owed'}
            </p>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-control" role="group" aria-label="Chart view">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setView(v.id)}
                title={v.label}
                aria-label={v.label}
                aria-pressed={view === v.id}
                className={`touch-compact w-9 h-8 rounded-control text-label cursor-pointer border-0 transition-colors ${view === v.id ? 'bg-white text-indigo-700 shadow-card' : 'bg-transparent text-slate-500 hover:text-slate-800'}`}
              >
                <FontAwesomeIcon icon={v.icon} />
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex items-center">
            <span className="sr-only">Period</span>
            <FontAwesomeIcon icon={faCalendarDays} className="absolute left-3 text-slate-400 text-label pointer-events-none" aria-hidden="true" />
            <select
              value={preset}
              onChange={(e) => choosePreset(e.target.value)}
              className="h-9 pl-8 pr-8 rounded-control border border-slate-300 bg-white text-label font-medium text-slate-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>

          {preset === 'month' && (
            <label className="flex items-center gap-2 text-label text-slate-600">
              <span className="sr-only">Month</span>
              <input
                type="month"
                value={month}
                max={`${thisYear}-${pad(new Date().getMonth() + 1)}`}
                onChange={(e) => { setMonth(e.target.value); load(periodFor('month', { month: e.target.value })); }}
                className="h-9 px-3 rounded-control border border-slate-300 bg-white text-label text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
          )}

          {preset === 'year' && (
            <label className="flex items-center">
              <span className="sr-only">Year</span>
              <select
                value={year}
                onChange={(e) => { setYear(e.target.value); load(periodFor('year', { year: e.target.value })); }}
                className="h-9 px-3 rounded-control border border-slate-300 bg-white text-label font-medium text-slate-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
          )}

          {preset === 'custom' && (
            <form onSubmit={applyCustom} className="flex flex-wrap items-center gap-2" noValidate>
              <label className="flex items-center gap-1.5 text-label text-slate-600">
                From
                <input type="date" value={customFrom} max={ymd(today())} onChange={(e) => setCustomFrom(e.target.value)} aria-invalid={!!customMsg}
                  className="h-9 px-2 rounded-control border border-slate-300 bg-white text-label text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </label>
              <label className="flex items-center gap-1.5 text-label text-slate-600">
                To
                <input type="date" value={customTo} max={ymd(today())} onChange={(e) => setCustomTo(e.target.value)} aria-invalid={!!customMsg}
                  className="h-9 px-2 rounded-control border border-slate-300 bg-white text-label text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </label>
              <button type="submit" className={btn('primary', 'sm')}>Apply</button>
            </form>
          )}
        </div>
        {(customMsg || error) && <p role="alert" className="m-0 text-label text-red-700">{customMsg || error}</p>}
      </div>

      {/* Period totals */}
      <dl className="m-0 grid grid-cols-2 lg:grid-cols-4 gap-px bg-slate-100 border-b border-slate-100 text-label">
        {[
          { label: 'Collected', value: peso(range?.collected), cls: 'text-emerald-700' },
          { label: 'Still owed', value: peso(range?.pending), cls: 'text-amber-700' },
          range?.months > 1
            ? { label: 'Average per month', value: peso(Math.round(range?.avg_per_month || 0)), cls: 'text-slate-800' }
            : { label: 'Bills issued', value: range?.count ?? 0, cls: 'text-slate-800' },
          { label: 'Collection rate', value: rate == null ? '—' : `${rate}%`, cls: rateTone },
        ].map((s) => (
          <div key={s.label} className="bg-slate-50/80 px-4 sm:px-5 py-2.5">
            <dt className="text-slate-500 font-medium">{s.label}</dt>
            <dd className={`m-0 mt-0.5 text-body font-bold ${s.cls}`}>{loading || !range ? <Skeleton className="h-4 w-20 mt-1" /> : s.value}</dd>
          </div>
        ))}
      </dl>

      {/* Chart */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col min-w-0">
        {loading ? (
          <SkeletonBlock label="Loading income…" className="h-56 flex items-end gap-3 px-2">
            {['h-1/3', 'h-1/2', 'h-2/5', 'h-3/4', 'h-3/5', 'h-5/6'].map((h) => <Skeleton key={h} className={`flex-1 ${h}`} />)}
          </SkeletonBlock>
        ) : count === 0 || !range?.billed ? (
          <div className="h-56 flex flex-col items-center justify-center gap-1 text-center text-slate-500">
            <FontAwesomeIcon icon={faChartColumn} className="text-3xl text-slate-300" aria-hidden="true" />
            <p className="m-0 text-body font-medium text-slate-600">No bills issued in this period</p>
            <p className="m-0 text-label">Pick another period above.</p>
          </div>
        ) : view === 'table' ? (
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-left text-label">
              <thead className={`${THEAD} sticky top-0`}>
                <tr className="text-label font-medium text-slate-600">
                  <th className={TH}>{byDay ? 'Day' : 'Month'}</th>
                  <th className={`${TH} text-right`}>Bills</th>
                  <th className={`${TH} text-right`}>Billed</th>
                  <th className={`${TH} text-right`}>Collected</th>
                  <th className={`${TH} text-right`}>Still owed</th>
                  <th className={`${TH} text-right`}>Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.filter((d) => d.count > 0).slice().reverse().map((d) => {
                  const total = totalOf(d);
                  const r = total > 0 ? Math.round(((d.collected || 0) / total) * 100) : 0;
                  return (
                    <tr key={d.key} onClick={() => toggle(d.key)} className={`cursor-pointer transition-colors hover:bg-indigo-50/50 ${selectedKey === d.key ? 'bg-indigo-50 font-semibold' : ''}`}>
                      <td className="py-2.5 px-3 font-semibold text-slate-800 whitespace-nowrap">{d.full_label}</td>
                      <td className="py-2.5 px-3 text-right text-slate-500">{d.count}</td>
                      <td className="py-2.5 px-3 text-right text-slate-700">{peso(total)}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-emerald-700">{peso(d.collected)}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-amber-700">{peso(d.pending)}</td>
                      <td className="py-2.5 px-3 text-right">
                        <span className={`rounded-full px-2 py-0.5 text-caption font-semibold ${r >= 90 ? 'bg-emerald-100 text-emerald-800' : r >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{r}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 font-bold text-slate-800">
                <tr>
                  <td className="py-2.5 px-3">Total</td>
                  <td className="py-2.5 px-3 text-right">{range.count}</td>
                  <td className="py-2.5 px-3 text-right">{peso(range.billed)}</td>
                  <td className="py-2.5 px-3 text-right text-emerald-700">{peso(range.collected)}</td>
                  <td className="py-2.5 px-3 text-right text-amber-700">{peso(range.pending)}</td>
                  <td className={`py-2.5 px-3 text-right ${rateTone}`}>{rate == null ? '—' : `${rate}%`}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="flex flex-col min-w-0">
            <div className="flex justify-end items-center gap-4 text-label text-slate-500 mb-3">
              <span className="flex items-center gap-1.5"><span className={`inline-block ${view === 'bar' ? 'w-3 h-3 rounded-[3px]' : 'w-4 h-1 rounded-full'} bg-emerald-500`} />Collected</span>
              <span className="flex items-center gap-1.5"><span className={`inline-block ${view === 'bar' ? 'w-3 h-3 rounded-[3px]' : 'w-4 h-1 rounded-full'} bg-amber-400`} />Still owed</span>
            </div>

            <div className="flex gap-2 min-w-0">
              {/* Y axis */}
              <div className="h-56 flex flex-col justify-between text-right text-caption text-slate-400 shrink-0 w-10 sm:w-12 -mt-1.5" aria-hidden="true">
                {ticks.map((v) => <span key={v} className="leading-3">{pesoShort(v)}</span>)}
              </div>

              <div className="relative flex-1 min-w-0">
                {/* Gridlines */}
                <div className="absolute inset-x-0 top-0 h-56 flex flex-col justify-between pointer-events-none" aria-hidden="true">
                  {ticks.map((v) => <div key={v} className={`border-t ${v === 0 ? 'border-slate-300' : 'border-dashed border-slate-200'}`} />)}
                </div>

                {view === 'bar' ? (
                  <div className={`relative h-56 flex items-end ${count > 20 ? 'gap-px sm:gap-0.5' : 'gap-1.5 sm:gap-3'}`}>
                    {data.map((d, i) => {
                      const total = totalOf(d);
                      const isSel = selectedKey === d.key;
                      return (
                        <div
                          key={d.key}
                          className="relative flex-1 min-w-0 h-full flex flex-col justify-end items-center group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-sm"
                          {...clickable(() => toggle(d.key))}
                          aria-pressed={isSel}
                          aria-label={`${d.full_label}: collected ${peso(d.collected)}, still owed ${peso(d.pending)}`}
                        >
                          <div className={`absolute bottom-full mb-2 ${tipAlign(i)} z-30 w-40 admin-native rounded-control bg-slate-900 text-white text-caption p-2.5 shadow-raised pointer-events-none transition-opacity ${isSel ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                            <p className="m-0 mb-1.5 pb-1 border-b border-slate-700 font-bold text-slate-100">{d.full_label}</p>
                            <p className="m-0 flex justify-between"><span className="text-slate-400">Collected</span><span className="font-bold text-emerald-400">{peso(d.collected)}</span></p>
                            <p className="m-0 flex justify-between"><span className="text-slate-400">Still owed</span><span className="font-bold text-amber-300">{peso(d.pending)}</span></p>
                            <p className="m-0 mt-1 pt-1 flex justify-between border-t border-slate-700"><span className="text-slate-300">Billed</span><span className="font-semibold">{peso(total)}</span></p>
                          </div>
                          {count <= 12 && total > 0 && (
                            <span className="hidden sm:block mb-1 text-caption font-semibold text-slate-500 whitespace-nowrap">{pesoShort(total)}</span>
                          )}
                          <div
                            className={`shrink-0 w-full max-w-[2.75rem] rounded-t-[4px] overflow-hidden flex flex-col justify-end transition-all ${isSel ? 'ring-2 ring-indigo-500 ring-offset-1' : 'group-hover:brightness-95'}`}
                            style={{ height: total > 0 ? `${Math.max((total / top) * 100, 1.5)}%` : '0%' }}
                          >
                            <div className="w-full bg-amber-400" style={{ height: `${total > 0 ? ((d.pending || 0) / total) * 100 : 0}%` }} />
                            <div className="w-full bg-emerald-500" style={{ height: `${total > 0 ? ((d.collected || 0) / total) * 100 : 0}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="relative h-56">
                    <svg className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100" aria-hidden="true">
                      <defs>
                        <linearGradient id="income-collected-fill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
                          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path d={`M ${linePoints('collected').join(' L ')} L ${count > 1 ? 100 : 50},100 L ${count > 1 ? 0 : 50},100 Z`} fill="url(#income-collected-fill)" />
                      <path d={`M ${linePoints('collected').join(' L ')}`} fill="none" stroke="#10b981" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
                      <path d={`M ${linePoints('pending').join(' L ')}`} fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="5,4" vectorEffect="non-scaling-stroke" />
                    </svg>
                    {data.map((d, i) => {
                      const x = count > 1 ? (i / (count - 1)) * 100 : 50;
                      const y = 100 - ((d.collected || 0) / top) * 100;
                      const isSel = selectedKey === d.key;
                      return (
                        <div
                          key={d.key}
                          className="absolute -translate-x-1/2 -translate-y-1/2 group z-10"
                          style={{ left: `${x}%`, top: `${y}%` }}
                        >
                          <button
                            type="button"
                            onClick={() => toggle(d.key)}
                            aria-label={`${d.full_label}: collected ${peso(d.collected)}, still owed ${peso(d.pending)}`}
                            className={`touch-compact block rounded-full bg-white border-2 border-emerald-600 cursor-pointer p-0 transition-transform hover:scale-150 ${count > 31 ? 'w-2 h-2' : 'w-3 h-3'} ${isSel ? 'scale-150 ring-2 ring-indigo-400' : ''}`}
                          />
                          <div className={`absolute bottom-full mb-2 ${tipAlign(i)} w-36 admin-native rounded-control bg-slate-900 text-white text-caption p-2 shadow-raised pointer-events-none transition-opacity ${isSel ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                            <p className="m-0 mb-1 font-bold">{d.full_label}</p>
                            <p className="m-0 flex justify-between"><span className="text-slate-400">Collected</span><span className="font-bold text-emerald-400">{pesoShort(d.collected)}</span></p>
                            <p className="m-0 flex justify-between"><span className="text-slate-400">Still owed</span><span className="font-bold text-amber-300">{pesoShort(d.pending)}</span></p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* X axis */}
                <div className={`flex mt-2 ${view === 'bar' ? (count > 20 ? 'gap-px sm:gap-0.5' : 'gap-1.5 sm:gap-3') : 'justify-between'}`} aria-hidden="true">
                  {data.map((d, i) => (
                    <span
                      key={d.key}
                      className={`${view === 'bar' ? 'flex-1 min-w-0 text-center' : 'w-0 flex justify-center'} text-caption font-semibold whitespace-nowrap ${selectedKey === d.key ? 'text-indigo-700' : 'text-slate-500'} ${showLabel(i) ? (phoneLabel(i) ? '' : 'invisible sm:visible') : 'invisible'}`}
                    >
                      {d.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Picked bar / point / row */}
        {selected && !loading && (
          <div className="mt-4 p-3 sm:p-4 bg-indigo-50/70 rounded-card border border-indigo-100 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="m-0 text-body font-bold text-indigo-950">
                {selected.full_label}
                <span className="ml-2 align-middle rounded-full px-2 py-0.5 text-caption font-semibold bg-indigo-100 text-indigo-700">{selected.count} bill{selected.count === 1 ? '' : 's'}</span>
              </p>
              <p className="m-0 mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-label text-slate-600">
                <span>Collected <strong className="text-emerald-700">{peso(selected.collected)}</strong></span>
                <span>Still owed <strong className="text-amber-700">{peso(selected.pending)}</strong></span>
                <span>Billed <strong className="text-slate-800">{peso(totalOf(selected))}</strong></span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className={btn('ghost', 'sm')} onClick={() => setSelectedKey(null)} aria-label="Close summary">
                <FontAwesomeIcon icon={faXmark} />
              </button>
              <button type="button" className={btn('primary', 'sm')} onClick={() => navigate('/admin-payments')}>
                Open payments <FontAwesomeIcon icon={faArrowRight} className="text-[10px]" />
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
