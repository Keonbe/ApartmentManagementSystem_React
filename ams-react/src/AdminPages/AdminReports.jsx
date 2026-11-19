import { readStoredUser } from '../utils/readStoredUser';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faScaleBalanced, faMoneyBillWave, faFileInvoiceDollar, faBuildingUser, faScrewdriverWrench, faBolt, faUserPlus,
  faConciergeBell, faPrint, faFileExcel, faFilePdf, faChevronLeft, faChevronRight, faReceipt, faPesoSign,
  faPercent, faHashtag, faClock, faGauge, faSpinner, faCalendarDays, faCircleInfo,
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { apiErrorMessage } from '../utils/apiError';
import { printElement } from '../utils/print';
import { personName } from '../utils/personName';
import { localDateString } from '../utils/validation';
import StatCard from '../Components/admin/StatCard';
import LoadError from '../Components/admin/ui/LoadError';
import { PANEL, PANEL_HEADER, PANEL_TITLE, btn } from '../Components/admin/ui/styles';
import ReportChart from '../Components/admin/reports/ReportChart';
import ReportTable from '../Components/admin/reports/ReportTable';
import GenerateInvoiceModal from '../Components/admin/reports/GenerateInvoiceModal';
import ExpensesModal from '../Components/ExpensesModal';
import {
  RANGE_MODES, GROUPS, rangeFor, shiftRange, groupOptions, defaultGroup, presets, rangeLabel, modeOf, isDate, parse, monthOf, yearOf, weekOf,
} from '../config/reportPeriods';
import { formatValue, changeText } from '../utils/reportFormat';
import { downloadExcel, downloadPdf, reportMeta, reportTables, SITE_NAME } from '../utils/reportExport';

// Admin → Reports: pick a report, a range (days, a week, a month or a year)
// and how to cut it (by day, week, month or year). get_reports.php answers in
// one shape (summary, chart, periods, tables), drawn here like the Dashboard
// and saved as Excel or PDF from the same answer. The choice lives in the
// address bar, so a report can be bookmarked or shared.

const REPORTS = [
  { id: 'financial', label: 'Income statement', icon: faScaleBalanced, blurb: 'Revenue, expenses, net income' },
  { id: 'collections', label: 'Payments received', icon: faMoneyBillWave, blurb: 'Money in, by method' },
  { id: 'billing', label: 'Billing and arrears', icon: faFileInvoiceDollar, blurb: 'Billed, collected, still owed' },
  { id: 'occupancy', label: 'Occupancy and tenants', icon: faBuildingUser, blurb: 'Occupancy, move-ins, move-outs' },
  { id: 'maintenance', label: 'Maintenance', icon: faScrewdriverWrench, blurb: 'Requests, time to finish, cost' },
  { id: 'utilities', label: 'Utilities', icon: faBolt, blurb: 'Water and electricity used and charged' },
  { id: 'leasing', label: 'Inquiries and applications', icon: faUserPlus, blurb: 'From inquiry to tenant' },
  { id: 'services', label: 'Services and parking', icon: faConciergeBell, blurb: 'Service and parking requests' },
];
const REPORT_IDS = REPORTS.map((r) => r.id);

// Figures where a rise is bad news (the trend chip turns red).
const BAD_WHEN_UP = ['expenses', 'owed', 'overdueNow', 'moveOuts', 'rejected', 'avgHours', 'openNow', 'vacantRent', 'cost'];
const FORMAT_ICON = { money: faPesoSign, percent: faPercent, int: faHashtag, hours: faClock, number: faGauge };
const metricColor = (m) => {
  if (['revenue', 'received', 'collected', 'value', 'servicesPaid', 'parkingPaid'].includes(m.key)) return 'emerald';
  if (['expenses', 'cost', 'owed', 'overdueNow', 'vacantRent'].includes(m.key)) return 'amber';
  if (m.key === 'net') return Number(m.value) < 0 ? 'red' : 'indigo';
  if (m.format === 'percent') return 'blue';
  if (m.key === 'deposits') return 'violet';
  return 'slate';
};

