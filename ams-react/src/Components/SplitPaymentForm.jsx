import { useState } from 'react';
import { useLang } from '../config/i18n';
import { SPLIT_SCHEDULE_MAX_DAYS, checkSplit, maxForPortion } from '../utils/splitPayment';
import { addDays, localDateString } from '../utils/validation';
import { FILE_RULES, acceptFor, checkFile } from '../utils/fileLimits';
import FieldError from './form/FieldError';
import FileChip from './form/FileChip';
import { invalidCls } from './form/formHelpers';

const BANKS = ['BDO', 'BPI', 'Metrobank', 'Landbank', 'RCBC', 'UnionBank', 'Security Bank', 'Maya Bank'];
const METHOD_LABEL = { cash: 'Cash', gcash: 'GCash', bank_transfer: 'Bank transfer' };

// Portion editor for a split payment: one row per way the tenant is paying.
export default function SplitPaymentForm({ parts, setParts, total, showErrors, fmtMoney, scheduledDate, setScheduledDate, scheduledTimeSlot, setScheduledTimeSlot }) {
  const { t } = useLang();
  const check = checkSplit(parts, total, scheduledDate);
  // Errors show once a portion has been touched (or a submit was tried).
  const [touched, setTouched] = useState({});
  const [dateTouched, setDateTouched] = useState(false);
  const update = (index, changes) => setParts((list) => list.map((p, i) => (i === index ? { ...p, ...changes } : p)));
  const inputCls = 'pay-bills-input w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg outline-none bg-white focus:border-indigo-500';

  return (
    <div className="space-y-3">
      <p className="m-0 text-xs text-slate-500">{t('payBills.splitHelp')}</p>
      {parts.map((part, index) => {
        const errors = showErrors || touched[index] ? check.portions[index] : {};
        const gcash = part.method === 'gcash';
        return (
          <div key={index} onBlur={() => setTouched((t) => (t[index] ? t : { ...t, [index]: true }))} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-left">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-700">{t('payBills.portion')} {index + 1}</span>
            </div>
            <div className="space-y-3">
              <div>
                <label htmlFor={`split-method-${index}`} className="mb-1 block text-xs font-bold text-slate-700">{t('payBills.method')}</label>
                <select id={`split-method-${index}`} className={inputCls} value={part.method}
                  onChange={(e) => update(index, { method: e.target.value, bank_name: '', reference_number: '', proof: null, fileKey: part.fileKey + 1 })}>
                  {Object.entries(METHOD_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor={`split-amount-${index}`} className="mb-1 block text-xs font-bold text-slate-700">{t('payBills.amount')}</label>
                <input id={`split-amount-${index}`} type="number" min="0.01" max={maxForPortion(parts, index, total)} step="0.01" inputMode="decimal" value={part.amount} placeholder="0.00"
                  onKeyDown={(e) => { if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault(); }}
                  onChange={(e) => {
                    // Never above what is left of the amount due, and at most two decimals.
                    const raw = e.target.value;
                    const max = maxForPortion(parts, index, total);
                    const tooLong = /\.\d{3,}/.test(raw);
                    update(index, { amount: raw !== '' && (Number(raw) > max || tooLong) ? String(Math.min(Math.floor(Number(raw) * 100 + 1e-6) / 100, max)) : raw });
                  }}
                  className={`${inputCls} no-spinner${invalidCls(errors.amount)}`} />
                <FieldError id={`split-amount-${index}`} error={errors.amount} />
              </div>
            </div>

            {part.method === 'cash' && <p className="m-0 text-[11px] text-slate-500">{t('payBills.splitCashNote')}</p>}

            {part.method === 'bank_transfer' && (
              <div>
                <label htmlFor={`split-bank-${index}`} className="mb-1 block text-xs font-bold text-slate-700">{t('payBills.sendingBank')}</label>
                <select id={`split-bank-${index}`} className={inputCls + invalidCls(errors.bank)} value={part.bank_name} onChange={(e) => update(index, { bank_name: e.target.value })}>
                  <option value="">{t('payBills.selectBank')}</option>
                  {BANKS.map((bank) => <option key={bank} value={bank}>{bank}</option>)}
                </select>
                <FieldError id={`split-bank-${index}`} error={errors.bank} />
              </div>
            )}

            {part.method !== 'cash' && (
              <>
                <div>
                  <label htmlFor={`split-ref-${index}`} className="mb-1 block text-xs font-bold text-slate-700">{t('payBills.refNo')} <span className="text-red-500">*</span></label>
                  <input id={`split-ref-${index}`} type="text" autoComplete="off" value={part.reference_number}
                    maxLength={gcash ? 13 : 55} inputMode={gcash ? 'numeric' : 'text'}
                    placeholder={gcash ? '13-digit GCash reference' : 'e.g. BDO-2026-000123'}
                    onChange={(e) => update(index, { reference_number: gcash ? e.target.value.replace(/\D/g, '') : e.target.value })}
                    className={inputCls + invalidCls(errors.reference)} />
                  <FieldError id={`split-ref-${index}`} error={errors.reference} />
                </div>
                <div>
                  <label htmlFor={`split-proof-${index}`} className="mb-1 block text-xs font-bold text-slate-700">{t('payBills.proofOfPayment')} <span className="text-red-500">*</span></label>
                  <input key={part.fileKey} id={`split-proof-${index}`} type="file" accept={acceptFor(FILE_RULES.paymentProof)}
                    onChange={(e) => {
                      const file = e.target.files[0] || null;
                      if (file && checkFile(file, FILE_RULES.paymentProof)) { e.target.value = ''; update(index, { proof: file }); return; }
                      update(index, { proof: file });
                    }}
                    className="w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100" />
                  <p className="m-0 mt-1 text-[11px] text-slate-400">{FILE_RULES.paymentProof.label}, up to {FILE_RULES.paymentProof.maxMB} MB.</p>
                  <FieldError id={`split-proof-${index}`} error={errors.proof} />
                  <FileChip file={part.proof} onRemove={() => update(index, { proof: null, fileKey: part.fileKey + 1 })} />
                </div>
              </>
            )}
          </div>
        );
      })}

      {check.hasCash && (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-left">
          <p className="m-0 text-xs font-bold text-slate-700">{t('payBills.cashVisit')}</p>
          <div>
            <label htmlFor="split-visit-date" className="mb-1 block text-xs font-bold text-slate-700">{t('payBills.visitDate')} <span className="text-red-500">*</span></label>
            <input id="split-visit-date" type="date" value={scheduledDate} min={localDateString()} max={addDays(SPLIT_SCHEDULE_MAX_DAYS)}
              onChange={(e) => setScheduledDate(e.target.value)} onBlur={() => setDateTouched(true)}
              className={inputCls + invalidCls((showErrors || dateTouched) && check.scheduleError)} />
            <FieldError id="split-visit-date" error={(showErrors || dateTouched) && check.scheduleError} />
          </div>
          <div>
            <label htmlFor="split-visit-slot" className="mb-1 block text-xs font-bold text-slate-700">{t('payBills.timeSlot')} <span className="text-red-500">*</span></label>
            <select id="split-visit-slot" value={scheduledTimeSlot} onChange={(e) => setScheduledTimeSlot(e.target.value)} className={`${inputCls} cursor-pointer`}>
              <option value="morning">Morning (9am-12pm)</option>
              <option value="afternoon">Afternoon (1pm-5pm)</option>
            </select>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-indigo-700">{t('payBills.allocated')}: {fmtMoney(check.allocated)}</span>
          <span className={`rounded-full px-3 py-1.5 ${check.remaining === 0 ? 'bg-emerald-50 text-emerald-700' : check.remaining > 0 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>
            {check.remaining === 0 ? `✓ ${t('payBills.balanced')}` : check.remaining > 0 ? `${t('payBills.remaining')}: ${fmtMoney(check.remaining)}` : `${t('payBills.over')} ${fmtMoney(Math.abs(check.remaining))}`}
          </span>
        </div>
      </div>
      {showErrors && !check.hasOnline && <p role="alert" className="m-0 text-xs text-red-600">{t('payBills.splitNeedsOnline')}</p>}
    </div>
  );
}
