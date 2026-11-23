import toast from '../../../utils/toast';
import { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft, faBolt, faCheckCircle, faChevronRight, faFileInvoiceDollar, faPrint,
  faReceipt, faSave, faSpinner, faSquareParking, faTimes, faTint,
} from '@fortawesome/free-solid-svg-icons';
import api from '../../../api/axiosConfig';
import { LIMITS, MAX_AMOUNT, checkAmount, checkDate, checkText, localDateString, maxFutureDate } from '../../../utils/validation';
import { apiErrorMessage } from '../../../utils/apiError';
import { printElement } from '../../../utils/print';
import useFieldErrors from '../../../hooks/useFieldErrors';
import FieldError from '../../form/FieldError';
import CharCount from '../../form/CharCount';
import { blockNonNumericKeys, invalidCls } from '../../form/formHelpers';
import { fetchContractTemplate, pick } from '../../contract/contractTemplate';
import Modal from '../Modal';
import { TH, btn } from '../ui/styles';
import { personName } from '../../../utils/personName';

// Admin → Reports → Generate invoice: issue a manual invoice to a current
// tenant (create_invoice.php), or adjust an open one's manual lines
// (adjust_invoice.php), with a printable preview. Moved here from the old
// Reports page unchanged; the tenant list now comes from the Occupancy report's
// "Current tenants" table (get_reports.php).

// Manual invoice lines; blank counts as 0 (create_invoice.php / adjust_invoice.php).
const INVOICE_AMOUNT_LABELS = { rent: 'Base rent', water: 'Water', electric: 'Electric', parking: 'Parking', lateFee: 'Late fee' };

// Display-only placeholder; create_invoice.php assigns the real number.
const draftInvoiceId = (year, month) =>
  `INV-${year}${String(month).padStart(2, '0')}-${String(Math.floor(1000 + Math.random() * 9000))}`;

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const formatCurrency = (n) => `₱${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// A fresh form for this month, filled from a tenant when one is given.
const blankForm = (tenant) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  // The 15th of this month, but never a date already past.
  const monthDue = `${year}-${String(month).padStart(2, '0')}-15`;
  return {
    invoiceNumber: draftInvoiceId(year, month),
    tenant: tenant?.name || '',
    unit: tenant?.unit || '',
    userId: tenant?.userId || null,
    appId: tenant?.appId || null,
    email: tenant?.email || '',
    phone: tenant?.phone || '',
    rent: tenant?.rent || 4000,
    water: 300,
    electric: 800,
    parking: 0,
    lateFee: 0,
    services: 0,
    maintenance: 0,
    securityDeposit: 0,
    billingPeriod: `${MONTH_NAMES[month - 1]} ${year}`,
    dueDate: monthDue < localDateString() ? localDateString() : monthDue,
    notes: 'Please settle on or before the due date to avoid late charges.',
  };
};

export default function GenerateInvoiceModal({ onClose, onSaved }) {
  // Payment accounts and the owner's address and phone printed on invoices come
  // from Settings → Site Maintenance (the contract template's details).
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  const [siteDetails, setSiteDetails] = useState({});
  useEffect(() => {
    fetchContractTemplate()
      .then((res) => {
        setPaymentAccounts(res.template.payment_accounts || []);
        setSiteDetails(res.template.details || {});
      })
      .catch((err) => console.error('Failed to load payment accounts:', err));
  }, []);

  // Modal Invoice Generation States
  const [showInvoicePreview, setShowInvoicePreview] = useState(false);
  const [issuingInvoice, setIssuingInvoice] = useState(false);
  const [invoiceSuccessMsg, setInvoiceSuccessMsg] = useState('');
  // Audit H8: create_invoice.php is insert-only now, so re-issuing an
  // existing invoice number 409s instead of silently overwriting posted
  // charges. 'adjust' picks an existing invoice and edits only its manual
  // lines via adjust_invoice.php, which recomputes the total from every
  // column so services/maintenance/security_deposit can never be dropped.
  const [invoiceMode, setInvoiceMode] = useState('create'); // 'create' | 'adjust'
  const [adjustableInvoices, setAdjustableInvoices] = useState([]);
  const [adjustInvoicesLoading, setAdjustInvoicesLoading] = useState(false);
  const [selectedAdjustInvoiceId, setSelectedAdjustInvoiceId] = useState('');
  const [invoiceForm, setInvoiceForm] = useState(() => blankForm(null));

  // Statuses adjust_invoice.php still accepts (mirrors backend INVOICE_ADJUSTABLE_STATUSES).
  const ADJUSTABLE_STATUSES = ['pending', 'unpaid', 'overdue', 'scheduled', 'payment-failed'];

  const loadAdjustableInvoices = async () => {
    setAdjustInvoicesLoading(true);
    try {
      const res = await api.get('get_invoices.php');
      if (res.data.success) {
        setAdjustableInvoices((res.data.invoices || []).filter(inv => ADJUSTABLE_STATUSES.includes(inv.status)));
      }
    } catch (err) {
      console.error('Failed to load invoices for adjustment', err);
    } finally {
      setAdjustInvoicesLoading(false);
    }
  };

  const handleAdjustInvoiceSelect = (e) => {
    const id = e.target.value;
    setSelectedAdjustInvoiceId(id);
    const inv = adjustableInvoices.find(i => i.id === id);
    if (!inv) return;
    setInvoiceForm(prev => ({
      ...prev,
      invoiceNumber: inv.id,
      tenant: personName(inv) || prev.tenant,
      unit: inv.room_name || prev.unit,
      userId: inv.user_id,
      rent: inv.base_rent || 0,
      water: inv.water || 0,
      electric: inv.electricity || 0,
      parking: inv.parking || 0,
      lateFee: inv.late_fee || 0,
      services: inv.services || 0,
      maintenance: inv.maintenance || 0,
      securityDeposit: inv.security_deposit || 0,
      billingPeriod: inv.billing_period || '',
      dueDate: inv.due_date ? String(inv.due_date).slice(0, 10) : ''
    }));
  };
  const handleTenantSelect = (e) => {
    const selected = tenantInvoiceOptions.find(t => t.name === e.target.value);
    if (selected) {
      setInvoiceForm(prev => ({
        ...prev,
        tenant: selected.name,
        unit: selected.unit,
        userId: selected.userId,
        appId: selected.appId,
        email: selected.email,
        phone: selected.phone,
        rent: selected.rent || 4000,
      }));
    } else {
      setInvoiceForm(prev => ({
        ...prev,
        tenant: e.target.value,
        unit: '',
        userId: null,
        appId: null,
        email: '',
        phone: ''
      }));
    }
  };

  // No due date in the past (create_invoice.php / adjust_invoice.php enforce
  // it too); an adjustment may keep the invoice's own, already lapsed date.
  const originalDue = invoiceMode === 'adjust'
    ? String(adjustableInvoices.find(i => i.id === selectedAdjustInvoiceId)?.due_date || '').slice(0, 10)
    : '';
  const creating = invoiceMode === 'create';
  const invoiceErrors = useFieldErrors({
    adjustInvoiceId: () => (!creating && !selectedAdjustInvoiceId ? 'Please select an invoice to adjust.' : ''),
    tenant: (v) => (creating ? checkText(v, { label: 'Tenant name', max: LIMITS.fullName }) : ''),
    unit: (v) => (creating ? checkText(v, { label: 'Room / unit', max: LIMITS.unitId }) : ''),
    billingPeriod: (v) => (creating ? checkText(v, { label: 'Billing period', max: LIMITS.billingPeriod }) : ''),
    dueDate: (v) => (!creating && v === originalDue ? '' : checkDate(v, { min: localDateString(), max: maxFutureDate(), label: 'Due date' })),
    ...Object.fromEntries(Object.entries(INVOICE_AMOUNT_LABELS).map(([key, label]) => [key, (v) => checkAmount(v, { label, required: false })])),
    notes: (v) => checkText(v, { label: 'Memo', max: LIMITS.notes, required: false }),
    // adjust_invoice.php: every adjustment needs a reason, 5-255 characters.
    reason: (v) => (creating ? '' : checkText(String(v ?? '').replace(/\s+/g, ' '), { label: 'Reason', min: 5, max: 255 })),
  }, { idPrefix: 'inv-' });
  const invoiceValues = { ...invoiceForm, adjustInvoiceId: selectedAdjustInvoiceId };
  const setInvoiceField = (key, value) => {
    setInvoiceForm(p => ({ ...p, [key]: value }));
    invoiceErrors.clearError(key);
  };
  const blurInvoiceField = (key, { trim = false } = {}) => {
    const v = trim ? String(invoiceForm[key] ?? '').trim() : invoiceForm[key];
    if (trim && v !== invoiceForm[key]) setInvoiceForm(p => ({ ...p, [key]: v }));
    invoiceErrors.validateField(key, { ...invoiceValues, [key]: v });
  };
  const amountProps = (key) => ({
    type: 'number',
    ...invoiceErrors.fieldA11y(key),
    inputMode: 'decimal',
    min: '0',
    max: MAX_AMOUNT,
    step: '0.01',
    value: invoiceForm[key],
    onKeyDown: blockNonNumericKeys,
    onChange: e => setInvoiceField(key, e.target.value),
    onBlur: () => blurInvoiceField(key),
    className: `w-full px-2.5 py-1.5 text-xs font-semibold border border-slate-200 rounded-control outline-none bg-white text-slate-800 focus:border-indigo-500${invalidCls(invoiceErrors.errors[key])}`,
  });

  const handlePreviewInvoice = () => {
    const clean = {
      ...invoiceValues,
      tenant: String(invoiceForm.tenant ?? '').trim(),
      unit: String(invoiceForm.unit ?? '').trim(),
      billingPeriod: String(invoiceForm.billingPeriod ?? '').trim(),
    };
    setInvoiceForm(p => ({ ...p, tenant: clean.tenant, unit: clean.unit, billingPeriod: clean.billingPeriod }));
    if (invoiceErrors.validateAll(clean)) setShowInvoicePreview(true);
  };

  const handleSaveAndIssueInvoice = async () => {
    if (issuingInvoice) return;
    // Re-checked here too: the preview can be reached with values edited since.
    if (!invoiceErrors.validateAll(invoiceValues)) {
      setShowInvoicePreview(false);
      return;
    }
    if (invoiceMode === 'adjust') {
      setIssuingInvoice(true);
      setInvoiceSuccessMsg('');
      try {
        const payload = {
          invoiceId: selectedAdjustInvoiceId,
          baseRent: Number(invoiceForm.rent) || 0,
          water: Number(invoiceForm.water) || 0,
          electricity: Number(invoiceForm.electric) || 0,
          parking: Number(invoiceForm.parking) || 0,
          lateFee: Number(invoiceForm.lateFee) || 0,
          dueDate: invoiceForm.dueDate,
          reason: String(invoiceForm.reason ?? '').replace(/\s+/g, ' ').trim(),
        };
        const response = await api.post('adjust_invoice.php', payload);
        if (response.data.success) {
          setInvoiceSuccessMsg(`Invoice ${response.data.invoice_id} adjusted — new total ₱${Number(response.data.total_amount).toLocaleString()}.`);
          setInvoiceForm(p => ({ ...p, reason: '' }));
          loadAdjustableInvoices();
          onSaved?.();
        } else if (!invoiceErrors.applyServerErrors(response)) {
          toast.error(response.data.message || 'Failed to adjust invoice.');
        }
      } catch (err) {
        // create_invoice/adjust_invoice return a 4xx body with a specific
        // reason (duplicate id, invalid amount, invoice no longer
        // adjustable, etc.) — surface it instead of a generic alert.
        if (!invoiceErrors.applyServerErrors(err)) toast.error(apiErrorMessage(err, 'Error adjusting invoice. Please verify connection and inputs.'));
      } finally {
        setIssuingInvoice(false);
      }
      return;
    }

    setIssuingInvoice(true);
    setInvoiceSuccessMsg('');
    try {
      const payload = {
        userId: invoiceForm.userId,
        tenantName: invoiceForm.tenant,
        unit: invoiceForm.unit,
        baseRent: Number(invoiceForm.rent) || 0,
        water: Number(invoiceForm.water) || 0,
        electricity: Number(invoiceForm.electric) || 0,
        parking: Number(invoiceForm.parking) || 0,
        lateFee: Number(invoiceForm.lateFee) || 0,
        billingPeriod: invoiceForm.billingPeriod,
        dueDate: invoiceForm.dueDate
      };
      const response = await api.post('create_invoice.php', payload);
      if (response.data.success) {
        setInvoiceSuccessMsg(`Invoice ${response.data.invoice_id} successfully saved & issued to ${invoiceForm.tenant}!`);
        onSaved?.();
      } else if (!invoiceErrors.applyServerErrors(response)) {
        toast.error(response.data.message || 'Failed to issue invoice.');
      }
    } catch (err) {
      if (!invoiceErrors.applyServerErrors(err)) toast.error(apiErrorMessage(err, 'Error issuing invoice. Please verify connection and inputs.'));
    } finally {
      setIssuingInvoice(false);
    }
  };

  // Current tenants (the Occupancy report's roster: today, whatever the range).
  const [tenantInvoiceOptions, setTenantInvoiceOptions] = useState([]);
  useEffect(() => {
    let alive = true;
    const today = localDateString();
    api.get('get_reports.php', { params: { report: 'occupancy', from: today, to: today, group: 'day' } })
      .then((res) => {
        if (!alive) return;
        const roster = (res.data.tables || []).find((t) => t.key === 'roster')?.rows || [];
        const options = roster.map((t) => ({
          name: t.tenant, unit: t.unit, rent: t.rent || 4000, userId: t._userId ?? null, appId: t._appId ?? null, email: t.email || '', phone: t.phone || '',
        }));
        setTenantInvoiceOptions(options);
        // The form opens on the first tenant, as before.
        setInvoiceForm((prev) => (prev.tenant || !options[0] ? prev : blankForm(options[0])));
      })
      .catch((err) => console.error('Failed to load tenants for invoicing:', err));
    return () => { alive = false; };
  }, []);

  const invoiceRef = useRef(null);
  const handlePrintInvoice = () => printElement(invoiceRef.current);

  return (
    <Modal busy={issuingInvoice} title={`${showInvoicePreview ? 'Official Rental Invoice Preview' : (invoiceMode === 'adjust' ? 'Adjust Existing Invoice' : 'Generate Tenant Invoice')}`} onClose={() => { onClose(); }} overlayClassName="flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto print:static print:p-0 print:bg-transparent print:block print:overflow-visible" className={`bg-white rounded-card shadow-dialog w-full ${showInvoicePreview ? 'max-w-3xl' : 'max-w-xl'} mx-auto overflow-hidden transition-all duration-200 print:shadow-none print:border-none print:max-w-none print:w-full`}>
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-control bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <FontAwesomeIcon icon={faFileInvoiceDollar} />
            </div>
            <div>
              <h2 className="text-title font-bold text-slate-800 m-0">
                {showInvoicePreview ? 'Official Rental Invoice Preview' : (invoiceMode === 'adjust' ? 'Adjust Existing Invoice' : 'Generate Tenant Invoice')}
              </h2>
              <p className="text-caption text-slate-500 m-0 mt-0.5">
                {showInvoicePreview ? 'Review line items, totals, and print or issue to database' : (invoiceMode === 'adjust' ? 'Pick an open invoice and edit its manual charges' : 'Select tenant, set billing period & customize itemized charges')}
              </p>
            </div>
          </div>
          <button aria-label="Close" 
            onClick={() => { onClose(); }} 
            className="text-slate-500 hover:text-slate-600 bg-transparent border-0 cursor-pointer p-1 rounded-control hover:bg-slate-200/50 transition-colors"
          >
            <FontAwesomeIcon icon={faTimes} className="text-base" />
          </button>
        </div>

        {/* Notification alert banner */}
        {invoiceSuccessMsg && (
          <div className="mx-6 mt-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-card flex items-center justify-between gap-3 text-emerald-800 text-label print:hidden">
            <div className="flex items-center gap-2 font-semibold">
              <FontAwesomeIcon icon={faCheckCircle} className="text-emerald-700 text-sm" />
              <span>{invoiceSuccessMsg}</span>
            </div>
            <button onClick={() => setInvoiceSuccessMsg('')} className="text-emerald-700 hover:text-emerald-800 border-0 bg-transparent cursor-pointer text-label font-bold">✕</button>
          </div>
        )}

        {/* FORM VIEW */}
        {!showInvoicePreview ? (
          <div className="p-6 space-y-4 text-left">
            {/* Mode Toggle: create a fresh invoice, or adjust an existing
                one's manual lines (audit H8) — create_invoice.php is
                insert-only, so reusing an id there just 409s. */}
            <div className="flex gap-2 p-1 bg-slate-100 rounded-card">
              <button
                type="button"
                onClick={() => { setInvoiceMode('create'); invoiceErrors.setErrors({}); }}
                className={`flex-1 py-2 text-label font-bold rounded-control border-0 cursor-pointer transition-colors ${invoiceMode === 'create' ? 'bg-white text-indigo-700 shadow-card' : 'bg-transparent text-slate-500'}`}
              >
                New Invoice
              </button>
              <button
                type="button"
                onClick={() => { setInvoiceMode('adjust'); invoiceErrors.setErrors({}); if (adjustableInvoices.length === 0) loadAdjustableInvoices(); }}
                className={`flex-1 py-2 text-label font-bold rounded-control border-0 cursor-pointer transition-colors ${invoiceMode === 'adjust' ? 'bg-white text-indigo-700 shadow-card' : 'bg-transparent text-slate-500'}`}
              >
                Adjust Existing
              </button>
            </div>

            {invoiceMode === 'adjust' ? (
              <div>
                <label className="block text-label font-medium text-slate-600 mb-1.5">
                  Select Invoice to Adjust <span className="text-indigo-600">*</span>
                </label>
                <select
                  {...invoiceErrors.fieldA11y('adjustInvoiceId')}
                  value={selectedAdjustInvoiceId}
                  onChange={(e) => { handleAdjustInvoiceSelect(e); invoiceErrors.setErrors({}); }}
                  disabled={adjustInvoicesLoading}
                  className={`w-full px-3.5 py-2.5 text-label font-medium border border-slate-300 rounded-card outline-none text-slate-800 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all${invalidCls(invoiceErrors.errors.adjustInvoiceId)}`}
                >
                  <option value="">{adjustInvoicesLoading ? 'Loading invoices…' : '-- Select Open Invoice --'}</option>
                  {adjustableInvoices.map(inv => (
                    <option key={inv.id} value={inv.id}>
                      {inv.id} — {personName(inv)} (Unit {inv.room_name}) — {inv.billing_period} — {formatCurrency(inv.total_amount)}
                    </option>
                  ))}
                </select>
                <FieldError id="inv-adjustInvoiceId" error={invoiceErrors.errors.adjustInvoiceId} />
                <p className="text-caption text-slate-500 mt-1 mb-0">Only invoices that are still open (not paid, cancelled, or mid-checkout) can be adjusted.</p>
                <label htmlFor="inv-reason" className="block text-label font-medium text-slate-600 mb-1.5 mt-3">
                  Reason for the adjustment <span className="text-indigo-600">*</span>
                </label>
                <textarea
                  {...invoiceErrors.fieldA11y('reason')}
                  rows={2}
                  maxLength={255}
                  value={invoiceForm.reason || ''}
                  onChange={e => setInvoiceField('reason', e.target.value)}
                  onBlur={() => blurInvoiceField('reason', { trim: true })}
                  placeholder="e.g. Water billed twice; corrected to the provider bill"
                  className={`w-full px-3.5 py-2.5 text-label border border-slate-300 rounded-card outline-none text-slate-800 bg-white focus:border-indigo-500 resize-y${invalidCls(invoiceErrors.errors.reason)}`}
                />
                <FieldError id="inv-reason" error={invoiceErrors.errors.reason} />
                <p className="text-caption text-slate-500 mt-1 mb-0">Kept in the invoice's adjustment history and quoted in the tenant's notice.</p>
              </div>
            ) : (
            <>
            {/* Select Tenant */}
            <div>
              <label className="block text-label font-medium text-slate-600 mb-1.5">
                Select Active Tenant <span className="text-indigo-600">*</span>
              </label>
              <select
                aria-label="Select active tenant"
                value={invoiceForm.tenant}
                onChange={(e) => { handleTenantSelect(e); invoiceErrors.clearError('tenant'); invoiceErrors.clearError('unit'); }}
                className="w-full px-3.5 py-2.5 text-label font-medium border border-slate-300 rounded-card outline-none text-slate-800 bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
              >
                <option value="">-- Select Registered Tenant --</option>
                {tenantInvoiceOptions.map((t, idx) => (
                  <option key={idx} value={t.name}>
                    {t.name} — Unit {t.unit} (₱{Number(t.rent).toLocaleString()}/mo)
                  </option>
                ))}
              </select>
            </div>

            {/* Tenant & Unit Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="inv-tenant" className="block text-label font-medium text-slate-600 mb-1">Tenant Name</label>
                <input
                  type="text"
                  {...invoiceErrors.fieldA11y('tenant')}
                  autoComplete="off"
                  maxLength={LIMITS.fullName}
                  value={invoiceForm.tenant}
                  onChange={e => setInvoiceField('tenant', e.target.value)}
                  onBlur={() => blurInvoiceField('tenant', { trim: true })}
                  placeholder="e.g. John Doe"
                  className={`w-full px-3 py-2 text-label border border-slate-300 rounded-control outline-none focus:border-indigo-500 text-slate-800${invalidCls(invoiceErrors.errors.tenant)}`}
                />
                <FieldError id="inv-tenant" error={invoiceErrors.errors.tenant} />
              </div>
              <div>
                <label htmlFor="inv-unit" className="block text-label font-medium text-slate-600 mb-1">Room / Unit</label>
                <input
                  type="text"
                  {...invoiceErrors.fieldA11y('unit')}
                  autoComplete="off"
                  maxLength={LIMITS.unitId}
                  value={invoiceForm.unit}
                  onChange={e => setInvoiceField('unit', e.target.value)}
                  onBlur={() => blurInvoiceField('unit', { trim: true })}
                  placeholder="e.g. 101 or A"
                  className={`w-full px-3 py-2 text-label border border-slate-300 rounded-control outline-none focus:border-indigo-500 text-slate-800${invalidCls(invoiceErrors.errors.unit)}`}
                />
                <FieldError id="inv-unit" error={invoiceErrors.errors.unit} />
              </div>
            </div>
            </>
            )}

            {/* Billing Period & Due Date */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-label font-medium text-slate-600 mb-1">Invoice #</label>
                <input
                  type="text"
                  value={invoiceForm.invoiceNumber}
                  readOnly
                  disabled={invoiceMode === 'create'}
                  title={invoiceMode === 'create' ? 'Server-generated on save — cannot be chosen here.' : undefined}
                  className="w-full px-3 py-2 text-label border border-slate-300 rounded-control outline-none font-mono text-slate-600 bg-slate-100 cursor-not-allowed"
                />
              </div>
              <div>
                <label htmlFor="inv-billingPeriod" className="block text-label font-medium text-slate-600 mb-1">Billing Period</label>
                <input
                  type="text"
                  {...invoiceErrors.fieldA11y('billingPeriod')}
                  autoComplete="off"
                  maxLength={LIMITS.billingPeriod}
                  value={invoiceForm.billingPeriod}
                  onChange={e => setInvoiceField('billingPeriod', e.target.value)}
                  onBlur={() => invoiceMode === 'create' && blurInvoiceField('billingPeriod', { trim: true })}
                  readOnly={invoiceMode === 'adjust'}
                  placeholder="e.g. September 2026"
                  className={`w-full px-3 py-2 text-label border border-slate-300 rounded-control outline-none text-slate-800 ${invoiceMode === 'adjust' ? 'bg-slate-100 text-slate-600 cursor-not-allowed' : 'focus:border-indigo-500'}${invalidCls(invoiceErrors.errors.billingPeriod)}`}
                />
                <FieldError id="inv-billingPeriod" error={invoiceErrors.errors.billingPeriod} />
              </div>
              <div>
                <label htmlFor="inv-dueDate" className="block text-label font-medium text-slate-600 mb-1">Due Date</label>
                <input
                  type="date"
                  {...invoiceErrors.fieldA11y('dueDate')}
                  min={invoiceMode === 'create' ? localDateString() : undefined}
                  max={maxFutureDate()}
                  value={invoiceForm.dueDate}
                  onChange={e => setInvoiceField('dueDate', e.target.value)}
                  onBlur={() => blurInvoiceField('dueDate')}
                  className={`w-full px-3 py-2 text-label border border-slate-300 rounded-control outline-none focus:border-indigo-500 text-slate-800${invalidCls(invoiceErrors.errors.dueDate)}`}
                />
                <FieldError id="inv-dueDate" error={invoiceErrors.errors.dueDate} />
              </div>
            </div>

            {/* Itemized Line Items */}
            <div className="bg-slate-50 border border-slate-200 rounded-card p-4 space-y-3">
              <span className="text-label font-medium text-slate-700 flex items-center gap-1.5 capitalize">
                <FontAwesomeIcon icon={faReceipt} className="text-indigo-600" />
                Itemized Charges Breakdown
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="inv-rent" className="block text-label font-medium text-slate-600 mb-1">Base Rent (₱)</label>
                  <input {...amountProps('rent')} />
                  <FieldError id="inv-rent" error={invoiceErrors.errors.rent} />
                </div>
                <div>
                  <label htmlFor="inv-water" className="text-label font-medium text-slate-600 mb-1 flex items-center gap-1 capitalize">
                    <FontAwesomeIcon icon={faTint} className="text-blue-500" /> Water (₱)
                  </label>
                  <input {...amountProps('water')} />
                  <FieldError id="inv-water" error={invoiceErrors.errors.water} />
                </div>
                <div>
                  <label htmlFor="inv-electric" className="text-label font-medium text-slate-600 mb-1 flex items-center gap-1 capitalize">
                    <FontAwesomeIcon icon={faBolt} className="text-amber-700" /> Electric (₱)
                  </label>
                  <input {...amountProps('electric')} />
                  <FieldError id="inv-electric" error={invoiceErrors.errors.electric} />
                </div>
                <div>
                  <label htmlFor="inv-parking" className="text-label font-medium text-slate-600 mb-1 flex items-center gap-1 capitalize">
                    <FontAwesomeIcon icon={faSquareParking} className="text-pink-500" /> Parking (₱)
                  </label>
                  <input {...amountProps('parking')} />
                  <FieldError id="inv-parking" error={invoiceErrors.errors.parking} />
                </div>
                <div>
                  <label htmlFor="inv-lateFee" className="block text-label font-medium text-slate-600 mb-1">Late / Arrears (₱)</label>
                  <input {...amountProps('lateFee')} />
                  <FieldError id="inv-lateFee" error={invoiceErrors.errors.lateFee} />
                </div>
                <div className="bg-indigo-50/70 border border-indigo-100 rounded-control p-2 flex flex-col justify-center">
                  <span className="text-label font-medium text-indigo-700">Calculated Total</span>
                  <span className="text-body font-bold text-indigo-900">
                    {formatCurrency(
                      (Number(invoiceForm.rent) || 0) +
                      (Number(invoiceForm.water) || 0) +
                      (Number(invoiceForm.electric) || 0) +
                      (Number(invoiceForm.parking) || 0) +
                      (Number(invoiceForm.lateFee) || 0) +
                      (invoiceMode === 'adjust' ? (Number(invoiceForm.services) || 0) + (Number(invoiceForm.maintenance) || 0) + (Number(invoiceForm.securityDeposit) || 0) : 0)
                    )}
                  </span>
                </div>
              </div>
              {invoiceMode === 'adjust' && (
                <p className="text-caption text-slate-500 m-0">
                  Already posted on this invoice (not editable here): Services {formatCurrency(invoiceForm.services)} · Maintenance {formatCurrency(invoiceForm.maintenance)} · Security Deposit {formatCurrency(invoiceForm.securityDeposit)}.
                </p>
              )}
            </div>

            {/* Memo */}
            <div>
              <label htmlFor="inv-notes" className="block text-label font-medium text-slate-600 mb-1">Payment Instructions / Memo</label>
              <textarea
                rows="2"
                {...invoiceErrors.fieldA11y('notes')}
                maxLength={LIMITS.notes}
                value={invoiceForm.notes}
                onChange={e => setInvoiceField('notes', e.target.value)}
                onBlur={() => blurInvoiceField('notes', { trim: true })}
                className={`w-full px-3 py-2 text-label border border-slate-300 rounded-control outline-none focus:border-indigo-500 text-slate-700 resize-none${invalidCls(invoiceErrors.errors.notes)}`}
              ></textarea>
              <FieldError id="inv-notes" error={invoiceErrors.errors.notes} />
              <CharCount value={invoiceForm.notes} max={LIMITS.notes} />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button 
                onClick={() => onClose()}
                className={btn('secondary', 'sm', 'flex-1')}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePreviewInvoice}
                className={btn('primary', 'sm', 'flex-1')}
              >
                Preview Official Invoice <FontAwesomeIcon icon={faChevronRight} className="ml-1 text-[10px]" />
              </button>
            </div>
          </div>
        ) : (
          /* PREVIEW DOCUMENT VIEW */
          <div className="p-6 space-y-6 text-left">
            
            {/* Official Printable Statement Sheet */}
            <div ref={invoiceRef} className="printable-invoice bg-white border border-slate-300 rounded-card p-6 sm:p-8 space-y-6 shadow-card print:border-none print:shadow-none print:p-0">
              
              {/* Top Invoice Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between border-b-2 border-slate-800 pb-5 gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-control bg-indigo-600 text-white flex items-center justify-center font-bold font-serif text-body">
                      AMS
                    </div>
                    <div>
                      <h2 className="text-lg font-medium text-slate-900 tracking-tight m-0">APARTMENT MANAGEMENT SYSTEM</h2>
                      <p className="text-label text-slate-600 font-medium m-0">Property Rental & Financial Administration</p>
                    </div>
                  </div>
                  {(siteDetails.property_address || siteDetails.landlord_contact) && (
                    <p className="text-label text-slate-600 mt-2 m-0">
                      {[siteDetails.property_address, siteDetails.landlord_contact && `Tel: ${siteDetails.landlord_contact}`].filter(Boolean).join(' • ')}
                    </p>
                  )}
                </div>

                <div className="sm:text-right">
                  <span className="rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap inline-block bg-amber-50 text-amber-800 ring-amber-200 mb-1.5 ring-1 ring-inset">
                    Statement / Invoice
                  </span>
                  <p className="text-label font-mono font-bold text-slate-800 m-0">{invoiceForm.invoiceNumber}</p>
                  <p className="text-caption text-slate-500 m-0 mt-0.5">Date Issued: <strong>{new Date().toISOString().split('T')[0]}</strong></p>
                </div>
              </div>

              {/* Billed To & Account Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-card border border-slate-200 text-label">
                <div>
                  <span className="text-label font-medium text-slate-600 block mb-1">Billed To (Tenant)</span>
                  <p className="font-bold text-slate-800 text-body m-0">{invoiceForm.tenant}</p>
                  <p className="text-slate-600 font-semibold m-0 mt-0.5">Assigned Unit: <span className="text-indigo-600 font-bold">{invoiceForm.unit}</span></p>
                  {invoiceForm.email && <p className="text-slate-500 m-0 mt-0.5">Email: {invoiceForm.email}</p>}
                  {invoiceForm.phone && <p className="text-slate-500 m-0 mt-0.5">Phone: {invoiceForm.phone}</p>}
                </div>
                <div className="sm:text-right">
                  <span className="text-label font-medium text-slate-600 block mb-1">Billing Overview</span>
                  <p className="text-slate-700 m-0">Billing Period: <strong className="text-slate-900">{invoiceForm.billingPeriod}</strong></p>
                  <p className="text-red-600 font-bold m-0 mt-0.5">Due Date: {invoiceForm.dueDate || 'Upon Receipt'}</p>
                  <p className="text-slate-500 m-0 mt-0.5">Status: <span className="font-bold text-amber-700">Pending Payment</span></p>
                </div>
              </div>

              {/* Itemized Charges Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-label border-collapse">
                  <thead>
                    <tr className="border-b-2 border-slate-300 text-label font-medium text-slate-600 bg-slate-100">
                      <th className={TH}>#</th>
                      <th className={TH}>Item Description</th>
                      <th className={TH}>Period / Scope</th>
                      <th className={`${TH} text-right`}>Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="py-2.5 px-3 text-slate-500 font-mono">01</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">Monthly Apartment Base Rent</td>
                      <td className="py-2.5 px-3 text-slate-500">{invoiceForm.billingPeriod}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-800">{formatCurrency(invoiceForm.rent)}</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 text-slate-500 font-mono">02</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">Water Utility Consumption</td>
                      <td className="py-2.5 px-3 text-slate-500">Submeter Reading</td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-800">{formatCurrency(invoiceForm.water)}</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 text-slate-500 font-mono">03</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">Electricity Utility Consumption</td>
                      <td className="py-2.5 px-3 text-slate-500">Submeter Reading</td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-800">{formatCurrency(invoiceForm.electric)}</td>
                    </tr>
                    {Number(invoiceForm.parking) > 0 && (
                      <tr>
                        <td className="py-2.5 px-3 text-slate-500 font-mono">04</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">Allocated Parking Slot Rental</td>
                        <td className="py-2.5 px-3 text-slate-500">{invoiceForm.billingPeriod}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-800">{formatCurrency(invoiceForm.parking)}</td>
                      </tr>
                    )}
                    {Number(invoiceForm.lateFee) > 0 && (
                      <tr>
                        <td className="py-2.5 px-3 text-slate-500 font-mono">05</td>
                        <td className="py-2.5 px-3 font-semibold text-red-700">Late Administrative Fee / Prior Arrears</td>
                        <td className="py-2.5 px-3 text-slate-500">Account Overdue</td>
                        <td className="py-2.5 px-3 text-right font-bold text-red-700">{formatCurrency(invoiceForm.lateFee)}</td>
                      </tr>
                    )}
                    {invoiceMode === 'adjust' && Number(invoiceForm.services) > 0 && (
                      <tr>
                        <td className="py-2.5 px-3 text-slate-500 font-mono">06</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">Add-On Services (already posted)</td>
                        <td className="py-2.5 px-3 text-slate-500">{invoiceForm.billingPeriod}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-800">{formatCurrency(invoiceForm.services)}</td>
                      </tr>
                    )}
                    {invoiceMode === 'adjust' && Number(invoiceForm.maintenance) > 0 && (
                      <tr>
                        <td className="py-2.5 px-3 text-slate-500 font-mono">07</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">Maintenance Recharge (already posted)</td>
                        <td className="py-2.5 px-3 text-slate-500">{invoiceForm.billingPeriod}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-800">{formatCurrency(invoiceForm.maintenance)}</td>
                      </tr>
                    )}
                    {invoiceMode === 'adjust' && Number(invoiceForm.securityDeposit) > 0 && (
                      <tr>
                        <td className="py-2.5 px-3 text-slate-500 font-mono">08</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">Security Deposit (already posted)</td>
                        <td className="py-2.5 px-3 text-slate-500">Move-In</td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-800">{formatCurrency(invoiceForm.securityDeposit)}</td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-800 bg-slate-50 font-bold text-body">
                      <td colSpan="3" className="py-3 px-3 text-right text-slate-700">Total Balance Due:</td>
                      <td className="py-3 px-3 text-right text-indigo-700 font-bold text-title">
                        {formatCurrency(
                          (Number(invoiceForm.rent) || 0) +
                          (Number(invoiceForm.water) || 0) +
                          (Number(invoiceForm.electric) || 0) +
                          (Number(invoiceForm.parking) || 0) +
                          (Number(invoiceForm.lateFee) || 0) +
                          (invoiceMode === 'adjust' ? (Number(invoiceForm.services) || 0) + (Number(invoiceForm.maintenance) || 0) + (Number(invoiceForm.securityDeposit) || 0) : 0)
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Payment Instructions & Authorization Footer */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-slate-200 text-label">
                <div className="space-y-1 text-slate-600 bg-slate-50 p-3.5 rounded-card border border-slate-100">
                  <p className="font-medium text-slate-800 text-label m-0 mb-1">Payment Instructions</p>
                  {paymentAccounts.map((acct) => (
                    <p key={acct.id} className="m-0">
                      • <strong>{acct.label}:</strong>{' '}
                      {[acct.account_number, acct.account_name && `(${acct.account_name})`, !acct.account_number && pick(acct.note, 'en')].filter(Boolean).join(' ') || '—'}
                    </p>
                  ))}
                  <p className="m-0 text-caption text-slate-500 pt-1 italic">Please reference <strong>{invoiceForm.invoiceNumber}</strong> upon payment.</p>
                </div>

                <div className="flex flex-col justify-end items-end text-right space-y-1">
                  <div className="w-44 border-b border-slate-400 mb-1"></div>
                  <p className="font-bold text-slate-800 text-caption m-0">Authorized Property Administrator</p>
                  <p className="text-label text-slate-600 m-0">Financial Operations Management</p>
                </div>
              </div>

            </div>

            {/* Action Buttons (Print-hidden) */}
            <div className="flex flex-wrap gap-2.5 pt-2 print:hidden">
              <button 
                onClick={() => setShowInvoicePreview(false)} 
                className={btn('secondary', 'sm')}
              >
                <FontAwesomeIcon icon={faArrowLeft} /> Back to Edit
              </button>

              <button 
                onClick={handleSaveAndIssueInvoice}
                disabled={issuingInvoice}
                className={btn('success', 'sm', 'flex-1 justify-center')}
              >
                <FontAwesomeIcon icon={issuingInvoice ? faSpinner : faSave} className={issuingInvoice ? 'animate-spin' : ''} />
                {issuingInvoice ? 'Saving...' : (invoiceMode === 'adjust' ? 'Save Adjustment' : 'Save & Issue to Tenant')}
              </button>

              <button 
                onClick={handlePrintInvoice}
                className={btn('primary', 'sm', 'flex-1 justify-center')}
              >
                <FontAwesomeIcon icon={faPrint} /> Print / Save as PDF
              </button>
            </div>
          </div>
        )}
      </Modal>
  );
}
