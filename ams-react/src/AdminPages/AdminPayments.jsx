import { useState, useMemo, useEffect } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSearch, faCheckCircle, faPrint, faCalendarAlt,
  faDollarSign, faFileAlt, faExclamationTriangle, faTimes, faHistory, faMoneyBillWave, faInfoCircle, faCircle,
  faTrash, faChartBar, faBalanceScale, faShieldAlt, faEye, faExternalLinkAlt,
  faBell
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import fileUrl from '../api/fileUrl';

const formatCurrency = (n) => `₱${Number(n).toLocaleString()}`;

const getBackendAssetUrl = (path) => (path ? fileUrl(path.replace(/^\//, '')) : '');

const AdminPayments = () => {
  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOption, setSortOption] = useState('name-asc');
  const [statusFilter, setStatusFilter] = useState('all');
  const [contracts, setContracts] = useState([]);
  const [activeTab, setActiveTab] = useState('billing');
  const [loading, setLoading] = useState(true);
  const [previewProof, setPreviewProof] = useState(null);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [batchSending, setBatchSending] = useState(false);
  
  const handleSendReminder = async (invoiceId) => {
    if (!invoiceId) return;
    setSendingReminder(true);
    try {
      const res = await api.post('/send_payment_reminder.php', { invoice_id: invoiceId });
      if (res.data.success) {
        alert(res.data.message || 'Payment reminder sent successfully!');
        fetchInvoices();
      } else {
        alert(res.data.message || 'Failed to send reminder.');
      }
    } catch (err) {
      console.error('Failed to send reminder:', err);
      alert(err.response?.data?.message || 'Error sending payment reminder.');
    } finally {
      setSendingReminder(false);
    }
  };

  const handleBatchReminders = async () => {
    if (!window.confirm('Send in-app due date reminders to all tenants with pending or overdue bills?')) return;
    setBatchSending(true);
    try {
      const res = await api.post('/send_payment_reminder.php', { all: true });
      if (res.data.success) {
        alert(res.data.message || 'Batch reminders dispatched successfully!');
        fetchInvoices();
      } else {
        alert(res.data.message || 'Failed to send batch reminders.');
      }
    } catch (err) {
      console.error('Batch reminders error:', err);
      alert(err.response?.data?.message || 'Error sending batch reminders.');
    } finally {
      setBatchSending(false);
    }
  };

  const loadInvoices = async () => {
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
              billing: { baseRent: 0, water: 0, electricity: 0, parking: 0, services: 0, maintenance: 0, addOns: 0 },
              history: [],
              outstandingBalance: 0,
              pendingInvoiceId: null,
              lastReminderDate: inv.last_reminder_date || null,
              reminderCount: inv.reminder_count || 0
            };
          }
          
          const t = grouped[inv.user_id];
          
          if (inv.status === 'pending' || inv.status === 'overdue' || inv.status === 'pending-verification' || inv.status === 'scheduled' || inv.status === 'processing' || inv.status === 'payment-failed') {
            t.status = inv.status;
            t.dueDate = inv.due_date;
            t.scheduledDate = inv.scheduled_date;
            t.scheduledTimeSlot = inv.scheduled_time_slot;
            t.billingPeriod = inv.billing_period;
            t.lastReminderDate = inv.last_reminder_date;
            t.reminderCount = inv.reminder_count;
            t.billing.baseRent = parseFloat(inv.base_rent || 0);
            t.billing.water = parseFloat(inv.water || 0);
            t.billing.electricity = parseFloat(inv.electricity || 0);
            t.billing.parking = parseFloat(inv.parking || 0);
            t.billing.services = parseFloat(inv.services || 0);
            t.billing.maintenance = parseFloat(inv.maintenance || 0);
            t.billing.securityDeposit = parseFloat(inv.security_deposit || 0);
            t.billing.lateFee = parseFloat(inv.late_fee || 0);
            t.outstandingBalance += parseFloat(inv.total_amount || 0);
            t.pendingInvoiceId = inv.id;
            if (inv.proof_of_payment_path) t.proofOfPaymentPath = inv.proof_of_payment_path;
            if (inv.payment_reference) t.paymentReference = inv.payment_reference;
            if (inv.sender_name) t.senderName = inv.sender_name;
            if (inv.payment_gateway) t.paymentGateway = inv.payment_gateway;
            if (inv.payment_method) {
               t.preferredMethod = inv.payment_method;
            }
          } else if (inv.status === 'paid') {
            const methodDisplay = inv.payment_method || (inv.payment_gateway?.includes('paymongo') ? 'PayMongo (Sandbox)' : 'Cash');
            t.history.push({
              id: inv.id, 
              period: inv.billing_period, 
              breakdown: `Total: ${inv.total_amount}`,
              amount: parseFloat(inv.total_amount || 0), 
              datePaid: inv.paid_at, 
              status: 'paid', 
              method: methodDisplay,
              gateway: inv.payment_gateway,
              proofOfPaymentPath: inv.proof_of_payment_path,
              paymentReference: inv.payment_reference,
              senderName: inv.sender_name
            });
            if (!t.proofOfPaymentPath && inv.proof_of_payment_path) {
              t.proofOfPaymentPath = inv.proof_of_payment_path;
              if (inv.payment_reference) t.paymentReference = inv.payment_reference;
              if (inv.sender_name) t.senderName = inv.sender_name;
            }
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

  const fetchInvoices = () => {
    setLoading(true);
    return loadInvoices();
  };

  const fetchContracts = async () => {
    try {
      const res = await api.get('/get_contracts.php');
      if (res.data.success) {
        setContracts(res.data.contracts || []);
      }
    } catch (err) {
      console.error("Error fetching contracts for security deposit ledger:", err);
    }
  };

  useEffect(() => {
    // Reminders and overdue alerts run from the daily sweep (run_notification_sweep()
    // in config.php); this page no longer triggers them on every visit.
    const load = async () => { await Promise.all([loadInvoices(), fetchContracts()]); };
    load();
  }, []);
  
  const [billingPeriod, setBillingPeriod] = useState('July 2026');
  const [isExtendedRent, setIsExtendedRent] = useState(false);
  const [extendedAmount, setExtendedAmount] = useState(0);
  const [customAddOns, setCustomAddOns] = useState(0);

  // Payment Recording States
  const [methodChoice, setMethodChoice] = useState({ tenant: null, method: 'Cash' });
  const [amountTendered, setAmountTendered] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // History Table States
  const [historySearchPeriod, setHistorySearchPeriod] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const recordsPerPage = 5;

  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState(null);



  const activeTenant = tenants.find(t => t.id === selectedTenantId) || tenants[0] || null;
  const filteredTenants = useMemo(() => {
    const filtered = tenants.filter(t => {
      const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            t.unit?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || 
                            (statusFilter === 'unpaid' && t.status !== 'paid') ||
                            (statusFilter === 'paid' && t.status === 'paid') ||
                            (statusFilter === 'pending-verification' && t.status === 'pending-verification') ||
                            (statusFilter === 'scheduled' && t.status === 'scheduled') ||
                            (statusFilter === 'processing' && t.status === 'processing') ||
                            (statusFilter === 'payment-failed' && t.status === 'payment-failed') ||
                            (statusFilter === 'overdue' && t.status === 'overdue');
      return matchesSearch && matchesStatus;
    });
    return filtered.sort((a, b) => {
      if (sortOption === 'name-asc') {
        return a.name.localeCompare(b.name);
      } else if (sortOption === 'name-desc') {
        return b.name.localeCompare(a.name);
      } else if (sortOption === 'due-asc') {
        const valA = a.dueDate || '';
        const valB = b.dueDate || '';
        return valA.localeCompare(valB);
      } else if (sortOption === 'due-desc') {
        const valA = a.dueDate || '';
        const valB = b.dueDate || '';
        return valB.localeCompare(valA);
      }
      return 0;
    });
  }, [tenants, searchTerm, sortOption, statusFilter]);

  // The method defaults to the selected tenant's preferred one; a manual choice only
  // sticks while that same tenant record is selected.
  const paymentMethod = methodChoice.tenant === activeTenant ? methodChoice.method : (activeTenant?.preferredMethod || 'Cash');
  const setPaymentMethod = (method) => setMethodChoice({ tenant: activeTenant, method });

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
  const overdueCount = tenants.filter(t => t.status === 'overdue' || t.status === 'payment-failed').length;
  const pendingCount = tenants.filter(t => t.status === 'pending' || t.status === 'pending-verification' || t.status === 'scheduled' || t.status === 'processing').length;
  const totalOutstanding = tenants.filter(t => t.status !== 'paid').reduce((sum, t) => sum + (t.outstandingBalance || (t.billing.baseRent + t.billing.water + t.billing.electricity + t.billing.parking + t.billing.services + t.billing.maintenance)), 0);

  // Security Deposit Tracking summaries (Non-refundable)
  const totalDepositsHeld = contracts.filter(c => c.deposit_status === 'Held').reduce((sum, c) => sum + parseFloat(c.deposit_amount || 0), 0);
  const totalDepositDeductions = contracts.reduce((sum, c) => sum + parseFloat(c.damage_deduction || 0) + parseFloat(c.utility_deduction || 0), 0);
  const totalAppliedToRent = contracts.filter(c => c.status === 'expired').reduce((sum, c) => {
    const dep = parseFloat(c.deposit_amount || 0);
    const dmg = parseFloat(c.damage_deduction || 0);
    const utl = parseFloat(c.utility_deduction || 0);
    return sum + Math.max(0, dep - dmg - utl);
  }, 0);

  // Outstanding Balance Aging
  const agingData = useMemo(() => {
    const now = new Date();
    const result = { current: 0, days15: 0, days30: 0, days60plus: 0 };
    tenants.forEach(t => {
      if (t.status === 'paid') return;
      const daysOverdue = t.dueDate ? Math.max(0, Math.ceil((now - new Date(t.dueDate)) / (1000 * 60 * 60 * 24))) : 0;
      const balance = t.outstandingBalance || (t.billing.baseRent + t.billing.water + t.billing.electricity + t.billing.parking + t.billing.services + t.billing.maintenance);
      if (daysOverdue <= 0) result.current += balance;
      else if (daysOverdue <= 15) result.days15 += balance;
      else if (daysOverdue <= 30) result.days30 += balance;
      else result.days60plus += balance;
    });
    return result;
  }, [tenants]);

  // Security deposit and late fee are part of what is actually invoiced, so
  // leaving them out measured collection against a smaller base than the
  // amounts tenants were billed — overstating the collection rate on any
  // move-in or overdue invoice.
  const billedTotal = (t) => t.billing.baseRent + t.billing.water + t.billing.electricity + t.billing.parking + t.billing.services + t.billing.maintenance + (t.billing.securityDeposit || 0) + (t.billing.lateFee || 0);
  const monthlyTarget = tenants.reduce((sum, t) => sum + billedTotal(t), 0);
  const monthlyCollected = tenants.filter(t => t.status === 'paid').reduce((sum, t) => sum + billedTotal(t), 0);
  const collectionPct = monthlyTarget > 0 ? Math.round((monthlyCollected / monthlyTarget) * 100) : 0;

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
        paymentMethod: paymentMethod,
        // The amount tendered and reference were previously collected in this
        // form and then thrown away, so nothing about the payment itself was
        // recorded beyond the method.
        amountPaid: amountTendered !== '' ? Number(amountTendered) : undefined,
        paymentReference: paymentReference || undefined
      });
      
      // Safely check if the response is successful
      if (res.data && res.data.success) {
        fetchInvoices();
        setIsExtendedRent(false); 
        setExtendedAmount(0); 
        setCustomAddOns(0);
        setAmountTendered('');
        setPaymentReference('');
        setShowConfirmModal(false);
      } else {
        // If it's a string (HTML error) or missing the message property, alert a safe fallback
        console.error("Server returned an error format:", res.data);
        alert(res.data?.message || "Server Error. Check the browser console for details.");
      }
    } catch(err) {
      console.error("Network or API Error:", err);
      // Safely chain into the error response
      alert(err.response?.data?.message || "A network or server error occurred.");
    }
  };

  const handleRejectProof = async () => {
    if (!activeTenant || !activeTenant.pendingInvoiceId) return;
    const reason = window.prompt("Why is this payment proof being rejected? The tenant will see this message.");
    if (!reason || !reason.trim()) return;

    try {
      const res = await api.post('/reject_payment_proof.php', {
        invoiceId: activeTenant.pendingInvoiceId,
        reason: reason.trim()
      });
      if (res.data && res.data.success) {
        fetchInvoices();
      } else {
        alert(res.data?.message || "Failed to reject payment proof.");
      }
    } catch (err) {
      console.error("Reject proof error:", err);
      alert(err.response?.data?.message || "A network or server error occurred.");
    }
  };

  const handleGenerateReceipt = (record = null) => {
    if (!activeTenant) return;
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (record) {
      setReceiptData({ rctId: record.id, date: record.datePaid, tenant: activeTenant.name, unit: activeTenant.unit, period: record.period, amount: record.amount, breakdown: record.breakdown, status: record.status.toUpperCase(), method: record.method, gateway: record.gateway });
    } else {
      setReceiptData({ rctId: 'RCT-DRAFT', date: today, tenant: activeTenant.name, unit: activeTenant.unit, period: billingPeriod, amount: totalDue, breakdown: `Rent: ${activeTenant.billing.baseRent}`, status: 'UNPAID', method: paymentMethod, gateway: activeTenant.paymentGateway || 'Manual' });
    }
    setShowReceipt(true);
  };

  const handleDeleteHistory = (recordId) => {
    if (window.confirm('Are you sure you want to delete this payment record?')) {
      setTenants(prev => prev.map(t => t.id === selectedTenantId ? { ...t, history: t.history.filter(h => h.id !== recordId) } : t));
    }
  };

  const filteredHistory = useMemo(() => {
    if (!activeTenant) return [];
    return activeTenant.history.filter(h => h.period?.toLowerCase().includes(historySearchPeriod.toLowerCase()));
  }, [activeTenant, historySearchPeriod]);

  const historyPageCount = Math.ceil(filteredHistory.length / recordsPerPage);
  const paginatedHistory = filteredHistory.slice((historyPage - 1) * recordsPerPage, historyPage * recordsPerPage);

  const activeDaysDue = activeTenant ? getDaysUntilDue(activeTenant.dueDate) : null;
  const showBanner = activeTenant ? (activeTenant.status === 'overdue' || activeTenant.status === 'payment-failed' || (activeTenant.status === 'pending' && activeDaysDue !== null && activeDaysDue <= 5) || activeTenant.status === 'pending-verification' || activeTenant.status === 'scheduled' || activeTenant.status === 'processing') : false;

  // SAFETY GUARD CLAUSE: Stops render tree compilation if async requests haven't completed
  if (loading) {
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

  if (!activeTenant) {
    return (
      <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
        <Sidebar />
        <main className="flex-1 flex flex-col h-screen overflow-hidden text-left bg-slate-50">
          <Header title="Payment Management" />
          <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-8 text-center bg-white border border-slate-200 rounded-xl m-6">
             <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-2xl mb-4">
               <FontAwesomeIcon icon={faInfoCircle} />
             </div>
             <h3 className="text-lg font-bold text-slate-800 m-0">No Active Tenant Ledgers</h3>
             <p className="text-slate-500 text-sm max-w-sm mt-2">There are currently no active tenant ledgers or invoices in the system. Create invoices or approve a tenant's rent application to view ledgers here.</p>
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
            
            {/* Due Date Indicator Bar with Batch Reminder Button */}
            {(dueWithin5DaysCount > 0 || overdueCount > 0) && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-xl text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-600 text-base" />
                  <span>
                    <strong>{overdueCount}</strong> overdue account(s) and <strong>{dueWithin5DaysCount}</strong> bill(s) due within 5 days.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleBatchReminders}
                  disabled={batchSending}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer border-0 shrink-0 self-start sm:self-auto disabled:opacity-50"
                >
                  <FontAwesomeIcon icon={faBell} />
                  {batchSending ? 'Sending Reminders...' : 'Send Due Reminders to All'}
                </button>
              </div>
            )}

            <div className="flex border-b border-slate-200 mb-2 gap-4">
              <button 
                onClick={() => setActiveTab('billing')}
                className={`pb-3 pt-1 text-sm font-bold border-b-2 transition-colors cursor-pointer bg-transparent outline-none ${activeTab === 'billing' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
              >
                <FontAwesomeIcon icon={faFileAlt} className="mr-2" />
                Tenant Billing & Payments
              </button>
              <button 
                onClick={() => setActiveTab('deposits')}
                className={`pb-3 pt-1 text-sm font-bold border-b-2 transition-colors cursor-pointer bg-transparent outline-none ${activeTab === 'deposits' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
              >
                <FontAwesomeIcon icon={faShieldAlt} className="mr-2" />
                Security Deposit Ledger
              </button>
            </div>

            {activeTab === 'billing' && (
            <>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Tenant Selector */}
              <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden h-[calc(100vh-18rem)] min-h-[500px]">
                <div className="p-4 border-b border-slate-200 bg-slate-50 space-y-2">
                  <h3 className="text-sm font-semibold text-slate-800 m-0">Select Tenant</h3>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1 flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus-within:border-indigo-500 transition-all">
                      <FontAwesomeIcon icon={faSearch} className="text-slate-400 text-xs" />
                      <input type="text" placeholder="Search tenant..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-transparent text-sm outline-none border-0 p-0 text-slate-800 bg-white" />
                    </div>
                    <div className="flex gap-2">
                      <select 
                        value={statusFilter} 
                        onChange={e => setStatusFilter(e.target.value)} 
                        className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 outline-none cursor-pointer focus:border-indigo-500 transition-all"
                      >
                        <option value="all">All</option>
                        <option value="unpaid">Unpaid</option>
                        <option value="paid">Paid</option>
                        <option value="pending-verification">Verify</option>
                        <option value="scheduled">Scheduled</option>
                        <option value="processing">Processing</option>
                        <option value="payment-failed">Failed</option>
                        <option value="overdue">Overdue</option>
                      </select>
                      <select 
                        value={sortOption} 
                        onChange={e => setSortOption(e.target.value)} 
                        className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 outline-none cursor-pointer focus:border-indigo-500 transition-all"
                      >
                        <option value="name-asc">Name ↑</option>
                        <option value="name-desc">Name ↓</option>
                        <option value="due-asc">Due ↑</option>
                        <option value="due-desc">Due ↓</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {filteredTenants.map(t => {
                    const days = getDaysUntilDue(t.dueDate);
                    const isDueSoon = t.status !== 'paid' && days !== null && days >= 0 && days <= 5;
                    const fallbackTotal = t.billing.baseRent + t.billing.water + t.billing.electricity + t.billing.parking + t.billing.services + t.billing.maintenance;
                    const tenantTotalDue = t.outstandingBalance > 0 ? t.outstandingBalance : fallbackTotal;
                    return (
                      <div key={t.id} onClick={() => {setSelectedTenantId(t.id); setHistoryPage(1);}} className={`flex items-center justify-between p-4 border-b border-slate-100 cursor-pointer ${selectedTenantId === t.id ? 'bg-indigo-50 border-l-4 border-l-indigo-600' : 'hover:bg-slate-50'}`}>
                        <div>
                          <p className="text-sm font-bold text-slate-800 m-0 flex items-center gap-2">
                            {t.name}
                            {t.status === 'overdue' && <FontAwesomeIcon icon={faCircle} className="text-[8px] text-red-500 animate-pulse" />}
                            {t.status === 'payment-failed' && <FontAwesomeIcon icon={faCircle} className="text-[8px] text-red-600 animate-pulse" />}
                            {t.status === 'pending-verification' && <FontAwesomeIcon icon={faCircle} className="text-[8px] text-indigo-500 animate-pulse" />}
                            {t.status === 'scheduled' && <FontAwesomeIcon icon={faCircle} className="text-[8px] text-blue-500" />}
                            {t.status === 'processing' && <FontAwesomeIcon icon={faCircle} className="text-[8px] text-amber-500 animate-pulse" />}
                            {isDueSoon && t.status !== 'pending-verification' && t.status !== 'scheduled' && t.status !== 'processing' && t.status !== 'payment-failed' && <FontAwesomeIcon icon={faCircle} className="text-[8px] text-amber-500" />}
                          </p>
                          <p className="text-[11px] text-slate-500 m-0 mt-0.5">Unit {t.unit} · Due {t.dueDate}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-slate-700 m-0 mb-1">{t.status !== 'paid' ? formatCurrency(tenantTotalDue) : '₱0'}</p>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold text-center uppercase min-w-[75px] block ${
                            t.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 
                            t.status === 'pending-verification' ? 'bg-indigo-100 text-indigo-800' : 
                            t.status === 'scheduled' ? 'bg-blue-100 text-blue-800' : 
                            t.status === 'processing' ? 'bg-amber-100 text-amber-800' :
                            'bg-red-100 text-red-800'
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
                    activeTenant.status === 'scheduled' ? 'bg-blue-50 border-blue-200 text-blue-800' :
                    activeTenant.status === 'processing' ? 'bg-amber-50 border-amber-200 text-amber-800' :
                    (activeTenant.status === 'overdue' || activeTenant.status === 'payment-failed') ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'
                  }`}>
                    <FontAwesomeIcon icon={faExclamationTriangle} />
                    {activeTenant.status === 'pending-verification' 
                      ? "This tenant has uploaded proof of payment. Please verify the details below before processing."
                      : activeTenant.status === 'scheduled'
                        ? `Tenant is scheduled for an in-person payment on ${activeTenant.scheduledDate}.`
                      : activeTenant.status === 'processing'
                        ? "Tenant is currently completing an online checkout session."
                      : activeTenant.status === 'payment-failed'
                        ? "The online payment attempt failed or was cancelled."
                        : activeTenant.status === 'overdue'
                        ? `This account is overdue. Due date was ${activeTenant.dueDate}.` 
                        : `Payment is due in ${activeDaysDue} days (${activeTenant.dueDate}).`}
                  </div>
                )}

                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
                    <div>
                      <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 m-0"><FontAwesomeIcon icon={faFileAlt} className="text-indigo-600" /> Billing Details</h3>
                      <p className="text-sm text-slate-500 m-0 mt-0.5">{activeTenant.name} · Unit {activeTenant.unit}</p>
                    </div>

                    {/* Due Date & Reminder Controls */}
                    {activeTenant.status !== 'paid' && activeTenant.pendingInvoiceId && (
                      <div className="flex items-center gap-2 flex-wrap">
                        {activeTenant.lastReminderDate ? (
                          <span className="text-[11px] text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md font-medium border border-slate-200">
                            Last Reminded: <strong className="text-slate-700">{new Date(activeTenant.lastReminderDate).toLocaleDateString()}</strong> {activeTenant.reminderCount > 1 ? `(${activeTenant.reminderCount}x)` : ''}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 bg-slate-50 px-2 py-1 rounded-md border border-slate-200">
                            No reminders sent yet
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleSendReminder(activeTenant.pendingInvoiceId)}
                          disabled={sendingReminder}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-200 cursor-pointer transition-colors disabled:opacity-50"
                        >
                          <FontAwesomeIcon icon={faBell} />
                          {sendingReminder ? 'Sending...' : 'Send Due Reminder'}
                        </button>
                      </div>
                    )}
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
                        {activeTenant.billing.services > 0 && <div className="flex justify-end gap-4"><span className="w-32 text-right">Add-On Services:</span> <span className="w-20 text-right font-semibold text-slate-700">{formatCurrency(activeTenant.billing.services)}</span></div>}
                        {activeTenant.billing.maintenance > 0 && <div className="flex justify-end gap-4"><span className="w-32 text-right">Maintenance Recharge:</span> <span className="w-20 text-right font-semibold text-slate-700">{formatCurrency(activeTenant.billing.maintenance)}</span></div>}
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

                      {paymentMethod !== 'Cash' && (
                        <div className="mt-3">
                          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Reference No.</label>
                          <input
                            type="text"
                            value={paymentReference}
                            onChange={e => setPaymentReference(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500 text-slate-800 bg-white"
                            placeholder={activeTenant.paymentReference || 'Transfer / transaction reference'}
                          />
                        </div>
                      )}
                      
                      {(activeTenant.status === 'pending-verification' || activeTenant.proofOfPaymentPath) && (
                        <div className="mt-2 p-4 bg-indigo-50 border border-indigo-100 rounded-xl space-y-3">
                          <div className="flex items-center justify-between">
                            <h5 className="text-xs font-bold text-indigo-900 uppercase tracking-wider m-0 flex items-center gap-1.5">
                              <FontAwesomeIcon icon={faInfoCircle} /> E-Receipt Metadata Verification
                            </h5>
                            {activeTenant.status === 'pending-verification' && (
                              <span className="text-[10px] bg-indigo-200/70 text-indigo-900 px-2 py-0.5 rounded-full font-bold">Verification Needed</span>
                            )}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-indigo-950 font-medium">
                             <div><span className="text-indigo-500 font-bold mr-1">Sender Profile Name:</span> {activeTenant.senderName || 'Not Captured'}</div>
                             <div><span className="text-indigo-500 font-bold mr-1">Network Reference No:</span> <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-indigo-200/60 font-bold text-slate-800">{activeTenant.paymentReference || '—'}</span></div>
                          </div>
                          {activeTenant.proofOfPaymentPath && (
                            <div className="pt-2 flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => setPreviewProof({
                                  url: getBackendAssetUrl(activeTenant.proofOfPaymentPath),
                                  title: `Proof of Payment — ${activeTenant.name} (${activeTenant.unit})`,
                                  reference: activeTenant.paymentReference,
                                  sender: activeTenant.senderName
                                })}
                                className="inline-flex items-center gap-1.5 bg-indigo-600 text-white px-3.5 py-2 rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all border-0 cursor-pointer shadow-sm"
                              >
                                <FontAwesomeIcon icon={faEye} /> Preview Proof in Modal
                              </button>
                              <a 
                                href={getBackendAssetUrl(activeTenant.proofOfPaymentPath)} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="inline-flex items-center gap-1.5 bg-white text-indigo-700 border border-indigo-200 px-3.5 py-2 rounded-xl text-xs font-bold hover:bg-indigo-50 transition-all no-underline shadow-sm"
                              >
                                <FontAwesomeIcon icon={faExternalLinkAlt} /> Open Full Asset in New Tab
                              </a>
                            </div>
                          )}
                        </div>
                      )}

                      {activeTenant.status === 'scheduled' && (
                        <div className="mt-2 p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-3">
                          <h5 className="text-xs font-bold text-blue-900 uppercase tracking-wider m-0 flex items-center gap-1.5">
                            <FontAwesomeIcon icon={faCalendarAlt} /> In-Person Visit Scheduled
                          </h5>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-blue-950 font-medium">
                             <div><span className="text-blue-500 font-bold mr-1">Scheduled Date:</span> {activeTenant.scheduledDate || 'Not Captured'}</div>
                             <div><span className="text-blue-500 font-bold mr-1">Time Slot:</span> <span className="font-bold text-slate-800">{activeTenant.scheduledTimeSlot === 'morning' ? 'Morning (9am-12pm)' : activeTenant.scheduledTimeSlot === 'afternoon' ? 'Afternoon (1pm-5pm)' : activeTenant.scheduledTimeSlot}</span></div>
                          </div>
                        </div>
                      )}

                      {activeTenant.status === 'processing' && (
                        <div className="mt-2 p-4 bg-amber-50 border border-amber-100 rounded-xl space-y-3">
                           <h5 className="text-xs font-bold text-amber-900 uppercase tracking-wider m-0 flex items-center gap-1.5">
                            <FontAwesomeIcon icon={faExclamationTriangle} /> Checkout Processing
                           </h5>
                           <p className="text-xs text-amber-800 m-0">An online checkout session is currently active. Please wait for the webhook to confirm payment.</p>
                        </div>
                      )}
                      
                      {activeTenant.status === 'payment-failed' && (
                        <div className="mt-2 p-4 bg-red-50 border border-red-100 rounded-xl space-y-3">
                           <h5 className="text-xs font-bold text-red-900 uppercase tracking-wider m-0 flex items-center gap-1.5">
                            <FontAwesomeIcon icon={faExclamationTriangle} /> Payment Failed
                           </h5>
                           <p className="text-xs text-red-800 m-0">The online payment attempt failed. You can record a manual payment here instead.</p>
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
                    {activeTenant.status === 'pending-verification' && (
                      <button
                        onClick={handleRejectProof}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white border border-red-200 text-red-700 rounded-lg text-sm font-semibold hover:bg-red-50 border-solid cursor-pointer transition-colors"
                      >
                        <FontAwesomeIcon icon={faExclamationTriangle} /> Reject Proof
                      </button>
                    )}
                    <button onClick={() => handleGenerateReceipt()} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 border-solid cursor-pointer transition-colors"><FontAwesomeIcon icon={faPrint} /> View Draft Receipt</button>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex-1">
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 m-0"><FontAwesomeIcon icon={faHistory} className="text-slate-400" /> Payment History</h3>
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
                          <th className="py-2 px-3 text-center">Proof</th>
                          <th className="py-2 px-3 text-right">Receipt</th>
                          <th className="py-2 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedHistory.length > 0 ? paginatedHistory.map((record, idx) => (
                          <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-3 px-3 font-medium text-slate-800">{record.period}</td>
                            <td className="py-3 px-3 text-emerald-600 font-semibold">{formatCurrency(record.amount)}</td>
                            <td className="py-3 px-3 text-slate-600"><span className="px-2 py-0.5 bg-slate-100 rounded text-xs border border-slate-200">{record.method || (record.gateway?.includes('paymongo') ? 'PayMongo (Sandbox)' : 'N/A')}</span></td>
                            <td className="py-3 px-3 text-slate-500 text-xs truncate max-w-[150px]" title={record.breakdown}>{record.breakdown}</td>
                            <td className="py-3 px-3 text-slate-500">{record.datePaid}</td>
                            <td className="py-3 px-3 text-center">
                              {record.proofOfPaymentPath ? (
                                <button
                                  onClick={() => setPreviewProof({
                                    url: getBackendAssetUrl(record.proofOfPaymentPath),
                                    title: `Proof of Payment — ${record.period}`,
                                    reference: record.paymentReference,
                                    sender: record.senderName
                                  })}
                                  className="text-xs inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-md border border-indigo-200 cursor-pointer font-semibold transition-colors"
                                  title="View Uploaded Payment Proof"
                                >
                                  <FontAwesomeIcon icon={faEye} /> Proof
                                </button>
                              ) : (
                                <span className="text-slate-300 text-xs">—</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right"><button onClick={() => handleGenerateReceipt(record)} className="text-indigo-600 border-0 bg-slate-100 hover:bg-indigo-100 p-1.5 rounded cursor-pointer transition-colors text-xs" title="View Receipt"><FontAwesomeIcon icon={faPrint} /></button></td>
                            <td className="py-3 px-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => handleDeleteHistory(record.id)} className="text-slate-500 hover:text-red-600 border-0 bg-transparent cursor-pointer p-1 transition-colors"><FontAwesomeIcon icon={faTrash} /></button>
                              </div>
                            </td>
                          </tr>
                        )) : (
                          <tr><td colSpan="8" className="py-4 text-center text-slate-500 text-sm">No records found.</td></tr>
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
                                t.status === 'pending-verification' ? 'bg-indigo-100 text-indigo-800' : 
                                t.status === 'scheduled' ? 'bg-blue-100 text-blue-800' : 
                                t.status === 'processing' ? 'bg-amber-100 text-amber-800' :
                                'bg-red-100 text-red-800'
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
                
                {/* ─── OUTSTANDING BALANCE ─── */}
                {/* Invoices are settled in full via Record Payment; there is no
                    partial-payment ledger, so no settlement entry form here. */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-800 m-0 flex items-center gap-2">
                      <FontAwesomeIcon icon={faBalanceScale} className="text-violet-600" />
                      Outstanding Balance — {activeTenant.name}
                    </h3>
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
            </>
            )}

            {activeTab === 'deposits' && (
            <div className="grid grid-cols-1 gap-6">
              {/* ─── SECURITY DEPOSIT TRACKING LEDGER ─── */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800 m-0 flex items-center gap-2">
                  <FontAwesomeIcon icon={faShieldAlt} className="text-emerald-600" />
                  Security Deposit Tracking Ledger
                </h3>
                <span className="text-xs text-slate-500 font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-100 uppercase tracking-wider">Non-Refundable Held Assets</span>
              </div>
              
              <div className="p-6 space-y-6">
                {/* Deposit metrics summary cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide m-0">Total Deposits Held</p>
                      <p className="text-2xl font-extrabold text-emerald-800 m-0 mt-1">{formatCurrency(totalDepositsHeld)}</p>
                    </div>
                    <FontAwesomeIcon icon={faShieldAlt} className="text-emerald-600/30 text-3xl" />
                  </div>
                  
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide m-0">Total Billing Deductions Applied</p>
                      <p className="text-2xl font-extrabold text-amber-800 m-0 mt-1">{formatCurrency(totalDepositDeductions)}</p>
                    </div>
                    <FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-600/30 text-3xl" />
                  </div>

                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-indigo-700 uppercase tracking-wide m-0">Total Applied to Last Rent Month</p>
                      <p className="text-2xl font-extrabold text-indigo-800 m-0 mt-1">{formatCurrency(totalAppliedToRent)}</p>
                    </div>
                    <FontAwesomeIcon icon={faCheckCircle} className="text-indigo-600/30 text-3xl" />
                  </div>
                </div>

                {/* Detailed Deposits Table */}
                <div className="overflow-x-auto border border-slate-100 rounded-xl">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wide bg-slate-50">
                        <th className="py-3 px-4">Tenant Name</th>
                        <th className="py-3 px-4 text-center">Unit</th>
                        <th className="py-3 px-4">Lease Term</th>
                        <th className="py-3 px-4">Original Deposit</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Fixture Damages</th>
                        <th className="py-3 px-4">Unpaid Utilities</th>
                        <th className="py-3 px-4">Applied to Rent</th>
                        <th className="py-3 px-4">Refunded</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {contracts.length > 0 ? contracts.map((c, idx) => {
                        const tenantName = c.tenant || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Tenant';
                        const leaseStart = c.leaseStart || c.lease_start ? new Date(c.leaseStart || c.lease_start).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'N/A';
                        const leaseEnd = c.leaseEnd || c.lease_end ? new Date(c.leaseEnd || c.lease_end).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'N/A';
                        const baseDeposit = parseFloat(c.deposit || c.deposit_amount || 0);
                        const dmg = parseFloat(c.damage_deduction || 0);
                        const utl = parseFloat(c.utility_deduction || 0);
                        const appliedRent = c.status === 'expired' ? Math.max(0, baseDeposit - dmg - utl) : 0;
                        const status = c.deposit_status || (c.status === 'active' ? 'Held' : 'Processed');
                        
                        return (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-3.5 px-4 font-bold text-slate-800">{tenantName}</td>
                            <td className="py-3.5 px-4 text-center font-bold text-indigo-600">{c.unit || c.room_name}</td>
                            <td className="py-3.5 px-4 text-slate-500">{leaseStart} – {leaseEnd}</td>
                            <td className="py-3.5 px-4 font-semibold text-slate-700">{formatCurrency(baseDeposit)}</td>
                            <td className="py-3.5 px-4">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                                status === 'Held' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                status === 'Applied to Rent' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                                'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}>
                                {status}
                              </span>
                            </td>
                            <td className={`py-3.5 px-4 font-semibold ${dmg > 0 ? 'text-red-600' : 'text-slate-400'}`}>{dmg > 0 ? formatCurrency(dmg) : '—'}</td>
                            <td className={`py-3.5 px-4 font-semibold ${utl > 0 ? 'text-red-600' : 'text-slate-400'}`}>{utl > 0 ? formatCurrency(utl) : '—'}</td>
                            <td className="py-3.5 px-4 font-bold text-indigo-600">{appliedRent > 0 ? formatCurrency(appliedRent) : '—'}</td>
                            <td className="py-3.5 px-4 text-slate-400 font-medium">₱0.00 <span className="text-[9px] text-slate-400 italic font-normal">(Non-Refundable)</span></td>
                          </tr>
                        );
                      }) : (
                        <tr><td colSpan="9" className="py-6 text-center text-slate-400">No security deposit transactions registered.</td></tr>
                      )}
                    </tbody>
                  </table>
              </div>
            </div>
            </div>
            </div>
            )}

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

      {/* Receipt Modal */}
      {showReceipt && receiptData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowReceipt(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden printable-receipt" onClick={e => e.stopPropagation()}>
            <div className="bg-slate-900 text-white p-6 text-center border-b-4 border-indigo-500">
              <h2 className="text-2xl font-bold tracking-wider italic font-serif mb-1 m-0 uppercase">Apartment AMS</h2>
              <div className="mt-4 pt-4 border-t border-slate-700/50">
                <p className="text-sm font-semibold text-slate-300 uppercase tracking-widest m-0">Official Receipt</p>
                <p className="text-xs font-mono text-indigo-300 m-0 mt-1">{receiptData.rctId}</p>
              </div>
            </div>
            <div className="p-6 space-y-4 font-mono text-sm">
              <div className="flex justify-between border-b border-slate-200 pb-4">
                <div><p className="text-slate-500 text-[10px] uppercase m-0">Date</p><p className="font-semibold m-0 mt-0.5">{receiptData.date}</p></div>
                <div className="text-right"><p className="text-slate-500 text-[10px] uppercase m-0">Status</p><p className="font-bold text-emerald-600 m-0 mt-0.5">{receiptData.status}</p></div>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-4">
                <div><p className="text-slate-500 text-[10px] uppercase m-0">Received From</p><p className="font-bold text-base m-0 mt-0.5 text-slate-800">{receiptData.tenant}</p><p className="m-0 text-slate-600 text-xs">Unit {receiptData.unit}</p></div>
                <div className="text-right">
                  <p className="text-slate-500 text-[10px] uppercase m-0">Method</p>
                  <p className="font-semibold text-slate-800 m-0 mt-0.5">{receiptData.method}</p>
                  {receiptData.gateway && (
                    <>
                      <p className="text-slate-500 text-[10px] uppercase m-0 mt-2">Gateway</p>
                      <p className="font-semibold text-slate-800 m-0 mt-0.5">{receiptData.gateway}</p>
                    </>
                  )}
                </div>
              </div>
              <div>
                <p className="text-slate-500 text-[10px] uppercase m-0 mb-1">Payment Breakdown ({receiptData.period})</p>
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 whitespace-pre-wrap leading-relaxed text-xs text-slate-700">{receiptData.breakdown}</div>
              </div>
              <div className="flex justify-between items-center pt-4 border-t-2 border-dashed border-slate-200">
                <p className="font-bold text-slate-600 m-0 text-base">TOTAL PAID</p>
                <p className="text-2xl font-bold text-slate-900 m-0">{formatCurrency(receiptData.amount)}</p>
              </div>
              {/* Signature placeholder */}
              <div className="pt-6 flex flex-col items-end text-right">
                <div className="border-b border-slate-400 w-36 h-8 mb-1"></div>
                <p className="text-[9px] uppercase text-slate-400 font-bold tracking-widest m-0">Authorized Admin Signature</p>
              </div>
            </div>
            <div className="flex gap-2 p-4 bg-slate-50 border-t border-slate-200 print-hide">
              <button onClick={() => window.print()} className="flex-1 flex items-center justify-center gap-2 py-2 bg-indigo-600 text-white rounded text-sm font-semibold hover:bg-indigo-700 border-0 cursor-pointer transition-colors"><FontAwesomeIcon icon={faPrint} /> Print Receipt</button>
              <button onClick={() => setShowReceipt(false)} className="flex-1 py-2 bg-white border border-slate-300 text-slate-700 rounded text-sm font-semibold hover:bg-slate-100 border-solid cursor-pointer transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Proof of Payment Preview Modal */}
      {previewProof && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setPreviewProof(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-800 m-0">{previewProof.title || 'Uploaded Proof of Payment'}</h3>
                {(previewProof.reference || previewProof.sender) && (
                  <p className="text-xs text-slate-500 m-0 mt-0.5">
                    {previewProof.sender ? `Sender: ${previewProof.sender} ` : ''}
                    {previewProof.reference ? `· Ref: ${previewProof.reference}` : ''}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewProof.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 transition-colors no-underline inline-flex items-center gap-1"
                >
                  <FontAwesomeIcon icon={faExternalLinkAlt} /> Open in New Tab
                </a>
                <button
                  onClick={() => setPreviewProof(null)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 border-0 bg-transparent cursor-pointer"
                >
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              </div>
            </div>
            <div className="p-6 overflow-auto flex items-center justify-center bg-slate-900/5 min-h-[300px]">
              {previewProof.url.toLowerCase().endsWith('.pdf') ? (
                <iframe src={previewProof.url} title="Payment Proof PDF" className="w-full h-[500px] border-0 rounded-lg shadow" />
              ) : (
                <img
                  src={previewProof.url}
                  alt="Proof of Payment"
                  className="max-h-[65vh] max-w-full object-contain rounded-lg shadow-md border border-slate-200 bg-white"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.style.display = 'none';
                    if (e.target.nextSibling) e.target.nextSibling.style.display = 'block';
                  }}
                />
              )}
              <div style={{ display: 'none' }} className="text-center p-8 text-slate-500">
                <p className="font-bold text-sm">Image could not be rendered directly.</p>
                <p className="text-xs mt-1">Please use the "Open in New Tab" link above to view or download.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPayments;