import React, { useState, useMemo } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSearch, faCheckCircle, faPrint, faPaperPlane, faUser, faCalendarAlt, 
  faDollarSign, faFileAlt, faExclamationTriangle, faTimes, faHistory, faMoneyBillWave, faInfoCircle, faCircle
} from '@fortawesome/free-solid-svg-icons';

const initialTenants = [
  { id: 1, name: 'Pedro Cruz', unit: 'E', status: 'overdue', depositStatus: 'Paid', advanceStatus: 'Paid', termOfPayment: 'Monthly', dueDate: '2025-05-05', dueDateDay: 5, billing: { baseRent: 6500, water: 350, electricity: 820, parking: 0, addOns: 0 }, history: [{ id: 'RCT-1001', period: 'Apr 2025', breakdown: 'Rent: 6500, Water: 320, Elec: 750', amount: 7570, datePaid: 'Apr 3, 2025', status: 'paid', method: 'Cash' }, { id: 'RCT-1002', period: 'Mar 2025', breakdown: 'Rent: 6500, Water: 340, Elec: 700', amount: 7540, datePaid: 'Mar 5, 2025', status: 'paid', method: 'GCash' }] },
  { id: 2, name: 'Rosa Dela Cruz', unit: 'F', status: 'pending', depositStatus: 'Paid', advanceStatus: 'Pending', termOfPayment: 'Semi-monthly', dueDate: '2025-05-15', dueDateDay: 15, billing: { baseRent: 7500, water: 400, electricity: 900, parking: 500, addOns: 0 }, history: [{ id: 'RCT-1003', period: 'Apr 2025', breakdown: 'Rent: 7500, Water: 400, Elec: 850', amount: 8750, datePaid: 'Apr 1, 2025', status: 'paid', method: 'Bank Transfer' }] },
  { id: 3, name: 'Maria Santos', unit: 'A', status: 'paid', depositStatus: 'Paid', advanceStatus: 'Paid', termOfPayment: 'Monthly', dueDate: '2025-05-01', dueDateDay: 1, billing: { baseRent: 6500, water: 300, electricity: 700, parking: 0, addOns: 0 }, history: [{ id: 'RCT-1004', period: 'May 2025', breakdown: 'Rent: 6500, Water: 300, Elec: 700', amount: 7500, datePaid: 'May 1, 2025', status: 'paid', method: 'GCash' }, { id: 'RCT-1005', period: 'Apr 2025', breakdown: 'Rent: 6500, Water: 310, Elec: 720', amount: 7530, datePaid: 'Apr 2, 2025', status: 'paid', method: 'Cash' }] }
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

  // Payment Recording States
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [amountTendered, setAmountTendered] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // History Table States
  const [historySearchPeriod, setHistorySearchPeriod] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const recordsPerPage = 5;

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
  const change = amountTendered ? Math.max(0, Number(amountTendered) - totalDue) : 0;

  // Summaries
  const totalCollected = tenants.reduce((sum, t) => sum + t.history.filter(h => h.status === 'paid').reduce((s, h) => s + h.amount, 0), 0);
  const overdueCount = tenants.filter(t => t.status === 'overdue').length;
  const pendingCount = tenants.filter(t => t.status === 'pending').length;
  const totalOutstanding = tenants.filter(t => t.status !== 'paid').reduce((sum, t) => sum + (t.billing.baseRent + t.billing.water + t.billing.electricity + t.billing.parking), 0);

  // Due Date Helpers
  const getDaysUntilDue = (dueDateStr) => {
    if (!dueDateStr) return null;
    const due = new Date(dueDateStr);
    const today = new Date();
    today.setHours(0,0,0,0);
    const diff = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    return diff;
  };
  
  const dueWithin5DaysCount = tenants.filter(t => {
    const diff = getDaysUntilDue(t.dueDate);
    return t.status !== 'paid' && diff !== null && diff >= 0 && diff <= 5;
  }).length;

  const handleUpdateTenantField = (field, value) => {
    setTenants(prev => prev.map(t => t.id === selectedTenantId ? { ...t, [field]: value } : t));
  };

  const handleConfirmPayment = () => {
    setShowConfirmModal(true);
  };

  const handleMarkAsPaid = () => {
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const breakdown = isExtendedRent ? `Extended Rent: ${extendedAmount}, Add-ons: ${customAddOns}` : `Rent: ${activeTenant.billing.baseRent}, Water: ${activeTenant.billing.water}, Elec: ${activeTenant.billing.electricity}`;
    const newRecordId = `RCT-${Math.floor(1000 + Math.random() * 9000)}`;
    const newRecord = { id: newRecordId, period: billingPeriod, breakdown, amount: totalDue, datePaid: today, status: 'paid', method: paymentMethod };

    setTenants(prev => prev.map(t => t.id === selectedTenantId ? { ...t, status: 'paid', history: [newRecord, ...t.history] } : t));
    
    setIsExtendedRent(false); setExtendedAmount(0); setCustomAddOns(0); setAmountTendered('');
    setShowConfirmModal(false);
    handleGenerateReceipt(newRecord);
  };

  const handleGenerateReceipt = (record = null) => {
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (record) {
      setReceiptData({ rctId: record.id, date: record.datePaid, tenant: activeTenant.name, unit: activeTenant.unit, period: record.period, amount: record.amount, breakdown: record.breakdown, status: record.status.toUpperCase(), method: record.method });
    } else {
      setReceiptData({ rctId: 'RCT-DRAFT', date: today, tenant: activeTenant.name, unit: activeTenant.unit, period: billingPeriod, amount: totalDue, breakdown: `Rent: ${activeTenant.billing.baseRent}`, status: 'UNPAID', method: paymentMethod });
    }
    setShowReceipt(true);
  };

  // Pagination and Filtering for History
  const filteredHistory = useMemo(() => {
    return activeTenant.history.filter(h => h.period.toLowerCase().includes(historySearchPeriod.toLowerCase()));
  }, [activeTenant.history, historySearchPeriod]);

  const historyPageCount = Math.ceil(filteredHistory.length / recordsPerPage);
  const paginatedHistory = filteredHistory.slice((historyPage - 1) * recordsPerPage, historyPage * recordsPerPage);

  const activeDaysDue = getDaysUntilDue(activeTenant.dueDate);
  const showBanner = activeTenant.status === 'overdue' || (activeTenant.status === 'pending' && activeDaysDue !== null && activeDaysDue <= 5);

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left bg-slate-50">
        <Header title="Payment Management" />

        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 text-lg"><FontAwesomeIcon icon={faDollarSign} /></div>
                <div><p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Total Collected</p><p className="text-xl lg:text-2xl font-bold text-slate-800 m-0 mt-0.5">{formatCurrency(totalCollected)}</p></div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center gap-4 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
                <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0 text-lg"><FontAwesomeIcon icon={faExclamationTriangle} /></div>
                <div><p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Overdue Accounts</p><p className="text-xl lg:text-2xl font-bold text-slate-800 m-0 mt-0.5">{overdueCount}</p></div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center gap-4 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
                <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 text-lg"><FontAwesomeIcon icon={faCalendarAlt} /></div>
                <div><p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Pending Payments</p><p className="text-xl lg:text-2xl font-bold text-slate-800 m-0 mt-0.5">{pendingCount}</p></div>
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-sm flex items-center gap-4 text-white">
                <div className="w-12 h-12 rounded-full bg-slate-700 text-slate-300 flex items-center justify-center shrink-0 text-lg"><FontAwesomeIcon icon={faMoneyBillWave} /></div>
                <div><p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide m-0">Total Outstanding</p><p className="text-xl lg:text-2xl font-bold text-white m-0 mt-0.5">{formatCurrency(totalOutstanding)}</p></div>
              </div>
            </div>
            
            {/* Due Date Indicator Bar */}
            {dueWithin5DaysCount > 0 && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
                <FontAwesomeIcon icon={faExclamationTriangle} /> <strong>{dueWithin5DaysCount}</strong> tenant(s) have payments due within the next 5 days.
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Tenant Selector */}
              <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden h-[calc(100vh-18rem)] min-h-[500px]">
                <div className="p-4 border-b border-slate-200 bg-slate-50">
                  <h3 className="text-sm font-semibold text-slate-800 mb-3 m-0">Select Tenant</h3>
                  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 focus-within:border-indigo-500 transition-all">
                    <FontAwesomeIcon icon={faSearch} className="text-slate-400 text-xs" />
                    <input type="text" placeholder="Search tenant..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="flex-1 bg-transparent text-sm outline-none border-0 p-0 text-slate-800 bg-white" />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {filteredTenants.map(t => {
                    const days = getDaysUntilDue(t.dueDate);
                    const isDueSoon = t.status !== 'paid' && days !== null && days >= 0 && days <= 5;
                    const tenantTotalDue = t.billing.baseRent + t.billing.water + t.billing.electricity + t.billing.parking;
                    return (
                      <div key={t.id} onClick={() => {setSelectedTenantId(t.id); setHistoryPage(1);}} className={`flex items-center justify-between p-4 border-b border-slate-100 cursor-pointer ${selectedTenantId === t.id ? 'bg-indigo-50 border-l-4 border-l-indigo-600' : 'hover:bg-slate-50'}`}>
                        <div>
                          <p className="text-sm font-bold text-slate-800 m-0 flex items-center gap-2">
                            {t.name}
                            {t.status === 'overdue' && <FontAwesomeIcon icon={faCircle} className="text-[8px] text-red-500 animate-pulse" />}
                            {isDueSoon && <FontAwesomeIcon icon={faCircle} className="text-[8px] text-amber-500" />}
                          </p>
                          <p className="text-[11px] text-slate-500 m-0 mt-0.5">Unit {t.unit} · Due {t.dueDate}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-slate-700 m-0 mb-1">{t.status !== 'paid' ? formatCurrency(tenantTotalDue) : '₱0'}</p>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${t.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>{t.status.toUpperCase()}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Main Detail Area */}
              <div className="lg:col-span-8 flex flex-col gap-6">
                
                {/* Due Date Banner */}
                {showBanner && (
                  <div className={`p-3 rounded-lg border flex items-center gap-3 text-sm font-semibold ${activeTenant.status === 'overdue' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                    <FontAwesomeIcon icon={faExclamationTriangle} />
                    {activeTenant.status === 'overdue' 
                      ? `This account is overdue. Due date was ${activeTenant.dueDate}.` 
                      : `Payment is due in ${activeDaysDue} days (${activeTenant.dueDate}).`}
                  </div>
                )}

                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 m-0"><FontAwesomeIcon icon={faFileAlt} className="text-indigo-600" /> Billing Details</h3>
                      <p className="text-sm text-slate-500 m-0 mt-0.5">{activeTenant.name} · Unit {activeTenant.unit}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <p className="text-[10px] uppercase text-slate-400 font-semibold mb-1 m-0">Period</p>
                      <input type="text" value={billingPeriod} onChange={e => setBillingPeriod(e.target.value)} className="w-full bg-transparent text-sm font-medium outline-none border-0 p-0 border-b border-dashed border-slate-300 focus:border-indigo-500 text-slate-800" />
                    </div>
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <p className="text-[10px] uppercase text-slate-400 font-semibold mb-1 m-0">Due Date</p>
                      <input type="date" value={activeTenant.dueDate} onChange={e => handleUpdateTenantField('dueDate', e.target.value)} className="w-full bg-transparent text-sm font-medium outline-none border-0 p-0 border-b border-dashed border-slate-300 focus:border-indigo-500 text-slate-800" />
                    </div>
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <p className="text-[10px] uppercase text-slate-400 font-semibold mb-1 m-0">Term</p>
                      <select value={activeTenant.termOfPayment} onChange={e => handleUpdateTenantField('termOfPayment', e.target.value)} className="w-full bg-transparent text-sm font-medium outline-none border-0 p-0 border-b border-dashed border-slate-300 focus:border-indigo-500 text-slate-800 cursor-pointer">
                        <option value="Monthly">Monthly</option>
                        <option value="Semi-monthly">Semi-monthly</option>
                      </select>
                    </div>
                    <div 
                      className="bg-slate-50 p-3 rounded-lg border border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => handleUpdateTenantField('depositStatus', activeTenant.depositStatus === 'Paid' ? 'Pending' : 'Paid')}
                    >
                      <p className="text-[10px] uppercase text-slate-400 font-semibold mb-1 m-0">Deposit</p>
                      <p className={`text-sm font-medium m-0 mt-0.5 ${activeTenant.depositStatus === 'Paid' ? 'text-emerald-600' : 'text-amber-600'}`}>{activeTenant.depositStatus}</p>
                    </div>
                    <div 
                      className="bg-slate-50 p-3 rounded-lg border border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => handleUpdateTenantField('advanceStatus', activeTenant.advanceStatus === 'Paid' ? 'Pending' : 'Paid')}
                    >
                      <p className="text-[10px] uppercase text-slate-400 font-semibold mb-1 m-0">Advance</p>
                      <p className={`text-sm font-medium m-0 mt-0.5 ${activeTenant.advanceStatus === 'Paid' ? 'text-emerald-600' : 'text-amber-600'}`}>{activeTenant.advanceStatus}</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 mb-4">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="extendedRent" checked={isExtendedRent} onChange={e => setIsExtendedRent(e.target.checked)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                      <label htmlFor="extendedRent" className="text-sm font-medium text-slate-700 cursor-pointer">Use Extended/Prorated Rent</label>
                    </div>
                    {isExtendedRent && (
                      <div className="flex items-start gap-2 text-[11px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-100">
                        <FontAwesomeIcon icon={faInfoCircle} className="mt-0.5 text-indigo-400" />
                        <p className="m-0">Prorated rent is applied when a tenant moves in or out midway through a billing cycle. Enter the calculated prorated amount below.</p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-end justify-between border-t border-slate-100 pt-4 mb-6">
                    <div className="w-1/3 space-y-3">
                      {isExtendedRent && (
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Prorated Base Rent</label>
                          <input type="number" value={extendedAmount} onChange={e => setExtendedAmount(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-white focus:border-indigo-500 transition-colors" placeholder="0" />
                        </div>
                      )}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Custom Add-ons</label>
                        <input type="number" value={customAddOns} onChange={e => setCustomAddOns(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-white focus:border-indigo-500 transition-colors" placeholder="0" />
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1 m-0">Total Due</p>
                      <p className="text-3xl font-bold text-indigo-600 m-0 mt-0.5">{formatCurrency(totalDue)}</p>
                    </div>
                  </div>

                  {/* Payment Recording Area */}
                  {totalDue > 0 && activeTenant.status !== 'paid' && (
                    <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 mb-6">
                      <h4 className="text-sm font-bold text-slate-800 mb-3 m-0">Record Payment</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Method</label>
                          <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-white focus:border-indigo-500">
                            <option value="Cash">Cash</option>
                            <option value="GCash">GCash</option>
                            <option value="Bank Transfer">Bank Transfer</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Amount Tendered</label>
                          <input type="number" value={amountTendered} onChange={e => setAmountTendered(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-white focus:border-indigo-500" placeholder="0" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Change</label>
                          <div className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-100 text-slate-700 font-semibold">{formatCurrency(change)}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button 
                      onClick={handleConfirmPayment} 
                      disabled={totalDue <= 0 || activeTenant.status === 'paid' || (paymentMethod === 'Cash' && (!amountTendered || Number(amountTendered) < totalDue))} 
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors border-0 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                    >
                      <FontAwesomeIcon icon={faCheckCircle} /> Process Payment
                    </button>
                    <button onClick={() => handleGenerateReceipt()} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 border-solid cursor-pointer transition-colors"><FontAwesomeIcon icon={faPrint} /> View Draft Receipt</button>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex-1">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 m-0"><FontAwesomeIcon icon={faHistory} className="text-slate-400" /> Payment History</h3>
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 focus-within:border-indigo-400 transition-colors">
                      <FontAwesomeIcon icon={faSearch} className="text-slate-400 text-xs" />
                      <input type="text" placeholder="Filter period..." value={historySearchPeriod} onChange={e => {setHistorySearchPeriod(e.target.value); setHistoryPage(1);}} className="bg-transparent text-xs outline-none border-0 p-0 text-slate-700 w-24" />
                    </div>
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead>
                        <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wide bg-slate-50">
                          <th className="py-2 px-3">Period</th>
                          <th className="py-2 px-3">Amount</th>
                          <th className="py-2 px-3">Method</th>
                          <th className="py-2 px-3">Breakdown</th>
                          <th className="py-2 px-3">Date Paid</th>
                          <th className="py-2 px-3 text-right">Receipt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedHistory.length > 0 ? paginatedHistory.map((record, idx) => (
                          <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-3 px-3 font-medium text-slate-800">{record.period}</td>
                            <td className="py-3 px-3 text-emerald-600 font-semibold">{formatCurrency(record.amount)}</td>
                            <td className="py-3 px-3 text-slate-600"><span className="px-2 py-0.5 bg-slate-100 rounded text-xs border border-slate-200">{record.method}</span></td>
                            <td className="py-3 px-3 text-slate-500 text-xs truncate max-w-[150px]" title={record.breakdown}>{record.breakdown}</td>
                            <td className="py-3 px-3 text-slate-500">{record.datePaid}</td>
                            <td className="py-3 px-3 text-right"><button onClick={() => handleGenerateReceipt(record)} className="text-indigo-600 border-0 bg-slate-100 hover:bg-indigo-100 p-1.5 rounded cursor-pointer transition-colors text-xs" title="View Receipt"><FontAwesomeIcon icon={faPrint} /></button></td>
                          </tr>
                        )) : (
                          <tr><td colSpan="6" className="py-4 text-center text-slate-500 text-sm">No records found.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  
                  {historyPageCount > 1 && (
                    <div className="flex justify-between items-center mt-4 pt-4 border-t border-slate-100">
                      <p className="text-xs text-slate-500 m-0">Showing Page {historyPage} of {historyPageCount}</p>
                      <div className="flex gap-1">
                        <button onClick={() => setHistoryPage(p => Math.max(1, p - 1))} disabled={historyPage === 1} className="px-2 py-1 text-xs border border-slate-200 rounded bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 cursor-pointer">Prev</button>
                        <button onClick={() => setHistoryPage(p => Math.min(historyPageCount, p + 1))} disabled={historyPage === historyPageCount} className="px-2 py-1 text-xs border border-slate-200 rounded bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 cursor-pointer">Next</button>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowConfirmModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <h3 className="text-lg font-bold text-slate-800 mb-2 mt-0">Confirm Payment</h3>
              <p className="text-sm text-slate-600 mb-4">Are you sure you want to process this payment? This action will generate a receipt and mark the period as paid.</p>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-sm space-y-2 mb-6">
                <div className="flex justify-between"><span className="text-slate-500">Tenant</span><span className="font-semibold text-slate-800">{activeTenant.name}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Period</span><span className="font-semibold text-slate-800">{billingPeriod}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Amount</span><span className="font-bold text-emerald-600">{formatCurrency(totalDue)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Method</span><span className="font-semibold text-slate-800">{paymentMethod}</span></div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleMarkAsPaid} className="flex-1 py-2 bg-indigo-600 text-white rounded text-sm font-semibold hover:bg-indigo-700 border-0 cursor-pointer transition-colors">Confirm</button>
                <button onClick={() => setShowConfirmModal(false)} className="flex-1 py-2 bg-white border border-slate-300 text-slate-700 rounded text-sm font-semibold hover:bg-slate-50 border-solid cursor-pointer transition-colors">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {showReceipt && receiptData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowReceipt(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-slate-900 text-white p-6 text-center border-b-4 border-indigo-500">
              <h2 className="text-2xl font-bold tracking-wider italic font-serif mb-1 m-0 uppercase">Grand Villas AMS</h2>
              <p className="text-xs text-slate-400 m-0">123 Balete Drive, Quezon City, Metro Manila</p>
              <div className="mt-4 pt-4 border-t border-slate-700/50">
                <p className="text-sm font-semibold text-slate-300 uppercase tracking-widest m-0">Official Receipt</p>
                <p className="text-xs font-mono text-indigo-300 m-0 mt-1">{receiptData.rctId}</p>
              </div>
            </div>
            <div className="p-6 space-y-4 font-mono text-sm">
              <div className="flex justify-between border-b border-slate-200 pb-4">
                <div><p className="text-slate-500 text-[10px] uppercase m-0">Date</p><p className="font-semibold m-0 mt-0.5">{receiptData.date}</p></div>
                <div className="text-right"><p className="text-slate-500 text-[10px] uppercase m-0">Status</p><p className={`font-bold m-0 mt-0.5 ${receiptData.status === 'PAID' ? 'text-emerald-600' : 'text-red-600'}`}>{receiptData.status}</p></div>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-4">
                <div><p className="text-slate-500 text-[10px] uppercase m-0">Received From</p><p className="font-bold text-base m-0 mt-0.5 text-slate-800">{receiptData.tenant}</p><p className="m-0 text-slate-600 text-xs">Unit {receiptData.unit}</p></div>
                <div className="text-right"><p className="text-slate-500 text-[10px] uppercase m-0">Method</p><p className="font-semibold text-slate-800 m-0 mt-0.5">{receiptData.method}</p></div>
              </div>
              <div>
                <p className="text-slate-500 text-[10px] uppercase m-0 mb-1">Payment Breakdown ({receiptData.period})</p>
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 whitespace-pre-wrap leading-relaxed text-xs text-slate-700">{receiptData.breakdown}</div>
              </div>
              <div className="flex justify-between items-center pt-4 border-t-2 border-dashed border-slate-200">
                <p className="font-bold text-slate-600 m-0 text-base">TOTAL PAID</p>
                <p className="text-2xl font-bold text-slate-900 m-0">{formatCurrency(receiptData.amount)}</p>
              </div>
            </div>
            <div className="flex gap-2 p-4 bg-slate-50 border-t border-slate-200">
              <button onClick={() => window.print()} className="flex-1 flex items-center justify-center gap-2 py-2 bg-indigo-600 text-white rounded text-sm font-semibold hover:bg-indigo-700 border-0 cursor-pointer transition-colors"><FontAwesomeIcon icon={faPrint} /> Download PDF</button>
              <button onClick={() => setShowReceipt(false)} className="flex-1 py-2 bg-white border border-slate-300 text-slate-700 rounded text-sm font-semibold hover:bg-slate-100 border-solid cursor-pointer transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPayments;