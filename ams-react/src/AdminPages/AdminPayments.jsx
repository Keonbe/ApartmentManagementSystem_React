import React, { useState, useMemo, useEffect } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSearch, faCheckCircle, faPrint, faUser, faCalendarAlt, 
  faDollarSign, faFileAlt, faExclamationTriangle, faTimes, faHistory, faMoneyBillWave, faInfoCircle, faCircle,
  faEdit, faTrash, faPlus, faChartBar, faHandshake, faBalanceScale, faArrowRight
} from '@fortawesome/free-solid-svg-icons';
import { getSystemSettings } from '../config/systemSettings';
import api from '../api/axiosConfig';

const formatCurrency = (n) => `₱${Number(n).toLocaleString()}`;

const AdminPayments = () => {
  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const res = await api.get('/get_invoices.php');
      if (res.data.success) {
        const grouped = {};
        
        res.data.invoices.forEach(inv => {
          if (!grouped[inv.user_id]) {
            grouped[inv.user_id] = {
              id: inv.user_id,
              // Null-safe name creation protects the component tree from throwing TypeErrors
              name: inv.first_name ? `${inv.first_name} ${inv.last_name}` : "Unknown User",
              unit: inv.room_name ?? "Unassigned",
              status: inv.status ?? "pending", 
              depositStatus: 'Paid', 
              advanceStatus: 'Paid', 
              termOfPayment: 'Monthly',
              dueDate: inv.due_date ?? "",
              dueDateDay: 5,
              billing: { baseRent: 0, water: 0, electricity: 0, parking: 0, addOns: 0 },
              history: [],
              settlements: [],
              outstandingBalance: 0,
              pendingInvoiceId: null
            };
          }
          
          const t = grouped[inv.user_id];
          
          if (inv.status === 'pending' || inv.status === 'overdue' || inv.status === 'pending-verification') {
            t.status = inv.status;
            t.dueDate = inv.due_date;
            t.billing.baseRent = parseFloat(inv.base_rent || 0);
            t.billing.water = parseFloat(inv.water || 0);
            t.billing.electricity = parseFloat(inv.electricity || 0);
            t.billing.parking = parseFloat(inv.parking || 0);
            t.billing.securityDeposit = parseFloat(inv.security_deposit || 0);
            t.outstandingBalance += parseFloat(inv.total_amount || 0);
            t.pendingInvoiceId = inv.id;
            t.proofOfPaymentPath = inv.proof_of_payment_path;
            t.paymentReference = inv.payment_reference;
            t.senderName = inv.sender_name;
            if (inv.payment_method) {
               t.preferredMethod = inv.payment_method;
            }
          } else if (inv.status === 'paid') {
            t.history.push({
              id: inv.id, 
              period: inv.billing_period, 
              breakdown: `Total: ${inv.total_amount}`,
              amount: parseFloat(inv.total_amount || 0), 
              datePaid: inv.paid_at, 
              status: 'paid', 
              method: inv.payment_method
            });
          }
        });
        
        const tenantArray = Object.values(grouped);
        setTenants(tenantArray);
        if (tenantArray.length > 0) setSelectedTenantId(tenantArray[0].id);
      }
    } catch(err) { 
      console.error(err); 
    } finally {
      setLoading(false);
    }
  };
  
  const [billingPeriod, setBillingPeriod] = useState('July 2026');
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

  const [showEditHistoryModal, setShowEditHistoryModal] = useState(false);
  const [historyForm, setHistoryForm] = useState(null);

  const [showSettlementForm, setShowSettlementForm] = useState(false);
  const [settlementForm, setSettlementForm] = useState({ amount: '', note: '', type: 'Partial Payment' });

  const settings = getSystemSettings();

  const activeTenant = tenants.find(t => t.id === selectedTenantId) || tenants[0] || null;
  const filteredTenants = tenants.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.unit?.toLowerCase().includes(searchTerm.toLowerCase()));

  // Switch dynamic admin selection method parameters on tenant changes
  useEffect(() => {
    if (activeTenant && activeTenant.preferredMethod) {
      setPaymentMethod(activeTenant.preferredMethod);
    } else {
      setPaymentMethod('Cash');
    }
  }, [selectedTenantId, activeTenant]);

  const calculateTotal = () => {
    if (!activeTenant) return 0;
    return isExtendedRent 
      ? Number(extendedAmount) + Number(customAddOns)
      : (activeTenant.outstandingBalance || 0) + Number(customAddOns);
  };
  const totalDue = calculateTotal();
  const change = amountTendered ? Math.max(0, Number(amountTendered) - totalDue) : 0;

  // Summaries
  const totalCollected = tenants.reduce((sum, t) => sum + t.history.filter(h => h.status === 'paid').reduce((s, h) => s + h.amount, 0), 0);
  const overdueCount = tenants.filter(t => t.status === 'overdue').length;
  const pendingCount = tenants.filter(t => t.status === 'pending' || t.status === 'pending-verification').length;
  const totalOutstanding = tenants.filter(t => t.status !== 'paid').reduce((sum, t) => sum + (t.outstandingBalance || (t.billing.baseRent + t.billing.water + t.billing.electricity + t.billing.parking)), 0);

  // Outstanding Balance Aging
  const agingData = useMemo(() => {
    const now = new Date();
    const result = { current: 0, days15: 0, days30: 0, days60plus: 0 };
    tenants.forEach(t => {
      if (t.status === 'paid') return;
      const daysOverdue = t.dueDate ? Math.max(0, Math.ceil((now - new Date(t.dueDate)) / (1000 * 60 * 60 * 24))) : 0;
      const balance = t.outstandingBalance || (t.billing.baseRent + t.billing.water + t.billing.electricity + t.billing.parking);
      if (daysOverdue <= 0) result.current += balance;
      else if (daysOverdue <= 15) result.days15 += balance;
      else if (daysOverdue <= 30) result.days30 += balance;
      else result.days60plus += balance;
    });
    return result;
  }, [tenants]);

  const monthlyTarget = tenants.reduce((sum, t) => sum + (t.billing.baseRent + t.billing.water + t.billing.electricity + t.billing.parking), 0);
  const monthlyCollected = tenants.filter(t => t.status === 'paid').reduce((sum, t) => sum + (t.billing.baseRent + t.billing.water + t.billing.electricity + t.billing.parking), 0);
  const collectionPct = monthlyTarget > 0 ? Math.round((monthlyCollected / monthlyTarget) * 100) : 0;

  const handleAddSettlement = () => {
    if (!settlementForm.amount || Number(settlementForm.amount) <= 0) return;
    const amt = Number(settlementForm.amount);
    const newBalance = Math.max(0, (activeTenant.outstandingBalance || totalDue) - amt);
    const settlement = {
      id: `STL-${String(Math.floor(100 + Math.random() * 900))}`,
      date: new Date().toISOString().slice(0, 10),
      type: settlementForm.type,
      amount: amt,
      remaining: newBalance,
      note: settlementForm.note,
      status: newBalance === 0 ? 'settled' : 'partial'
    };
    setTenants(prev => prev.map(t => t.id === selectedTenantId ? {
      ...t,
      settlements: [settlement, ...(t.settlements || [])],
      outstandingBalance: newBalance,
      status: newBalance === 0 ? 'paid' : t.status
    } : t));
    setSettlementForm({ amount: '', note: '', type: 'Partial Payment' });
    setShowSettlementForm(false);
  };

  const getDaysUntilDue = (dueDateStr) => {
    if (!dueDateStr) return null;
    const due = new Date(dueDateStr);
    const today = new Date();
    today.setHours(0,0,0,0);
    return Math.ceil((due - today) / (1000 * 60 * 60 * 24));
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

  const handleMarkAsPaid = async () => {
    if (!activeTenant || !activeTenant.pendingInvoiceId) return;
    try {
      const res = await api.post('/record_payment_admin.php', {
        invoiceId: activeTenant.pendingInvoiceId,
        paymentMethod: paymentMethod
      });
      if (res.data.success) {
        fetchInvoices();
        setIsExtendedRent(false); setExtendedAmount(0); setCustomAddOns(0); setAmountTendered('');
        setShowConfirmModal(false);
      } else {
        alert(res.data.message);
      }
    } catch(err) {
      console.error(err);
    }
  };

  const handleGenerateReceipt = (record = null) => {
    if (!activeTenant) return;
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (record) {
      setReceiptData({ rctId: record.id, date: record.datePaid, tenant: activeTenant.name, unit: activeTenant.unit, period: record.period, amount: record.amount, breakdown: record.breakdown, status: record.status.toUpperCase(), method: record.method });
    } else {
      setReceiptData({ rctId: 'RCT-DRAFT', date: today, tenant: activeTenant.name, unit: activeTenant.unit, period: billingPeriod, amount: totalDue, breakdown: `Rent: ${activeTenant.billing.baseRent}`, status: 'UNPAID', method: paymentMethod });
    }
    setShowReceipt(true);
  };

  const handleDeleteHistory = (recordId) => {
    if (window.confirm('Are you sure you want to delete this payment record?')) {
      setTenants(prev => prev.map(t => t.id === selectedTenantId ? { ...t, history: t.history.filter(h => h.id !== recordId) } : t));
    }
  };

  const handleEditHistoryClick = (record) => {
    setHistoryForm({ ...record });
    setShowEditHistoryModal(true);
  };

  const handleAddAdHocClick = () => {
    setHistoryForm({ 
      id: `RCT-${Math.floor(1000 + Math.random() * 9000)}`, 
      period: '', 
      amount: '', 
      method: 'Cash', 
      breakdown: '', 
      datePaid: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), 
      status: 'paid' 
    });
    setShowEditHistoryModal(true);
  };

  const handleSaveHistory = () => {
    setTenants(prev => prev.map(t => {
      if (t.id === selectedTenantId) {
        const existing = t.history.find(h => h.id === historyForm.id);
        if (existing) {
          return { ...t, history: t.history.map(h => h.id === historyForm.id ? { ...h, ...historyForm, amount: Number(historyForm.amount) } : h) };
        } else {
          return { ...t, history: [{ ...historyForm, amount: Number(historyForm.amount) }, ...t.history] };
        }
      }
      return t;
    }));
    setShowEditHistoryModal(false);
  };

  const filteredHistory = useMemo(() => {
    if (!activeTenant) return [];
    return activeTenant.history.filter(h => h.period?.toLowerCase().includes(historySearchPeriod.toLowerCase()));
  }, [activeTenant, historySearchPeriod]);

  const historyPageCount = Math.ceil(filteredHistory.length / recordsPerPage);
  const paginatedHistory = filteredHistory.slice((historyPage - 1) * recordsPerPage, historyPage * recordsPerPage);

  const activeDaysDue = activeTenant ? getDaysUntilDue(activeTenant.dueDate) : null;
  const showBanner = activeTenant ? (activeTenant.status === 'overdue' || (activeTenant.status === 'pending' && activeDaysDue !== null && activeDaysDue <= 5) || activeTenant.status === 'pending-verification') : false;

  // SAFETY GUARD CLAUSE: Stops render tree compilation if async requests haven't completed
  if (loading || !activeTenant) {
    return (
      <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
        <Sidebar />
        <main className="flex-1 flex flex-col h-screen overflow-hidden text-left bg-slate-50">
          <Header title="Payment Management" />
          <div className="flex-1 flex items-center justify-center p-6 md:p-8">
             <p className="text-slate-400 text-sm font-semibold animate-pulse">Loading active tenant ledger parameters safely...</p>
          </div>
        </main>
      </div>
    );
  }

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
                    const fallbackTotal = t.billing.baseRent + t.billing.water + t.billing.electricity + t.billing.parking;
                    const tenantTotalDue = t.outstandingBalance > 0 ? t.outstandingBalance : fallbackTotal;
                    return (
                      <div key={t.id} onClick={() => {setSelectedTenantId(t.id); setHistoryPage(1);}} className={`flex items-center justify-between p-4 border-b border-slate-100 cursor-pointer ${selectedTenantId === t.id ? 'bg-indigo-50 border-l-4 border-l-indigo-600' : 'hover:bg-slate-50'}`}>
                        <div>
                          <p className="text-sm font-bold text-slate-800 m-0 flex items-center gap-2">
                            {t.name}
                            {t.status === 'overdue' && <FontAwesomeIcon icon={faCircle} className="text-[8px] text-red-500 animate-pulse" />}
                            {t.status === 'pending-verification' && <FontAwesomeIcon icon={faCircle} className="text-[8px] text-indigo-500 animate-pulse" />}
                            {isDueSoon && t.status !== 'pending-verification' && <FontAwesomeIcon icon={faCircle} className="text-[8px] text-amber-500" />}
                          </p>
                          <p className="text-[11px] text-slate-500 m-0 mt-0.5">Unit {t.unit} · Due {t.dueDate}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-slate-700 m-0 mb-1">{t.status !== 'paid' ? formatCurrency(tenantTotalDue) : '₱0'}</p>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold text-center uppercase min-w-[75px] block ${
                            t.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 
                            t.status === 'pending-verification' ? 'bg-indigo-100 text-indigo-800' : 'bg-red-100 text-red-800'
                          }`}>{t.status === 'pending-verification' ? 'VERIFY' : t.status}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Main Detail Area */}
              <div className="lg:col-span-8 flex flex-col gap-6">
                
                {/* Dynamic Status Notification Banner */}
                {showBanner && (
                  <div className={`p-3 rounded-lg border flex items-center gap-3 text-sm font-semibold ${
                    activeTenant.status === 'pending-verification' ? 'bg-indigo-50 border-indigo-200 text-indigo-800' :
                    activeTenant.status === 'overdue' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'
                  }`}>
                    <FontAwesomeIcon icon={faExclamationTriangle} />
                    {activeTenant.status === 'pending-verification' 
                      ? "This tenant has uploaded proof of payment. Please verify the details below before processing."
                      : activeTenant.status === 'overdue'
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
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleUpdateTenantField('depositStatus', activeTenant.depositStatus === 'Paid' ? 'Pending' : 'Paid')}>
                      <p className="text-[10px] uppercase text-slate-400 font-semibold mb-1 m-0">Deposit</p>
                      <p className={`text-sm font-medium m-0 mt-0.5 ${activeTenant.depositStatus === 'Paid' ? 'text-emerald-600' : 'text-amber-600'}`}>{activeTenant.depositStatus}</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => handleUpdateTenantField('advanceStatus', activeTenant.advanceStatus === 'Paid' ? 'Pending' : 'Paid')}>
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
                        <p className="m-0">Prorated rent is applied when a tenant moves in midway through a cycle.</p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-end justify-between border-t border-slate-100 pt-4 mb-6">
                    <div className="w-1/3 space-y-3">
                      {isExtendedRent && (
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Prorated Base Rent</label>
                          <input type="number" value={extendedAmount} onChange={e => setExtendedAmount(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500 text-slate-800 bg-white" placeholder="0" />
                        </div>
                      )}
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Custom Add-ons</label>
                        <input type="number" value={customAddOns} onChange={e => setCustomAddOns(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500 text-slate-800 bg-white" placeholder="0" />
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <div className="mb-3 text-xs text-slate-500 space-y-1">
                        <div className="flex justify-end gap-4"><span className="w-32 text-right">Base Rent:</span> <span className="w-20 text-right font-semibold text-slate-700">{formatCurrency(activeTenant.billing.baseRent)}</span></div>
                        {activeTenant.billing.securityDeposit > 0 && <div className="flex justify-end gap-4"><span className="w-32 text-right">Security Deposit:</span> <span className="w-20 text-right font-semibold text-slate-700">{formatCurrency(activeTenant.billing.securityDeposit)}</span></div>}
                        {activeTenant.billing.water > 0 && <div className="flex justify-end gap-4"><span className="w-32 text-right">Water:</span> <span className="w-20 text-right font-semibold text-slate-700">{formatCurrency(activeTenant.billing.water)}</span></div>}
                        {activeTenant.billing.electricity > 0 && <div className="flex justify-end gap-4"><span className="w-32 text-right">Electricity:</span> <span className="w-20 text-right font-semibold text-slate-700">{formatCurrency(activeTenant.billing.electricity)}</span></div>}
                        {activeTenant.billing.parking > 0 && <div className="flex justify-end gap-4"><span className="w-32 text-right">Parking:</span> <span className="w-20 text-right font-semibold text-slate-700">{formatCurrency(activeTenant.billing.parking)}</span></div>}
                        {Number(customAddOns) > 0 && <div className="flex justify-end gap-4"><span className="w-32 text-right">Add-ons:</span> <span className="w-20 text-right font-semibold text-slate-700">{formatCurrency(customAddOns)}</span></div>}
                        <div className="border-t border-slate-200 my-1 ml-auto w-56"></div>
                      </div>
                      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1 m-0">Total Due</p>
                      <p className="text-3xl font-bold text-indigo-600 m-0 mt-0.5">{formatCurrency(totalDue)}</p>
                    </div>
                  </div>

                  {/* Payment Recording Area */}
                  {totalDue > 0 && activeTenant.status !== 'paid' && (
                    <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 mb-6">
                      <h4 className="text-sm font-bold text-slate-800 mb-3 m-0">Record Payment</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
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
                          <input type="number" value={amountTendered} onChange={e => setAmountTendered(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500 text-slate-800 bg-white" placeholder="0" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Change</label>
                          <div className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-100 text-slate-700 font-semibold">{formatCurrency(change)}</div>
                        </div>
                      </div>
                      
                      {activeTenant.status === 'pending-verification' && (
                        <div className="mt-2 p-4 bg-indigo-50 border border-indigo-100 rounded-xl space-y-3">
                          <h5 className="text-xs font-bold text-indigo-900 uppercase tracking-wider m-0 flex items-center gap-1.5">
                            <FontAwesomeIcon icon={faInfoCircle} /> E-Receipt Metadata Verification
                          </h5>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-indigo-950 font-medium">
                             <div><span className="text-indigo-500 font-bold mr-1">Sender Profile Name:</span> {activeTenant.senderName || 'Not Captured'}</div>
                             <div><span className="text-indigo-500 font-bold mr-1">Network Reference No:</span> <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-indigo-200/60 font-bold text-slate-800">{activeTenant.paymentReference || '—'}</span></div>
                          </div>
                          {activeTenant.proofOfPaymentPath && (
                            <div className="pt-1.5">
                              <a 
                                href={`http://localhost/ApartmentManagementSystem_React/backend/${activeTenant.proofOfPaymentPath}`} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="inline-flex items-center gap-1.5 bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all no-underline shadow-sm"
                              >
                                <FontAwesomeIcon icon={faFileAlt} /> View Uploaded Receipt Document Asset
                              </a>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button 
                      onClick={handleConfirmPayment} 
                      disabled={totalDue <= 0 || activeTenant.status === 'paid' || (paymentMethod === 'Cash' && (!amountTendered || Number(amountTendered) < totalDue))} 
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors border-0 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                    >
                      <FontAwesomeIcon icon={faCheckCircle} /> Clear & Process Payment
                    </button>
                    <button onClick={() => handleGenerateReceipt()} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 border-solid cursor-pointer transition-colors"><FontAwesomeIcon icon={faPrint} /> View Draft Receipt</button>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex-1">
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 m-0"><FontAwesomeIcon icon={faHistory} className="text-slate-400" /> Payment History</h3>
                      <button onClick={handleAddAdHocClick} className="flex items-center gap-1.5 px-2 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded text-xs font-semibold border-0 cursor-pointer transition-colors"><FontAwesomeIcon icon={faPlus} /> Add Past Payment</button>
                    </div>
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 focus-within:border-indigo-400 transition-colors">
                      <FontAwesomeIcon icon={faSearch} className="text-slate-400 text-xs" />
                      <input type="text" placeholder="Filter period..." value={historySearchPeriod} onChange={e => {setHistorySearchPeriod(e.target.value); setHistoryPage(1);}} className="bg-transparent text-xs outline-none border-0 p-0 text-slate-700 w-24 bg-slate-50" />
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
                          <th className="py-2 px-3 text-right">Actions</th>
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
                            <td className="py-3 px-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => handleEditHistoryClick(record)} className="text-slate-500 hover:text-indigo-600 border-0 bg-transparent cursor-pointer p-1 transition-colors"><FontAwesomeIcon icon={faEdit} /></button>
                                <button onClick={() => handleDeleteHistory(record.id)} className="text-slate-500 hover:text-red-600 border-0 bg-transparent cursor-pointer p-1 transition-colors"><FontAwesomeIcon icon={faTrash} /></button>
                              </div>
                            </td>
                          </tr>
                        )) : (
                          <tr><td colSpan="7" className="py-4 text-center text-slate-500 text-sm">No records found.</td></tr>
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

            {/* ─── PAYMENT TRACKING DASHBOARD ─── */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 m-0 flex items-center gap-2">
                  <FontAwesomeIcon icon={faChartBar} className="text-indigo-600" />
                  Payment Tracking Dashboard
                </h3>
              </div>
              <div className="p-6 space-y-6">

                {/* Monthly Collection Progress */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Monthly Collection Progress</span>
                    <span className="text-xs font-bold text-indigo-600">{collectionPct}%</span>
                  </div>
                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${collectionPct >= 80 ? 'bg-emerald-500' : collectionPct >= 50 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${collectionPct}%` }}></div>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                    <span>Collected: {formatCurrency(monthlyCollected)}</span>
                    <span>Target: {formatCurrency(monthlyTarget)}</span>
                  </div>
                </div>

                {/* Outstanding Balance Aging */}
                <div>
                  <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3 m-0">Outstanding Balance Aging</h4>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-center">
                      <p className="text-sm lg:text-base font-bold text-emerald-700 m-0">{formatCurrency(agingData.current)}</p>
                      <p className="text-[10px] text-emerald-600 font-semibold m-0 mt-0.5">Current</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-center">
                      <p className="text-sm lg:text-base font-bold text-amber-700 m-0">{formatCurrency(agingData.days15)}</p>
                      <p className="text-[10px] text-amber-600 font-semibold m-0 mt-0.5">1–15 Days</p>
                    </div>
                    <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 text-center">
                      <p className="text-sm lg:text-base font-bold text-orange-700 m-0">{formatCurrency(agingData.days30)}</p>
                      <p className="text-[10px] text-orange-600 font-semibold m-0 mt-0.5">16–30 Days</p>
                    </div>
                    <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-center">
                      <p className="text-sm lg:text-base font-bold text-red-700 m-0">{formatCurrency(agingData.days60plus)}</p>
                      <p className="text-[10px] text-red-600 font-semibold m-0 mt-0.5">60+ Days</p>
                    </div>
                  </div>
                  {/* Aging visual bar */}
                  {totalOutstanding > 0 && (
                    <div className="flex h-2 rounded-full overflow-hidden mt-3">
                      <div className="bg-emerald-400" style={{ width: `${(agingData.current / totalOutstanding) * 100}%` }}></div>
                      <div className="bg-amber-400" style={{ width: `${(agingData.days15 / totalOutstanding) * 100}%` }}></div>
                      <div className="bg-orange-400" style={{ width: `${(agingData.days30 / totalOutstanding) * 100}%` }}></div>
                      <div className="bg-red-400" style={{ width: `${(agingData.days60plus / totalOutstanding) * 100}%` }}></div>
                    </div>
                  )}
                </div>

                {/* Per-Tenant Payment Status */}
                <div>
                  <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3 m-0">Per-Tenant Payment Status</h4>
                  <div className="space-y-2">
                    {tenants.map(t => {
                      const paidCount = t.history.filter(h => h.status === 'paid').length;
                      return (
                        <div key={t.id} className="flex items-center gap-3 p-2 rounded-lg bg-slate-50 border border-slate-100">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">{t.name.charAt(0)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium text-slate-700 truncate">{t.name} · Unit {t.unit}</span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                t.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 
                                t.status === 'pending-verification' ? 'bg-indigo-100 text-indigo-800' : 'bg-red-100 text-red-800'
                              }`}>{t.status.toUpperCase()}</span>
                            </div>
                            <div className="flex justify-between mt-0.5">
                              <span className="text-[9px] text-slate-400">{paidCount} payments recorded</span>
                              {(t.outstandingBalance || 0) > 0 && <span className="text-[9px] text-red-500 font-semibold">Balance: {formatCurrency(t.outstandingBalance)}</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* ─── PAYMENT SETTLEMENT TRACKING ─── */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 m-0 flex items-center gap-2">
                  <FontAwesomeIcon icon={faHandshake} className="text-violet-600" />
                  Settlement Tracking — {activeTenant.name}
                </h3>
                <button onClick={() => setShowSettlementForm(!showSettlementForm)} className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 text-violet-700 hover:bg-violet-100 rounded-lg text-xs font-semibold border-0 cursor-pointer transition-colors">
                  <FontAwesomeIcon icon={faPlus} /> Record Settlement
                </button>
              </div>
              <div className="p-6 space-y-4">
                {/* Outstanding Balance Monitor */}
                <div className={`rounded-xl p-4 border flex items-center justify-between ${(activeTenant.outstandingBalance || 0) > 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                  <div className="flex items-center gap-3">
                    <FontAwesomeIcon icon={faBalanceScale} className={(activeTenant.outstandingBalance || 0) > 0 ? 'text-red-500 text-xl' : 'text-emerald-500 text-xl'} />
                    <div>
                      <p className="text-sm font-bold text-slate-800 m-0">Outstanding Balance</p>
                      <p className="text-[11px] text-slate-500 m-0 mt-0.5">{activeTenant.name} · Unit {activeTenant.unit}</p>
                    </div>
                  </div>
                  <p className={`text-2xl font-bold m-0 ${(activeTenant.outstandingBalance || 0) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {formatCurrency(activeTenant.outstandingBalance || 0)}
                  </p>
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
              <p className="text-sm text-slate-600 mb-4">Are you sure you want to process this payment? This action will generate an official receipt record row.</p>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-sm space-y-2 mb-6">
                <div className="flex justify-between"><span className="text-slate-500">Tenant</span><span className="font-semibold text-slate-800">{activeTenant.name}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Period</span><span className="font-semibold text-slate-800">{billingPeriod}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Amount</span><span className="font-bold text-emerald-600">{formatCurrency(totalDue)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Method</span><span className="font-semibold text-slate-800">{paymentMethod}</span></div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleMarkAsPaid} className="flex-1 py-2 bg-indigo-600 text-white rounded text-sm font-semibold hover:bg-indigo-700 border-0 cursor-pointer transition-colors">Confirm Approval</button>
                <button onClick={() => setShowConfirmModal(false)} className="flex-1 py-2 bg-white border border-slate-300 text-slate-700 rounded text-sm font-semibold hover:bg-slate-50 border-solid cursor-pointer transition-colors">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPayments;