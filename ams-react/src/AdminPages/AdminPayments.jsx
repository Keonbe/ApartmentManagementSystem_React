import React, { useState } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSearch, faCheckCircle, faPrint, faPaperPlane, faUser, faCalendarAlt, 
  faDollarSign, faFileAlt, faExclamationTriangle, faTimes, faHistory 
} from '@fortawesome/free-solid-svg-icons';

const initialTenants = [
  { id: 1, name: 'Pedro Cruz', unit: '2B', status: 'overdue', depositStatus: 'Paid', advanceStatus: 'Paid', termOfPayment: 'Monthly', billing: { baseRent: 6500, water: 350, electricity: 820, parking: 0, addOns: 0 }, history: [{ period: 'Apr 2025', breakdown: 'Rent: 6500, Water: 320, Elec: 750', amount: 7570, datePaid: 'Apr 3', status: 'paid' }, { period: 'Mar 2025', breakdown: 'Rent: 6500, Water: 340, Elec: 700', amount: 7540, datePaid: 'Mar 5', status: 'paid' }] },
  { id: 2, name: 'Rosa Dela Cruz', unit: '2C', status: 'pending', depositStatus: 'Paid', advanceStatus: 'Pending', termOfPayment: 'Semi-monthly', billing: { baseRent: 7500, water: 400, electricity: 900, parking: 500, addOns: 0 }, history: [{ period: 'Apr 2025', breakdown: 'Rent: 7500, Water: 400, Elec: 850', amount: 8750, datePaid: 'Apr 1', status: 'paid' }] },
  { id: 3, name: 'Maria Santos', unit: '1A', status: 'paid', depositStatus: 'Paid', advanceStatus: 'Paid', termOfPayment: 'Monthly', billing: { baseRent: 6500, water: 300, electricity: 700, parking: 0, addOns: 0 }, history: [{ period: 'May 2025', breakdown: 'Rent: 6500, Water: 300, Elec: 700', amount: 7500, datePaid: 'May 1', status: 'paid' }, { period: 'Apr 2025', breakdown: 'Rent: 6500, Water: 310, Elec: 720', amount: 7530, datePaid: 'Apr 2', status: 'paid' }] }
];

const formatCurrency = (n) => `₱${Number(n).toLocaleString()}`;

