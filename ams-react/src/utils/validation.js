// Client-side input checks. The backend is still the boundary: these only stop
// a bad value before the round trip and keep the UI's limits equal to the
// database's. Each check returns an error message, or '' when the value is fine.

// Column sizes from backend/api/migrations/SetupDB.sql. MariaDB runs non-strict,
// so a longer value is silently cut instead of rejected — maxLength prevents that.
export const LIMITS = {
  firstName: 30,          // users.first_name
  middleName: 50,         // users.middle_name
  lastName: 30,           // users.last_name
  suffix: 20,
  userEmail: 190,         // users.email_address
  email: 150,             // applications, inquiries, reservations, waitlist
  applicantName: 100,     // rent_applications.first/middle/last_name
  fullName: 150,          // inquiries, reservations, visitors, household members
  reason: 255,            // every *_reason column
  paymentReference: 100,  // invoices.payment_reference
  senderName: 150,        // invoices.sender_name
  announcementTitle: 255,
  maintenanceTitle: 150,
  assignedTo: 100,
  serviceName: 150,
  serviceIcon: 50,
  vehicleModel: 100,
  plate: 15,              // parking_reservations.plate_number is 20; the backend rule caps at 15
  visitorPlate: 30,       // visitor_logs.vehicle_plate
  idNumber: 50,
  purpose: 255,
  relationship: 50,
  expenseDescription: 255,
  locationDetails: 50,    // cctv_requests.location_details
  notes: 1000,            // TEXT columns: a sane UI cap, not a schema limit
  message: 2000,
};

// decimal(10,2) — the largest amount any money column can hold.
export const MAX_AMOUNT = 99999999.99;

// bcrypt ignores everything past 72 bytes; backend PASSWORD_MIN_LENGTH is 8.
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX_BYTES = 72;

export const checkRequired = (value, label = 'This field') =>
  String(value ?? '').trim() === '' ? `${label} is required.` : '';

export const checkLength = (value, max, label = 'This field') =>
  String(value ?? '').trim().length > max ? `${label} must be ${max} characters or fewer.` : '';

export const checkEmail = (value) => {
  const v = String(value ?? '').trim();
  if (!v) return 'Email is required.';
  // Same shape PHP's FILTER_VALIDATE_EMAIL accepts for ordinary addresses.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Enter a valid email address.';
  return '';
};

// Ten digits after +63, starting with 9 — the rule the backend enforces
// (profile.php, normalize_ph_mobile()). Takes the 10-digit local part the phone
// inputs store, or a full number in any common format.
export const checkPhMobile = (value) => {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.startsWith('63') && digits.length === 12) digits = digits.slice(2);
  else if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);

  if (digits.length !== 10) return 'Mobile number must be exactly 10 digits (e.g., 9171234567).';
  if (!digits.startsWith('9')) return 'Philippine mobile numbers start with 9.';
  if (/^(\d)\1+$/.test(digits)) return 'Repeated-digit numbers are not accepted.';
  if ('0123456789012'.includes(digits) || '9876543210'.includes(digits)) return 'Sequential numbers are not accepted.';
  return '';
};

// Any contact number, landlines included — check_in_visitor.php's rule.
export const checkContactNumber = (value) =>
  /^[0-9+\-\s()]{7,30}$/.test(String(value ?? '').trim())
    ? '' : 'Contact number must be 7-30 characters of digits, spaces, +, - or ().';

export const checkPassword = (password) => {
  const pw = String(password ?? '');
  if (pw.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters.`;
  if (new TextEncoder().encode(pw).length > PASSWORD_MAX_BYTES) return `Password must be ${PASSWORD_MAX_BYTES} characters or fewer.`;
  return '';
};

export const checkAmount = (value, { min = 0, max = MAX_AMOUNT, label = 'Amount', allowZero = true } = {}) => {
  const raw = String(value ?? '').trim();
  if (raw === '') return `${label} is required.`;
  const n = Number(raw);
  if (!Number.isFinite(n)) return `${label} must be a number.`;
  if (n < min || (!allowZero && n === 0)) return `${label} must be ${allowZero ? 'at least' : 'more than'} ${min}.`;
  if (n > max) return `${label} must not exceed ${max.toLocaleString()}.`;
  return '';
};

// Manual payment references (PaymentUpload's rules, shared with PayBills):
// GCash is exactly 13 digits; a bank reference is up to 55 characters and not
// digits only. Anything else fits invoices.payment_reference.
export const checkPaymentReference = (reference, method = '') => {
  const ref = String(reference ?? '').trim();
  const m = String(method).toLowerCase();
  if (!ref) return 'Reference number is required.';
  if (m.includes('gcash')) {
    return /^\d{13}$/.test(ref) ? '' : 'GCash reference number must be exactly 13 digits.';
  }
  if (m.includes('bank')) {
    if (ref.length > 55) return 'Bank transfer reference must be 55 characters or fewer.';
    if (/^\d+$/.test(ref)) return 'Bank transfer reference cannot be numbers only.';
    return '';
  }
  return checkLength(ref, LIMITS.paymentReference, 'Reference number');
};

export const checkIntRange =(value, min, max, label = 'Value') => {
  const n = Number(value);
  if (!Number.isInteger(n)) return `${label} must be a whole number.`;
  if (n < min || n > max) return `${label} must be between ${min} and ${max}.`;
  return '';
};

// YYYY-MM-DD that is a real calendar day (rejects 2026-02-31), optionally within
// [min, max] given as YYYY-MM-DD strings.
export const checkDate = (value, { min, max, label = 'Date' } = {}) => {
  const v = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${label} is required.`;
  const [y, m, d] = v.split('-').map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  // Date.UTC rolls 2026-02-31 over to March, so compare the parts back.
  if (parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== m - 1 || parsed.getUTCDate() !== d) {
    return `${label} is not a valid date.`;
  }
  if (min && v < min) return `${label} cannot be before ${min}.`;
  if (max && v > max) return `${label} cannot be after ${max}.`;
  return '';
};

// Local YYYY-MM-DD for date inputs' min/max (toISOString() would give UTC).
export const localDateString = (date = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

// First non-empty message from a list of checks.
export const firstError = (...messages) => messages.find(Boolean) || '';
