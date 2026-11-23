import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/axiosConfig';
import fileUrl from '../api/fileUrl';
import { FILE_RULES, acceptFor, checkFile } from '../utils/fileLimits';
import { apiErrorMessage } from '../utils/apiError';
import { useLang, dateLocale } from '../config/i18n';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTint, faBolt, faCheckCircle, faClock, faChevronLeft,
  faCalendarAlt, faInfoCircle, faReceipt, faUpload,
  faFileAlt, faFilePdf, faDownload, faTimes, faExternalLinkAlt, faSearch,
  faLink, faCreditCard, faUser
} from '@fortawesome/free-solid-svg-icons';
import '../assets/styles/responsive/user/user-utilities.responsive.css';
import { SkeletonList } from '../Components/tenant/Skeleton';

// What one reading costs: a total-only record is its total_amount; otherwise
// water + electricity with their other fees, plus any extra items (what the
// sync puts on the invoice). The card and the average both use this, so they
// can no longer disagree (the average used to add total_amount to every row
// and leave the items out).
const money = (v) => parseFloat(v) || 0;
function readingTotal(r) {
  const items = (r.items || []).reduce((sum, it) => sum + money(it.amount) + money(it.other_fees), 0);
  if (r.entry_mode === 'total') return money(r.total_amount) + items;
  return money(r.water_amount) + money(r.water_other_fees) + money(r.electric_amount) + money(r.electric_other_fees) + items;
}

