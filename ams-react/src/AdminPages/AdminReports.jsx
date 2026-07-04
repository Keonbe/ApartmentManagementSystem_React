import React, { useState } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faDownload, faFileInvoiceDollar, faChartBar, faChartLine, faBuilding,
  faDollarSign, faExclamationTriangle, faTimes, faUser, faCalendarAlt,
  faBolt, faTint, faCheckCircle, faClock, faPrint, faArrowUp, faArrowDown
} from '@fortawesome/free-solid-svg-icons';

const revenueData = [
  { month: 'Nov', revenue: 78000, expenses: 28000 },
  { month: 'Dec', revenue: 82000, expenses: 30000 },
  { month: 'Jan', revenue: 84000, expenses: 32000 },
  { month: 'Feb', revenue: 80000, expenses: 29000 },
  { month: 'Mar', revenue: 86000, expenses: 31000 },
  { month: 'Apr', revenue: 88000, expenses: 34000 },
];

const outstandingBalances = [
  { tenant: 'Pedro Cruz', unit: '2B', balance: 6500, daysOverdue: 12, status: 'overdue' },
  { tenant: 'Rosa Dela Cruz', unit: '2C', balance: 7500, daysOverdue: 5, status: 'overdue' },
  { tenant: 'Ben Flores', unit: '3A', balance: 6500, daysOverdue: 18, status: 'overdue' },
];

const utilityData = [
  { unit: '1A', tenant: 'Maria Santos', water: 320, electric: 760, total: 1080 },
  { unit: '1B', tenant: 'Jose Reyes', water: 280, electric: 650, total: 930 },
  { unit: '1C', tenant: 'Ana Garcia', water: 350, electric: 820, total: 1170 },
  { unit: '2B', tenant: 'Pedro Cruz', water: 300, electric: 700, total: 1000 },
  { unit: '2C', tenant: 'Rosa Dela Cruz', water: 310, electric: 780, total: 1090 },
  { unit: '3A', tenant: 'Ben Flores', water: 290, electric: 710, total: 1000 },
];

const tenantInvoiceOptions = [
  { name: 'Maria Santos', unit: '1A', rent: 6500 },
  { name: 'Jose Reyes', unit: '1B', rent: 6500 },
  { name: 'Pedro Cruz', unit: '2B', rent: 6500 },
  { name: 'Rosa Dela Cruz', unit: '2C', rent: 7500 },
  { name: 'Ben Flores', unit: '3A', rent: 6500 },
];

const formatCurrency = (n) => `₱${Number(n).toLocaleString()}`;

