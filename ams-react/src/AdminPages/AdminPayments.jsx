import React, { useState } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { 
  Search, CheckCircle, Printer, Send, User, Calendar, 
  DollarSign, FileText, AlertCircle, X, History 
} from 'lucide-react';

/* ───────────────────────────────────────────
   SEED DATA
   ─────────────────────────────────────────── */
const initialTenants = [
  { id: 1, name: 'Pedro Cruz', unit: '2B', status: 'overdue', 
    depositStatus: 'Paid', advanceStatus: 'Paid', termOfPayment: 'Monthly',
    billing: { baseRent: 6500, water: 350, electricity: 820, parking: 0, addOns: 0 },
    history: [
      { period: 'Apr 2025', breakdown: 'Rent: 6500, Water: 320, Elec: 750', amount: 7570, datePaid: 'Apr 3', status: 'paid' },
      { period: 'Mar 2025', breakdown: 'Rent: 6500, Water: 340, Elec: 700', amount: 7540, datePaid: 'Mar 5', status: 'paid' },
    ]
  },
  { id: 2, name: 'Rosa Dela Cruz', unit: '2C', status: 'pending',
    depositStatus: 'Paid', advanceStatus: 'Pending', termOfPayment: 'Semi-monthly',
    billing: { baseRent: 7500, water: 400, electricity: 900, parking: 500, addOns: 0 },
    history: [
      { period: 'Apr 2025', breakdown: 'Rent: 7500, Water: 400, Elec: 850', amount: 8750, datePaid: 'Apr 1', status: 'paid' },
    ]
  },
  { id: 3, name: 'Maria Santos', unit: '1A', status: 'paid',
    depositStatus: 'Paid', advanceStatus: 'Paid', termOfPayment: 'Monthly',
    billing: { baseRent: 6500, water: 300, electricity: 700, parking: 0, addOns: 0 },
    history: [
      { period: 'May 2025', breakdown: 'Rent: 6500, Water: 300, Elec: 700', amount: 7500, datePaid: 'May 1', status: 'paid' },
      { period: 'Apr 2025', breakdown: 'Rent: 6500, Water: 310, Elec: 720', amount: 7530, datePaid: 'Apr 2', status: 'paid' },
    ]
  }
];

const formatCurrency = (n) => `₱${Number(n).toLocaleString()}`;