export default function UserUtilities() {
  const navigate = useNavigate();
  const { t, lang } = useLang();
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [allowTenantSelfPay, setAllowTenantSelfPay] = useState(true);
  const [viewingBillReading, setViewingBillReading] = useState(null);

  const fetchReadings = useCallback(async () => {
    try {
      const res = await api.get('/get_utility_readings.php');
      if (res.data.success && Array.isArray(res.data.data)) {
        setReadings(res.data.data);
        if (res.data.allow_tenant_self_pay !== undefined) {
          setAllowTenantSelfPay(Boolean(res.data.allow_tenant_self_pay));
        }
      } else {
        setReadings([]);
      }
      setError(null); // a later successful load clears an earlier failure
    } catch (err) {
      console.error("Failed to load utility history:", err);
      setError(t('utilities.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timer = window.setTimeout(fetchReadings, 0);
    return () => window.clearTimeout(timer);
  }, [fetchReadings]);

  // Average usage per billing cycle across the tenant's own readings.
  const summary = useMemo(() => {
    if (readings.length === 0) return null;
    // Total-only records have no meters: they count toward the cost average, not the usage averages.
    // A provider bill without a meter reading has no usage either.
    const withUsage = (key) => readings.filter((r) => r.entry_mode !== 'total' && r[key] !== null && r[key] !== undefined);
    const sum = (key, rows = readings) => rows.reduce((acc, r) => acc + (parseFloat(r[key]) || 0), 0);
    const avgUsage = (key) => { const rows = withUsage(key); return (rows.length ? sum(key, rows) / rows.length : 0).toFixed(2); };
    return {
      cycles: readings.length,
      avgWater: avgUsage('water_consumption'),
      avgElectric: avgUsage('electric_consumption'),
      avgCost: readings.reduce((acc, r) => acc + readingTotal(r), 0) / readings.length,
    };
  }, [readings]);

  return (
    <div className="user-utilities-root w-full min-h-[calc(100vh-76px)] bg-slate-50 py-6 sm:py-10 px-4 md:px-12 box-border flex flex-col items-center text-slate-800">
      <div className="w-full max-w-5xl lg:max-w-[1400px] space-y-6 sm:space-y-8 flex flex-col justify-start text-left">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="min-w-0">
            <Link
              to="/my-room"
              className="group mb-2 -ml-0.5 inline-flex min-h-[44px] items-center gap-1.5 py-1 text-sm font-medium text-slate-500 no-underline transition-colors hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              <FontAwesomeIcon icon={faChevronLeft} className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
              <span>{t('common.backToMyRoom')}</span>
            </Link>
            <h1 className="text-2xl sm:text-3xl font-black m-0 tracking-tight text-brand">
              {t('utilities.title')}
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm mt-1.5 m-0">
              {t('utilities.subtitle')}
            </p>
          </div>

          <div className="flex items-center self-start sm:self-auto">
            {allowTenantSelfPay ? (
              <button
                type="button"
                onClick={() => navigate('/pay-bills')}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2.5 transition-all shadow-sm cursor-pointer border-0"
              >
                <FontAwesomeIcon icon={faReceipt} />
                <span>{t('utilities.goPayBills')}</span>
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-xs px-3.5 py-2 shadow-sm">
                <FontAwesomeIcon icon={faInfoCircle} className="text-slate-400" />
                <span>Direct Office Settlement</span>
              </span>
            )}
          </div>
        </div>

        {/* Notice if tenant self-pay is disabled by management */}
        {!allowTenantSelfPay && (
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
            <FontAwesomeIcon icon={faInfoCircle} className="text-amber-600 mt-0.5 text-base shrink-0" />
            <div>
              <p className="font-bold m-0">Direct Office Settlement Notice</p>
              <p className="m-0 mt-0.5 text-xs text-amber-800 leading-relaxed">
                Online self-payment for utility bills is currently disabled by property management. Please settle all utility bill payments directly in person (cash or check) with apartment management at the office. Management handles provider payments on your behalf.
              </p>
            </div>
          </div>
        )}

        {/* Content Body */}
        {loading ? (
          <SkeletonList label={t('utilities.loading')} count={3} />
        ) : error ? (
          <div className="p-8 text-center flex flex-col items-center justify-center bg-white rounded-3xl border border-rose-200 shadow-sm text-rose-600" style={{ textAlign: 'center' }}>
            <p className="text-sm font-semibold m-0 text-center" style={{ textAlign: 'center' }}>{error}</p>
          </div>
        ) : readings.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center bg-white rounded-3xl border border-slate-200 shadow-sm text-slate-500" style={{ textAlign: 'center' }}>
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-2xl mx-auto mb-4">
              <FontAwesomeIcon icon={faInfoCircle} />
            </div>
            <h3 className="text-lg font-bold text-slate-800 m-0 text-center" style={{ textAlign: 'center' }}>{t('utilities.emptyTitle')}</h3>
            <p className="text-slate-500 text-sm max-w-md mx-auto mt-2 mb-0 text-center leading-relaxed" style={{ textAlign: 'center' }}>
              {t('utilities.emptyBody')}
            </p>
          </div>
        ) : (
          <div className="stagger-children space-y-4">
            {summary && (
              <div className="stagger-children grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs font-bold text-slate-500 m-0">{t('utilities.avgWater')}</p>
                  <p className="text-xl font-black text-blue-800 m-0 mt-1">{summary.avgWater} m³</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs font-bold text-slate-500 m-0">{t('utilities.avgElectric')}</p>
                  <p className="text-xl font-black text-amber-800 m-0 mt-1">{summary.avgElectric} kWh</p>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                  <p className="text-xs font-bold text-slate-500 m-0">{t('utilities.avgCost')}</p>
                  <p className="text-xl font-black text-slate-900 m-0 mt-1">₱{summary.avgCost.toFixed(2)}</p>
                  <p className="text-xs text-slate-500 m-0">{summary.cycles === 1 ? t('utilities.acrossOne') : t('utilities.acrossMany', { n: summary.cycles })}</p>
                </div>
              </div>
            )}
            {readings.map(r => {
              // #2: Include other_fees in total (matches what sync sends to invoice)
              const isTotalOnly = r.entry_mode === 'total';
              const totalAmount = readingTotal(r);
              const isInvoiced = r.is_invoiced == 1;

              return (
                <div key={r.id} className="card-interactive bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-5 sm:p-7 space-y-6">
                  
                  {/* Top Bar of Card */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-3">
                      <div>
                        <h3 className="text-base sm:text-lg font-extrabold text-slate-900 m-0">
                          {t('utilities.billingCycle', { period: r.billing_period_label || r.billing_period })}
                        </h3>
                        {r.reading_date && (
                          <p className="text-xs text-slate-500 m-0 mt-0.5 flex items-center gap-1.5">
                            <FontAwesomeIcon icon={faCalendarAlt} className="text-xs" />
                            {t(r.entry_mode === 'bill' ? 'utilities.recordedOn' : 'utilities.readOn', { date: new Date(r.reading_date).toLocaleDateString(dateLocale(lang), { month: 'long', day: 'numeric', year: 'numeric' }) })}
                          </p>
                        )}
                      </div>
                    </div>

                    <span className={`self-start sm:self-auto inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full ${
                      isInvoiced 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      <FontAwesomeIcon icon={isInvoiced ? faCheckCircle : faClock} className="text-xs" />
                      <span>
                        {isInvoiced
                          ? (r.invoice_payment_method === 'Cash' || (r.invoice_payment_ref && String(r.invoice_payment_ref).startsWith('UTIL-READING'))
                            ? 'Paid in Cash to Admin'
                            : parseFloat(r.invoice_base_rent || 0) > 0
                              ? `Combined with Rent · ${r.invoice_id}`
                              : `Separate Bill · ${r.invoice_id}`)
                          : t('utilities.notBilled')}
                      </span>
                    </span>
                  </div>

                  {/* Sub-Meter Breakdown Grids */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6 items-center">
                    
                    {isTotalOnly ? (
                      <div className="md:col-span-8 p-4 rounded-2xl bg-indigo-50/60 border border-indigo-100 space-y-1 text-xs text-slate-600">
                        <span className="text-xs font-bold text-indigo-900">{t('utilities.totalOnlyTitle')}</span>
                        <p className="m-0">{t('utilities.totalOnlyBody')}</p>
                      </div>
                    ) : r.entry_mode === 'bill' ? (<>
                      {/* Provider bill: you pay exactly the Meralco / water bill amount */}
                      {[
                        { key: 'water', title: t('utilities.waterBill'), icon: faTint, unit: 'm³', box: 'bg-blue-50/60 border-blue-100', text: 'text-blue-900', strong: 'text-blue-800', tone: 'text-blue-500' },
                        { key: 'electric', title: t('utilities.electricBill'), icon: faBolt, unit: 'kWh', box: 'bg-amber-50/60 border-amber-100', text: 'text-amber-900', strong: 'text-amber-800', tone: 'text-amber-500' },
                      ].map((u) => {
                        const consumption = r[`${u.key}_consumption`];
                        const curr = r[`${u.key}_curr_reading`];
                        return (
                          <div key={u.key} className={`md:col-span-4 p-4 rounded-2xl border space-y-2.5 ${u.box}`}>
                            <span className={`text-xs font-bold flex items-center gap-1.5 ${u.text}`}>
                              <FontAwesomeIcon icon={u.icon} className={u.tone} />
                              {u.title}
                            </span>
                            <div className="space-y-1 text-xs text-slate-600">
                              {consumption !== null && consumption !== undefined ? (<>
                                <div className="flex justify-between"><span>{t('utilities.previous')}</span><span className="font-semibold text-slate-800">{r[`${u.key}_prev_reading`]} {u.unit}</span></div>
                                <div className="flex justify-between"><span>{t('utilities.present')}</span><span className="font-semibold text-slate-800">{curr} {u.unit}</span></div>
                                <div className="flex justify-between font-semibold"><span>{t('utilities.usage')}</span><span>{consumption} {u.unit}</span></div>
                                <UsageChange pct={r[`${u.key}_change_pct`]} />
                              </>) : curr !== null && curr !== undefined ? (
                                <div className="flex justify-between"><span>{t('utilities.meter')}</span><span className="font-semibold text-slate-800">{curr} {u.unit}</span></div>
                              ) : (
                                <p className="m-0 text-slate-500">{t('utilities.fromProvider')}</p>
                              )}
                            </div>
                            <div className="pt-2 border-t border-slate-200/60 flex justify-between items-center text-xs">
                              <span className="text-slate-500 font-medium">{t('utilities.billAmount')}</span>
                              <span className={`text-sm font-black ${u.strong}`}>₱{(parseFloat(r[`${u.key}_amount`] || 0) + parseFloat(r[`${u.key}_other_fees`] || 0)).toFixed(2)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </>) : (<>
                    {/* Water Meter Block */}
                    <div className="md:col-span-4 p-4 rounded-2xl bg-blue-50/60 border border-blue-100 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                          <FontAwesomeIcon icon={faTint} className="text-blue-500" />
                          {t('utilities.waterMeter')}
                        </span>
                        <span className="text-xs font-semibold text-blue-600 bg-white px-2 py-0.5 rounded-full border border-blue-200">
                          ₱{r.water_rate_per_unit}/m³
                        </span>
                      </div>

                      <div className="space-y-1 text-xs text-slate-600">
                        <div className="flex justify-between">
                          <span>{t('utilities.previous')}</span>
                          <span className="font-semibold text-slate-800">{r.water_prev_reading} m³</span>
                        </div>
                        <div className="flex justify-between">
                          <span>{t('utilities.present')}</span>
                          <span className="font-semibold text-slate-800">{r.water_curr_reading} m³</span>
                        </div>
                        <div className="flex justify-between border-t border-blue-200/60 pt-1 font-bold text-blue-900">
                          <span>{t('utilities.consumption')}</span>
                          <span>{r.water_consumption} m³</span>
                        </div>
                        <UsageChange pct={r.water_change_pct} />
                      </div>

                      {/* #3: Show other fees line item if present */}
                      {parseFloat(r.water_other_fees || 0) > 0 && (
                        <div className="flex justify-between text-xs text-blue-700 font-semibold">
                          <span>{t('utilities.otherFees')}</span>
                          <span>+₱{parseFloat(r.water_other_fees).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="pt-2 border-t border-blue-200/60 flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-medium">{t('utilities.subtotal')}</span>
                        <span className="text-sm font-black text-blue-800">
                          ₱{(parseFloat(r.water_amount || 0) + parseFloat(r.water_other_fees || 0)).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Electric Meter Block */}
                    <div className="md:col-span-4 p-4 rounded-2xl bg-amber-50/60 border border-amber-100 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                          <FontAwesomeIcon icon={faBolt} className="text-amber-500" />
                          {t('utilities.electricMeter')}
                        </span>
                        <span className="text-xs font-semibold text-amber-700 bg-white px-2 py-0.5 rounded-full border border-amber-200">
                          ₱{r.electric_rate_per_unit}/kWh
                        </span>
                      </div>

                      <div className="space-y-1 text-xs text-slate-600">
                        <div className="flex justify-between">
                          <span>{t('utilities.previous')}</span>
                          <span className="font-semibold text-slate-800">{r.electric_prev_reading} kWh</span>
                        </div>
                        <div className="flex justify-between">
                          <span>{t('utilities.present')}</span>
                          <span className="font-semibold text-slate-800">{r.electric_curr_reading} kWh</span>
                        </div>
                        <div className="flex justify-between border-t border-amber-200/60 pt-1 font-bold text-amber-900">
                          <span>{t('utilities.consumption')}</span>
                          <span>{r.electric_consumption} kWh</span>
                        </div>
                        <UsageChange pct={r.electric_change_pct} />
                      </div>

                      {/* #3: Show other fees line item if present */}
                      {parseFloat(r.electric_other_fees || 0) > 0 && (
                        <div className="flex justify-between text-xs text-amber-700 font-semibold">
                          <span>{t('utilities.otherFees')}</span>
                          <span>+₱{parseFloat(r.electric_other_fees).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="pt-2 border-t border-amber-200/60 flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-medium">{t('utilities.subtotal')}</span>
                        <span className="text-sm font-black text-amber-800">
                          ₱{(parseFloat(r.electric_amount || 0) + parseFloat(r.electric_other_fees || 0)).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    </>)}

                    {/* Total Combined Summary Block */}
                    <div className="md:col-span-4 flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm backdrop-blur-md">
                      <div>
                        <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                          {t('utilities.totalSubtotal')}
                        </span>
                        <span className="mt-1 block text-2xl font-black text-indigo-600">
                          ₱{totalAmount.toFixed(2)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-slate-500 m-0">
                        {isInvoiced 
                          ? t('utilities.billedNote')
                          : t('utilities.notBilledNote')}
                      </p>
                    </div>

                  </div>

                  {(r.items || []).length > 0 && (
                    <div className="px-4 py-3 rounded-xl bg-indigo-50/60 border border-indigo-100 text-xs text-slate-700 space-y-1">
                      <span className="font-bold text-indigo-900">{t('utilities.otherUtilities')}</span>
                      {r.items.map((it) => (
                        <div key={it.type_id} className="flex justify-between">
                          <span>{it.name}{it.billing_mode === 'metered' ? ` (${it.consumption} ${it.unit_label || t('utilities.units')} @ ₱${it.rate})` : ''}</span>
                          <span className="font-semibold">₱{(parseFloat(it.amount) + parseFloat(it.other_fees || 0)).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <ReadingPayment r={r} onChanged={fetchReadings} onViewBill={() => setViewingBillReading(r)} allowTenantSelfPay={allowTenantSelfPay} />

                  {/* Notes Footer */}
                  {r.notes && (
                    <div className="pt-2 text-xs text-slate-500 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-100 flex items-center gap-2">
                      <FontAwesomeIcon icon={faInfoCircle} className="text-slate-500 text-xs shrink-0" />
                      <span><strong>{t('utilities.adminNote')}</strong> {r.notes}</span>
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}

        {/* Tenant In-Page Bill Viewer Modal */}
        {viewingBillReading && (
          <TenantBillViewerModal
            reading={viewingBillReading}
            onClose={() => setViewingBillReading(null)}
          />
        )}

      </div>
    </div>
  );
}

// Bill file + proof of payment for one reading. Proof goes through the same
// upload_payment_proof.php the Pay Bills page uses, on the reading's invoice.
// Bill file + payment options for one reading.
// For open standalone utility bills, tenant can:
// 1. Pay Together with Rent (merges into their open monthly rent invoice)
// 2. Pay Separately (pay online via Pay Bills or upload offline payment proof)
function ReadingPayment({ r, onChanged, onViewBill, allowTenantSelfPay = true }) {
  const { t } = useLang();
  const navigate = useNavigate();
  const [openProofForm, setOpenProofForm] = useState(false);
  const [payMode, setPayMode] = useState('provider'); // 'provider' (I paid provider directly) | 'admin' (Paying management)
  const [merging, setMerging] = useState(false);
  const [method, setMethod] = useState('Self-Paid (Provider Direct)');
  const [reference, setReference] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const status = r.invoice_status;
  const canUpload = !!r.invoice_id && ['pending', 'overdue'].includes(status);
  const isSeparateBill = !!r.invoice_id && parseFloat(r.invoice_base_rent || 0) === 0;
  const isCombinedRent = !!r.invoice_id && parseFloat(r.invoice_base_rent || 0) > 0;

  const handleMergeIntoRent = async () => {
    if (!window.confirm("Combine this utility bill with your monthly rent invoice? You'll be able to pay both together in one transaction to management.")) {
      return;
    }
    setMerging(true);
    setMsg(null);
    try {
      const res = await api.post('/merge_utility_into_rent.php', { reading_id: r.id });
      if (res.data?.success) {
        alert(res.data.message || "Combined successfully! This bill has been merged into your rent invoice.");
        onChanged();
      } else {
        alert(res.data?.message || "Failed to combine with rent invoice.");
      }
    } catch (err) {
      alert(apiErrorMessage(err, "Failed to combine with rent invoice."));
    } finally {
      setMerging(false);
    }
  };

  const submitProof = async (e) => {
    e.preventDefault();
    const fileError = file ? checkFile(file, FILE_RULES.paymentProof) : 'Please upload a receipt or screenshot of your payment.';
    if (fileError) { setMsg({ ok: false, text: fileError }); return; }
    if (!reference.trim()) { setMsg({ ok: false, text: 'Please enter a valid reference or official receipt (OR) number.' }); return; }
    const fd = new FormData();
    fd.append('invoice_id', r.invoice_id);
    fd.append('payment_reference', reference.trim());
    fd.append('payment_method', method);
    fd.append('proof', file);
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.post('/upload_payment_proof.php', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (!res.data.success) { setMsg({ ok: false, text: apiErrorMessage(res) }); return; }
      setMsg({ ok: true, text: 'Payment proof submitted! Management will verify it shortly.' });
      setOpenProofForm(false);
      setFile(null);
      setReference('');
      onChanged();
    } catch (err) {
      setMsg({ ok: false, text: apiErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const hasBillFiles = Boolean(r.bill_file_path || (Array.isArray(r.bill_file_paths) && r.bill_file_paths.length > 0));
  if (!hasBillFiles && !r.invoice_id) return null;

  return (
    <div className="mt-2 border-t border-slate-100/80 px-4 py-3 text-xs text-slate-600">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: View Bill button */}
        <div>
          {hasBillFiles && (
            <button
              type="button"
              onClick={onViewBill}
              className="font-bold text-indigo-600 hover:underline border-0 bg-transparent p-0 cursor-pointer inline-flex items-center gap-1.5"
            >
              <FontAwesomeIcon icon={r.bill_file_path && r.bill_file_path.toLowerCase().endsWith('.pdf') ? faFilePdf : faFileAlt} className="text-xs" />
              <span>{t('utilities.viewBill')} {Array.isArray(r.bill_file_paths) && r.bill_file_paths.length > 1 ? `(${r.bill_file_paths.length} files)` : ''}</span>
            </button>
          )}
        </div>

        {/* Right: Payment status and tenant action choices */}
        <div className="flex flex-wrap items-center gap-2">
          {status === 'paid' && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              <FontAwesomeIcon icon={faCheckCircle} aria-hidden="true" />
              {t('common.paid')}{r.paid_at ? ` · ${new Date(r.paid_at).toLocaleDateString()}` : ''}
            </span>
          )}

          {status === 'pending-verification' && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700">
              <FontAwesomeIcon icon={faClock} className="text-xs text-sky-500" />
              <span>
                {r.invoice_payment_method && (r.invoice_payment_method.toLowerCase().includes('provider') || r.invoice_payment_method.toLowerCase().includes('self'))
                  ? 'Paid to Provider — Awaiting Admin Verification'
                  : 'Paid to Admin — Awaiting Verification'}
              </span>
            </span>
          )}

          {/* If open and separate: Offer tenant clear choices */}
          {canUpload && isSeparateBill && (
            allowTenantSelfPay ? (
              <div className="flex flex-wrap items-center gap-2">
                {/* Choice 1: Combine with Rent (Admin pays provider) */}
                <button
                  type="button"
                  onClick={handleMergeIntoRent}
                  disabled={merging}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs border border-indigo-200 transition-colors cursor-pointer disabled:opacity-50"
                  title="Combine this bill into your open monthly rent invoice so admin pays the provider on your behalf"
                >
                  <FontAwesomeIcon icon={faLink} className="text-xs" />
                  <span>{merging ? 'Combining…' : 'Pay Together with Rent'}</span>
                </button>

                {/* Choice 2: I Paid Provider Directly (Self-Pay) */}
                <button
                  type="button"
                  onClick={() => {
                    setPayMode('provider');
                    setMethod('Self-Paid (Provider Direct)');
                    setOpenProofForm(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 font-bold text-xs border border-sky-200 transition-colors cursor-pointer"
                  title="I paid Meralco or PrimeWater directly on my own"
                >
                  <FontAwesomeIcon icon={faUser} className="text-xs" />
                  <span>I Paid Provider Directly</span>
                </button>

                {/* Choice 3: Pay Admin Separately */}
                <button
                  type="button"
                  onClick={() => {
                    setPayMode('admin');
                    setMethod('GCash');
                    setOpenProofForm(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs border border-slate-300 transition-colors cursor-pointer"
                  title="Pay property management for this bill via GCash, Maya, or Bank"
                >
                  <FontAwesomeIcon icon={faUpload} className="text-xs" />
                  <span>Pay Admin Separately</span>
                </button>
              </div>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600">
                <FontAwesomeIcon icon={faInfoCircle} className="text-slate-400" />
                Pay directly to Office / Admin
              </span>
            )
          )}

          {/* If open and combined with rent */}
          {canUpload && isCombinedRent && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">
                Combined on Rent Invoice #{r.invoice_id}
              </span>
              <button
                type="button"
                onClick={() => navigate('/pay-bills')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs border-0 transition-colors cursor-pointer"
              >
                <FontAwesomeIcon icon={faCreditCard} className="text-xs" />
                <span>Pay Rent & Utilities</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {canUpload && r.invoice_proof_rejection && (
        <p className="m-0 mt-2 font-semibold text-rose-700">{t('utilities.lastRejected', { reason: r.invoice_proof_rejection })}</p>
      )}

      {/* Payment Proof / Receipt Form */}
      {openProofForm && (
        <form onSubmit={submitProof} className="mt-3 space-y-3 p-4 rounded-xl bg-slate-50 border border-slate-200 animate-fadeIn">
          {/* Header & Mode Tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
            <div>
              <p className="font-bold text-slate-800 m-0 text-sm">
                {payMode === 'provider' ? 'Submit Proof of Direct Provider Payment' : 'Pay Management for Utility Bill'}
              </p>
              <p className="text-[11px] text-slate-500 m-0 mt-0.5">
                {payMode === 'provider'
                  ? 'Upload the official receipt or payment screenshot from your direct payment to Meralco / PrimeWater / Bayad Center.'
                  : 'Send payment directly to apartment management and upload your transaction receipt.'}
              </p>
            </div>
            <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-lg shrink-0">
              <button
                type="button"
                onClick={() => { setPayMode('provider'); setMethod('Self-Paid (Provider Direct)'); }}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer border-0 ${
                  payMode === 'provider' ? 'bg-white text-indigo-700 shadow-2xs' : 'bg-transparent text-slate-600'
                }`}
              >
                Paid Provider
              </button>
              <button
                type="button"
                onClick={() => { setPayMode('admin'); setMethod('GCash'); }}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer border-0 ${
                  payMode === 'admin' ? 'bg-white text-indigo-700 shadow-2xs' : 'bg-transparent text-slate-600'
                }`}
              >
                Pay Management
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                {payMode === 'provider' ? 'Provider / Channel' : 'Payment Method'}
              </label>
              <select
                aria-label="Payment Method"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500"
              >
                {payMode === 'provider' ? (
                  <>
                    <option value="Self-Paid (Provider Direct)">Provider Direct (Official Receipt)</option>
                    <option value="Self-Paid (Meralco Direct)">Meralco Direct (App / OTC)</option>
                    <option value="Self-Paid (PrimeWater Direct)">PrimeWater Direct (App / OTC)</option>
                    <option value="Self-Paid (Bayad Center)">Bayad Center / Payment Center</option>
                    <option value="Self-Paid (Online Banking)">Online Banking Bills Pay</option>
                  </>
                ) : (
                  <>
                    <option value="GCash">GCash</option>
                    <option value="Maya">Maya</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cash at Office">Cash (Settled at Office)</option>
                  </>
                )}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                {payMode === 'provider' ? 'Provider Ref / OR Number' : 'Transaction Ref No.'}
              </label>
              <input
                aria-label="Reference Number"
                value={reference}
                maxLength={100}
                onChange={(e) => setReference(e.target.value)}
                placeholder={payMode === 'provider' ? 'e.g. Meralco OR / 10-digit ref' : 'e.g. GCash / Bank ref no.'}
                className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-800 outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                {payMode === 'provider' ? 'Upload Provider Receipt (OR)' : 'Upload Payment Proof'}
              </label>
              <input
                type="file"
                aria-label="Proof of Payment"
                accept={acceptFor(FILE_RULES.paymentProof)}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={busy}
              className="min-h-[38px] cursor-pointer rounded-lg border-0 bg-indigo-600 hover:bg-indigo-700 px-4 text-xs font-bold text-white transition-colors disabled:opacity-50 shadow-xs"
            >
              {busy ? 'Submitting…' : payMode === 'provider' ? 'Submit Provider Receipt' : 'Submit Proof to Management'}
            </button>
            <button
              type="button"
              onClick={() => setOpenProofForm(false)}
              className="min-h-[38px] cursor-pointer rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-3.5 text-xs font-semibold text-slate-600 transition-colors"
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}

      {msg && <p role="status" className={`m-0 mt-2 font-semibold ${msg.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{msg.text}</p>}
    </div>
  );
}

// Change against the tenant's own previous cycle (the server sends null when there is none).
// The 30% cutoff mirrors UTILITY_SPIKE_THRESHOLD_PCT in backend/config.php.
function UsageChange({ pct }) {
  const { t } = useLang();
  if (pct === null || pct === undefined) return null;
  const high = pct > 30;
  const tone = high ? 'text-rose-600' : pct > 0 ? 'text-amber-700' : 'text-emerald-700';
  return (
    <div className={`text-xs font-semibold ${tone}`}>
      {pct > 0 ? '▲' : pct < 0 ? '▼' : '■'} {t('utilities.vsPrevious', { pct: Math.abs(pct) })}{high ? t('utilities.unusuallyHigh') : ''}
    </div>
  );
}

// In-Page Modal for Tenant to view their attached provider bill(s)
function TenantBillViewerModal({ reading, onClose }) {
  const [zoomActual, setZoomActual] = useState(false);
  const [activeFileIndex, setActiveFileIndex] = useState(0);

  const files = useMemo(() => {
    if (!reading) return [];
    if (Array.isArray(reading.bill_file_paths) && reading.bill_file_paths.length > 0) {
      return reading.bill_file_paths;
    }
    if (reading.bill_file_path) {
      try {
        const parsed = JSON.parse(reading.bill_file_path);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {
        // Fall back to plain single path string
      }
      return [reading.bill_file_path];
    }
    return [];
  }, [reading]);

  if (!reading || files.length === 0) return null;
  const currentPath = files[activeFileIndex] || files[0];
  const url = fileUrl(currentPath);
  const isPdf = /\.pdf$/i.test(currentPath);

  const getFileLabel = (path, idx) => {
    const lower = path.toLowerCase();
    if (lower.includes('electric') || lower.includes('meralco')) return '⚡ Electricity Bill';
    if (lower.includes('water') || lower.includes('primewater') || lower.includes('maynilad') || lower.includes('manila_water')) return '💧 Water Bill';
    if (idx === 0) return '⚡ Electricity / Bill 1';
    if (idx === 1) return '💧 Water / Bill 2';
    return `Attachment ${idx + 1}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/80 overflow-y-auto" role="dialog" aria-modal="true">
      <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl my-auto text-left">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm font-bold shrink-0">
              <FontAwesomeIcon icon={isPdf ? faFilePdf : faFileAlt} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 m-0">Provider Utility Bill</h3>
              <p className="text-xs text-slate-500 m-0">Billing Period: {reading.billing_period_label || reading.billing_period}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              download
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 no-underline shadow-xs"
            >
              <FontAwesomeIcon icon={faDownload} className="text-xs" />
              <span>Download</span>
            </a>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 no-underline shadow-xs"
            >
              <FontAwesomeIcon icon={faExternalLinkAlt} className="text-xs" />
              <span>Open in Tab</span>
            </a>
            <button aria-label="Close" type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-transparent border-0 cursor-pointer p-1.5 ml-1">
              <FontAwesomeIcon icon={faTimes} className="text-base" />
            </button>
          </div>
        </div>

        {/* Tab Selector if multiple files attached */}
        {files.length > 1 && (
          <div className="flex items-center gap-2 px-6 py-2.5 bg-slate-100/80 border-b border-slate-200 overflow-x-auto shrink-0">
            <span className="text-xs font-semibold text-slate-500 mr-1">Bills:</span>
            {files.map((p, idx) => (
              <button
                key={p + idx}
                type="button"
                onClick={() => { setActiveFileIndex(idx); setZoomActual(false); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                  activeFileIndex === idx
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {getFileLabel(p, idx)}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 flex flex-col items-center justify-center bg-slate-900/5 min-h-[350px]">
          {isPdf ? (
            <iframe src={url} title="Provider Bill PDF" className="w-full h-[65vh] rounded-xl border border-slate-300 bg-white shadow-sm" />
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="overflow-auto max-h-[65vh] flex items-center justify-center">
                <img
                  src={url}
                  alt="Provider utility bill"
                  className={`transition-all rounded-xl shadow-md ${zoomActual ? 'max-w-none' : 'max-w-full max-h-[62vh] object-contain'}`}
                />
              </div>
              <button
                type="button"
                onClick={() => setZoomActual(!zoomActual)}
                className="text-xs text-slate-500 hover:text-indigo-600 font-medium border-0 bg-transparent cursor-pointer inline-flex items-center gap-1"
              >
                <FontAwesomeIcon icon={faSearch} className="text-[10px]" />
                <span>{zoomActual ? 'Fit to Screen' : 'View Actual Size'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs border-0 cursor-pointer transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
