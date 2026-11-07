import { useState, useEffect } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPesoSign, faUsers, faBuilding, faChartLine, faScrewdriverWrench, faKey,
  faUserPlus, faInfoCircle, faCogs, faFileSignature, faClipboardList, faBullhorn,
  faFileInvoiceDollar, faBuildingUser, faClockRotateLeft, faArrowRight, faDollarSign, faWrench,
} from '@fortawesome/free-solid-svg-icons';
import { useNavigate } from 'react-router-dom';
import api from '../api/axiosConfig';
import StatCard from '../Components/admin/StatCard';
import AttentionList from '../Components/admin/AttentionList';
import IncomePanel from '../Components/admin/dashboard/IncomePanel';
import { PANEL, PANEL_HEADER, PANEL_TITLE, btn } from '../Components/admin/ui/styles';
import LoadError from '../Components/admin/ui/LoadError';
import EmptyState from '../Components/admin/ui/EmptyState';
import { SkeletonList } from '../Components/admin/ui/Skeleton';
import { personName } from '../utils/personName';

// Keyed on the 12 activity-log categories (LOG_CATEGORIES in config.php).
const LOG_CATEGORY_STYLE = {
  billing: { icon: faDollarSign, color: 'bg-emerald-100 text-emerald-700' },
  utilities: { icon: faChartLine, color: 'bg-cyan-100 text-cyan-600' },
  maintenance: { icon: faWrench, color: 'bg-amber-100 text-amber-700' },
  tenant: { icon: faUserPlus, color: 'bg-blue-100 text-blue-600' },
  user: { icon: faUsers, color: 'bg-blue-100 text-blue-600' },
  auth: { icon: faKey, color: 'bg-violet-100 text-violet-600' },
  unit: { icon: faBuilding, color: 'bg-indigo-100 text-indigo-600' },
  contract: { icon: faFileSignature, color: 'bg-indigo-100 text-indigo-600' },
  service: { icon: faClipboardList, color: 'bg-teal-100 text-teal-600' },
  inquiry: { icon: faInfoCircle, color: 'bg-sky-100 text-sky-700' },
  communication: { icon: faBullhorn, color: 'bg-red-100 text-red-600' },
  system: { icon: faCogs, color: 'bg-slate-100 text-slate-600' },
};

// Unit tile colours by room status.
const UNIT_STYLE = {
  occupied: { tile: 'bg-emerald-50 border-emerald-200 hover:border-emerald-400', dot: 'bg-emerald-500', label: 'Occupied' },
  reserved: { tile: 'bg-amber-50 border-amber-200 hover:border-amber-400', dot: 'bg-amber-500', label: 'Reserved' },
  vacant: { tile: 'bg-white border-slate-200 hover:border-indigo-400', dot: 'bg-slate-300', label: 'Vacant' },
};

