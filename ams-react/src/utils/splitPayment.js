import { addDays, checkDate, checkPaymentReference, localDateString } from './validation';
import { FILE_RULES, checkFile } from './fileLimits';

export const SPLIT_MAX_PORTIONS = 2;
// schedule_payment.php / submit_split_payment.php accept today up to 60 days ahead.
export const SPLIT_SCHEDULE_MAX_DAYS = 60;

export const emptyPortion = (method = 'gcash') => ({ method, bank_name: '', amount: '', reference_number: '', proof: null, fileKey: 0 });

const toCents = (value) => Math.round((Number(value) || 0) * 100);

// The most this portion can take: the total less the other portions (cents-safe).
export const maxForPortion = (parts, index, total) =>
  Math.max(0, (toCents(total) - parts.reduce((sum, p, i) => sum + (i === index ? 0 : toCents(p.amount)), 0)) / 100);

// What is still unassigned, and the first problem with each portion.
export function checkSplit(parts, total, scheduledDate = '') {
  const allocated = parts.reduce((sum, p) => sum + toCents(p.amount), 0);
  const remaining = toCents(total) - allocated;
  const portions = parts.map((p) => {
    const cents = toCents(p.amount);
    const errors = {};
    if (!(cents > 0)) errors.amount = 'Enter an amount greater than ₱0.';
    else if (cents > toCents(total)) errors.amount = 'A portion cannot be more than the amount due.';
    if (p.method === 'bank_transfer' && !p.bank_name) errors.bank = 'Choose the bank you sent from.';
    if (p.method !== 'cash') {
      const refError = checkPaymentReference(p.reference_number, p.method === 'gcash' ? 'GCash' : 'Bank Transfer');
      if (refError) errors.reference = refError;
      const proofError = p.proof ? checkFile(p.proof, FILE_RULES.paymentProof) : 'Please attach your proof of payment.';
      if (proofError) errors.proof = proofError;
    }
    return errors;
  });
  // A cash portion is paid at the office on a booked date.
  const hasCash = parts.some((p) => p.method === 'cash');
  const scheduleError = hasCash
    ? checkDate(scheduledDate, { min: localDateString(), max: addDays(SPLIT_SCHEDULE_MAX_DAYS), label: 'Visit date' })
    : '';
  const hasOnline = parts.some((p) => p.method !== 'cash');
  const valid = remaining === 0 && hasOnline && parts.length >= 2 && portions.every((e) => Object.keys(e).length === 0) && !scheduleError;
  return { allocated: allocated / 100, remaining: remaining / 100, portions, hasOnline, hasCash, scheduleError, valid };
}