const preparedByName = () => {
  try {
    return personName(readStoredUser({})) || 'Administrator';
  } catch {
    return 'Administrator';
  }
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SEGMENT = 'flex bg-slate-100 p-1 rounded-control text-label font-semibold';
const segBtn = (on, disabled) => `touch-compact px-3 py-1.5 rounded-control border-0 transition-all ${disabled ? 'bg-transparent text-slate-400 cursor-not-allowed' : on ? 'bg-white text-indigo-700 shadow-card cursor-pointer' : 'bg-transparent text-slate-600 hover:text-slate-800 cursor-pointer'}`;
const FIELD = 'h-9 rounded-control border border-slate-300 bg-white px-2.5 text-label text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';

// The choice in the address bar, made whole and valid.
function readChoice(params, today) {
  const legacy = params.get('tab'); // old ?tab=utilities links
  const report = REPORT_IDS.includes(params.get('report')) ? params.get('report') : REPORT_IDS.includes(legacy) ? legacy : 'financial';
  let from = params.get('from');
  let to = params.get('to');
  let mode = RANGE_MODES.some((m) => m.id === params.get('mode')) ? params.get('mode') : null;
  if (!isDate(from) || !isDate(to) || from > to) {
    mode = mode || 'month';
    ({ from, to } = rangeFor(mode, today));
  }
  mode = mode || modeOf(from, to);
  const options = groupOptions(from, to, report);
  const asked = options.find((o) => o.id === params.get('group') && !o.disabled);
  return { report, mode, from, to, group: asked ? asked.id : defaultGroup(mode, from, to, report) };
}

export default function AdminReports() {
  const today = localDateString();
  const [params, setParams] = useSearchParams();
  const choice = useMemo(() => readChoice(params, today), [params, today]);
  const { report, mode, from, to, group } = choice;
  const setChoice = (next) => {
    const c = { ...choice, ...next };
    // A new range or report keeps the grouping only while it still fits.
    if (!next.group) {
      const ok = groupOptions(c.from, c.to, c.report).find((o) => o.id === c.group && !o.disabled);
      if (!ok || next.mode) c.group = defaultGroup(c.mode, c.from, c.to, c.report);
    }
    setParams({ report: c.report, mode: c.mode, from: c.from, to: c.to, group: c.group }, { replace: false });
  };

  // { key, data, error } of the last answer; loading = it is not for the current choice.
  const queryKey = `${report}|${from}|${to}|${group}`;
  const [result, setResult] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);
  const loading = !result || result.key !== `${queryKey}|${reloadTick}`;
  const data = loading ? null : result.data;
  const error = loading ? null : result.error;
  useEffect(() => {
    let alive = true;
    const key = `${queryKey}|${reloadTick}`;
    api.get('get_reports.php', { params: { report, from, to, group } })
      .then((res) => {
        if (!alive) return;
        if (!res.data?.success) throw new Error(res.data?.message || 'The report did not load.');
        setResult({ key, data: res.data, error: null });
      })
      .catch((err) => { if (alive) setResult({ key, data: null, error: apiErrorMessage(err, 'The report did not load.') }); });
    return () => { alive = false; };
  }, [queryKey, report, from, to, group, reloadTick]);

  const [busy, setBusy] = useState(''); // 'excel' | 'pdf' while a file is being made
  const [exportError, setExportError] = useState('');
  const preparedBy = useMemo(() => preparedByName(), []);
  const save = async (kind) => {
    if (!data || busy) return;
    setBusy(kind);
    setExportError('');
    try {
      if (kind === 'excel') downloadExcel(data, preparedBy);
      else await downloadPdf(data, preparedBy);
    } catch (err) {
      console.error(err);
      setExportError(`The ${kind === 'excel' ? 'Excel' : 'PDF'} file could not be made. Try again.`);
    } finally {
      setBusy('');
    }
  };

  // Printing shows every row: tables unfold, then the report is printed.
  const reportRef = useRef(null);
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (!printing) return;
    printElement(reportRef.current);
    const t = setTimeout(() => setPrinting(false), 0);
    return () => clearTimeout(t);
  }, [printing]);

  const [showInvoice, setShowInvoice] = useState(false);
  const [showExpenses, setShowExpenses] = useState(false);
  const refresh = () => setReloadTick((n) => n + 1);

  const groups = groupOptions(from, to, report);
  const meta = data ? reportMeta(data, preparedBy) : null;
  const current = REPORTS.find((r) => r.id === report);
  const tables = data ? reportTables(data) : [];
  const periodsTable = tables.find((t) => t.key === 'periods');
  const detail = tables.filter((t) => t.key !== 'periods');
  // A narrow table (4 columns or fewer) sits beside the chart; the rest below.
  const side = detail.find((t) => t.columns.length <= 4);
  const rest = detail.filter((t) => t !== side);
  const years = [];
  for (let y = new Date().getFullYear() + 1; y >= 2020; y--) years.push(y);
  const anchor = parse(from);
  // Six figures sit in two rows of three; amounts need the width.
  const kpiCols = { 4: 'xl:grid-cols-4', 5: 'xl:grid-cols-5', 6: 'xl:grid-cols-3' }[data?.summary?.length] || 'xl:grid-cols-5';

  const pickPreset = (id) => {
    const p = presets(today).find((x) => x.id === id);
    if (p) setChoice({ mode: p.mode, from: p.from, to: p.to });
  };
  const setMode = (m) => {
    if (m === mode) return;
    const r = m === 'days' ? { from, to } : rangeFor(m, from > today ? today : from);
    setChoice({ mode: m, ...r });
  };
  const step = (dir) => setChoice(shiftRange({ mode, from, to }, dir));

  return (
    <div className="admin-shell flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />
      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left min-w-0">
        <Header title="Reports" />
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Heading and actions */}
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="m-0 text-section font-semibold text-slate-900">Reports</p>
                <p className="m-0 mt-0.5 text-label text-slate-500">Pick a report and a range. Print it or save it as an Excel or PDF file.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={btn('secondary', 'sm')} onClick={() => setShowExpenses(true)}>
                  <FontAwesomeIcon icon={faReceipt} /> Expenses
                </button>
                <button type="button" className={btn('secondary', 'sm')} onClick={() => setShowInvoice(true)}>
                  <FontAwesomeIcon icon={faFileInvoiceDollar} /> Generate invoice
                </button>
                <span className="hidden sm:block w-px h-6 bg-slate-200" aria-hidden="true" />
                <button type="button" className={btn('secondary', 'sm')} onClick={() => setPrinting(true)} disabled={!data}>
                  <FontAwesomeIcon icon={faPrint} /> Print
                </button>
                <button type="button" className={btn('secondary', 'sm')} onClick={() => save('excel')} disabled={!data || !!busy}>
                  <FontAwesomeIcon icon={busy === 'excel' ? faSpinner : faFileExcel} spin={busy === 'excel'} className="text-emerald-700" /> Excel
                </button>
                <button type="button" className={btn('primary', 'sm')} onClick={() => save('pdf')} disabled={!data || !!busy}>
                  <FontAwesomeIcon icon={busy === 'pdf' ? faSpinner : faFilePdf} spin={busy === 'pdf'} /> {busy === 'pdf' ? 'Making PDF…' : 'PDF'}
                </button>
              </div>
            </div>
            {exportError && <p role="alert" className="m-0 -mt-3 text-label font-semibold text-red-700">{exportError}</p>}

            {/* Which report */}
            <nav aria-label="Reports" className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {REPORTS.map((r) => {
                const on = r.id === report;
                return (
                  <button
                    key={r.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => !on && setChoice({ report: r.id })}
                    className={`group text-left flex items-start gap-3 p-3 sm:p-3.5 rounded-card border cursor-pointer transition-all ${on ? 'bg-indigo-600 border-indigo-600 text-white shadow-raised' : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-card'}`}
                  >
                    <span aria-hidden="true" className={`w-9 h-9 shrink-0 rounded-control flex items-center justify-center ${on ? 'admin-native bg-white/15 text-white' : 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100'}`}>
                      <FontAwesomeIcon icon={r.icon} />
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-label font-bold leading-tight ${on ? 'admin-native text-white' : 'text-slate-800'}`}>{r.label}</span>
                      <span className={`hidden sm:block mt-0.5 text-caption leading-snug ${on ? 'admin-native text-indigo-100' : 'text-slate-500'}`}>{r.blurb}</span>
                    </span>
                  </button>
                );
              })}
            </nav>

            {/* Range and grouping */}
            <section aria-label="Range" className={`${PANEL} p-4 sm:p-5 space-y-4`}>
              <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
                <div>
                  <p className="m-0 mb-1.5 text-label font-medium text-slate-600">Range</p>
                  <div className={SEGMENT} role="group" aria-label="Range">
                    {RANGE_MODES.map((m) => (
                      <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => setMode(m.id)} className={segBtn(mode === m.id)}>{m.label}</button>
                    ))}
                  </div>
                </div>

                <div className="flex items-end gap-2">
                  {mode !== 'days' && (
                    <button type="button" className={`${btn('secondary', 'sm')} w-9 px-0`} onClick={() => step(-1)} aria-label={`Previous ${mode}`} title={`Previous ${mode}`}>
                      <FontAwesomeIcon icon={faChevronLeft} />
                    </button>
                  )}
                  {mode === 'days' && (
                    <>
                      <label className="flex flex-col gap-1.5 text-label font-medium text-slate-600">From
                        <input type="date" className={FIELD} value={from} max={to} onChange={(e) => isDate(e.target.value) && setChoice({ from: e.target.value, to: e.target.value > to ? e.target.value : to })} />
                      </label>
                      <label className="flex flex-col gap-1.5 text-label font-medium text-slate-600">To
                        <input type="date" className={FIELD} value={to} min={from} onChange={(e) => isDate(e.target.value) && setChoice({ to: e.target.value, from: e.target.value < from ? e.target.value : from })} />
                      </label>
                    </>
                  )}
                  {mode === 'week' && (
                    <label className="flex flex-col gap-1.5 text-label font-medium text-slate-600">Week containing
                      <input type="date" className={FIELD} value={from} onChange={(e) => isDate(e.target.value) && setChoice(weekOf(e.target.value))} />
                    </label>
                  )}
                  {mode === 'month' && (
                    <>
                      <label className="flex flex-col gap-1.5 text-label font-medium text-slate-600">Month
                        <select className={FIELD} value={anchor.getMonth() + 1} onChange={(e) => setChoice(monthOf(anchor.getFullYear(), Number(e.target.value)))}>
                          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1.5 text-label font-medium text-slate-600">Year
                        <select className={FIELD} value={anchor.getFullYear()} onChange={(e) => setChoice(monthOf(Number(e.target.value), anchor.getMonth() + 1))}>
                          {years.map((y) => <option key={y} value={y}>{y}</option>)}
                        </select>
                      </label>
                    </>
                  )}
                  {mode === 'year' && (
                    <label className="flex flex-col gap-1.5 text-label font-medium text-slate-600">Year
                      <select className={FIELD} value={anchor.getFullYear()} onChange={(e) => setChoice(yearOf(Number(e.target.value)))}>
                        {years.map((y) => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </label>
                  )}
                  {mode !== 'days' && (
                    <button type="button" className={`${btn('secondary', 'sm')} w-9 px-0`} onClick={() => step(1)} aria-label={`Next ${mode}`} title={`Next ${mode}`}>
                      <FontAwesomeIcon icon={faChevronRight} />
                    </button>
                  )}
                </div>

                <label className="flex flex-col gap-1.5 text-label font-medium text-slate-600">Quick pick
                  <select className={FIELD} value="" onChange={(e) => pickPreset(e.target.value)}>
                    <option value="">Choose…</option>
                    {presets(today).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </label>

                <div className="lg:ml-auto">
                  <p className="m-0 mb-1.5 text-label font-medium text-slate-600">Group by</p>
                  <div className={SEGMENT} role="group" aria-label="Group by">
                    {groups.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        aria-pressed={group === g.id}
                        disabled={g.disabled}
                        title={g.reason || `One row per ${g.label.toLowerCase()}`}
                        onClick={() => setChoice({ group: g.id })}
                        className={segBtn(group === g.id, g.disabled)}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <p className="m-0 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-x-2 gap-y-1 text-label text-slate-600">
                <FontAwesomeIcon icon={faCalendarDays} className="text-indigo-500" aria-hidden="true" />
                <strong className="text-slate-900">{rangeLabel({ from, to })}</strong>
                <span>· {formatValue(from, 'date')} – {formatValue(to, 'date')}</span>
                <span>· by {GROUPS.find((g) => g.id === group)?.label.toLowerCase()}</span>
                {meta?.previous && <span className="text-slate-500">· {meta.previous.charAt(0).toLowerCase() + meta.previous.slice(1)}</span>}
                {data?.note && <span className="w-full text-amber-800 flex items-center gap-1.5"><FontAwesomeIcon icon={faCircleInfo} aria-hidden="true" />{data.note}</span>}
              </p>
            </section>

            {error ? (
              <div className={PANEL}>
                <LoadError title="Couldn't load the report" message={`${error} No figures are shown, so nothing here can be mistaken for a real total.`} onRetry={refresh} />
              </div>
            ) : (
              <div ref={reportRef} className="space-y-6 report-print">
                {/* Shown only when printed. */}
                <div className="hidden print:block border-b-2 border-slate-800 pb-3">
                  <p className="m-0 text-caption font-bold uppercase tracking-wider text-slate-500">{SITE_NAME}</p>
                  <h1 className="m-0 mt-1 text-2xl font-bold text-slate-900">{current?.label}</h1>
                  <p className="m-0 mt-1 text-body text-slate-700">{meta?.range} · {meta?.grouping}</p>
                  <p className="m-0 mt-0.5 text-caption text-slate-500">{meta?.generated}{meta?.previous ? ` · ${meta.previous}` : ''}</p>
                </div>

                <section aria-label="Key figures" className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 ${kpiCols} gap-4`}>
                  {(data?.summary || Array.from({ length: 5 }, (_, i) => ({ key: `s${i}`, label: '', format: 'money' }))).map((m) => {
                    const change = data ? changeText(m) : null;
                    const up = change && !change.startsWith('-');
                    const bad = change && change !== '+0%' && change !== '+0 pts' && (BAD_WHEN_UP.includes(m.key) ? up : !up);
                    return (
                      <StatCard
                        key={m.key}
                        icon={FORMAT_ICON[m.format]}
                        showIconBadge={false}
                        quietMark
                        title={m.label || 'Loading…'}
                        value={data ? formatValue(m.value, m.format, { compact: true }) : ''}
                        color={data ? metricColor(m) : 'slate'}
                        trend={change}
                        isBadTrend={!!bad}
                        subtext={m.previous !== undefined && m.previous !== null ? `vs ${formatValue(m.previous, m.format, { compact: true })} before` : m.hint}
                        tooltip={m.hint}
                        status={loading ? 'loading' : undefined}
                      />
                    );
                  })}
                </section>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <section aria-labelledby="report-chart-title" className={`${side ? 'lg:col-span-2' : 'lg:col-span-3'} ${PANEL} flex flex-col min-w-0`}>
                    <div className={PANEL_HEADER}>
                      <div className="min-w-0">
                        <h2 id="report-chart-title" className={PANEL_TITLE}>{current?.label} by {GROUPS.find((g) => g.id === group)?.label.toLowerCase()}</h2>
                        <p className="m-0 mt-0.5 text-caption text-slate-500">{rangeLabel({ from, to })}. Hover or tab to a {group} for its figures.</p>
                      </div>
                    </div>
                    <div className="p-4 sm:p-5">
                      <ReportChart chart={data?.chart} rows={data?.periods?.rows} loading={loading} />
                    </div>
                  </section>
                  {(side || loading) && (
                    <div className="min-w-0">
                      <ReportTable table={side} loading={loading} expanded={printing} fold={16} id="report-side" />
                    </div>
                  )}
                </div>

                {(periodsTable || loading) && <ReportTable table={periodsTable} loading={loading} expanded={printing} fold={14} id="report-periods" />}

                {rest.length > 0 && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {rest.map((t) => (
                      <div key={t.key} className={t.columns.length > 4 ? 'lg:col-span-2 min-w-0' : 'min-w-0'}>
                        <ReportTable table={t} loading={false} expanded={printing} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {showInvoice && <GenerateInvoiceModal onClose={() => setShowInvoice(false)} onSaved={refresh} />}
      {showExpenses && (
        <ExpensesModal
          onClose={() => setShowExpenses(false)}
          onChanged={refresh}
          month={mode === 'month' ? from.slice(0, 7) : null}
        />
      )}
    </div>
  );
}