const peso = (n) => `₱${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const formatLogDate = (dateStr) => {
  if (!dateStr) return 'Recently';
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? 'Recently' : `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
};

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};
const adminFirstName = () => {
  try {
    return JSON.parse(sessionStorage.getItem('loggedInUser') || localStorage.getItem('loggedInUser') || '{}').first_name || '';
  } catch {
    return '';
  }
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [lowerTab, setLowerTab] = useState('units');
  const [stats, setStats] = useState({});
  const [incomeData, setIncomeData] = useState([]);
  const [range, setRange] = useState(null);
  const [newTenants, setNewTenants] = useState([]);
  const [attention, setAttention] = useState({});
  const [roomsSummary, setRoomsSummary] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  // True when the stats request failed: one page-level error replaces the whole
  // dashboard, so no card ever reads "₱0" or "All caught up" for data that never loaded.
  const [statsError, setStatsError] = useState(false);

  const kpiStatus = loading ? 'loading' : undefined;

  const fetchDashboardData = async () => {
    setLoading(true);
    setStatsError(false);
    try {
      const { data } = await api.get('dashboard_stats.php');
      if (data && data.success) {
        setStats(data.stats || {});
        setIncomeData(data.income_data || []);
        setRange(data.range || null);
        setNewTenants(data.new_tenants || []);
        setAttention(data.attention || {});
        if (!data.attention) setStatsError(true);
        setRoomsSummary(data.rooms_summary || []);
        setActivityLogs(data.activity_logs || []);
      } else {
        setStatsError(true);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data', error);
      setStatsError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const load = async () => { await fetchDashboardData(); };
    load();
  }, []);

  const unitCounts = roomsSummary.reduce((acc, r) => {
    const k = UNIT_STYLE[r.status] ? r.status : 'vacant';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const owedTone = stats.overdue_count > 0 ? 'red' : stats.pending_dues > 0 ? 'amber' : 'slate';
  const name = adminFirstName();
  const todayLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="admin-shell flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left min-w-0">
        <Header title="Dashboard" />

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="m-0 text-section font-semibold text-slate-900">{greeting()}{name ? `, ${name}` : ''}</p>
                <p className="m-0 mt-0.5 text-label text-slate-500">{todayLabel}</p>
              </div>
            </div>

            {statsError && !loading ? (
              <div className={PANEL}>
                <LoadError
                  title="Couldn't load the dashboard"
                  message="This is not an all-clear: the dashboard data did not load, so no figures are shown."
                  onRetry={fetchDashboardData}
                />
              </div>
            ) : (<>

            {/* Key figures right now. Applications and urgent repairs are lines in
                "Needs your attention", so they get no card of their own here. */}
            <section aria-label="Key figures" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard
                icon={faPesoSign}
                showIconBadge={false}
                title="Collected this month"
                value={peso(stats.total_revenue)}
                color="emerald"
                trend={stats.revenue_trend}
                subtext={stats.last_month_revenue > 0 ? `vs ${peso(stats.last_month_revenue)} last month` : 'Rent and utilities paid this month'}
                tooltip="Payments received this month, security deposits excluded"
                status={kpiStatus}
              />
              <StatCard
                icon={faFileInvoiceDollar}
                showIconBadge={false}
                title="Still owed"
                value={peso(stats.pending_dues)}
                color={owedTone}
                subtext={stats.overdue_count > 0 ? `${stats.overdue_count} overdue bill${stats.overdue_count === 1 ? '' : 's'} · ${peso(stats.overdue_dues)}` : 'Nothing overdue'}
                tooltip="Unpaid balance of every open bill"
                status={kpiStatus}
                onClick={() => navigate(stats.overdue_count > 0 ? '/admin-payments?status=overdue' : '/admin-payments')}
              />
              <StatCard
                icon={faBuildingUser}
                showIconBadge={false}
                title="Occupancy"
                value={`${stats.occupancy_rate ?? 0}%`}
                color="blue"
                subtext={`${stats.occupied_rooms ?? 0} of ${stats.total_rooms ?? 0} units · ${stats.vacant_rooms ?? 0} vacant`}
                progress={stats.occupancy_rate}
                tooltip="Units occupied now"
                status={kpiStatus}
                onClick={() => navigate('/admin-units')}
              />
              <StatCard
                icon={faScrewdriverWrench}
                showIconBadge={false}
                title="Open maintenance"
                value={stats.open_maintenance ?? 0}
                color={stats.urgent_maintenance > 0 ? 'red' : 'violet'}
                subtext={stats.urgent_maintenance > 0 ? `${stats.urgent_maintenance} urgent` : 'None urgent'}
                tooltip="Pending and in-progress repair requests"
                status={kpiStatus}
                onClick={() => navigate('/admin-maintenance')}
              />
            </section>

            {/* Money over time, and what needs doing (first on phones). On desktop the
                side card is taken out of the flow (absolute) so the main card alone sets
                the row height and the side card scrolls inside that height. */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 min-w-0">
                <IncomePanel initialData={incomeData} initialRange={range} loading={loading} />
              </div>
              <div className="order-first lg:order-none min-w-0 lg:relative lg:min-h-[26rem]">
                <AttentionList
                  attention={attention}
                  loading={loading}
                  onRetry={fetchDashboardData}
                  className="h-[28rem] lg:h-auto lg:absolute lg:inset-0"
                />
              </div>
            </div>

            {/* Units and recent activity, newest tenants (same height rule as above) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <section aria-labelledby="ops-title" className={`lg:col-span-2 ${PANEL} flex flex-col min-w-0`}>
                <div className={PANEL_HEADER}>
                  <h2 id="ops-title" className={PANEL_TITLE}>Building</h2>
                  <div className="flex bg-slate-100 p-1 rounded-control text-label font-semibold" role="tablist" aria-label="Building view">
                    {[
                      { id: 'units', icon: faBuilding, label: 'Units', count: roomsSummary.length },
                      { id: 'activity', icon: faClockRotateLeft, label: 'Recent activity' },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={lowerTab === tab.id}
                        onClick={() => setLowerTab(tab.id)}
                        className={`touch-compact px-3 py-1.5 rounded-control cursor-pointer border-0 transition-all flex items-center gap-1.5 ${lowerTab === tab.id ? 'bg-white text-indigo-700 shadow-card' : 'bg-transparent text-slate-500 hover:text-slate-700'}`}
                      >
                        <FontAwesomeIcon icon={tab.icon} />
                        <span>{tab.label}</span>
                        {tab.count !== undefined && !loading && <span className="text-caption font-normal text-slate-500">{tab.count}</span>}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 sm:p-5 max-h-[24rem] overflow-y-auto" role="tabpanel">
                  {loading ? (
                    <SkeletonList rows={5} label="Loading…" />
                  ) : lowerTab === 'units' ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap justify-between items-center gap-3 text-label text-slate-600">
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {Object.entries(UNIT_STYLE).map(([k, s]) => (
                            <span key={k} className="flex items-center gap-1.5">
                              <span className={`w-2.5 h-2.5 rounded-full ${s.dot}`} aria-hidden="true" />
                              {s.label} <strong className="text-slate-800">{unitCounts[k] || 0}</strong>
                            </span>
                          ))}
                        </div>
                        <button type="button" onClick={() => navigate('/admin-units')} className={btn('link')}>
                          Manage units <FontAwesomeIcon icon={faArrowRight} className="text-[10px]" />
                        </button>
                      </div>

                      {roomsSummary.length === 0 ? (
                        <EmptyState icon={faBuilding} title="No units yet" message="Add units on the Units page." />
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2.5">
                          {roomsSummary.map((room) => {
                            const s = UNIT_STYLE[room.status] || UNIT_STYLE.vacant;
                            const who = room.status === 'vacant' ? `${peso(room.rent)}/mo` : room.tenant || s.label;
                            return (
                              <button
                                key={room.id}
                                type="button"
                                onClick={() => navigate('/admin-units')}
                                aria-label={`Unit ${room.id}, ${s.label}${room.tenant ? `, ${room.tenant}` : ''}`}
                                className={`text-left p-3 rounded-card border cursor-pointer transition-all hover:shadow-raised ${s.tile}`}
                              >
                                <span className="flex items-center justify-between gap-2">
                                  <span className="font-bold text-body text-slate-900">{room.id}</span>
                                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.dot}`} aria-hidden="true" />
                                </span>
                                <span className="block text-caption text-slate-500 mt-0.5">{room.floor} · {room.type}</span>
                                <span className="block text-label font-semibold mt-1.5 truncate text-slate-700">{who}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : activityLogs.length === 0 ? (
                    <EmptyState icon={faClockRotateLeft} title="No recent activity" message="Actions taken in the system show up here." />
                  ) : (
                    <div>
                      <ul className="m-0 p-0 list-none divide-y divide-slate-100">
                        {activityLogs.map((log) => {
                          const s = LOG_CATEGORY_STYLE[log.category] || LOG_CATEGORY_STYLE.system;
                          return (
                            <li key={log.id} className="py-2.5 flex items-start gap-3">
                              <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${s.color}`} aria-hidden="true">
                                <FontAwesomeIcon icon={s.icon} className="text-xs" />
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start gap-2">
                                  <p className="text-label font-semibold text-slate-800 m-0 truncate">{log.action}</p>
                                  <span className="text-caption text-slate-500 whitespace-nowrap shrink-0">{formatLogDate(log.created_at)}</span>
                                </div>
                                <p className="text-caption text-slate-500 m-0 mt-0.5 break-words">
                                  {log.details || `By ${log.first_name ? personName(log) : 'the system'}`}
                                </p>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                      <div className="pt-3 text-center border-t border-slate-100">
                        <button type="button" onClick={() => navigate('/admin-activity-logs')} className={btn('link')}>
                          Full activity log <FontAwesomeIcon icon={faArrowRight} className="text-[10px]" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <div className="min-w-0 lg:relative lg:min-h-[16rem]">
              <section aria-labelledby="new-tenants-title" className={`${PANEL} flex flex-col min-w-0 overflow-hidden lg:absolute lg:inset-0`}>
                <div className={PANEL_HEADER}>
                  <h2 id="new-tenants-title" className={PANEL_TITLE}>Newest tenants</h2>
                  <button type="button" onClick={() => navigate('/admin-tenants')} className={btn('link')}>View all</button>
                </div>
                <div className="p-3 flex-1 min-h-0 overflow-y-auto">
                  {loading ? (
                    <SkeletonList rows={3} label="Loading newest tenants…" />
                  ) : newTenants.length === 0 ? (
                    <EmptyState icon={faUserPlus} title="No tenants yet" message="Approved tenants show up here." />
                  ) : (
                    <ul className="m-0 p-0 list-none space-y-1">
                      {newTenants.map((t, idx) => (
                        <li key={`${t.name}-${idx}`} className="flex items-center gap-3 px-2 py-2 rounded-control hover:bg-slate-50 transition-colors">
                          <span className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center font-bold text-label shrink-0" aria-hidden="true">
                            {(t.name || '?').charAt(0).toUpperCase()}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-body font-semibold text-slate-800 m-0 truncate">{t.name}</p>
                            <p className="text-caption text-slate-500 m-0">Unit {t.unit}</p>
                          </div>
                          <span className="text-caption text-slate-500 whitespace-nowrap shrink-0">{t.date}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
              </div>
            </div>
            </>)}
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