const AdminPayments = () => {
  const [tenants, setTenants] = useState(initialTenants);
  const [selectedTenantId, setSelectedTenantId] = useState(initialTenants[0].id);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [billingPeriod, setBillingPeriod] = useState('May 2025');
  const [isExtendedRent, setIsExtendedRent] = useState(false);
  const [extendedAmount, setExtendedAmount] = useState(0);
  const [customAddOns, setCustomAddOns] = useState(0);

  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState(null);

  const activeTenant = tenants.find(t => t.id === selectedTenantId) || tenants[0];
  const filteredTenants = tenants.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.unit.toLowerCase().includes(searchTerm.toLowerCase()));

  const calculateTotal = () => {
    return isExtendedRent 
      ? Number(extendedAmount) + Number(customAddOns)
      : activeTenant.billing.baseRent + activeTenant.billing.water + activeTenant.billing.electricity + activeTenant.billing.parking + Number(customAddOns);
  };
  const totalDue = calculateTotal();

  const totalCollected = tenants.reduce((sum, t) => sum + t.history.filter(h => h.status === 'paid').reduce((s, h) => s + h.amount, 0), 0);
  const overdueCount = tenants.filter(t => t.status === 'overdue').length;
  const pendingCount = tenants.filter(t => t.status === 'pending').length;

  const handleMarkAsPaid = () => {
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const breakdown = isExtendedRent ? `Extended Rent: ${extendedAmount}, Add-ons: ${customAddOns}` : `Rent: ${activeTenant.billing.baseRent}, Water: ${activeTenant.billing.water}, Elec: ${activeTenant.billing.electricity}`;
    const newRecord = { period: billingPeriod, breakdown, amount: totalDue, datePaid: today, status: 'paid' };

    setTenants(prev => prev.map(t => t.id === selectedTenantId ? { ...t, status: 'paid', history: [newRecord, ...t.history] } : t));
    setIsExtendedRent(false); setExtendedAmount(0); setCustomAddOns(0);
  };

  const handleGenerateReceipt = (record = null) => {
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (record) {
      setReceiptData({ date: record.datePaid, tenant: activeTenant.name, unit: activeTenant.unit, period: record.period, amount: record.amount, breakdown: record.breakdown, status: record.status.toUpperCase() });
    } else {
      setReceiptData({ date: today, tenant: activeTenant.name, unit: activeTenant.unit, period: billingPeriod, amount: totalDue, breakdown: `Rent: ${activeTenant.billing.baseRent}`, status: 'UNPAID' });
    }
    setShowReceipt(true);
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left bg-slate-50">
        <Header title="Payment Management" />

        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-7xl mx-auto space-y-6">

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 text-lg"><FontAwesomeIcon icon={faDollarSign} /></div>
                <div><p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Total Collected</p><p className="text-2xl font-bold text-slate-800 m-0 mt-0.5">{formatCurrency(totalCollected)}</p></div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0 text-lg"><FontAwesomeIcon icon={faExclamationTriangle} /></div>
                <div><p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Overdue Accounts</p><p className="text-2xl font-bold text-slate-800 m-0 mt-0.5">{overdueCount}</p></div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 text-lg"><FontAwesomeIcon icon={faCalendarAlt} /></div>
                <div><p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Pending Payments</p><p className="text-2xl font-bold text-slate-800 m-0 mt-0.5">{pendingCount}</p></div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden h-[calc(100vh-16rem)] min-h-[500px]">
                <div className="p-4 border-b border-slate-200 bg-slate-50">
                  <h3 className="text-sm font-semibold text-slate-800 mb-3 m-0">Select Tenant</h3>
                  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 focus-within:border-indigo-500 transition-all">
                    <FontAwesomeIcon icon={faSearch} className="text-slate-400 text-xs" />
                    <input type="text" placeholder="Search tenant..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="flex-1 bg-transparent text-sm outline-none border-0 p-0 text-slate-800 bg-white" />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {filteredTenants.map(t => (
                    <div key={t.id} onClick={() => setSelectedTenantId(t.id)} className={`flex items-center justify-between p-4 border-b border-slate-100 cursor-pointer ${selectedTenantId === t.id ? 'bg-indigo-50 border-l-4 border-l-indigo-600' : 'hover:bg-slate-50'}`}>
                      <div><p className="text-sm font-bold text-slate-800 m-0">{t.name}</p><p className="text-[11px] text-slate-500 m-0 mt-0.5">Unit {t.unit}</p></div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${t.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>{t.status.toUpperCase()}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-8 flex flex-col gap-6">
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                  <div className="flex justify-between items-start mb-6">
                    <div><h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 m-0"><FontAwesomeIcon icon={faFileAlt} className="text-indigo-600" /> Billing Details</h3><p className="text-sm text-slate-500 m-0 mt-0.5">{activeTenant.name} · Unit {activeTenant.unit}</p></div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <p className="text-[10px] uppercase text-slate-400 font-semibold mb-1 m-0">Period</p>
                      <input type="text" value={billingPeriod} onChange={e => setBillingPeriod(e.target.value)} className="w-full bg-transparent text-sm font-medium outline-none border-0 p-0 border-b border-dashed border-slate-300 focus:border-indigo-500 text-slate-800" />
                    </div>
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100"><p className="text-[10px] uppercase text-slate-400 font-semibold mb-1 m-0">Term</p><p className="text-sm font-medium text-slate-700 m-0 mt-0.5">{activeTenant.termOfPayment}</p></div>
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100"><p className="text-[10px] uppercase text-slate-400 font-semibold mb-1 m-0">Deposit</p><p className="text-sm font-medium text-emerald-600 m-0 mt-0.5">{activeTenant.depositStatus}</p></div>
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100"><p className="text-[10px] uppercase text-slate-400 font-semibold mb-1 m-0">Advance</p><p className="text-sm font-medium text-emerald-600 m-0 mt-0.5">{activeTenant.advanceStatus}</p></div>
                  </div>

                  <div className="flex items-center gap-2 mb-4">
                    <input type="checkbox" id="extendedRent" checked={isExtendedRent} onChange={e => setIsExtendedRent(e.target.checked)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                    <label htmlFor="extendedRent" className="text-sm font-medium text-slate-700 cursor-pointer">Use Extended/Prorated Rent</label>
                  </div>

                  <div className="flex items-end justify-between border-t border-slate-100 pt-4">
                    <div className="w-1/3">
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Custom Add-ons</label>
                      <input type="number" value={customAddOns} onChange={e => setCustomAddOns(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-white" placeholder="0" />
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1 m-0">Total Due</p>
                      <p className="text-3xl font-bold text-indigo-600 m-0 mt-0.5">{formatCurrency(totalDue)}</p>
                    </div>
                  </div>

                  <div className="flex gap-3 mt-6">
                    <button onClick={handleMarkAsPaid} disabled={totalDue <= 0} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors border-0 cursor-pointer disabled:opacity-45"><FontAwesomeIcon icon={faCheckCircle} /> Mark as Paid</button>
                    <button onClick={() => handleGenerateReceipt()} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 border-solid cursor-pointer"><FontAwesomeIcon icon={faPrint} /> View Current Receipt</button>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex-1 min-h-[300px]">
                  <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2 m-0"><FontAwesomeIcon icon={faHistory} className="text-slate-400" /> Payment History</h3>
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                        <th className="py-2">Period</th><th className="py-2">Amount</th><th className="py-2">Date Paid</th><th className="py-2 text-right">Receipt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeTenant.history.map((record, idx) => (
                        <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-3 font-medium text-slate-800">{record.period}</td>
                          <td className="py-3 text-slate-700">{formatCurrency(record.amount)}</td>
                          <td className="py-3 text-slate-500">{record.datePaid}</td>
                          <td className="py-3 text-right"><button onClick={() => handleGenerateReceipt(record)} className="text-indigo-600 border-0 bg-transparent cursor-pointer hover:text-indigo-800 text-xs"><FontAwesomeIcon icon={faPrint} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>

      {showReceipt && receiptData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowReceipt(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-slate-900 text-white p-6 text-center">
              <h2 className="text-2xl font-bold tracking-wider italic font-serif mb-1 m-0 uppercase">AMS</h2>
              <p className="text-[11px] text-slate-400 uppercase tracking-widest m-0 mt-0.5">Official Receipt</p>
            </div>
            <div className="p-6 space-y-4 font-mono text-sm">
              <div className="flex justify-between border-b border-slate-200 pb-4">
                <div><p className="text-slate-500 text-xs m-0">Date</p><p className="font-semibold m-0 mt-0.5">{receiptData.date}</p></div>
                <div className="text-right"><p className="text-slate-500 text-xs m-0">Status</p><p className="font-bold text-emerald-600 m-0 mt-0.5">{receiptData.status}</p></div>
              </div>
              <div><p className="text-slate-500 text-xs m-0">Received From</p><p className="font-bold text-base m-0 mt-0.5 text-slate-800">{receiptData.tenant}</p><p className="m-0 text-slate-600">Unit {receiptData.unit}</p></div>
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 whitespace-pre-wrap leading-relaxed text-xs">{receiptData.breakdown}</div>
              <div className="flex justify-between items-center pt-4 border-t border-slate-200"><p className="font-bold text-slate-500 m-0">TOTAL</p><p className="text-xl font-bold text-slate-800 m-0">{formatCurrency(receiptData.amount)}</p></div>
            </div>
            <div className="flex gap-2 p-4 bg-slate-50 border-t border-slate-200">
              <button onClick={() => window.print()} className="flex-1 flex items-center justify-center gap-2 py-2 bg-indigo-600 text-white rounded text-sm font-semibold hover:bg-indigo-700 border-0 cursor-pointer"><FontAwesomeIcon icon={faPrint} /> Print Receipt</button>
              <button onClick={() => setShowReceipt(false)} className="flex-1 py-2 bg-white border border-slate-300 text-slate-700 rounded text-sm font-semibold hover:bg-slate-100 border-solid cursor-pointer">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPayments;