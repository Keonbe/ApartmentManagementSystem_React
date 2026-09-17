import { useState, useEffect, useCallback } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSearch, faDollarSign, faWrench, faUserPlus, faFileContract, faCogs, faBullhorn,
  faChevronLeft, faChevronRight, faTimes, faInfoCircle, faArrowLeft, faDownload,
  faKey, faUserShield, faBuilding, faTint, faConciergeBell, faClipboardList, faSync
} from '@fortawesome/free-solid-svg-icons';
import { useNavigate } from 'react-router-dom';

import api from '../api/axiosConfig';

// Icon and colour per category. Keys match LOG_CATEGORIES in backend/config.php;
// labels come from the server so the two can't drift apart.
const categoryStyle = {
  auth:          { icon: faKey,           color: 'bg-rose-100 text-rose-700 border-rose-200' },
  user:          { icon: faUserShield,    color: 'bg-violet-100 text-violet-700 border-violet-200' },
  tenant:        { icon: faUserPlus,      color: 'bg-blue-100 text-blue-700 border-blue-200' },
  unit:          { icon: faBuilding,      color: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  contract:      { icon: faFileContract,  color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  billing:       { icon: faDollarSign,    color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  utilities:     { icon: faTint,          color: 'bg-sky-100 text-sky-700 border-sky-200' },
  maintenance:   { icon: faWrench,        color: 'bg-amber-100 text-amber-700 border-amber-200' },
  service:       { icon: faConciergeBell, color: 'bg-purple-100 text-purple-700 border-purple-200' },
  inquiry:       { icon: faClipboardList, color: 'bg-teal-100 text-teal-700 border-teal-200' },
  communication: { icon: faBullhorn,      color: 'bg-orange-100 text-orange-700 border-orange-200' },
  system:        { icon: faCogs,          color: 'bg-slate-100 text-slate-700 border-slate-200' },
};

const PAGE_SIZE = 25;

const formatDateTime = (value) => {
  if (!value) return '';
  const d = new Date(value.replace(' ', 'T'));
  return isNaN(d) ? value : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

// Details can contain text typed by tenants (visitor names, request notes). A cell
// starting with = + - @ would run as a formula when the CSV is opened in Excel, so
// those are prefixed with an apostrophe.
const csvCell = (value) => {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

export default function AdminActivityLogs() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [categories, setCategories] = useState({});
  const [categoryCounts, setCategoryCounts] = useState({});
  const [loadedQuery, setLoadedQuery] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [failure, setFailure] = useState(null); // { query, message }
  const [selectedLog, setSelectedLog] = useState(null);

  // Filters are applied by the server, over the whole log.
  const [category, setCategory] = useState('all');
  const [performer, setPerformer] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  // Debounce typing so each keystroke doesn't hit the server.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const buildParams = useCallback((extra = {}) => {
    const params = new URLSearchParams({ category, performer, page: String(page), limit: String(PAGE_SIZE), ...extra });
    if (search) params.set('search', search);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return params;
  }, [category, performer, page, search, from, to]);

  // Loading and error are derived from the query they belong to, so changing a
  // filter shows the spinner without setting state inside the effect.
  const query = buildParams().toString();
  const loading = refreshing || loadedQuery !== query;
  const error = failure && failure.query === query ? failure.message : null;

  const loadLogs = useCallback(async (q) => {
    try {
      const res = await api.get(`get_activity_logs.php?${q}`);
      if (res.data.success) {
        setLogs(res.data.logs);
        setTotal(res.data.total);
        setPages(res.data.pages);
        setCategories(res.data.categories || {});
        setCategoryCounts(res.data.categoryCounts || {});
        setFailure(null);
      } else {
        setFailure({ query: q, message: res.data.message || 'Failed to load activity logs.' });
      }
    } catch (e) {
      console.error('Failed to fetch logs:', e);
      setFailure({ query: q, message: e?.response?.data?.message || 'Failed to load activity logs.' });
    } finally {
      setLoadedQuery(q);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const load = async () => { await loadLogs(query); };
    load();
  }, [loadLogs, query]);

  const fetchLogs = () => {
    setRefreshing(true);
    setFailure(null);
    return loadLogs(query);
  };

  // Real export of every entry matching the current filters (the old button only showed an alert).
  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await api.get(`get_activity_logs.php?${buildParams({ export: '1', page: '1' })}`);
      if (!res.data.success) throw new Error(res.data.message);
      if (res.data.truncated) {
        alert(`Only the newest ${res.data.logs.length.toLocaleString()} of ${res.data.total.toLocaleString()} matching entries fit in one export. Narrow the date range to export the rest.`);
      }
      const header =['Log ID', 'Timestamp', 'Category', 'Action', 'Details', 'Performed By', 'Role', 'Email'];
      const rows = res.data.logs.map(l => [
        `LOG-${String(l.id).padStart(4, '0')}`, l.createdAt, l.categoryLabel, l.action, l.details,
        l.performerName, l.performerRole, l.performerEmail
      ]);
      const csv = [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `activity_log_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e?.response?.data?.message || e.message || 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  const setFilter = (setter) => (value) => { setter(value); setPage(1); };
  const allCount = Object.values(categoryCounts).reduce((a, b) => a + b, 0);
  const hasFilters = category !== 'all' || performer !== 'all' || search || from || to;

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left">
        <Header title="System Activity Logs" />

        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-7xl mx-auto space-y-6">

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <button
                onClick={() => navigate('/admin-dashboard')}
                className="flex items-center gap-2 text-xs font-bold text-[#3b4276] bg-white border border-slate-200 rounded-xl px-4 py-2.5 hover:bg-slate-50 active:scale-[0.98] transition-all cursor-pointer shadow-sm"
              >
                <FontAwesomeIcon icon={faArrowLeft} /> Back to Dashboard
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchLogs}
                  title="Refresh"
                  className="flex items-center justify-center w-9 h-9 text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer shadow-sm"
                >
                  <FontAwesomeIcon icon={faSync} className={loading ? 'animate-spin' : ''} />
                </button>
                <button
                  onClick={handleExport}
                  disabled={total === 0 || exporting}
                  className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl px-4 py-2.5 hover:bg-slate-50 active:scale-[0.98] transition-all cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FontAwesomeIcon icon={faDownload} /> {exporting ? 'Exporting…' : `Export CSV (${total})`}
                </button>
              </div>
            </div>

            {/* The audit trail is append-only: there is deliberately no way to clear it from the UI. */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
                <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 focus-within:border-indigo-500 focus-within:bg-white transition-all flex-grow">
                  <FontAwesomeIcon icon={faSearch} className="text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search action, details, user name or email, or log ID…"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="bg-transparent border-none outline-none text-sm text-slate-800 placeholder-slate-400 w-full"
                  />
                </div>
                <select
                  value={performer}
                  onChange={(e) => setFilter(setPerformer)(e.target.value)}
                  className="px-3 py-2.5 text-xs font-semibold border border-slate-200 rounded-xl bg-white text-slate-700 outline-none focus:border-indigo-500"
                >
                  <option value="all">All performers</option>
                  <option value="admin">Admins</option>
                  <option value="tenant">Tenants</option>
                  <option value="system">System (no user)</option>
                </select>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <input type="date" value={from} max={to || undefined} onChange={(e) => setFilter(setFrom)(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-700 outline-none focus:border-indigo-500" aria-label="From date" />
                  <span>to</span>
                  <input type="date" value={to} min={from || undefined} onChange={(e) => setFilter(setTo)(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-700 outline-none focus:border-indigo-500" aria-label="To date" />
                </div>
                {hasFilters && (
                  <button
                    onClick={() => { setCategory('all'); setPerformer('all'); setSearchInput(''); setSearch(''); setFrom(''); setTo(''); setPage(1); }}
                    className="text-xs font-bold text-slate-500 hover:text-slate-800 bg-transparent border-0 cursor-pointer whitespace-nowrap"
                  >
                    Clear filters
                  </button>
                )}
              </div>

              <div className="flex gap-2 p-1 bg-slate-100 rounded-xl overflow-x-auto select-none">
                {[['all', 'All Logs', allCount], ...Object.entries(categories).map(([key, label]) => [key, label, categoryCounts[key] || 0])].map(([key, label, count]) => (
                  <button
                    key={key}
                    onClick={() => setFilter(setCategory)(key)}
                    className={`px-3 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap cursor-pointer border-0 ${
                      category === key ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800 bg-transparent'
                    }`}
                  >
                    {label} <span className="text-[10px] text-slate-400 font-semibold">({count})</span>
                  </button>
                ))}
              </div>

              <div className="text-xs text-slate-500 font-medium">
                {loading ? 'Loading…' : `${total} matching entr${total === 1 ? 'y' : 'ies'}`}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase">
                      <th className="px-6 py-4">Log ID</th>
                      <th className="px-6 py-4">Category</th>
                      <th className="px-6 py-4">Timestamp</th>
                      <th className="px-6 py-4">Action</th>
                      <th className="px-6 py-4">Details</th>
                      <th className="px-6 py-4">Performed By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {error ? (
                      <tr><td colSpan="6" className="text-center py-12 text-rose-600 text-sm">{error}</td></tr>
                    ) : !loading && logs.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="text-center py-12 text-slate-400">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <FontAwesomeIcon icon={faInfoCircle} className="text-2xl text-slate-300" />
                            <p className="m-0 text-sm font-semibold">No activity logs found</p>
                            <p className="m-0 text-xs text-slate-400">Try adjusting your filters or search query.</p>
                          </div>
                        </td>
                      </tr>
                    ) : logs.map((log) => {
                      const style = categoryStyle[log.category] || categoryStyle.system;
                      return (
                        <tr key={log.id} onClick={() => setSelectedLog(log)} className="hover:bg-slate-50/80 cursor-pointer transition-colors">
                          <td className="px-6 py-4 font-mono text-xs text-indigo-600 font-semibold">LOG-{String(log.id).padStart(4, '0')}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap ${style.color}`}>
                              <FontAwesomeIcon icon={style.icon} className="text-[9px]" />
                              {log.categoryLabel}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-500 whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                          <td className="px-6 py-4 font-semibold text-slate-800">{log.action}</td>
                          <td className="px-6 py-4 text-xs text-slate-600 max-w-xs truncate">{log.details}</td>
                          <td className="px-6 py-4 text-xs text-slate-600 whitespace-nowrap">
                            <div className="font-semibold">{log.performerName}</div>
                            <div className="text-[10px] text-slate-400 uppercase tracking-wide">{log.performerRole}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {total > 0 && (
                <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-500">Page {page} of {pages}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      aria-label="Previous page"
                      className="w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center cursor-pointer text-slate-600 text-xs"
                    >
                      <FontAwesomeIcon icon={faChevronLeft} />
                    </button>
                    <button
                      onClick={() => setPage(p => Math.min(pages, p + 1))}
                      disabled={page === pages}
                      aria-label="Next page"
                      className="w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center cursor-pointer text-slate-600 text-xs"
                    >
                      <FontAwesomeIcon icon={faChevronRight} />
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </main>

      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setSelectedLog(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden border border-slate-200" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100">
                  LOG-{String(selectedLog.id).padStart(4, '0')}
                </span>
                <span className="text-xs text-slate-400 font-medium">Log Details</span>
              </div>
              <button onClick={() => setSelectedLog(null)} aria-label="Close" className="text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer p-1">
                <FontAwesomeIcon icon={faTimes} className="text-lg" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Category</span>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border mt-1 ${(categoryStyle[selectedLog.category] || categoryStyle.system).color}`}>
                    <FontAwesomeIcon icon={(categoryStyle[selectedLog.category] || categoryStyle.system).icon} />
                    {selectedLog.categoryLabel}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Timestamp</span>
                  <span className="text-sm font-semibold text-slate-700 block mt-1">{formatDateTime(selectedLog.createdAt)}</span>
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Action</span>
                <span className="text-base font-bold text-slate-800 block mt-1">{selectedLog.action}</span>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Details</span>
                <p className="m-0 text-sm text-slate-700 leading-relaxed font-mono whitespace-pre-wrap">{selectedLog.details || '—'}</p>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Performed By</span>
                <span className="text-sm font-semibold text-slate-700 block mt-1">
                  {selectedLog.performerName}
                  {selectedLog.performerEmail && <span className="text-slate-400 font-normal"> · {selectedLog.performerEmail}</span>}
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-400">({selectedLog.performerRole})</span>
                </span>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button onClick={() => setSelectedLog(null)} className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 border-0 cursor-pointer shadow-sm">
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
