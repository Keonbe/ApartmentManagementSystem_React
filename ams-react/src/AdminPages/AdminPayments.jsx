import { Fragment, useState, useMemo, useEffect, useRef } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSearch, faCheckCircle, faPrint, faCalendarAlt,
  faDollarSign, faFileAlt, faExclamationTriangle, faTimes, faHistory, faMoneyBillWave, faInfoCircle, faCircle,
  faChartBar, faBalanceScale, faShieldAlt, faEye, faExternalLinkAlt,
  faBell
} from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import fileUrl from '../api/fileUrl';
import { LIMITS, MAX_AMOUNT, checkAmount, checkPaymentReference, isBankMethod, localDateString, maxFutureDate } from '../utils/validation';
import { apiErrorMessage } from '../utils/apiError';
import useFieldErrors from '../hooks/useFieldErrors';
import FieldError from '../Components/form/FieldError';
import ReasonModal from '../Components/form/ReasonModal';
import { blockNonNumericKeys, invalidCls } from '../Components/form/formHelpers';
import { ADMIN_PAYMENTS_EVENT } from '../config/notificationLinks';
import { daysPastDue, formatCoveredPeriod, isBundleKey, isPastDue } from '../utils/billingPeriod';
import { printElement } from '../utils/print';
import { clickable } from '../utils/clickable';
import StatCard from '../Components/admin/StatCard';
import Modal from '../Components/admin/Modal';

const formatCurrency = (n) => `₱${Number(n).toLocaleString()}`;
// Desk methods are cash, GCash and bank transfer; the actual bank is captured
// separately on each transaction.
const METHODS = ['cash', 'gcash', 'bank_transfer'];
const BANKS = ['BDO', 'BPI', 'Metrobank', 'Landbank', 'RCBC', 'UnionBank', 'Security Bank', 'Maya Bank', 'Other'];
// Bills the desk may clear: the tenant has acted in Pay Bills. Mirrors ADMIN_RECORDABLE_STATUSES (backend/config.php).
const TENANT_ACTED_STATUSES = ['pending-verification', 'scheduled', 'payment-failed'];
const BLANK_PARTS = [{ method: 'cash', bank_name: '', amount: '', reference_number: '' }];
// The desk methods a tenant's channel label ('GCash (Manual)', 'BPI (Manual)',
// 'Cash on Hand', …) can be recorded as — mirrors desk_methods_for_label().
const deskMethodsFor = (label) => {
  const l = String(label || '').trim().toLowerCase();
  if (!l) return [];
  if (l.includes('gcash')) return ['gcash'];
  if (l.includes('bank') || l.includes('bdo') || l.includes('bpi')) return ['bank_transfer'];
  if (l.includes('cash') || l.includes('in-person') || l.includes('in person')) return ['cash'];
  return [];
};
const AMOUNT_INPUT = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500 text-slate-800 bg-white';
// Statuses adjust_invoice.php accepts (backend INVOICE_ADJUSTABLE_STATUSES).
const ADJUSTABLE_STATUSES = ['pending', 'unpaid', 'overdue', 'scheduled', 'payment-failed'];
// Manual invoice lines adjust_invoice.php may change; services, maintenance
// and the security deposit are system-posted and stay as they are.
const ADJUST_LINES = [['baseRent', 'base_rent', 'Base rent'], ['water', 'water', 'Water'], ['electricity', 'electricity', 'Electricity'], ['parking', 'parking', 'Parking'], ['lateFee', 'late_fee', 'Late fee']];
// Every adjustment needs a reason (adjust_invoice.php: 5-255 characters).
const ADJUST_REASON_MIN = 5;
const ADJUST_REASON_MAX = 255;
// Labels of the lines an adjustment history entry can name (invoice_adjustments.changes).
// Status of the other payment a reused reference was found on (get_invoices.php reference_reuse).
const REUSE_STATUS_LABELS = { paid: 'paid', 'pending-verification': 'awaiting verification', pending: 'part paid', overdue: 'part paid, overdue', scheduled: 'part paid' };
const ADJUSTMENT_LINE_LABELS ={ base_rent: 'Base rent', water: 'Water', electricity: 'Electricity', parking: 'Parking', late_fee: 'Late fee', due_date: 'Due date' };

const CHIP_TONES = {
  emerald: 'text-emerald-700', amber: 'text-amber-700', red: 'text-red-700', indigo: 'text-indigo-700', slate: 'text-slate-500',
};

// Read-only status of the tenant's security deposit, from the contract and
// the move-in invoice (get_invoices.php accounts[].deposit). Recorded by the
// move-in, move-out and termination flows — never toggled from this page.
const depositChip = (account) => {
  const d = account?.deposit;
  if (!d) return { text: 'No tenancy on record', tone: 'slate' };
  if (d.state === 'unpaid') return { text: `Unpaid · ${formatCurrency(d.amount)}`, sub: `On move-in invoice ${d.move_in_invoice}`, tone: 'amber' };
  if (d.state === 'held') return { text: `Held · ${formatCurrency(d.amount)}`, sub: 'Non-refundable; applied at move-out', tone: 'emerald' };
  if (d.state === 'settled') {
    // Itemized lines (deposit_deductions) when the clearance recorded them.
    const items = (d.items || []).map((i) => `${i.label} – ${i.reason} ${formatCurrency(i.amount)}`).join('; ');
    return { text: d.status, sub: d.deductions > 0 ? `Deductions ${formatCurrency(d.deductions)}${items ? `: ${items}` : ''}` : `Deposit ${formatCurrency(d.amount)}`, tone: 'indigo' };
  }
  return { text: 'Not billed', sub: 'No move-in invoice or paid deposit on record', tone: 'red' };
};

// Read-only status of rent the tenant prepaid (advance_credits). The move-in
// advance month is part of the move-in invoice, not this.
const prepaidChip = (account) => {
  const a = account?.advance || {};
  const months = (n) => `${n} month${n === 1 ? '' : 's'}`;
  if (a['refund-due']) return { text: `Refund due · ${formatCurrency(a['refund-due'].amount)}`, sub: `${months(a['refund-due'].months)} not reached at move-out. Handle it under Refunds.`, tone: 'red' };
  if (a.available) return { text: `${months(a.available.months)} credit`, sub: `${formatCurrency(a.available.amount)}, applied as each month is billed`, tone: 'emerald' };
  if (a.reserved) return { text: 'Awaiting payment', sub: `Advance for ${months(a.reserved.months)} not paid yet`, tone: 'amber' };
  return { text: 'None', sub: 'No prepaid months', tone: 'slate' };
};

const getBackendAssetUrl = (path) => (path ? fileUrl(path.replace(/^\//, '')) : '');

// What a tenant owes: open invoices less parts received, advance rent excluded.
// The billing sum is the old fallback for an account with no balance figure; it is
// skipped when the only open invoice is an advance, or that prepayment would be
// counted as a debt after all.
const owedBalance = (t) => t.outstandingBalance
  || (t.advanceAwaiting > 0 ? 0 : t.billing.baseRent + t.billing.water + t.billing.electricity + t.billing.parking + t.billing.services + t.billing.maintenance);

const AdminPayments = () => {
  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOption, setSortOption] = useState('name-asc');
  const [statusFilter, setStatusFilter] = useState('all');
  // Security Deposit Ledger controls (client-side over the contracts list).
  const [depositSearch, setDepositSearch] = useState('');
  const [depositFilter, setDepositFilter] = useState('all');
  const [depositSort, setDepositSort] = useState('tenant-asc');
  const [contracts, setContracts] = useState([]);
  const [activeTab, setActiveTab] = useState('billing');
  const [loading, setLoading] = useState(true);
  const [previewProof, setPreviewProof] = useState(null);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [batchSending, setBatchSending] = useState(false);
  // Confirmation that a decision went through and reached the tenant.
  const [flash, setFlash] = useState(null);
  const showFlash = (text) => {
    setFlash(text);
    setTimeout(() => setFlash(null), 6000);
  };
  const [rejectModal, setRejectModal] = useState(null); // { invoiceId, tenant } while open
  
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
        // Each tenant's deposit and prepaid-rent position (get_invoices.php).
        const accounts = res.data.accounts || {};

        res.data.invoices.forEach(inv => {
          if (!grouped[inv.user_id]) {
            grouped[inv.user_id] = {
              id: inv.user_id,
              // Null-safe name creation protects the component tree from throwing TypeErrors
              name: inv.first_name ? `${inv.first_name} ${inv.last_name}` : "Unknown User",
              unit: inv.room_name ?? "Unassigned",
              status: inv.status ?? "pending",
              account: accounts[inv.user_id] || null,
              dueDate: inv.due_date ?? "",
              billing: { baseRent: 0, water: 0, electricity: 0, parking: 0, services: 0, maintenance: 0, addOns: 0 },
              history: [],
              outstandingBalance: 0,
              advanceAwaiting: 0,
              overdueInvoices: 0,
              pendingInvoiceId: null,
              lastReminderDate: inv.last_reminder_date || null,
              reminderCount: inv.reminder_count || 0
            };
          }
          
          const t = grouped[inv.user_id];
          
          if (inv.status === 'pending' || inv.status === 'overdue' || inv.status === 'pending-verification' || inv.status === 'scheduled' || inv.status === 'processing' || inv.status === 'payment-failed') {
            // Installments: only what is still owed (total less parts received).
            const stillOwed = Math.max(0, parseFloat(inv.total_amount || 0) - parseFloat(inv.amount_paid || 0));
            if (inv.advance_months) {
              // A prepayment the tenant chose to open, not a debt: nothing is owed for
              // those months until they are billed, and an unpaid one cancels itself.
              // Still listed below so the desk can verify its proof, but kept out of
              // "owed" like the Dashboard and Reports do.
              t.advanceAwaiting += stillOwed;
            } else {
              t.outstandingBalance += stillOwed;
              if (isPastDue(inv)) t.overdueInvoices += 1;
            }
            (t.openInvoices = t.openInvoices || []).push(inv);
          } else if (inv.status === 'paid') {
            const methodDisplay = inv.payment_method || (inv.payment_gateway?.includes('paymongo') ? 'PayMongo (Sandbox)' : 'Cash');
            const invoiceBreakdown = [
              ['Rent', inv.base_rent],
              ['Water', inv.water],
              ['Electricity', inv.electricity],
              ['Parking', inv.parking],
              ['Services', inv.services],
              ['Maintenance', inv.maintenance],
              ['Security deposit', inv.security_deposit],
              ['Late fee', inv.late_fee],
            ]
              .filter(([, amount]) => Number(amount) > 0)
              .map(([label, amount]) => `${label}: ${formatCurrency(amount)}`)
              .join(' · ');
            const paymentTransactions = inv.payment_transactions || [];
            t.history.push({
              id: inv.id, 
              period: inv.billing_period, 
              breakdown: invoiceBreakdown || `Total: ${formatCurrency(inv.total_amount)}`,
              amount: parseFloat(inv.total_amount || 0), 
              datePaid: inv.paid_at, 
              status: 'paid', 
              method: methodDisplay,
              paymentTransactions,
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
        
        // The bill the desk acts on: one awaiting the admin's decision first
        // (a proof, then a scheduled cash visit, then a checkout in flight),
        // otherwise the earliest due. An advance payment's months are acted on
        // together — pendingInvoiceId is then its ADV-… group id, which
        // record_payment_admin.php / reject_payment_proof.php accept, and
        // pendingAmount is what that one action settles.
        const RANK = { 'pending-verification': 0, scheduled: 1, processing: 2 };
        Object.values(grouped).forEach(t => {
          const open = t.openInvoices || [];
          if (open.length === 0) return;
          const sel = [...open].sort((a, b) =>
            (RANK[a.status] ?? 3) - (RANK[b.status] ?? 3) || String(a.due_date || '').localeCompare(String(b.due_date || ''))
          )[0];
          const months = sel.payment_group
            ? open.filter(i => i.payment_group === sel.payment_group).sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
            : [sel];
          const sum = (key) => months.reduce((s, i) => s + parseFloat(i[key] || 0), 0);

          t.status = sel.status;
          t.dueDate = sel.due_date;
          t.pastDue = isPastDue(sel);
          t.daysPastDue = daysPastDue(sel);
          t.coveredPeriod = formatCoveredPeriod(sel);
          t.advanceInvoice = sel.advance_months ? { id: sel.id, months: sel.advance_months, label: sel.billing_period } : null;
          t.scheduledDate = sel.scheduled_date;
          t.scheduledTimeSlot = sel.scheduled_time_slot;
          t.billingPeriod = sel.payment_group ? months.map(i => i.billing_period).join(', ') : sel.billing_period;
          t.lastReminderDate = sel.last_reminder_date;
          t.reminderCount = sel.reminder_count;
          t.billing.baseRent = sum('base_rent');
          t.billing.water = sum('water');
          t.billing.electricity = sum('electricity');
          t.billing.parking = sum('parking');
          t.billing.services = sum('services');
          t.billing.maintenance = sum('maintenance');
          t.billing.securityDeposit = sum('security_deposit');
          t.billing.lateFee = sum('late_fee');
          t.pendingInvoiceId = sel.payment_group || sel.id;
          // The balance that one action settles (parts already received are not owed again).
          t.pendingAmount = Math.round((sum('total_amount') - sum('amount_paid')) * 100) / 100;
          t.invoiceTotal = sum('total_amount');
          t.paidSoFar = sum('amount_paid');
          // A part the tenant declared with their proof; null = the whole balance.
          t.proofAmount = sel.status === 'pending-verification' && sel.proof_amount != null ? parseFloat(sel.proof_amount) : null;
          t.partsList = sel.payment_group ? [] : (sel.payment_transactions || []);
          t.canPartPay = !sel.payment_group && !sel.advance_months;
          t.advanceGroup = sel.payment_group ? { key: sel.payment_group, months } : null;
          // A single bill's charges and due date are changed through
          // adjust_invoice.php, never at the till; a group or advance is not adjustable.
          t.adjustInvoice = !sel.payment_group && !sel.advance_months && ADJUSTABLE_STATUSES.includes(sel.status) ? sel : null;
          // Admin-only fields of get_invoices.php: the bill's adjustment history
          // (reason, before/after) and, for a payment under review, another
          // payment that used the same reference (Settings -> Payments).
          t.adjustments = months.flatMap(i => (i.adjustments || []).map(a => ({ ...a, invoiceId: i.id })));
          t.referenceReuse = sel.status === 'pending-verification' ? (months.map(i => i.reference_reuse).find(Boolean) || null) : null;
          if (sel.proof_of_payment_path) t.proofOfPaymentPath = sel.proof_of_payment_path;
          if (sel.payment_reference) t.paymentReference = sel.payment_reference;
          if (sel.sender_name) t.senderName = sel.sender_name;
          if (sel.split_parts?.length) t.splitParts = sel.split_parts;
          if (sel.payment_gateway) t.paymentGateway = sel.payment_gateway;
          // How the tenant chose to pay this bill. A proof under review locks
          // the desk to that method (record_payment_admin.php enforces it).
          t.declaredLabel = sel.payment_method || (sel.payment_gateway === 'in_person' ? 'In-person visit' : null);
          const declared = deskMethodsFor(sel.payment_method);
          t.declaredMethod = declared[0] || (sel.payment_gateway === 'in_person' ? 'cash' : null);
          // Under review, only the declared method(s) may be recorded: one, or
          // either bank for an older generic bank-transfer proof.
          t.allowedMethods = sel.status === 'pending-verification' && declared.length ? declared : METHODS;
          t.methodLocked = t.allowedMethods.length === 1;
        });

        const tenantArray = Object.values(grouped);
        setTenants(tenantArray);
        // Keep the admin on the tenant they were working with. This also runs on
        // background refreshes; jumping to the first tenant there could put a
        // different tenant under an open Confirm Payment dialog.
        if (tenantArray.length > 0) setSelectedTenantId(prev => (tenantArray.some(t => t.id === prev) ? prev : tenantArray[0].id));
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
    // A tenant just paid (the header saw a new payment to verify): reload the
    // list in place, without the loading state, so open modals stay as they are.
    window.addEventListener(ADMIN_PAYMENTS_EVENT, loadInvoices);
    return () => window.removeEventListener(ADMIN_PAYMENTS_EVENT, loadInvoices);
  }, []);
  
  // The till records a payment against the bill as issued: the period,
  // charges and due date come from the invoice (payments audit 2026-09-30 —
  // the editable Period, Term, Prorated Rent and Add-ons controls here were
  // never saved). Changes go through "Adjust invoice" (adjust_invoice.php).
  const [recording, setRecording] = useState(false);
  const [adjustForm, setAdjustForm] = useState(null); // the open adjustment, or null
  const [adjusting, setAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState('');
  const [adjustReasonError, setAdjustReasonError] = useState('');

  // Payment Recording States
  const [methodChoice, setMethodChoice] = useState({ tenant: null, method: 'cash' });
  const [tender, setTender] = useState({ tenant: null, value: '' });
  const [splitChoice, setSplitChoice] = useState({ tenant: null, on: false, parts: null });
  const [refChoice, setRefChoice] = useState({ tenant: null, value: '' });
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const confirmTarget = useRef(null);
  const receiptRef = useRef(null);

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

  // Keep the selected tenant's row visible in the list. The first load selects the
  // first tenant in API order, which can sit far down the name-sorted list. Scrolls
  // only the list panel, so the page itself does not jump. Runs on selection
  // change only, so a background refresh never yanks a list the admin scrolled.
  const tenantListRef = useRef(null);
  useEffect(() => {
    const list = tenantListRef.current;
    const row = list?.querySelector('[aria-pressed="true"]');
    if (!row) return;
    const top = row.offsetTop;
    if (top < list.scrollTop || top + row.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = Math.max(0, top - 8);
    }
  }, [selectedTenantId]);

  // The method is the tenant's declared one: fixed while their proof is under
  // review, otherwise the default, which a manual choice overrides while that
  // same tenant record is selected.
  const allowedMethods = activeTenant?.allowedMethods || METHODS;
  const chosenMethod = methodChoice.tenant === activeTenant ? methodChoice.method : (activeTenant?.declaredMethod || 'cash');
  const paymentMethod = allowedMethods.includes(chosenMethod) ? chosenMethod : allowedMethods[0];
  const setPaymentMethod = (method) => setMethodChoice({ tenant: activeTenant, method });
  // Starts as the reference the tenant submitted with their proof; an edit sticks
  // only while that same tenant record is selected (like the method above).
  const paymentReference = refChoice.tenant === activeTenant ? refChoice.value : (activeTenant?.paymentReference || '');
  const setPaymentReference = (value) => setRefChoice({ tenant: activeTenant, value });

  // What "Clear & Process" settles (one invoice, or one payment group's
  // bills) — not every open invoice, which the button never settled.
  // A part the tenant declared with a proof is confirmed as declared.
  const declaredPart = activeTenant?.proofAmount ?? null;
  const totalDue = activeTenant ? (declaredPart ?? (activeTenant.pendingAmount || 0)) : 0;
  // "Record part-payment" (installments): a single bill, below its balance.
  const [partChoice, setPartChoice] = useState({ tenant: null, on: false });
  const adminPart = !!activeTenant?.canPartPay && partChoice.tenant === activeTenant && partChoice.on && declaredPart === null;
  const partMode = adminPart || (declaredPart !== null && declaredPart < (activeTenant?.pendingAmount || 0));
  // Starts at the total due; a typed amount only sticks while that same tenant
  // record is selected (like the method above).
  const amountTendered = tender.tenant === activeTenant ? tender.value : (totalDue > 0 ? String(totalDue) : '');
  const setAmountTendered = (value) => setTender({ tenant: activeTenant, value });
  // Split mode and its portions: a tenant's own split submission opens the desk
  // already split and filled in; otherwise one blank cash portion. Edits stick
  // only while that same tenant record is selected (like the method above).
  const submittedParts = activeTenant?.splitParts?.length
    ? activeTenant.splitParts.map(p => ({ method: p.method, bank_name: p.bank_name || '', amount: String(p.amount), reference_number: p.reference_number || '' }))
    : null;
  // The tenant fixed the portions and their methods; the desk only verifies them.
  const tenantSplit = !!submittedParts;
  const ownChoice = splitChoice.tenant === activeTenant;
  const splitMode = ownChoice ? splitChoice.on : !!submittedParts;
  const paymentParts = ownChoice && splitChoice.parts ? splitChoice.parts : (submittedParts || BLANK_PARTS);
  const setSplitMode = (on) => setSplitChoice({ tenant: activeTenant, on, parts: paymentParts });
  const setPaymentParts = (next) => setSplitChoice({ tenant: activeTenant, on: splitMode, parts: typeof next === 'function' ? next(paymentParts) : next });
  const splitTotal = paymentParts.reduce((sum, part) => sum + (Number(part.amount) || 0), 0);
  const remainingBalance = Math.round((totalDue - splitTotal) * 100) / 100;
  const hasInvalidSplitPart = paymentParts.some(part => {
    const amount = Number(part.amount);
    return !part.amount || !Number.isFinite(amount) || amount <= 0 || amount > totalDue ||
      (part.method !== 'cash' && (!part.reference_number?.trim() || checkPaymentReference(part.reference_number, part.method))) ||
      (part.method === 'bank_transfer' && (!part.bank_name || (part.bank_name === 'Other' && !part.other_bank_name?.trim())));
  });
  const splitCanProcess = paymentParts.length > 0 && paymentParts.length <= 2 && Math.abs(remainingBalance) <= 0.009 && !hasInvalidSplitPart;
  const change = amountTendered ? Math.max(0, Number(amountTendered) - totalDue) : 0;

  // Summaries
  const totalCollected = tenants.reduce((sum, t) => sum + t.history.filter(h => h.status === 'paid').reduce((s, h) => s + h.amount, 0), 0);
  // Overdue while any bill is past due, even one whose proof is awaiting
  // verification (the money is not confirmed yet), as the Dashboard counts it.
  const overdueCount = tenants.filter(t => t.overdueInvoices > 0 || t.status === 'payment-failed').length;
  const overdueInvoiceCount = tenants.reduce((sum, t) => sum + t.overdueInvoices, 0);
  const advanceAwaitingTotal = tenants.reduce((sum, t) => sum + t.advanceAwaiting, 0);
  const pendingCount = tenants.filter(t => t.status === 'pending' || t.status === 'pending-verification' || t.status === 'scheduled' || t.status === 'processing').length;
  const totalOutstanding = tenants.filter(t => t.status !== 'paid').reduce((sum, t) => sum + owedBalance(t), 0);

  // Security Deposit Tracking summaries (Non-refundable)
  const totalDepositsHeld = contracts.filter(c => c.deposit_status === 'Held').reduce((sum, c) => sum + parseFloat(c.deposit_amount || 0), 0);
  const totalDepositDeductions = contracts.reduce((sum, c) => sum + parseFloat(c.damage_deduction || 0) + parseFloat(c.utility_deduction || 0), 0);
  // A deposit is applied once move-out or termination records its disposition
  // (deposit_status 'Applied to …'); 'Pending' means it was never paid.
  const depositApplied = (c) => String(c.deposit_status || '').startsWith('Applied');
  const totalAppliedToRent = contracts.filter(depositApplied).reduce((sum, c) => {
    const dep = parseFloat(c.deposit_amount || 0);
    const dmg = parseFloat(c.damage_deduction || 0);
    const utl = parseFloat(c.utility_deduction || 0);
    return sum + Math.max(0, dep - dmg - utl);
  }, 0);

  // One deposit row, shared by the deposits table (md and up) and its phone cards.
  const depositRowData = (c) => {
    const baseDeposit = parseFloat(c.deposit || c.deposit_amount || 0);
    const dmg = parseFloat(c.damage_deduction || 0);
    const utl = parseFloat(c.utility_deduction || 0);
    const fmtMonth = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'N/A');
    return {
      tenantName: c.tenant || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Tenant',
      unit: c.unit || c.room_name,
      leaseStart: fmtMonth(c.leaseStart || c.lease_start),
      leaseEnd: fmtMonth(c.leaseEnd || c.lease_end),
      baseDeposit, dmg, utl,
      appliedRent: depositApplied(c) ? Math.max(0, baseDeposit - dmg - utl) : 0,
      status: c.deposit_status || 'Pending',
      // Itemized move-out deductions (get_contracts.php deposit_items), so the
      // reasons show and not only the two totals.
      items: Array.isArray(c.deposit_items) ? c.deposit_items : [],
    };
  };
  // Ledger search / filter / sort. Filter values: a deposit_status, or 'deductions'
  // (any deduction recorded) / 'clean' (applied with none).
  const DEPOSIT_FILTERS = [
    ['all', 'All'], ['Held', 'Held'], ['Applied to Rent', 'Applied to rent'], ['Applied to Bills/Damages', 'Applied to bills/damages'],
    ['Pending', 'Pending (unpaid)'], ['Not Collected', 'Not collected'], ['deductions', 'With deductions'],
  ];
  const DEPOSIT_SORTS = [
    ['tenant-asc', 'Tenant A–Z'], ['tenant-desc', 'Tenant Z–A'], ['unit-asc', 'Unit ↑'], ['unit-desc', 'Unit ↓'],
    ['deposit-desc', 'Deposit: high to low'], ['deposit-asc', 'Deposit: low to high'],
    ['deductions-desc', 'Deductions: high to low'], ['end-asc', 'Rent end: soonest'], ['end-desc', 'Rent end: latest'],
  ];
  const visibleContracts = (() => {
    const term = depositSearch.trim().toLowerCase();
    const rows = contracts.map((c) => ({ c, d: depositRowData(c), end: c.leaseEnd || c.lease_end || '' }));
    const kept = rows.filter(({ c, d }) => {
      if (term && !`${d.tenantName} ${d.unit}`.toLowerCase().includes(term)) return false;
      if (depositFilter === 'all') return true;
      if (depositFilter === 'deductions') return d.dmg + d.utl > 0;
      return (c.deposit_status || 'Pending') === depositFilter;
    });
    const byText = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
    const sorters = {
      'tenant-asc': (a, b) => byText(a.d.tenantName, b.d.tenantName),
      'tenant-desc': (a, b) => byText(b.d.tenantName, a.d.tenantName),
      'unit-asc': (a, b) => byText(a.d.unit, b.d.unit),
      'unit-desc': (a, b) => byText(b.d.unit, a.d.unit),
      'deposit-desc': (a, b) => b.d.baseDeposit - a.d.baseDeposit,
      'deposit-asc': (a, b) => a.d.baseDeposit - b.d.baseDeposit,
      'deductions-desc': (a, b) => (b.d.dmg + b.d.utl) - (a.d.dmg + a.d.utl),
      // A missing end date sorts last either way.
      'end-asc': (a, b) => (!a.end - !b.end) || byText(a.end, b.end),
      'end-desc': (a, b) => (!a.end - !b.end) || byText(b.end, a.end),
    };
    return kept.sort(sorters[depositSort] || sorters['tenant-asc']).map(({ c }) => c);
  })();
  const depositItemsList = (items) => (
    <ul className="m-0 p-0 list-none space-y-0.5 text-[11px] text-slate-500 whitespace-normal">
      {items.map((it, i) => (
        <li key={i} className="flex justify-between gap-3">
          <span className="min-w-0"><span className="font-semibold text-slate-700">{it.label || it.category}</span>{it.reason ? `: ${it.reason}` : ''}</span>
          <span className="font-semibold text-red-600 shrink-0">{formatCurrency(it.amount)}</span>
        </li>
      ))}
    </ul>
  );
  const depositStatusBadge = (status) => (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
      status === 'Held' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
      status === 'Applied to Rent' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
      status === 'Not Collected' ? 'bg-slate-100 text-slate-600 border border-slate-200' :
      'bg-amber-50 text-amber-700 border border-amber-200'
    }`}>
      {status}
    </span>
  );

  // Outstanding Balance Aging
  const agingData = useMemo(() => {
    const now = new Date();
    const result = { current: 0, days15: 0, days30: 0, days60plus: 0 };
    tenants.forEach(t => {
      if (t.status === 'paid') return;
      const daysOverdue = t.dueDate ? Math.max(0, Math.ceil((now - new Date(t.dueDate)) / (1000 * 60 * 60 * 24))) : 0;
      const balance = owedBalance(t);
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
    return t.status !== 'paid' && owedBalance(t) > 0 && diff !== null && diff >= 0 && diff <= 5;
  }).length;

  // Keys match record_payment_admin.php's body.
  const recordValues = { paymentMethod, amountPaid: amountTendered, paymentReference };
  const recordForm = useFieldErrors({
    paymentMethod: (v) => (allowedMethods.includes(v) ? '' : 'Choose a payment method.'),
    // Required for every method: the server settles the bill in full only when
    // the amount covers it (no partial payments). Cash may exceed the total
    // (the difference is change); a transfer must match it exactly.
    amountPaid: (v, all) => {
      const base = checkAmount(v, { label: all.paymentMethod === 'cash' ? 'Amount tendered' : 'Amount received', required: true, min: 0.01, allowZero: false });
      if (base) return base;
      if (adminPart) {
        if (Number(v) - totalDue > -0.009) return `A part-payment must be less than the balance (${formatCurrency(totalDue)}). Untick part-payment to settle it.`;
        return '';
      }
      if (Number(v) + 0.009 < totalDue) return `The amount must cover the total due (${formatCurrency(totalDue)}).`;
      if (all.paymentMethod !== 'cash' && Number(v) - totalDue > 0.009) return `A ${all.paymentMethod} payment must match the total due (${formatCurrency(totalDue)}).`;
      return '';
    },
    // Optional for GCash/bank (the tenant's own reference is kept when blank).
    paymentReference: (v, all) => (all.paymentMethod !== 'cash' && String(v ?? '').trim() ? checkPaymentReference(v, all.paymentMethod) : ''),
  }, { idPrefix: 'record-' });
  const blurRecord = (name) => recordForm.validateField(name, recordValues);

  const handleConfirmPayment = () => {
    if (!splitMode && !recordForm.validateAll(recordValues)) return;
    if (splitMode && !splitCanProcess) return;
    if (!splitMode && paymentMethod === 'bank_transfer' && (!paymentParts[0]?.bank_name || (paymentParts[0]?.bank_name === 'Other' && !paymentParts[0]?.other_bank_name?.trim()))) return;
    // What the admin is confirming, fixed at the moment the dialog opens.
    confirmTarget.current = { tenantId: activeTenant?.id, invoiceId: activeTenant?.pendingInvoiceId, amount: totalDue };
    setShowConfirmModal(true);
  };

const handleMarkAsPaid = async () => {
    if (!activeTenant || !activeTenant.pendingInvoiceId || recording) return;
    if (splitMode && !splitCanProcess) return;
    // A refresh while the dialog was open may have changed the bill behind it.
    // Never post a payment for anything other than what was on screen.
    const target = confirmTarget.current;
    if (!target || target.tenantId !== activeTenant.id || target.invoiceId !== activeTenant.pendingInvoiceId || target.amount !== totalDue) {
      setShowConfirmModal(false);
      alert('This bill changed while the confirmation was open. Nothing was recorded — please review it and confirm again.');
      return;
    }

    setRecording(true);
    try {
      const res = await api.post('/record_payment_admin.php', {
        invoiceId: activeTenant.pendingInvoiceId,
        payments: splitMode
          ? paymentParts.map(p => ({ method: p.method, amount: Number(p.amount), bank_name: p.method === 'bank_transfer' ? (p.bank_name === 'Other' ? p.other_bank_name.trim() : p.bank_name) : undefined, reference_number: p.reference_number.trim() || undefined }))
          : [{
              method: paymentMethod,
              amount: paymentMethod === 'cash' && !adminPart ? totalDue : Number(amountTendered),
              bank_name: paymentMethod === 'bank_transfer' ? (paymentParts[0]?.bank_name === 'Other' ? paymentParts[0]?.other_bank_name?.trim() : paymentParts[0]?.bank_name) : undefined,
              reference_number: (paymentMethod !== 'cash' && paymentReference.trim()) || undefined,
            }],
        partial: partMode,
      });

      // Safely check if the response is successful
      if (res.data && res.data.success) {
        fetchInvoices();
        showFlash(res.data.partial
          ? `Part-payment recorded for ${activeTenant.name}. Balance ${formatCurrency(res.data.balance)}; the tenant has been notified.`
          : `Payment confirmed for ${activeTenant.name}. The tenant has been notified and their receipt is ready.`);
        setPartChoice({ tenant: null, on: false });
        setTender({ tenant: null, value: '' });
        setSplitChoice({ tenant: null, on: false, parts: null });
        setRefChoice({ tenant: null, value: '' });
        setShowConfirmModal(false);
      } else {
        // If it's a string (HTML error) or missing the message property, alert a safe fallback
        console.error("Server returned an error format:", res.data);
        setShowConfirmModal(false);
        if (!recordForm.applyServerErrors(res)) alert(res.data?.message || "Server Error. Check the browser console for details.");
      }
    } catch(err) {
      console.error("Network or API Error:", err);
      setShowConfirmModal(false);
      if (!recordForm.applyServerErrors(err)) alert(apiErrorMessage(err, "A network or server error occurred."));
    } finally {
      setRecording(false);
    }
  };

  // Cancels a tenant's unfinished online checkout (release_checkout_session.php)
  // so the desk can record the payment. If the tenant did pay at the gateway,
  // cancelling would lose that payment's match, so the admin checks first.
  const [releasing, setReleasing] = useState(false);
  const handleReleaseCheckout = async () => {
    if (!activeTenant?.pendingInvoiceId || releasing) return;
    if (!window.confirm(`Cancel ${activeTenant.name}'s online checkout?\n\nCheck the PayMongo dashboard first: if this checkout was paid there, do not cancel it — the payment will be confirmed automatically.`)) return;
    setReleasing(true);
    try {
      const res = await api.post('/release_checkout_session.php', { invoice_id: activeTenant.pendingInvoiceId });
      if (res.data?.released) {
        fetchInvoices();
        showFlash(`Online checkout cancelled for ${activeTenant.name}. The tenant has been notified; you can now record the payment.`);
      } else {
        alert(res.data?.message || 'No open checkout to cancel.');
        fetchInvoices();
      }
    } catch (err) {
      alert(apiErrorMessage(err, 'Could not cancel the online checkout.'));
    } finally {
      setReleasing(false);
    }
  };

  const handleRejectProof = () => {
    if (!activeTenant || !activeTenant.pendingInvoiceId) return;
    setRejectModal({ invoiceId: activeTenant.pendingInvoiceId, tenant: activeTenant.name });
  };

  // Throws on failure so ReasonModal shows the message under the reason.
  const submitRejectProof = async (reason) => {
    if (!rejectModal) return;
    let res;
    try {
      res = await api.post('/reject_payment_proof.php', {
        invoiceId: rejectModal.invoiceId,
        reason
      });
    } catch (err) {
      console.error("Reject proof error:", err);
      throw new Error(apiErrorMessage(err, "A network or server error occurred."), { cause: err });
    }
    if (!res.data?.success) throw new Error(res.data?.message || "Failed to reject payment proof.");
    fetchInvoices();
    showFlash(`Payment proof returned to ${rejectModal.tenant}. The tenant has been notified with your reason.`);
    setRejectModal(null);
  };

  const handleGenerateReceipt = (record = null) => {
    if (!activeTenant) return;
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (record) {
      setReceiptData({ rctId: record.id, date: record.datePaid, tenant: activeTenant.name, unit: activeTenant.unit, period: record.period, amount: record.amount, breakdown: record.breakdown, status: record.status.toUpperCase(), method: record.method, gateway: record.gateway, paymentTransactions: record.paymentTransactions || [], paymentReference: record.paymentReference });
    } else {
      setReceiptData({ rctId: 'RCT-DRAFT', date: today, tenant: activeTenant.name, unit: activeTenant.unit, period: activeTenant.billingPeriod, amount: totalDue, breakdown: `Rent: ${activeTenant.billing.baseRent}`, status: 'UNPAID', method: paymentMethod, gateway: activeTenant.paymentGateway || 'Manual' });
    }
    setShowReceipt(true);
  };

  // Adjust invoice: the bill's manual lines and due date, through
  // adjust_invoice.php (which recomputes the total from every column, logs it
  // and tells the tenant). Only for a single bill no payment is in flight for.
  const openAdjust = () => {
    const inv = activeTenant?.adjustInvoice;
    if (!inv) return;
    const form = { invoiceId: inv.id, period: inv.billing_period, originalDue: String(inv.due_date || '').slice(0, 10), dueDate: String(inv.due_date || '').slice(0, 10),
      services: Number(inv.services || 0), maintenance: Number(inv.maintenance || 0), securityDeposit: Number(inv.security_deposit || 0), oldTotal: Number(inv.total_amount || 0) };
    ADJUST_LINES.forEach(([key, column]) => { form[key] = String(Number(inv[column] || 0)); });
    form.reason = '';
    setAdjustError('');
    setAdjustReasonError('');
    setAdjustForm(form);
  };
  // Same rule as adjust_invoice.php: 5 to 255 characters, spaces collapsed.
  const checkAdjustReason = (value) => {
    const r = String(value || '').replace(/\s+/g, ' ').trim();
    if (!r) return 'Enter the reason for this adjustment.';
    if (r.length < ADJUST_REASON_MIN || r.length > ADJUST_REASON_MAX) return `The reason must be ${ADJUST_REASON_MIN} to ${ADJUST_REASON_MAX} characters.`;
    return '';
  };
  const adjustTotal = adjustForm
    ? ADJUST_LINES.reduce((s, [key]) => s + (Number(adjustForm[key]) || 0), 0) + adjustForm.services + adjustForm.maintenance + adjustForm.securityDeposit
    : 0;
  const submitAdjust = async (e) => {
    e?.preventDefault();
    if (!adjustForm || adjusting) return;
    for (const [key, , label] of ADJUST_LINES) {
      const err = checkAmount(adjustForm[key], { label, required: false });
      if (err) { setAdjustError(err); return; }
    }
    if (adjustForm.dueDate !== adjustForm.originalDue && adjustForm.dueDate < localDateString()) {
      setAdjustError('The due date cannot be in the past.');
      return;
    }
    const reasonErr = checkAdjustReason(adjustForm.reason);
    if (reasonErr) { setAdjustReasonError(reasonErr); return; }
    setAdjusting(true);
    try {
      const payload = { invoiceId: adjustForm.invoiceId, dueDate: adjustForm.dueDate, reason: adjustForm.reason.replace(/\s+/g, ' ').trim() };
      ADJUST_LINES.forEach(([key]) => { payload[key] = Number(adjustForm[key]) || 0; });
      const res = await api.post('/adjust_invoice.php', payload);
      if (res.data?.success) {
        setAdjustForm(null);
        fetchInvoices();
        showFlash(`Invoice ${adjustForm.invoiceId} adjusted — new total ${formatCurrency(res.data.total_amount)}. The tenant has been notified.`);
      } else if (res.data?.errors?.reason) {
        setAdjustReasonError(res.data.errors.reason);
      } else {
        setAdjustError(res.data?.message || 'Could not adjust the invoice.');
      }
    } catch (err) {
      const serverReason = err?.response?.data?.errors?.reason;
      if (serverReason) setAdjustReasonError(serverReason);
      else setAdjustError(apiErrorMessage(err, 'Could not adjust the invoice.'));
    } finally {
      setAdjusting(false);
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
      <div className="admin-shell flex h-screen bg-slate-50 font-sans text-slate-900">
        <Sidebar />
        <main className="flex-1 flex flex-col h-screen overflow-hidden text-left bg-slate-50">
          <Header title="Payment Management" />
          <div className="flex-1 flex items-center justify-center p-6 md:p-8">
             <p className="text-slate-500 text-sm font-semibold animate-pulse">Loading active tenant ledger parameters safely...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!activeTenant) {
    return (
      <div className="admin-shell flex h-screen bg-slate-50 font-sans text-slate-900">
        <Sidebar />
        <main className="flex-1 flex flex-col h-screen overflow-hidden text-left bg-slate-50">
          <Header title="Payment Management" />
          <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-8 text-center bg-white border border-slate-200 rounded-xl m-6">
             <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-2xl mb-4">
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
    <div className="admin-shell flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left bg-slate-50">
        <Header title="Payment Management" />

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Summary Cards */}
            <div className="stagger-children grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard icon={faDollarSign} color="emerald" title="Total Collected" value={formatCurrency(totalCollected)} />
              <StatCard
                icon={faExclamationTriangle}
                color={overdueCount > 0 ? 'red' : 'slate'}
                title="Overdue Accounts"
                value={overdueCount}
                subtext={overdueInvoiceCount > 0 ? `across ${overdueInvoiceCount} invoice${overdueInvoiceCount === 1 ? '' : 's'}` : null}
              />
              <StatCard icon={faCalendarAlt} color="amber" title="Pending Payments" value={pendingCount} />
              <StatCard
                icon={faMoneyBillWave}
                color={totalOutstanding > 0 ? 'red' : 'slate'}
                title="Total Outstanding"
                value={formatCurrency(totalOutstanding)}
                subtext={advanceAwaitingTotal > 0 ? `Excludes ${formatCurrency(advanceAwaitingTotal)} advance rent awaiting payment` : null}
              />
            </div>

            {/* Due Date Indicator Bar with Batch Reminder Button */}
            {(dueWithin5DaysCount > 0 || overdueCount > 0) && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-xl text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-700 text-base" />
                  <span>
                    <strong>{overdueCount}</strong> overdue account(s) and <strong>{dueWithin5DaysCount}</strong> bill(s) due within 5 days.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleBatchReminders}
                  disabled={batchSending}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer border-0 shrink-0 self-start sm:self-auto disabled:opacity-50"
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
                  {/* Search on its own row: beside the two filters it was squeezed to "Searc". */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus-within:border-indigo-500 transition-all">
                      <FontAwesomeIcon icon={faSearch} className="text-slate-500 text-xs" />
                      <input aria-label="Search tenants" maxLength={LIMITS.search} type="text" placeholder="Search tenant..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-transparent text-sm outline-none border-0 p-0 text-slate-800 bg-white" />
                    </div>
                    <div className="flex gap-2">
                      <select aria-label="Filter by payment status" 
                        value={statusFilter} 
                        onChange={e => setStatusFilter(e.target.value)} 
                        className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 outline-none cursor-pointer focus:border-indigo-500 transition-all"
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
                      <select aria-label="Sort tenants" 
                        value={sortOption} 
                        onChange={e => setSortOption(e.target.value)} 
                        className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 outline-none cursor-pointer focus:border-indigo-500 transition-all"
                      >
                        <option value="name-asc">Name ↑</option>
                        <option value="name-desc">Name ↓</option>
                        <option value="due-asc">Due ↑</option>
                        <option value="due-desc">Due ↓</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div ref={tenantListRef} className="relative flex-1 overflow-y-auto">
                  {filteredTenants.map(t => {
                    const days = getDaysUntilDue(t.dueDate);
                    const isDueSoon = t.status !== 'paid' && days !== null && days >= 0 && days <= 5;
                    const fallbackTotal = t.billing.baseRent + t.billing.water + t.billing.electricity + t.billing.parking + t.billing.services + t.billing.maintenance;
                    const tenantTotalDue = t.outstandingBalance > 0 ? t.outstandingBalance : fallbackTotal;
                    return (
                      <div key={t.id} {...clickable(() => {setSelectedTenantId(t.id); setHistoryPage(1);})} aria-pressed={selectedTenantId === t.id} className={`p-3.5 border-b border-slate-100 border-l-4 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 ${selectedTenantId === t.id ? 'bg-indigo-50 border-l-indigo-600' : 'border-l-transparent hover:bg-slate-50'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-800 m-0 flex items-center gap-2 min-w-0 truncate">
                            <span className="truncate">{t.name}</span>
                            {t.status === 'overdue' && <FontAwesomeIcon icon={faCircle} className="text-[8px] text-red-600 animate-pulse" />}
                            {t.status === 'payment-failed' && <FontAwesomeIcon icon={faCircle} className="text-[8px] text-red-600 animate-pulse" />}
                            {t.status === 'pending-verification' && <FontAwesomeIcon icon={faCircle} className="text-[8px] text-indigo-500 animate-pulse" />}
                            {t.status === 'scheduled' && <FontAwesomeIcon icon={faCircle} className="text-[8px] text-blue-500" />}
                            {t.status === 'processing' && <FontAwesomeIcon icon={faCircle} className="text-[8px] text-amber-700 animate-pulse" />}
                            {isDueSoon && t.status !== 'pending-verification' && t.status !== 'scheduled' && t.status !== 'processing' && t.status !== 'payment-failed' && <FontAwesomeIcon icon={faCircle} className="text-[8px] text-amber-700" />}
                          </p>
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold text-center uppercase shrink-0 ${
                            t.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 
                            t.status === 'pending-verification' ? 'bg-indigo-100 text-indigo-800' : 
                            t.status === 'scheduled' ? 'bg-blue-100 text-blue-800' : 
                            t.status === 'processing' ? 'bg-amber-100 text-amber-800' :
                            'bg-red-100 text-red-800'
                          }`}>{t.status === 'pending-verification' ? 'VERIFY' : t.status}</span>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <p className="text-xs text-slate-600 m-0 min-w-0 truncate">Unit {t.unit} · {t.pastDue ? `Overdue ${t.daysPastDue} day${t.daysPastDue === 1 ? "" : "s"} · covers ${t.coveredPeriod}` : `Due ${t.dueDate}`}</p>
                          {t.status !== 'paid'
                            ? <p className="text-sm font-bold text-slate-900 m-0 shrink-0">{formatCurrency(tenantTotalDue)}</p>
                            : <p className="text-xs font-medium text-slate-600 m-0 shrink-0">No balance</p>}
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
                        ? `This account is ${activeTenant.daysPastDue} day${activeTenant.daysPastDue === 1 ? "" : "s"} overdue for the period ${activeTenant.coveredPeriod}.`
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
                          <span className="text-[11px] text-slate-500 bg-slate-50 px-2 py-1 rounded-md border border-slate-200">
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

                  {/* Read-only: what the bill says. The period, charges and due
                      date are changed with "Adjust invoice", never at the till. */}
                  <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-5 gap-3 mb-2">
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <p className="text-[11px] uppercase text-slate-500 font-semibold mb-1 m-0">Period</p>
                      <p className="text-sm font-medium text-slate-800 m-0">{activeTenant.billingPeriod || '—'}</p>
                    </div>
                    {/* A past-due bill shows the period it covers (from move-in), not its lapsed due date. */}
                    {activeTenant.pastDue ? (
                      <div className="bg-rose-50 p-3 rounded-lg border border-rose-100">
                        <p className="text-[11px] uppercase text-rose-700 font-semibold mb-1 m-0">Covers (overdue)</p>
                        <p className="text-sm font-medium text-rose-800 m-0">{activeTenant.coveredPeriod}</p>
                      </div>
                    ) : (
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <p className="text-[11px] uppercase text-slate-500 font-semibold mb-1 m-0">Due Date</p>
                      <p className="text-sm font-medium text-slate-800 m-0">{activeTenant.dueDate || '—'}</p>
                    </div>
                    )}
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <p className="text-[11px] uppercase text-slate-500 font-semibold mb-1 m-0">Term</p>
                      <p className="text-sm font-medium text-slate-800 m-0">Monthly</p>
                      <p className="text-[11px] leading-snug text-slate-500 m-0 mt-0.5">Due on the move-in day each month</p>
                    </div>
                    {[['Security Deposit', depositChip(activeTenant.account)], ['Prepaid Rent', prepaidChip(activeTenant.account)]].map(([label, chip]) => (
                      <div key={label} className="bg-white p-3 rounded-lg border border-slate-200">
                        <p className="text-[11px] uppercase text-slate-500 font-semibold mb-1 m-0">{label}</p>
                        <p className={`text-sm font-semibold m-0 ${CHIP_TONES[chip.tone]}`}>{chip.text}</p>
                        {chip.sub && <p className="text-[11px] leading-snug text-slate-500 m-0 mt-0.5">{chip.sub}</p>}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-3 mb-6 text-[11px] text-slate-500">
                    <span>Amounts, period and due date come from the invoice.</span>
                    {activeTenant.adjustInvoice && (
                      <button type="button" onClick={openAdjust} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 border-solid text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                        <FontAwesomeIcon icon={faFileAlt} /> Adjust invoice…
                      </button>
                    )}
                  </div>

                  {activeTenant.adjustments?.length > 0 && (
                    <details className="mb-6 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
                      <summary className="cursor-pointer font-semibold text-slate-700">Adjustment history ({activeTenant.adjustments.length})</summary>
                      <ul className="m-0 mt-2 p-0 list-none space-y-2">
                        {activeTenant.adjustments.map(a => (
                          <li key={a.id} className="border-t border-slate-100 pt-2">
                            <p className="m-0 text-[11px] text-slate-500">
                              {a.created_at ? new Date(String(a.created_at).replace(' ', 'T')).toLocaleString() : '—'} · {a.admin || 'Admin'}
                              {activeTenant.advanceGroup ? <> · <span className="font-mono">{a.invoiceId}</span></> : null}
                            </p>
                            <p className="m-0 mt-0.5 text-slate-800">“{a.reason}”</p>
                            <p className="m-0 mt-0.5 text-[11px]">
                              {Object.entries(a.changes || {}).map(([line, [from, to]]) => (
                                <span key={line} className="mr-3 inline-block">
                                  {ADJUSTMENT_LINE_LABELS[line] || line}: {line === 'due_date' ? `${from || '—'} → ${to || '—'}` : `${formatCurrency(from)} → ${formatCurrency(to)}`}
                                </span>
                              ))}
                              <span className="inline-block font-semibold text-slate-700">Total: {formatCurrency(a.old_total)} → {formatCurrency(a.new_total)}</span>
                            </p>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}

                  {activeTenant.advanceInvoice && (
                    <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                      <p className="m-0 text-xs font-bold text-indigo-800">
                        Advance payment · {activeTenant.advanceInvoice.months} month{activeTenant.advanceInvoice.months === 1 ? '' : 's'} · <span className="font-mono">{activeTenant.advanceInvoice.id}</span>
                      </p>
                      <p className="m-0 mt-1 text-[11px] text-indigo-700">
                        {activeTenant.advanceInvoice.label}. Confirming it credits each month; the monthly rent invoices are still issued on their usual dates and paid from the credit, each with its own receipt.
                      </p>
                    </div>
                  )}

                  {activeTenant.account?.deposit?.state === 'unpaid' && activeTenant.pendingInvoiceId !== activeTenant.account.deposit.move_in_invoice && (
                    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                      <strong>Move-in invoice unpaid:</strong> {activeTenant.account.deposit.move_in_invoice} (advance rent + security deposit) is still open. The tenancy cannot start until it is paid.
                    </div>
                  )}

                  {activeTenant.advanceGroup && (
                    <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                      <p className="m-0 text-xs font-bold text-indigo-800">
                        {isBundleKey(activeTenant.advanceGroup.key) ? 'Combined payment' : 'Advance payment'} · {activeTenant.advanceGroup.months.length} {isBundleKey(activeTenant.advanceGroup.key) ? 'bill' : 'month'}{activeTenant.advanceGroup.months.length === 1 ? '' : 's'} · <span className="font-mono">{activeTenant.advanceGroup.key}</span>
                      </p>
                      <p className="m-0 mt-1 text-[11px] text-indigo-700">
                        Paid with one payment; confirming it settles each billing period as its own invoice, with its own receipt{isBundleKey(activeTenant.advanceGroup.key) ? ', plus one combined receipt for the tenant' : ''}.
                      </p>
                      <ul className="m-0 mt-2 pl-4 text-[11px] text-indigo-900 space-y-0.5">
                        {activeTenant.advanceGroup.months.map(m => (
                          <li key={m.id}>{m.billing_period} — {isPastDue(m) ? `covers ${formatCoveredPeriod(m)}` : `due ${m.due_date}`} — {formatCurrency(m.total_amount)} <span className="text-indigo-500">({m.id})</span></li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex items-end justify-between gap-4 border-t border-slate-100 pt-4 mb-6">
                    <div className="max-w-xs flex items-start gap-2 text-[11px] text-slate-500">
                      <FontAwesomeIcon icon={faInfoCircle} className="mt-0.5 text-indigo-400" />
                      <p className="m-0">The bill is settled in full at its total. To change a charge or the due date, or to add a one-off charge, adjust the invoice first; a rent extension is billed from the tenant's extension request.</p>
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
                        {activeTenant.billing.lateFee > 0 && <div className="flex justify-end gap-4"><span className="w-32 text-right">Late Fee:</span> <span className="w-20 text-right font-semibold text-slate-700">{formatCurrency(activeTenant.billing.lateFee)}</span></div>}
                        <div className="border-t border-slate-200 my-1 ml-auto w-56"></div>
                      </div>
                      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1 m-0">Total Due</p>
                      <p className="text-3xl font-bold text-indigo-600 m-0 mt-0.5">{formatCurrency(totalDue)}</p>
                    </div>
                  </div>

                  {/* Payment Recording Area */}
                  {totalDue > 0 && activeTenant.status !== 'paid' && (
                    <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 mb-6">
                      <div className="mb-4 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-slate-800 m-0">Record Payment</h4>
                          <p className="mt-1 text-xs text-slate-500">{splitMode ? 'Allocate how the tenant is settling this bill' : 'Select the received payment method and verify details'}</p>
                        </div>
                        <label className="inline-flex shrink-0 items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">
                          <input type="checkbox" className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500" checked={splitMode} disabled={activeTenant.methodLocked || tenantSplit} onChange={e => setSplitMode(e.target.checked)} />
                          Split Payment
                        </label>
                      </div>
                      <div className={`grid grid-cols-1 ${splitMode ? '' : 'md:grid-cols-3'} gap-4 mb-4`}>
                        <div>
                          {!splitMode && <label htmlFor="record-paymentMethod" className="mb-1 block text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Method</label>}
                          {!splitMode && <>
                            <select {...recordForm.fieldA11y('paymentMethod')} value={paymentMethod} disabled={activeTenant.methodLocked} onChange={e => { setPaymentMethod(e.target.value); recordForm.setErrors({}); }} className={`w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-white focus:border-indigo-500 disabled:bg-slate-100 disabled:cursor-not-allowed${invalidCls(recordForm.errors.paymentMethod)}`}>
                              {allowedMethods.map(m => <option key={m} value={m}>{m === 'cash' ? 'Cash' : m === 'gcash' ? 'GCash' : 'Bank Transfer'}</option>)}
                            </select>
                            {paymentMethod === 'bank_transfer' && <><select className="w-full mt-2 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white" value={paymentParts[0]?.bank_name || ''} onChange={e => setPaymentParts([{ ...paymentParts[0], bank_name: e.target.value }])}><option value="">Select bank</option>{BANKS.map(b => <option key={b}>{b}</option>)}</select>{paymentParts[0]?.bank_name === 'Other' && <input className={`${AMOUNT_INPUT} mt-2`} placeholder="Enter bank name" value={paymentParts[0]?.other_bank_name || ''} onChange={e => setPaymentParts([{ ...paymentParts[0], other_bank_name: e.target.value }])} />}</>}
                            <FieldError id="record-paymentMethod" error={recordForm.errors.paymentMethod} />
                          </>}
                          {activeTenant.methodLocked ? (
                            <p className="text-[11px] text-slate-500 m-0 mt-1">Declared by the tenant with their proof ({activeTenant.declaredLabel}). To record another method, reject the proof.</p>
                          ) : activeTenant.declaredLabel && (
                            <p className="text-[11px] text-slate-500 m-0 mt-1">Tenant chose: {activeTenant.declaredLabel}</p>
                          )}
                        </div>
                        <div>
                          {!splitMode && <label htmlFor="record-amountPaid" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">{paymentMethod === 'cash' ? 'Amount Tendered' : 'Amount Received'}</label>}
                          {!splitMode && <input type="number" {...recordForm.fieldA11y('amountPaid')} inputMode="decimal" min="0" max={MAX_AMOUNT} step="0.01" value={amountTendered}
                            onKeyDown={blockNonNumericKeys}
                            onChange={e => { setAmountTendered(e.target.value); recordForm.clearError('amountPaid'); }}
                            onBlur={() => amountTendered !== '' && blurRecord('amountPaid')}
                            className={AMOUNT_INPUT + invalidCls(recordForm.errors.amountPaid)} placeholder="0" />}
                          {splitMode && <div className="w-full min-w-0 space-y-3">
                            <div className="hidden grid-cols-12 gap-3 px-3 text-[11px] font-bold uppercase tracking-wide text-slate-500 sm:grid"><div className="col-span-3">Method</div><div className="col-span-4">Bank / Reference No.</div><div className="col-span-4">Amount (PHP)</div><div className="col-span-1 text-center">Action</div></div>
                            {paymentParts.map((part, index) => {
                              const updatePart = (changes) => setPaymentParts(parts => parts.map((p, i) => i === index ? { ...p, ...changes } : p));
                              const amountValue = Number(part.amount);
                              const amountError = part.amount !== '' && (!Number.isFinite(amountValue) || amountValue <= 0 || amountValue > totalDue);
                              const referenceError = part.method !== 'cash' && !part.reference_number.trim();
                              return <div key={index} className="grid w-full min-w-0 grid-cols-12 items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                                <select aria-label={`Portion ${index + 1} payment method`} className={`${AMOUNT_INPUT} col-span-12 w-full min-w-0 sm:col-span-3`} value={part.method} disabled={tenantSplit} onChange={e => { const method = e.target.value; const tenantRef = activeTenant.paymentReference || ''; const used = paymentParts.some((p, i) => i !== index && p.reference_number === tenantRef); updatePart({ method, bank_name: '', reference_number: method !== 'cash' && tenantRef && !used ? tenantRef : '' }); }}><option value="cash">Cash</option><option value="gcash">GCash</option><option value="bank_transfer">Bank Transfer</option></select>
                                <div className="col-span-12 min-w-0 sm:col-span-4">
                                  {part.method === 'cash' ? <div className="flex min-h-[38px] items-center rounded-lg border border-slate-200 bg-slate-100 px-3 text-xs text-slate-500">Physical Cash Over-the-counter</div> : part.method === 'bank_transfer' ? <div className="space-y-2"><select aria-label="Bank name" className={`${AMOUNT_INPUT} w-full min-w-0`} value={part.bank_name} onChange={e => updatePart({ bank_name: e.target.value })}><option value="">Select bank</option>{BANKS.map(b => <option key={b}>{b}</option>)}</select>{part.bank_name === 'Other' && <input className={`${AMOUNT_INPUT} w-full min-w-0`} placeholder="Enter bank name" value={part.other_bank_name || ''} onChange={e => updatePart({ other_bank_name: e.target.value })} />}<input aria-label="Reference / transaction number" required className={`${AMOUNT_INPUT} w-full min-w-0${referenceError ? ' border-red-400 focus:border-red-500' : ''}`} placeholder="Reference / Transaction No." value={part.reference_number} onChange={e => updatePart({ reference_number: e.target.value })} /><p className={`m-0 min-h-4 text-xs ${referenceError || (part.reference_number.trim() && checkPaymentReference(part.reference_number, part.method)) ? 'text-red-600' : 'invisible'}`}>{referenceError ? 'Reference number is required.' : checkPaymentReference(part.reference_number, part.method) || 'Validation message'}</p></div> : <div><input aria-label="Reference number" required className={`${AMOUNT_INPUT} w-full min-w-0${referenceError ? ' border-red-400 focus:border-red-500' : ''}`} placeholder="Reference / Transaction No." value={part.reference_number} onChange={e => updatePart({ reference_number: e.target.value })} /><p className={`m-0 min-h-4 text-xs ${referenceError || (part.reference_number.trim() && checkPaymentReference(part.reference_number, part.method)) ? 'text-red-600' : 'invisible'}`}>{referenceError ? 'Reference number is required.' : checkPaymentReference(part.reference_number, part.method) || 'Validation message'}</p></div>}
                                </div>
                                <div className="col-span-10 min-w-0 sm:col-span-4"><div className="flex min-w-0 items-center gap-2"><div className="relative min-w-0 flex-1"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 select-none text-sm leading-none text-slate-500">₱</span><input aria-label="Portion amount" type="number" min="0.01" max={totalDue} step="0.01" inputMode="decimal" onKeyDown={blockNonNumericKeys} className={`${AMOUNT_INPUT} no-spinner w-full min-w-0 pl-8 pr-3${amountError ? ' border-red-400 focus:border-red-500' : ''}`} placeholder="Amount" value={part.amount} onChange={e => { const value = e.target.value; updatePart({ amount: value === '' ? '' : String(Math.min(Number(value), totalDue)) }); }} /></div></div><p className={`m-0 min-h-4 pt-1 text-xs ${amountError ? 'text-red-600' : 'invisible'}`}>{amountError ? `Enter an amount greater than ₱0 and no more than ${formatCurrency(totalDue)}.` : 'Validation message'}</p></div>
                                <div className="col-span-2 flex justify-center sm:col-span-1"><button type="button" aria-label={`Remove portion ${index + 1}`} disabled={paymentParts.length === 1 || tenantSplit} onClick={() => setPaymentParts(parts => parts.filter((_, i) => i !== index))} className="flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-slate-200 bg-white text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-35">✕</button></div>
                              </div>;
                            })}
                            <div className="flex flex-col justify-between gap-3 border-t border-slate-200 pt-3 sm:flex-row sm:items-center"><button type="button" disabled={paymentParts.length >= 2 || tenantSplit} title={paymentParts.length >= 2 ? 'Split payments use two methods at most' : undefined} onClick={() => setPaymentParts(parts => parts.length < 4 ? [...parts, { method: 'cash', bank_name: '', amount: '', reference_number: '' }] : parts)} className="self-start text-xs font-bold text-indigo-700 disabled:cursor-not-allowed disabled:opacity-45">+ Add payment portion ({paymentParts.length}/2)</button><div className="flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-full bg-indigo-50 px-3 py-1.5 text-indigo-700">Allocated: {formatCurrency(splitTotal)}</span><span className={`rounded-full px-3 py-1.5 ${remainingBalance === 0 ? 'bg-emerald-50 text-emerald-700' : remainingBalance > 0 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>{remainingBalance === 0 ? '✓ Balanced' : remainingBalance > 0 ? `Remaining: ${formatCurrency(remainingBalance)}` : `Over by ${formatCurrency(Math.abs(remainingBalance))}`}</span></div></div>
                          </div>}
                          {!splitMode && <FieldError id="record-amountPaid" error={recordForm.errors.amountPaid} />}
                          {!splitMode && activeTenant.canPartPay && declaredPart === null && (
                            <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-600">
                              <input type="checkbox" checked={adminPart} onChange={e => { setPartChoice({ tenant: activeTenant, on: e.target.checked }); recordForm.clearError('amountPaid'); }} />
                              Record part-payment (the rest stays due)
                            </label>
                          )}
                          {declaredPart !== null && partMode && <p className="m-0 mt-1 text-[11px] text-indigo-600">The tenant paid part of the bill: {formatCurrency(declaredPart)} of {formatCurrency(activeTenant.pendingAmount)}. It is recorded as a part-payment.</p>}
                          {(activeTenant.paidSoFar || 0) > 0 && (
                            <div className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50/60 p-2 text-[11px] text-slate-600">
                              <p className="m-0 font-semibold text-emerald-700">Paid so far {formatCurrency(activeTenant.paidSoFar)} of {formatCurrency(activeTenant.invoiceTotal)} · balance {formatCurrency(activeTenant.pendingAmount)}</p>
                              {(activeTenant.partsList || []).map(p => <p key={p.id} className="m-0">{String(p.created_at || '').slice(0, 10)} · {p.payment_method}{p.bank_name ? ` (${p.bank_name})` : ''} · {formatCurrency(p.amount)}{p.reference_number ? ` · ref ${p.reference_number}` : ''}</p>)}
                            </div>
                          )}
                        </div>
                        <div className={splitMode ? 'hidden' : ''}>
                          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Change</label>
                          <div className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-100 text-slate-700 font-semibold">{formatCurrency(change)}</div>
                        </div>
                      </div>

                      {!splitMode && paymentMethod !== 'cash' && (
                        <div className="mt-3">
                          <label htmlFor="record-paymentReference" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Reference No.</label>
                          <input
                            type="text"
                            {...recordForm.fieldA11y('paymentReference')}
                            autoComplete="off"
                            inputMode={paymentMethod === 'gcash' ? 'numeric' : 'text'}
                            value={paymentReference}
                            maxLength={paymentMethod === 'gcash' ? 13 : isBankMethod(paymentMethod) ? 55 : LIMITS.paymentReference}
                            onChange={e => { setPaymentReference(e.target.value); recordForm.clearError('paymentReference'); }}
                            onBlur={() => { const v = paymentReference.trim(); setPaymentReference(v); recordForm.validateField('paymentReference', { ...recordValues, paymentReference: v }); }}
                            className={AMOUNT_INPUT + invalidCls(recordForm.errors.paymentReference)}
                            placeholder={activeTenant.paymentReference || 'Transfer / transaction reference'}
                          />
                          <FieldError id="record-paymentReference" error={recordForm.errors.paymentReference} />
                        </div>
                      )}
                      
                      {(activeTenant.status === 'pending-verification' || activeTenant.proofOfPaymentPath) && (
                        <div className="mt-2 p-4 bg-indigo-50 border border-indigo-100 rounded-xl space-y-3">
                          <div className="flex items-center justify-between">
                            <h5 className="text-xs font-bold text-indigo-900 uppercase tracking-wider m-0 flex items-center gap-1.5">
                              <FontAwesomeIcon icon={faInfoCircle} /> E-Receipt Metadata Verification
                            </h5>
                            {activeTenant.status === 'pending-verification' && (
                              <span className="text-[11px] bg-indigo-200/70 text-indigo-900 px-2 py-0.5 rounded-full font-bold">Verification Needed</span>
                            )}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-indigo-950 font-medium">
                             <div><span className="text-indigo-500 font-bold mr-1">Sender Profile Name:</span> {activeTenant.senderName || 'Not Captured'}</div>
                             {!activeTenant.splitParts?.length && <div><span className="text-indigo-500 font-bold mr-1">Network Reference No:</span> <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-indigo-200/60 font-bold text-slate-800">{activeTenant.paymentReference || '—'}</span></div>}
                          </div>
                          {activeTenant.referenceReuse && (
                            <p role="status" className="m-0 flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800">
                              <FontAwesomeIcon icon={faExclamationTriangle} className="mt-0.5" />
                              <span>
                                Reference already used on invoice <span className="font-mono">{activeTenant.referenceReuse.invoice_id}</span>
                                {' '}({[activeTenant.referenceReuse.tenant_name, REUSE_STATUS_LABELS[activeTenant.referenceReuse.status] || activeTenant.referenceReuse.status].filter(Boolean).join(', ')}).
                                {' '}Check the proof before confirming.
                              </span>
                            </p>
                          )}
                          {activeTenant.splitParts?.length > 0 && (
                            <div className="space-y-1.5 border-t border-indigo-100 pt-2">
                              <div className="text-[11px] font-bold uppercase tracking-wide text-indigo-500">Split payment portions submitted by the tenant</div>
                              {activeTenant.splitParts.map((p, i) => (
                                <div key={i} className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700">
                                  <span>
                                    <strong>{{ cash: 'Cash', gcash: 'GCash', bank_transfer: 'Bank transfer' }[p.method] || p.method}</strong> {formatCurrency(p.amount)}
                                    {p.bank_name ? ` · ${p.bank_name}` : ''}
                                    {p.reference_number && <> · Ref <span className="font-mono font-bold">{p.reference_number}</span></>}
                                  </span>
                                  {p.proof_path ? (
                                    <span className="inline-flex flex-wrap items-center gap-1.5"><button type="button" onClick={() => setPreviewProof({ url: getBackendAssetUrl(p.proof_path), title: `Proof of Payment — ${activeTenant.name} (${activeTenant.unit})`, reference: p.reference_number, sender: activeTenant.senderName })}
                                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-50">
                                      <FontAwesomeIcon icon={faEye} /> Preview proof
                                    </button>
                                    <a href={getBackendAssetUrl(p.proof_path)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-[11px] font-bold text-indigo-700 no-underline hover:bg-indigo-50">
                                      <FontAwesomeIcon icon={faExternalLinkAlt} /> Open in new tab
                                    </a></span>
                                  ) : <span className="text-[11px] text-slate-500">Cash at the office{activeTenant.scheduledDate ? ` on ${activeTenant.scheduledDate} (${activeTenant.scheduledTimeSlot || 'time not set'})` : ''}</span>}
                                </div>
                              ))}
                            </div>
                          )}
                          {activeTenant.proofOfPaymentPath && !activeTenant.splitParts?.length && (
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
                           <p className="text-xs text-amber-800 m-0">An online checkout session is currently active. Please wait for the webhook to confirm payment. A payment can't be recorded here while it is open, so the tenant is never charged twice.</p>
                           <button type="button" onClick={handleReleaseCheckout} disabled={releasing}
                             className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-300 border-solid text-amber-800 text-xs font-semibold rounded-lg hover:bg-amber-100 cursor-pointer transition-colors disabled:opacity-50">
                             <FontAwesomeIcon icon={faTimes} /> {releasing ? 'Cancelling…' : 'Cancel online checkout'}
                           </button>
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

                  {totalDue > 0 && !['paid', 'processing', ...TENANT_ACTED_STATUSES].includes(activeTenant.status) && (
                    <p className="m-0 mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Waiting for the tenant to pay or schedule a visit in Pay Bills. You can clear this bill once they do.</p>
                  )}
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={handleConfirmPayment}
                      disabled={recording || totalDue <= 0 || !TENANT_ACTED_STATUSES.includes(activeTenant.status) || (splitMode && !splitCanProcess)}
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
                      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 m-0"><FontAwesomeIcon icon={faHistory} className="text-slate-500" /> Payment History</h3>
                    </div>
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 focus-within:border-indigo-400 transition-colors">
                      <FontAwesomeIcon icon={faSearch} className="text-slate-500 text-xs" />
                      <input aria-label="Filter payment history by period" maxLength={LIMITS.search} type="text" placeholder="Filter period..." value={historySearchPeriod} onChange={e => {setHistorySearchPeriod(e.target.value); setHistoryPage(1);}} className="bg-transparent text-xs outline-none border-0 p-0 text-slate-700 w-24 bg-slate-50" />
                    </div>
                  </div>
                  
                  <div className="w-full overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wide bg-slate-50">
                          <th className="w-32 px-4 py-3">Period</th>
                          <th className="w-28 px-4 py-3">Amount</th>
                          <th className="w-32 px-4 py-3">Method</th>
                          <th className="max-w-xs px-4 py-3">Breakdown</th>
                          <th className="w-40 px-4 py-3 whitespace-nowrap">Date Paid</th>
                          <th className="w-28 px-4 py-3 text-center whitespace-nowrap">Proof</th>
                          <th className="w-28 px-4 py-3 text-center whitespace-nowrap">Receipt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedHistory.length > 0 ? paginatedHistory.map((record, idx) => (
                          <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="w-32 px-4 py-3 font-medium text-slate-900">{record.period}</td>
                            <td className="w-28 px-4 py-3 font-bold text-emerald-700 whitespace-nowrap">{formatCurrency(record.amount)}</td>
                            <td className="w-32 px-4 py-3 text-slate-600"><span className="inline-block max-w-full whitespace-normal break-words rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5">{record.method?.toLowerCase() === 'split' || record.paymentTransactions?.length > 1 ? 'Split Payment' : record.method || (record.gateway?.includes('paymongo') ? 'PayMongo (Sandbox)' : 'N/A')}</span></td>
                            <td className="max-w-xs px-4 py-3 text-slate-600 break-words whitespace-normal" title={record.paymentTransactions?.length ? record.paymentTransactions.map(tx => `${formatCurrency(tx.amount)} ${tx.bank_name || tx.payment_method}${tx.reference_number ? ` (Ref: ${tx.reference_number})` : ''}`).join(' + ') : record.breakdown}>
                              {record.paymentTransactions?.length > 1
                                ? record.paymentTransactions.map(tx => `${formatCurrency(tx.amount)} ${tx.bank_name || tx.payment_method}${tx.reference_number ? ` (Ref: ${tx.reference_number})` : ''}`).join(' + ')
                                : record.paymentTransactions?.length === 1 && record.method?.toLowerCase() === 'split'
                                  ? `${formatCurrency(record.paymentTransactions[0].amount)} ${record.paymentTransactions[0].bank_name || record.paymentTransactions[0].payment_method}${record.paymentTransactions[0].reference_number ? ` (Ref: ${record.paymentTransactions[0].reference_number})` : ''}`
                                  : record.paymentReference ? `Ref: ${record.paymentReference}` : record.breakdown || '—'}
                            </td>
                            <td className="w-40 px-4 py-3 text-slate-500 whitespace-nowrap">{record.datePaid}</td>
                            <td className="w-28 px-4 py-3 text-center whitespace-nowrap">
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
                            <td className="w-28 px-4 py-3 text-center whitespace-nowrap"><button onClick={() => handleGenerateReceipt(record)} className="text-indigo-600 border-0 bg-slate-100 hover:bg-indigo-100 p-1.5 rounded cursor-pointer transition-colors text-xs" title="View Receipt"><FontAwesomeIcon icon={faPrint} /></button></td>
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
                  <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                    <span>Collected: {formatCurrency(monthlyCollected)}</span>
                    <span>Target: {formatCurrency(monthlyTarget)}</span>
                  </div>
                </div>

                {/* Outstanding Balance Aging */}
                <div>
                  <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3 m-0">Outstanding Balance Aging</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-center">
                      <p className="text-sm lg:text-base font-bold text-emerald-700 m-0">{formatCurrency(agingData.current)}</p>
                      <p className="text-[11px] text-emerald-700 font-semibold m-0 mt-0.5">Current</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-center">
                      <p className="text-sm lg:text-base font-bold text-amber-700 m-0">{formatCurrency(agingData.days15)}</p>
                      <p className="text-[11px] text-amber-700 font-semibold m-0 mt-0.5">1–15 Days</p>
                    </div>
                    <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 text-center">
                      <p className="text-sm lg:text-base font-bold text-orange-700 m-0">{formatCurrency(agingData.days30)}</p>
                      <p className="text-[11px] text-orange-600 font-semibold m-0 mt-0.5">16–30 Days</p>
                    </div>
                    <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-center">
                      <p className="text-sm lg:text-base font-bold text-red-700 m-0">{formatCurrency(agingData.days60plus)}</p>
                      <p className="text-[11px] text-red-600 font-semibold m-0 mt-0.5">60+ Days</p>
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
                              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                                t.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 
                                t.status === 'pending-verification' ? 'bg-indigo-100 text-indigo-800' : 
                                t.status === 'scheduled' ? 'bg-blue-100 text-blue-800' : 
                                t.status === 'processing' ? 'bg-amber-100 text-amber-800' :
                                'bg-red-100 text-red-800'
                              }`}>{t.status.toUpperCase()}</span>
                            </div>
                            <div className="flex justify-between mt-0.5">
                              <span className="text-[11px] text-slate-500">{paidCount} payments recorded</span>
                              {(t.outstandingBalance || 0) > 0 && <span className="text-[11px] text-red-600 font-semibold">Balance: {formatCurrency(t.outstandingBalance)}</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                
                {/* ─── OUTSTANDING BALANCE ─── */}
                {/* Payments, full or part, are recorded via Record Payment
                    above; this panel only monitors what is still owed. */}
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
                        <FontAwesomeIcon icon={faBalanceScale} className={(activeTenant.outstandingBalance || 0) > 0 ? 'text-red-600 text-xl' : 'text-emerald-700 text-xl'} />
                        <div>
                          <p className="text-sm font-bold text-slate-800 m-0">Outstanding Balance</p>
                          <p className="text-[11px] text-slate-500 m-0 mt-0.5">{activeTenant.name} · Unit {activeTenant.unit}</p>
                        </div>
                      </div>
                      <p className={`text-2xl font-bold m-0 ${(activeTenant.outstandingBalance || 0) > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
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
                  <FontAwesomeIcon icon={faShieldAlt} className="text-emerald-700" />
                  Security Deposit Tracking Ledger
                </h3>
                <span className="text-xs font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-100 uppercase tracking-wider">Non-Refundable Held Assets</span>
              </div>
              
              <div className="p-6 space-y-6">
                {/* Deposit metrics summary cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <StatCard icon={faShieldAlt} color="emerald" title="Total Deposits Held" value={formatCurrency(totalDepositsHeld)} />
                  <StatCard icon={faExclamationTriangle} color="amber" title="Total Billing Deductions Applied" value={formatCurrency(totalDepositDeductions)} />
                  <StatCard icon={faCheckCircle} color="indigo" title="Total Applied to Last Rent Month" value={formatCurrency(totalAppliedToRent)} />
                </div>

                {/* Ledger search, filter and sort */}
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <div className="flex-1 flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus-within:border-indigo-500 transition-all">
                    <FontAwesomeIcon icon={faSearch} className="text-slate-500 text-xs" />
                    <input maxLength={LIMITS.search} type="text" aria-label="Search deposits by tenant or unit" placeholder="Search tenant or unit..." value={depositSearch} onChange={(e) => setDepositSearch(e.target.value)} className="w-full bg-transparent text-sm outline-none border-0 p-0" />
                  </div>
                  <div className="flex gap-2">
                    <select aria-label="Filter deposits" value={depositFilter} onChange={(e) => setDepositFilter(e.target.value)} className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 outline-none cursor-pointer focus:border-indigo-500 transition-all">
                      {DEPOSIT_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <select aria-label="Sort deposits" value={depositSort} onChange={(e) => setDepositSort(e.target.value)} className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 outline-none cursor-pointer focus:border-indigo-500 transition-all">
                      {DEPOSIT_SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                  <span className="text-[11px] text-slate-500 font-semibold sm:ml-auto whitespace-nowrap">{visibleContracts.length} of {contracts.length}</span>
                </div>

                {/* Detailed Deposits Table */}
                <div className="hidden md:block overflow-x-auto border border-slate-100 rounded-xl">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wide bg-slate-50">
                        <th className="py-3 px-4">Tenant Name</th>
                        <th className="py-3 px-4 text-center">Unit</th>
                        <th className="py-3 px-4">Rent Term</th>
                        <th className="py-3 px-4">Original Deposit</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Fixture Damages</th>
                        <th className="py-3 px-4">Unpaid Utilities</th>
                        <th className="py-3 px-4">Applied to Rent</th>
                        <th className="py-3 px-4">Refunded</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleContracts.length > 0 ? visibleContracts.map((c, idx) => {
                        const { tenantName, unit, leaseStart, leaseEnd, baseDeposit, dmg, utl, appliedRent, status, items } = depositRowData(c);

                        return (
                          <Fragment key={idx}>
                          <tr className={`hover:bg-slate-50/50${items.length > 0 ? ' [&>td]:pb-1.5' : ''}`}>
                            <td className="py-3.5 px-4 font-bold text-slate-800">{tenantName}</td>
                            <td className="py-3.5 px-4 text-center font-bold text-indigo-600">{unit}</td>
                            <td className="py-3.5 px-4 text-slate-500">{leaseStart} – {leaseEnd}</td>
                            <td className="py-3.5 px-4 font-semibold text-slate-700">{formatCurrency(baseDeposit)}</td>
                            <td className="py-3.5 px-4">{depositStatusBadge(status)}</td>
                            <td className={`py-3.5 px-4 font-semibold ${dmg > 0 ? 'text-red-600' : 'text-slate-500'}`}>{dmg > 0 ? formatCurrency(dmg) : '—'}</td>
                            <td className={`py-3.5 px-4 font-semibold ${utl > 0 ? 'text-red-600' : 'text-slate-500'}`}>{utl > 0 ? formatCurrency(utl) : '—'}</td>
                            <td className="py-3.5 px-4 font-bold text-indigo-600">{appliedRent > 0 ? formatCurrency(appliedRent) : '—'}</td>
                            <td className="py-3.5 px-4 text-slate-500 font-medium">₱0.00 <span className="text-[11px] text-slate-500 italic font-normal">(Non-Refundable)</span></td>
                          </tr>
                          {items.length > 0 && (
                            <tr className="border-t-0">
                              <td colSpan="9" className="px-4 pb-3 pt-0">
                                <div className="ml-4 max-w-xl bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 m-0 mb-1">Deductions</p>
                                  {depositItemsList(items)}
                                </div>
                              </td>
                            </tr>
                          )}
                          </Fragment>
                        );
                      }) : (
                        <tr><td colSpan="9" className="py-6 text-center text-slate-500">{contracts.length > 0 ? "No deposits match the search or filter." : "No security deposit transactions registered."}</td></tr>
                      )}
                    </tbody>
                  </table>
              </div>

                {/* Deposit cards (phones) */}
                <div className="md:hidden space-y-3">
                  {visibleContracts.length > 0 ? visibleContracts.map((c, idx) => {
                    const { tenantName, unit, leaseStart, leaseEnd, baseDeposit, dmg, utl, appliedRent, status, items } = depositRowData(c);
                    return (
                      <div key={idx} className="border border-slate-100 rounded-xl p-4 space-y-2 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-bold text-slate-800 m-0 truncate">{tenantName}</p>
                            <p className="text-xs text-slate-500 m-0 mt-0.5"><span className="font-bold text-indigo-600">Unit {unit}</span> · {leaseStart} – {leaseEnd}</p>
                          </div>
                          <div className="shrink-0">{depositStatusBadge(status)}</div>
                        </div>
                        <dl className="space-y-1.5 m-0 pt-2 border-t border-slate-100">
                          {[
                            ['Original deposit', formatCurrency(baseDeposit), 'text-slate-700'],
                            ['Fixture damages', dmg > 0 ? formatCurrency(dmg) : '—', dmg > 0 ? 'text-red-600' : 'text-slate-500'],
                            ['Unpaid utilities', utl > 0 ? formatCurrency(utl) : '—', utl > 0 ? 'text-red-600' : 'text-slate-500'],
                            ['Applied to rent', appliedRent > 0 ? formatCurrency(appliedRent) : '—', 'text-indigo-600'],
                            ['Refunded', '₱0.00 (Non-Refundable)', 'text-slate-500'],
                          ].map(([label, value, tone]) => (
                            <div key={label} className="flex justify-between gap-3">
                              <dt className="text-slate-500">{label}</dt>
                              <dd className={`m-0 font-semibold text-right ${tone}`}>{value}</dd>
                            </div>
                          ))}
                        </dl>
                        {items.length > 0 && (
                          <div className="pt-2 border-t border-slate-100">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 m-0 mb-1">Deductions</p>
                            {depositItemsList(items)}
                          </div>
                        )}
                      </div>
                    );
                  }) : (
                    <div className="py-6 text-center text-slate-500 text-sm">{contracts.length > 0 ? "No deposits match the search or filter." : "No security deposit transactions registered."}</div>
                  )}
                </div>
            </div>
            </div>
            </div>
            )}

          </div>
        </div>
      </main>

      {/* Adjust Invoice Modal — adjust_invoice.php */}
      {adjustForm && (
        <Modal title="Adjust Invoice" onClose={() => setAdjustForm(null)} busy={adjusting} as="form" overlayClassName="flex items-center justify-center bg-black/40 backdrop-blur-sm" className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onSubmit={submitAdjust} noValidate>
            <div className="p-6">
              <h3 className="text-lg font-bold text-slate-800 mb-1 mt-0">Adjust Invoice</h3>
              <p className="text-xs text-slate-500 m-0 mb-4"><span className="font-mono">{adjustForm.invoiceId}</span> · {adjustForm.period}. The change is logged and the tenant is notified of the new total.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                {ADJUST_LINES.map(([key, , label]) => (
                  <div key={key}>
                    <label htmlFor={`adjust-${key}`} className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</label>
                    <input id={`adjust-${key}`} type="number" inputMode="decimal" min="0" max={MAX_AMOUNT} step="0.01" value={adjustForm[key]}
                      onKeyDown={blockNonNumericKeys}
                      onChange={e => { setAdjustForm({ ...adjustForm, [key]: e.target.value }); setAdjustError(''); }}
                      className={AMOUNT_INPUT} />
                  </div>
                ))}
                <div>
                  <label htmlFor="adjust-dueDate" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Due date</label>
                  <input id="adjust-dueDate" type="date" min={adjustForm.originalDue < localDateString() ? adjustForm.originalDue : localDateString()} max={maxFutureDate()} value={adjustForm.dueDate}
                    onChange={e => { setAdjustForm({ ...adjustForm, dueDate: e.target.value }); setAdjustError(''); }}
                    className={AMOUNT_INPUT} />
                </div>
              </div>
              {(adjustForm.services > 0 || adjustForm.maintenance > 0 || adjustForm.securityDeposit > 0) && (
                <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded p-2 m-0 mb-3">
                  Already posted, not editable here: Services {formatCurrency(adjustForm.services)} · Maintenance {formatCurrency(adjustForm.maintenance)} · Security deposit {formatCurrency(adjustForm.securityDeposit)}.
                </p>
              )}
              <div className="mb-3">
                <label htmlFor="adjust-reason" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Reason <span className="text-red-600">*</span></label>
                <textarea id="adjust-reason" rows={2} maxLength={ADJUST_REASON_MAX} value={adjustForm.reason}
                  placeholder="e.g. Water billed twice; corrected to the provider bill"
                  aria-invalid={adjustReasonError ? 'true' : undefined} aria-describedby={adjustReasonError ? 'adjust-reason-error' : 'adjust-reason-hint'}
                  onChange={e => { setAdjustForm({ ...adjustForm, reason: e.target.value }); setAdjustReasonError(''); setAdjustError(''); }}
                  onBlur={e => setAdjustReasonError(checkAdjustReason(e.target.value))}
                  className={`w-full px-3 py-2 text-sm border border-solid rounded-lg outline-none text-slate-800 bg-white focus:border-indigo-500 resize-y ${adjustReasonError ? 'border-red-400' : 'border-slate-200'}`} />
                {adjustReasonError
                  ? <p id="adjust-reason-error" role="alert" className="text-[11px] text-red-700 m-0 mt-1">{adjustReasonError}</p>
                  : <p id="adjust-reason-hint" className="text-[11px] text-slate-500 m-0 mt-1">Kept in the invoice's adjustment history and quoted in the tenant's notice.</p>}
              </div>
              <div className="flex justify-between text-sm mb-4">
                <span className="text-slate-500">Total {formatCurrency(adjustForm.oldTotal)} →</span>
                <span className="font-bold text-indigo-700">{formatCurrency(adjustTotal)}</span>
              </div>
              {adjustError && <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 m-0 mb-3">{adjustError}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={adjusting} className="flex-1 py-2 bg-indigo-600 text-white rounded text-sm font-semibold hover:bg-indigo-700 border-0 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{adjusting ? 'Saving…' : 'Save Adjustment'}</button>
                <button type="button" disabled={adjusting} onClick={() => setAdjustForm(null)} className="flex-1 disabled:opacity-50 py-2 bg-white border border-slate-300 text-slate-700 rounded text-sm font-semibold hover:bg-slate-50 border-solid cursor-pointer transition-colors">Cancel</button>
              </div>
            </div>
          </Modal>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <Modal title="Confirm Payment" onClose={() => setShowConfirmModal(false)} busy={recording} overlayClassName="flex items-center justify-center bg-black/40 backdrop-blur-sm" className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="p-6">
              <h3 className="text-lg font-bold text-slate-800 mb-2 mt-0">Confirm Payment</h3>
              <p className="text-sm text-slate-600 mb-4">Are you sure you want to process this payment? This action will generate an official receipt record row.</p>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-sm space-y-2 mb-6">
                <div className="flex justify-between"><span className="text-slate-500">Tenant</span><span className="font-semibold text-slate-800">{activeTenant.name}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Period</span><span className="font-semibold text-slate-800 text-right">{activeTenant.billingPeriod}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Amount</span><span className="font-bold text-emerald-700">{formatCurrency(totalDue)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Method</span><span className="font-semibold text-slate-800">{paymentMethod}</span></div>
              </div>
              {(() => {
                const methodName = { cash: 'Cash', gcash: 'GCash', bank_transfer: 'Bank transfer' };
                const note = activeTenant.status === 'scheduled'
                  ? `The tenant scheduled an in-person visit${activeTenant.scheduledDate ? ` on ${activeTenant.scheduledDate}` : ''}. Confirm you received the payment at the office.`
                  : activeTenant.status === 'payment-failed'
                    ? "The tenant's online payment failed. You are recording a manual payment instead."
                                        : activeTenant.splitParts?.length
                      ? `The tenant submitted a split payment${activeTenant.scheduledDate ? ` and booked the cash portion for ${activeTenant.scheduledDate} (${activeTenant.scheduledTimeSlot})` : ''}: ${activeTenant.splitParts.map(p => `${methodName[p.method] || p.method} ${formatCurrency(p.amount)}${p.reference_number ? ` (Ref ${p.reference_number})` : ''}`).join(' + ')}. Check each proof matches before confirming.`
                      : `The tenant submitted ${activeTenant.declaredLabel || 'a payment'}${activeTenant.paymentReference ? ` (Ref ${activeTenant.paymentReference})` : ''} with a proof. Check it matches before confirming.`;
                return <div className="mb-4"><p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{note}</p></div>;
              })()}
              <div className="flex gap-2">
                <button type="button" onClick={handleMarkAsPaid} disabled={recording} className="flex-1 py-2 bg-indigo-600 text-white rounded text-sm font-semibold hover:bg-indigo-700 border-0 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{recording ? 'Processing…' : 'Confirm Approval'}</button>
                <button type="button" disabled={recording} onClick={() => setShowConfirmModal(false)} className="flex-1 disabled:opacity-50 py-2 bg-white border border-slate-300 text-slate-700 rounded text-sm font-semibold hover:bg-slate-50 border-solid cursor-pointer transition-colors">Cancel</button>
              </div>
            </div>
          </Modal>
      )}

      {/* Receipt Modal */}
      {showReceipt && receiptData && (
        <Modal title="Official receipt" onClose={() => setShowReceipt(false)} overlayClassName="flex items-center justify-center bg-black/60 backdrop-blur-sm" cardRef={receiptRef} className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden printable-receipt">
            <div className="bg-slate-900 text-white p-6 text-center border-b-4 border-indigo-500 print:bg-white print:text-slate-900 print:border-b-2 print:border-slate-900">
              <h2 className="text-2xl font-bold tracking-wider italic font-serif mb-1 m-0 uppercase">Apartment AMS</h2>
              <div className="mt-4 pt-4 border-t border-slate-700/50 print:border-slate-300">
                <p className="text-sm font-semibold text-slate-300 uppercase tracking-widest m-0 print:text-slate-700">Official Receipt</p>
                <p className="text-xs font-mono text-indigo-300 m-0 mt-1 print:text-slate-900">{receiptData.rctId}</p>
              </div>
            </div>
            <div className="p-6 space-y-4 font-mono text-sm">
              <div className="flex justify-between border-b border-slate-200 pb-4">
                <div><p className="text-slate-500 text-[11px] uppercase m-0">Date</p><p className="font-semibold m-0 mt-0.5">{receiptData.date}</p></div>
                <div className="text-right"><p className="text-slate-500 text-[11px] uppercase m-0">Status</p><p className="font-bold text-emerald-700 m-0 mt-0.5">{receiptData.status}</p></div>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-4">
                <div><p className="text-slate-500 text-[11px] uppercase m-0">Received From</p><p className="font-bold text-base m-0 mt-0.5 text-slate-800">{receiptData.tenant}</p><p className="m-0 text-slate-600 text-xs">Unit {receiptData.unit}</p></div>
                <div className="text-right">
                  <p className="text-slate-500 text-[11px] uppercase m-0">Method</p>
                  <p className="font-semibold text-slate-800 m-0 mt-0.5">{receiptData.method}</p>
                  {receiptData.paymentTransactions?.map(tx => <p key={tx.id} className="text-[11px] text-slate-700 m-0 mt-1">{formatCurrency(tx.amount)} {tx.bank_name || tx.payment_method}{tx.reference_number ? ` (Ref: ${tx.reference_number})` : ''}</p>)}
                  {!receiptData.paymentTransactions?.length && receiptData.paymentReference && <p className="text-[11px] text-indigo-600 m-0 mt-1">Ref: {receiptData.paymentReference}</p>}
                  {receiptData.gateway && (
                    <>
                      <p className="text-slate-500 text-[11px] uppercase m-0 mt-2">Gateway</p>
                      <p className="font-semibold text-slate-800 m-0 mt-0.5">{receiptData.gateway}</p>
                    </>
                  )}
                </div>
              </div>
              <div>
                <p className="text-slate-500 text-[11px] uppercase m-0 mb-1">Payment Breakdown ({receiptData.period})</p>
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 whitespace-pre-wrap leading-relaxed text-xs text-slate-700">{receiptData.breakdown}</div>
              </div>
              <div className="flex justify-between items-center pt-4 border-t-2 border-dashed border-slate-200">
                <p className="font-bold text-slate-600 m-0 text-base">TOTAL PAID</p>
                <p className="text-2xl font-bold text-slate-900 m-0">{formatCurrency(receiptData.amount)}</p>
              </div>
              {/* Signature placeholder */}
              <div className="pt-6 flex flex-col items-end text-right">
                <div className="border-b border-slate-400 w-36 h-8 mb-1"></div>
                <p className="text-[11px] uppercase text-slate-500 font-bold tracking-widest m-0">Authorized Admin Signature</p>
              </div>
            </div>
            <div className="flex gap-2 p-4 bg-slate-50 border-t border-slate-200 print-hide">
              <button onClick={() => printElement(receiptRef.current)} className="flex-1 flex items-center justify-center gap-2 py-2 bg-indigo-600 text-white rounded text-sm font-semibold hover:bg-indigo-700 border-0 cursor-pointer transition-colors"><FontAwesomeIcon icon={faPrint} /> Print Receipt</button>
              <button onClick={() => setShowReceipt(false)} className="flex-1 py-2 bg-white border border-slate-300 text-slate-700 rounded text-sm font-semibold hover:bg-slate-100 border-solid cursor-pointer transition-colors">Close</button>
            </div>
          </Modal>
      )}

      {/* Proof of Payment Preview Modal */}
      {previewProof && (
        <Modal title={`${previewProof.title || 'Uploaded Proof of Payment'}`} onClose={() => setPreviewProof(null)} overlayClassName="flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
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
                <button aria-label="Close"
                  onClick={() => setPreviewProof(null)}
                  className="text-slate-500 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 border-0 bg-transparent cursor-pointer"
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
          </Modal>
      )}

      {rejectModal && (
        <ReasonModal
          title="Reject Payment Proof"
          description={`${rejectModal.tenant}'s invoice returns to unpaid and they are notified with this reason, so they can pay again.`}
          label="Reason the tenant will see"
          placeholder="e.g. The reference number does not match any GCash transaction."
          confirmLabel="Reject & Notify Tenant"
          onConfirm={submitRejectProof}
          onClose={() => setRejectModal(null)}
        />
      )}

      {flash && (
        <div role="status" className="fixed bottom-6 right-6 z-50 max-w-sm flex items-start gap-3 rounded-xl bg-emerald-600 text-white px-4 py-3 shadow-2xl text-sm font-semibold">
          <FontAwesomeIcon icon={faCheckCircle} className="mt-0.5" />
          <span>{flash}</span>
        </div>
      )}
    </div>
  );
};

export default AdminPayments;