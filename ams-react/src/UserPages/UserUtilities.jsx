import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axiosConfig';
import fileUrl from '../api/fileUrl';
import { FILE_RULES, acceptFor, checkFile } from '../utils/fileLimits';
import { apiErrorMessage } from '../utils/apiError';
import { useLang, dateLocale } from '../config/i18n';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTint, faBolt, faCheckCircle, faClock, faArrowLeft,
  faCalendarAlt, faInfoCircle, faReceipt
} from '@fortawesome/free-solid-svg-icons';
import '../assets/styles/responsive/user/user-utilities.responsive.css';

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

  const fetchReadings = useCallback(async () => {
    try {
      const res = await api.get('/get_utility_readings.php');
      if (res.data.success && Array.isArray(res.data.data)) {
        setReadings(res.data.data);
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
      <div className="w-full max-w-5xl space-y-6 sm:space-y-8 flex flex-col justify-start text-left">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="h-11 w-11 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
                title={t('common.goBack')}
                aria-label={t('common.goBack')}
              >
                <FontAwesomeIcon icon={faArrowLeft} className="text-sm" aria-hidden="true" />
              </button>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 m-0 tracking-tight" style={{ color: '#3b4276' }}>
                {t('utilities.title')}
              </h1>
            </div>
            <p className="text-slate-500 text-xs sm:text-sm mt-1.5 m-0">
              {t('utilities.subtitle')}
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => navigate('/my-room')}
              className="inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs px-3.5 py-2.5 transition-all shadow-sm cursor-pointer"
            >
              <span>{t('nav.myRoom')}</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/pay-bills')}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2.5 transition-all shadow-sm cursor-pointer border-0"
            >
              <FontAwesomeIcon icon={faReceipt} />
              <span>{t('utilities.goPayBills')}</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        {loading ? (
          <div className="p-12 text-center flex flex-col items-center justify-center bg-white rounded-3xl border border-slate-200 shadow-sm text-slate-500" style={{ textAlign: 'center' }}>
            <FontAwesomeIcon icon={faTint} className="animate-pulse text-3xl mb-3 text-indigo-400" />
            <p className="text-sm font-semibold m-0 text-center" style={{ textAlign: 'center' }}>{t('utilities.loading')}</p>
          </div>
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
                      <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-700 font-bold flex items-center justify-center text-sm">
                        {r.room_name}
                      </div>
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
                      <span>{/* invoice_id is an id, not a date ("Billed on INV-…" read like one). */}
                      {isInvoiced ? (r.invoice_id ? t('utilities.onInvoice', { id: r.invoice_id }) : t('utilities.billed')) : t('utilities.notBilled')}</span>
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
                    <div className="md:col-span-4 p-5 rounded-2xl bg-slate-900 text-white flex flex-col justify-between space-y-3">
                      <div>
                        <span className="text-xs font-bold text-slate-300 block">
                          {t('utilities.totalSubtotal')}
                        </span>
                        <span className="text-2xl lg:text-3xl font-black text-emerald-400 mt-1 block">
                          ₱{totalAmount.toFixed(2)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 m-0 leading-tight">
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

                  <ReadingPayment r={r} onChanged={fetchReadings} />

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

      </div>
    </div>
  );
}

// Bill file + proof of payment for one reading. Proof goes through the same
// upload_payment_proof.php the Pay Bills page uses, on the reading's invoice.
function ReadingPayment({ r, onChanged }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState('GCash');
  const [reference, setReference] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const status = r.invoice_status;
  const canUpload = !!r.invoice_id && ['pending', 'overdue'].includes(status);

  const submit = async (e) => {
    e.preventDefault();
    const fileError = file ? checkFile(file, FILE_RULES.paymentProof) : t('utilities.chooseProof');
    if (fileError) { setMsg({ ok: false, text: fileError }); return; }
    if (!reference.trim()) { setMsg({ ok: false, text: t('utilities.enterRef') }); return; }
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
      setMsg({ ok: true, text: t('utilities.proofSent') });
      setOpen(false);
      setFile(null);
      setReference('');
      onChanged();
    } catch (err) {
      setMsg({ ok: false, text: apiErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  if (!r.bill_file_path && !r.invoice_id) return null;

  return (
    <div className="pt-2 text-xs text-slate-600 bg-slate-50 px-4 py-3 rounded-xl border border-slate-100 space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {r.bill_file_path && (
          <a href={fileUrl(r.bill_file_path)} target="_blank" rel="noreferrer" className="font-bold text-indigo-600 hover:underline">{t('utilities.viewBill')}</a>
        )}
        {status === 'paid' && <span className="font-bold text-emerald-700">{t('common.paid')}</span>}
        {status === 'pending-verification' && <span className="font-bold text-sky-700">{t('utilities.awaitingVerify')}</span>}
        {canUpload && !open && (
          <button type="button" onClick={() => setOpen(true)} className="cursor-pointer border-0 bg-transparent p-0 font-bold text-indigo-600 hover:underline">
            {t('utilities.uploadOutside')}
          </button>
        )}
      </div>
      {canUpload && r.invoice_proof_rejection && (
        <p className="m-0 font-semibold text-rose-700">{t('utilities.lastRejected', { reason: r.invoice_proof_rejection })}</p>
      )}
      {open && (
        <form onSubmit={submit} className="space-y-2">
          <p className="m-0 text-slate-500">{t('utilities.sameInvoice')}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <select aria-label={t('utilities.paymentMethod')} value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-lg border border-slate-300 bg-white p-2">
              <option value="GCash">GCash</option><option value="Maya">Maya</option><option value="Other">{t('utilities.otherMethod')}</option>
            </select>
            <input aria-label={t('utilities.refNo')} value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} placeholder={t('utilities.refNo')} className="rounded-lg border border-slate-300 p-2" />
            <input type="file" aria-label={t('utilities.proofLabel')} accept={acceptFor(FILE_RULES.paymentProof)} onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-xs" />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="min-h-[44px] cursor-pointer rounded-lg border-0 bg-indigo-600 px-4 text-sm font-bold text-white disabled:opacity-50">{busy ? t('common.sending') : t('utilities.sendProof')}</button>
            <button type="button" onClick={() => setOpen(false)} className="min-h-[44px] cursor-pointer rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-600">{t('common.cancel')}</button>
          </div>
        </form>
      )}
      {msg && <p role="status" className={`m-0 font-semibold ${msg.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{msg.text}</p>}
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