const AdminPayments = () => {
  const [tenants, setTenants] = useState(initialTenants);
  const [selectedTenantId, setSelectedTenantId] = useState(initialTenants[0].id);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Billing form state
  const [billingPeriod, setBillingPeriod] = useState('May 2025');
  const [isExtendedRent, setIsExtendedRent] = useState(false);
  const [extendedAmount, setExtendedAmount] = useState(0);
  const [customAddOns, setCustomAddOns] = useState(0);

  // Modals
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState(null);

  /* ── Derived Data ── */
  const activeTenant = tenants.find(t => t.id === selectedTenantId) || tenants[0];
  
  const filteredTenants = tenants.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    t.unit.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const calculateTotal = () => {
    let total = 0;
    if (isExtendedRent) {
      total = Number(extendedAmount) + Number(customAddOns);
    } else {
      total = activeTenant.billing.baseRent + 
              activeTenant.billing.water + 
              activeTenant.billing.electricity + 
              activeTenant.billing.parking + 
              Number(customAddOns);
    }
    return total;
  };

  const totalDue = calculateTotal();

  // Summary stats
  const totalCollected = tenants.reduce((sum, t) => 
    sum + t.history.filter(h => h.status === 'paid').reduce((s, h) => s + h.amount, 0)
  , 0);
  const overdueCount = tenants.filter(t => t.status === 'overdue').length;
  const pendingCount = tenants.filter(t => t.status === 'pending').length;

  /* ── Handlers ── */
  const handleMarkAsPaid = () => {
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const breakdown = isExtendedRent 
      ? `Extended Rent: ${extendedAmount}, Add-ons: ${customAddOns}`
      : `Rent: ${activeTenant.billing.baseRent}, Water: ${activeTenant.billing.water}, Elec: ${activeTenant.billing.electricity}`;
    
    const newRecord = {
      period: billingPeriod,
      breakdown,
      amount: totalDue,
      datePaid: today,
      status: 'paid'
    };

    setTenants(prev => prev.map(t => {
      if (t.id === selectedTenantId) {
        return {
          ...t,
          status: 'paid',
          history: [newRecord, ...t.history]
        };
      }
      return t;
    }));

    setIsExtendedRent(false);
    setExtendedAmount(0);
    setCustomAddOns(0);
  };

  const handleGenerateReceipt = (record = null) => {
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (record) {
      setReceiptData({
        date: record.datePaid,
        tenant: activeTenant.name,
        unit: activeTenant.unit,
        period: record.period,
        amount: record.amount,
        breakdown: record.breakdown,
        status: record.status.toUpperCase()
      });
    } else {
      const breakdown = isExtendedRent 
        ? `Extended Rent: ${extendedAmount}\nAdd-ons: ${customAddOns}`
        : `Base Rent: ${activeTenant.billing.baseRent}\nWater: ${activeTenant.billing.water}\nElectricity: ${activeTenant.billing.electricity}\nParking: ${activeTenant.billing.parking}\nAdd-ons: ${customAddOns}`;
      
      setReceiptData({
        date: today,
        tenant: activeTenant.name,
        unit: activeTenant.unit,
        period: billingPeriod,
        amount: totalDue,
        breakdown: breakdown,
        status: 'UNPAID'
      });
    }
    setShowReceipt(true);
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <Header title="Payment Management" />

        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* ─── Balance Monitoring Summary ─── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                  <DollarSign size={24} />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Total Collected</p>
                  <p className="text-2xl font-bold text-slate-800">{formatCurrency(totalCollected)}</p>
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                  <AlertCircle size={24} />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Overdue Accounts</p>
                  <p className="text-2xl font-bold text-slate-800">{overdueCount}</p>
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                  <Calendar size={24} />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Pending Payments</p>
                  <p className="text-2xl font-bold text-slate-800">{pendingCount}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* ─── Tenant Selector Sidebar ─── */}
              <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden h-[calc(100vh-16rem)] min-h-[500px]">
                <div className="p-4 border-b border-slate-200 bg-slate-50">
                  <h3 className="text-sm font-semibold text-slate-800 mb-3">Select Tenant</h3>
                  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 focus-within:border-indigo-500 transition-all">
                    <Search size={16} className="text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search tenant or unit..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="flex-1 bg-transparent text-sm outline-none"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {filteredTenants.map(tenant => (
                    <div 
                      key={tenant.id}
                      onClick={() => setSelectedTenantId(tenant.id)}
                      className={`flex items-center justify-between p-4 border-b border-slate-100 cursor-pointer transition-colors ${
                        selectedTenantId === tenant.id ? 'bg-indigo-50 border-l-4 border-l-indigo-600' : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-bold text-slate-800">{tenant.name}</p>
                        <p className="text-[11px] text-slate-500">Unit {tenant.unit}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        tenant.status === 'paid' ? 'bg-emerald-100 text-emerald-800' :
                        tenant.status === 'overdue' ? 'bg-red-100 text-red-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {tenant.status.toUpperCase()}
                      </span>
                    </div>
                  ))}
                  {filteredTenants.length === 0 && (
                    <div className="p-6 text-center text-sm text-slate-500">No tenants found.</div>
                  )}
                </div>
              </div>

              {/* ─── Main Billing & History Area ─── */}
              <div className="lg:col-span-8 flex flex-col gap-6">
                
                {/* 1. Record Payment Form */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <FileText size={20} className="text-indigo-600" />
                        Billing Details
                      </h3>
                      <p className="text-sm text-slate-500">{activeTenant.name} · Unit {activeTenant.unit}</p>
                    </div>
                    {activeTenant.status === 'overdue' && (
                      <button className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 rounded-md text-xs font-semibold transition-colors">
                        <Send size={14} /> Send Reminder
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <p className="text-[10px] uppercase text-slate-400 font-semibold mb-1">Period</p>
                      <input 
                        type="text" 
                        value={billingPeriod} 
                        onChange={e => setBillingPeriod(e.target.value)}
                        className="w-full bg-transparent text-sm font-medium outline-none border-b border-dashed border-slate-300 focus:border-indigo-500" 
                      />
                    </div>
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <p className="text-[10px] uppercase text-slate-400 font-semibold mb-1">Term</p>
                      <p className="text-sm font-medium">{activeTenant.termOfPayment}</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <p className="text-[10px] uppercase text-slate-400 font-semibold mb-1">Deposit (1 Mo)</p>
                      <p className="text-sm font-medium text-emerald-600">{activeTenant.depositStatus}</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <p className="text-[10px] uppercase text-slate-400 font-semibold mb-1">Advance (1 Mo)</p>
                      <p className={`text-sm font-medium ${activeTenant.advanceStatus === 'Paid' ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {activeTenant.advanceStatus}
                      </p>
                    </div>
                  </div>

                  {/* Toggle Extended Rent */}
                  <div className="flex items-center gap-2 mb-4">
                    <input 
                      type="checkbox" 
                      id="extendedRent" 
                      checked={isExtendedRent}
                      onChange={e => setIsExtendedRent(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <label htmlFor="extendedRent" className="text-sm font-medium text-slate-700 cursor-pointer">
                      Use Extended/Prorated Rent
                    </label>
                  </div>

                  {/* Line Items */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    {isExtendedRent ? (
                      <div className="col-span-2">
                        <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Prorated Amount</label>
                        <input 
                          type="number" 
                          value={extendedAmount} 
                          onChange={e => setExtendedAmount(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-indigo-500 outline-none" 
                        />
                      </div>
                    ) : (
                      <>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Base Rent</label>
                          <input type="text" value={formatCurrency(activeTenant.billing.baseRent)} readOnly className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-700" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Water</label>
                          <input type="text" value={formatCurrency(activeTenant.billing.water)} readOnly className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-700" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Electricity</label>
                          <input type="text" value={formatCurrency(activeTenant.billing.electricity)} readOnly className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-700" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Parking</label>
                          <input type="text" value={formatCurrency(activeTenant.billing.parking)} readOnly className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-700" />
                        </div>
                      </>
                    )}
                  </div>
                  
                  {/* Add-ons and Total */}
                  <div className="flex items-end justify-between border-t border-slate-100 pt-4">
                    <div className="w-1/3">
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Custom Add-ons / Penalties</label>
                      <input 
                        type="number" 
                        value={customAddOns} 
                        onChange={e => setCustomAddOns(e.target.value)}
                        placeholder="0"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-indigo-500 outline-none" 
                      />
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Total Due</p>
                      <p className="text-3xl font-bold text-indigo-600">{formatCurrency(totalDue)}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 mt-6">
                    <button 
                      onClick={handleMarkAsPaid}
                      disabled={totalDue <= 0}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
                    >
                      <CheckCircle size={16} /> Mark as Paid
                    </button>
                    <button 
                      onClick={() => handleGenerateReceipt()}
                      className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors"
                    >
                      <Printer size={16} /> View Current Receipt
                    </button>
                  </div>
                </div>

                {/* 2. Payment History */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex-1 min-h-[300px]">
                  <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <History size={16} className="text-slate-400" />
                    Payment History
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                          <th className="py-3 px-2">Period</th>
                          <th className="py-3 px-2">Amount</th>
                          <th className="py-3 px-2">Date Paid</th>
                          <th className="py-3 px-2">Status</th>
                          <th className="py-3 px-2 text-right">Receipt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeTenant.history.map((record, idx) => (
                          <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-3 px-2 font-medium">{record.period}</td>
                            <td className="py-3 px-2">{formatCurrency(record.amount)}</td>
                            <td className="py-3 px-2 text-slate-500">{record.datePaid}</td>
                            <td className="py-3 px-2">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                record.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                              }`}>
                                {record.status.toUpperCase()}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-right">
                              <button 
                                onClick={() => handleGenerateReceipt(record)}
                                className="text-indigo-600 hover:text-indigo-800 p-1"
                                title="View Receipt"
                              >
                                <Printer size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {activeTenant.history.length === 0 && (
                          <tr><td colSpan={5} className="py-8 text-center text-slate-400">No payment history found.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>
      </main>

      {/* ════════════════════════════════════
          MODAL — Receipt Generator
         ════════════════════════════════════ */}
      {showReceipt && receiptData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowReceipt(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-slate-900 text-white p-6 text-center">
              <h2 className="text-2xl font-bold tracking-wider italic font-serif mb-1">AMS</h2>
              <p className="text-[11px] text-slate-400 uppercase tracking-widest">Official Receipt</p>
            </div>
            
            <div className="p-6 space-y-4 font-mono text-sm">
              <div className="flex justify-between border-b border-slate-200 pb-4">
                <div>
                  <p className="text-slate-500 text-xs">Date</p>
                  <p className="font-semibold">{receiptData.date}</p>
                </div>
                <div className="text-right">
                  <p className="text-slate-500 text-xs">Status</p>
                  <p className={`font-bold ${receiptData.status === 'PAID' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {receiptData.status}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-slate-500 text-xs mb-1">Received From</p>
                <p className="font-bold text-base">{receiptData.tenant}</p>
                <p>Unit {receiptData.unit}</p>
              </div>

              <div>
                <p className="text-slate-500 text-xs mb-1">For Payment Of</p>
                <p className="font-semibold">{receiptData.period}</p>
              </div>

              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 whitespace-pre-wrap leading-relaxed text-xs">
                {receiptData.breakdown}
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-slate-200">
                <p className="font-bold text-slate-500">TOTAL</p>
                <p className="text-xl font-bold">{formatCurrency(receiptData.amount)}</p>
              </div>
            </div>

            <div className="flex gap-2 p-4 bg-slate-50 border-t border-slate-200">
              <button 
                onClick={() => window.print()}
                className="flex-1 flex items-center justify-center gap-2 py-2 bg-indigo-600 text-white rounded text-sm font-semibold hover:bg-indigo-700"
              >
                <Printer size={16} /> Print Receipt
              </button>
              <button 
                onClick={() => setShowReceipt(false)}
                className="flex-1 py-2 bg-white border border-slate-300 text-slate-700 rounded text-sm font-semibold hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminPayments;