const AdminReports = () => {
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({ tenant: '', unit: '', rent: '', water: '', electric: '', dueDate: '' });
  const [showInvoicePreview, setShowInvoicePreview] = useState(false);

  const maxRevenue = Math.max(...revenueData.map(d => d.revenue)) * 1.15;
  const totalRevenue = revenueData.reduce((sum, d) => sum + d.revenue, 0);
  const totalExpenses = revenueData.reduce((sum, d) => sum + d.expenses, 0);
  const totalOutstanding = outstandingBalances.reduce((sum, b) => sum + b.balance, 0);

  const handleTenantSelect = (e) => {
    const selected = tenantInvoiceOptions.find(t => t.name === e.target.value);
    if (selected) {
      const utility = utilityData.find(u => u.unit === selected.unit);
      setInvoiceForm({ tenant: selected.name, unit: selected.unit, rent: selected.rent, water: utility?.water || 0, electric: utility?.electric || 0, dueDate: '' });
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left bg-slate-50">
        <Header title="Reports & Analytics" />

        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Top Actions */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500 m-0">Financial overview and analytics</p>
              <div className="flex gap-2">
                <button onClick={() => setShowInvoiceModal(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-sm border-0 cursor-pointer">
                  <FontAwesomeIcon icon={faFileInvoiceDollar} /> Generate Invoice
                </button>
                <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors shadow-sm cursor-pointer">
                  <FontAwesomeIcon icon={faDownload} /> Export PDF
                </button>
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><FontAwesomeIcon icon={faDollarSign} /></div>
                  <div><p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Total Revenue</p><p className="text-xl font-bold text-slate-800 m-0">{formatCurrency(totalRevenue)}</p></div>
                </div>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 flex items-center gap-1 w-fit"><FontAwesomeIcon icon={faArrowUp} className="text-[8px]" /> +7.2% vs last period</span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center"><FontAwesomeIcon icon={faChartLine} /></div>
                  <div><p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Total Expenses</p><p className="text-xl font-bold text-slate-800 m-0">{formatCurrency(totalExpenses)}</p></div>
                </div>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 flex items-center gap-1 w-fit"><FontAwesomeIcon icon={faArrowUp} className="text-[8px]" /> +3.1%</span>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><FontAwesomeIcon icon={faChartBar} /></div>
                  <div><p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Net Income</p><p className="text-xl font-bold text-emerald-600 m-0">{formatCurrency(totalRevenue - totalExpenses)}</p></div>
                </div>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 flex items-center gap-1 w-fit"><FontAwesomeIcon icon={faArrowUp} className="text-[8px]" /> Healthy margin</span>
              </div>
              <div className="bg-white border-l-4 border-l-red-500 border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center"><FontAwesomeIcon icon={faExclamationTriangle} /></div>
                  <div><p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Outstanding</p><p className="text-xl font-bold text-red-600 m-0">{formatCurrency(totalOutstanding)}</p></div>
                </div>
                <span className="text-xs text-slate-500">{outstandingBalances.length} tenants</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Revenue vs Expenses Chart */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <h3 className="text-sm font-bold text-slate-800 mb-5 m-0 flex items-center gap-2"><FontAwesomeIcon icon={faChartBar} className="text-indigo-600" /> Revenue vs Expenses</h3>
                <div className="h-40 flex items-end gap-3 pb-2">
                  {revenueData.map(d => (
                    <div key={d.month} className="flex-1 flex flex-col items-center gap-1 group relative">
                      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] p-2 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-all z-50 w-28 pointer-events-none">
                        <div className="flex justify-between mb-1"><span className="text-slate-400">Revenue</span><span className="font-bold text-emerald-400">{formatCurrency(d.revenue)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Expense</span><span className="font-bold text-red-400">{formatCurrency(d.expenses)}</span></div>
                      </div>
                      <div className="w-full flex gap-0.5 items-end justify-center" style={{ height: `${(d.revenue / maxRevenue) * 100}%` }}>
                        <div className="flex-1 bg-indigo-500 rounded-t opacity-80 group-hover:opacity-100 transition-all cursor-pointer" style={{ height: '100%' }}></div>
                        <div className="flex-1 bg-red-400 rounded-t opacity-70 group-hover:opacity-90 transition-all cursor-pointer" style={{ height: `${(d.expenses / d.revenue) * 100}%` }}></div>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-500">{d.month}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-4 mt-4 text-[10px] text-slate-500">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-500"></span> Revenue</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-400"></span> Expenses</span>
                </div>
              </div>

              {/* Outstanding Balances */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                <h3 className="text-sm font-bold text-slate-800 mb-5 m-0 flex items-center gap-2"><FontAwesomeIcon icon={faExclamationTriangle} className="text-red-500" /> Outstanding Balances</h3>
                <div className="space-y-4">
                  {outstandingBalances.map((b, idx) => (
                    <div key={idx} className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <div className="w-9 h-9 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold text-xs shrink-0">{b.tenant.charAt(0)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1">
                          <p className="text-sm font-semibold text-slate-800 m-0">{b.tenant}</p>
                          <span className="text-sm font-bold text-red-600">{formatCurrency(b.balance)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500">
                          <span className="flex items-center gap-1"><FontAwesomeIcon icon={faBuilding} /> Unit {b.unit}</span>
                          <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-bold">{b.daysOverdue} days overdue</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Utility Tracking */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 m-0"><FontAwesomeIcon icon={faBolt} className="text-amber-500" /> Utility Tracking</h3>
                <span className="text-xs text-slate-500">Current Month</span>
              </div>
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                    <th className="py-3 px-4">Unit</th><th className="py-3 px-4">Tenant</th>
                    <th className="py-3 px-4 text-right"><FontAwesomeIcon icon={faTint} className="text-blue-400 mr-1" />Water</th>
                    <th className="py-3 px-4 text-right"><FontAwesomeIcon icon={faBolt} className="text-amber-400 mr-1" />Electric</th>
                    <th className="py-3 px-4 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {utilityData.map(u => (
                    <tr key={u.unit} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-semibold text-indigo-600">{u.unit}</td>
                      <td className="py-3 px-4 text-slate-700">{u.tenant}</td>
                      <td className="py-3 px-4 text-right text-slate-600">{formatCurrency(u.water)}</td>
                      <td className="py-3 px-4 text-right text-slate-600">{formatCurrency(u.electric)}</td>
                      <td className="py-3 px-4 text-right font-bold text-slate-800">{formatCurrency(u.total)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-bold">
                    <td colSpan="2" className="py-3 px-4 text-slate-600">Total</td>
                    <td className="py-3 px-4 text-right text-blue-600">{formatCurrency(utilityData.reduce((s, u) => s + u.water, 0))}</td>
                    <td className="py-3 px-4 text-right text-amber-600">{formatCurrency(utilityData.reduce((s, u) => s + u.electric, 0))}</td>
                    <td className="py-3 px-4 text-right text-slate-800">{formatCurrency(utilityData.reduce((s, u) => s + u.total, 0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>

          </div>
        </div>
      </main>

      {/* Invoice Generation Modal */}
      {showInvoiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => { setShowInvoiceModal(false); setShowInvoicePreview(false); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-800 m-0">{showInvoicePreview ? 'Invoice Preview' : 'Generate Invoice'}</h2>
              <button onClick={() => { setShowInvoiceModal(false); setShowInvoicePreview(false); }} className="text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer"><FontAwesomeIcon icon={faTimes} className="text-lg" /></button>
            </div>

            {!showInvoicePreview ? (
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Select Tenant *</label>
                  <select value={invoiceForm.tenant} onChange={handleTenantSelect} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-white focus:border-indigo-500">
                    <option value="">Choose tenant...</option>
                    {tenantInvoiceOptions.map(t => <option key={t.name} value={t.name}>{t.name} — Unit {t.unit}</option>)}
                  </select>
                </div>
                {invoiceForm.tenant && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Rent</label><input type="number" value={invoiceForm.rent} onChange={e => setInvoiceForm(p => ({...p, rent: e.target.value}))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none" /></div>
                      <div><label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Due Date</label><input type="date" value={invoiceForm.dueDate} onChange={e => setInvoiceForm(p => ({...p, dueDate: e.target.value}))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none" /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1"><FontAwesomeIcon icon={faTint} className="text-blue-400" /> Water</label><input type="number" value={invoiceForm.water} onChange={e => setInvoiceForm(p => ({...p, water: e.target.value}))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none" /></div>
                      <div><label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1"><FontAwesomeIcon icon={faBolt} className="text-amber-400" /> Electric</label><input type="number" value={invoiceForm.electric} onChange={e => setInvoiceForm(p => ({...p, electric: e.target.value}))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none" /></div>
                    </div>
                    <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-sm">
                      <span className="font-bold text-indigo-800">Total: {formatCurrency(Number(invoiceForm.rent) + Number(invoiceForm.water) + Number(invoiceForm.electric))}</span>
                    </div>
                  </>
                )}
                <button onClick={() => setShowInvoicePreview(true)} disabled={!invoiceForm.tenant} className="w-full py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 border-0 cursor-pointer transition-colors disabled:opacity-50 shadow-sm">
                  Preview Invoice
                </button>
              </div>
            ) : (
              <div className="p-6">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 space-y-4">
                  <div className="text-center border-b border-slate-200 pb-4">
                    <h3 className="text-lg font-bold text-slate-800 italic font-serif m-0">GRAND VILLAS AMS</h3>
                    <p className="text-[10px] text-slate-400 m-0 mt-1 uppercase tracking-widest">Monthly Invoice</p>
                  </div>
                  <div className="space-y-2 text-xs text-slate-700">
                    <div className="flex justify-between"><span className="text-slate-400">Tenant:</span><span className="font-semibold">{invoiceForm.tenant}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Unit:</span><span className="font-semibold">{invoiceForm.unit}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">Due Date:</span><span className="font-semibold">{invoiceForm.dueDate || 'N/A'}</span></div>
                    <hr className="border-slate-200" />
                    <div className="flex justify-between"><span>Monthly Rent</span><span>{formatCurrency(invoiceForm.rent)}</span></div>
                    <div className="flex justify-between"><span>Water Bill</span><span>{formatCurrency(invoiceForm.water)}</span></div>
                    <div className="flex justify-between"><span>Electricity Bill</span><span>{formatCurrency(invoiceForm.electric)}</span></div>
                    <hr className="border-slate-200" />
                    <div className="flex justify-between font-bold text-sm text-slate-800"><span>Total Due</span><span>{formatCurrency(Number(invoiceForm.rent) + Number(invoiceForm.water) + Number(invoiceForm.electric))}</span></div>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setShowInvoicePreview(false)} className="flex-1 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-100 cursor-pointer transition-colors">Back</button>
                  <button className="flex-1 flex items-center justify-center gap-2 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 border-0 cursor-pointer transition-colors"><FontAwesomeIcon icon={faDownload} /> Download</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminReports;