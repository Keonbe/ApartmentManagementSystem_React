// Client-side input checks. The backend is still the boundary: these only stop
// a bad value before the round trip and keep the UI's limits equal to the
// database's. Each check returns an error message, or '' when the value is fine.
// Messages are looked up in config/i18n.js (validation.*) when a check runs, so
// they follow the language the person has chosen.
import { t, dateLocale } from '../config/i18n';

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
  clause: 2000,           // system_settings text values
  unitId: 50,             // rooms.room_name / floor
  billingPeriod: 50,
  landlordText: 150,      // landlord name/address/contact settings
  smtpField: 190,         // SMTP host/user, API keys
  search: 100,            // search boxes: no column, just a sane cap
};

// Shortest acceptable title or subject.
export const TITLE_MIN = 3;

// Dates further ahead than this are almost always a typo.
export const MAX_FUTURE_YEARS = 10;

// decimal(10,2) — the largest amount any money column can hold.
export const MAX_AMOUNT = 99999999.99;

// bcrypt ignores everything past 72 bytes; backend PASSWORD_MIN_LENGTH is 8.
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX_BYTES = 72;

export const checkRequired = (value, label = t('validation.thisField')) =>
  String(value ?? '').trim() === '' ? t('validation.required', { label }) : '';

export const checkLength = (value, max, label = t('validation.thisField')) =>
  String(value ?? '').trim().length > max ? t('validation.maxLength', { label, max }) : '';

// Control characters other than tab/newline, and inline script tags. Text is
// escaped on output everywhere; this only stops junk from being stored.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const UNSAFE_TEXT =/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]|<\s*script/i;

// Free text: trimmed first, so whitespace-only counts as empty.
export const checkText = (value, { label = t('validation.thisField'), max, min = 0, required = true } = {}) => {
  const v = String(value ?? '').trim();
  if (!v) return required ? t('validation.required', { label }) : '';
  if (min && v.length < min) return t('validation.minLength', { label, min });
  if (max && v.length > max) return t('validation.maxLength', { label, max });
  if (UNSAFE_TEXT.test(v)) return t('validation.unsafe', { label });
  return '';
};

// Personal names: letters (any script, ñ included), spaces and . ' -
export const checkPersonName = (value, { label = t('validation.name'), max = LIMITS.fullName, required = true } = {}) => {
  const base = checkText(value, { label, max, required });
  if (base) return base;
  const v = String(value ?? '').trim();
  if (!v) return '';
  if (/^[\d\s]+$/.test(v)) return t('validation.nameOnlyNumbers', { label });
  if (!/^[\p{L}\p{M}][\p{L}\p{M}\s.'-]*$/u.test(v)) return t('validation.nameChars', { label });
  return '';
};

export const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase();

export const checkEmail = (value, { max = LIMITS.email, required = true } = {}) => {
  const v = String(value ?? '').trim();
  if (!v) return required ? t('validation.emailRequired') : '';
  // Same shape PHP's FILTER_VALIDATE_EMAIL accepts for ordinary addresses.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return t('validation.emailInvalid');
  if (v.length > max) return t('validation.emailMax', { max });
  return '';
};

// Ten digits after +63, starting with 9 — the rule the backend enforces
// (profile.php, normalize_ph_mobile()). Takes the 10-digit local part the phone
// inputs store, or a full number in any common format.
export const checkPhMobile = (value) => {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.startsWith('63') && digits.length === 12) digits = digits.slice(2);
  else if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);

  if (digits.length !== 10) return t('validation.phDigits');
  if (!digits.startsWith('9')) return t('validation.phStart9');
  if (/^(\d)\1+$/.test(digits)) return t('validation.phRepeated');
  if ('0123456789012'.includes(digits) || '9876543210'.includes(digits)) return t('validation.phSequential');
  return '';
};

// The 10-digit local part (9XXXXXXXXX) of a stored number in any format —
// "+639…", "+63 9…", "639…", "0063…", "09…". Mirrors normalize_ph_mobile()
// in config.php, so a legacy value pre-fills a fixed-+63 input correctly.
export const toPhLocal10 = (value) => {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('63')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, 10);
};

// The stored format every endpoint normalizes to: +639XXXXXXXXX.
export const toPhE164 = (local10) => {
  const digits = toPhLocal10(local10);
  return digits ? `+63${digits}` : '';
};

// Any contact number, landlines included — check_in_visitor.php's rule.
export const checkContactNumber = (value) =>
  /^[0-9+\-\s()]{7,30}$/.test(String(value ?? '').trim())
    ? '' : t('validation.contactNumber');

// Length only: for Login and "current password" fields, where an older
// password that predates the complexity rules must still be accepted.
export const checkPassword = (password) => {
  const pw = String(password ?? '');
  if (pw.length < PASSWORD_MIN) return t('validation.passwordMin', { min: PASSWORD_MIN });
  if (new TextEncoder().encode(pw).length > PASSWORD_MAX_BYTES) return t('validation.passwordMax', { max: PASSWORD_MAX_BYTES });
  return '';
};

// Rules for a new password — the same ones password_policy_error() in
// backend/config.php enforces. Drives PasswordChecklist too.
// `label` is a getter so it is looked up when read, in the current language.
export const PASSWORD_RULES = [
  { key: 'length', get label() { return t('validation.pw.length', { min: PASSWORD_MIN }); }, test: (pw) => pw.length >= PASSWORD_MIN },
  { key: 'upper', get label() { return t('validation.pw.upper'); }, test: (pw) => /[A-Z]/.test(pw) },
  { key: 'lower', get label() { return t('validation.pw.lower'); }, test: (pw) => /[a-z]/.test(pw) },
  { key: 'digit', get label() { return t('validation.pw.digit'); }, test: (pw) => /\d/.test(pw) },
  { key: 'symbol', get label() { return t('validation.pw.symbol'); }, test: (pw) => /[^A-Za-z0-9\s]/.test(pw) },
];

export const checkNewPassword = (password) => {
  const pw = String(password ?? '');
  if (!pw) return t('validation.passwordRequired');
  const lengthError = checkPassword(pw);
  if (lengthError) return lengthError;
  const missing = PASSWORD_RULES.filter((r) => !r.test(pw)).map((r) => r.label.toLowerCase());
  return missing.length ? t('validation.passwordNeeds', { rules: missing.join(', ') }) : '';
};

export const checkPasswordMatch = (password, confirm) => {
  if (!String(confirm ?? '')) return t('validation.confirmPassword');
  return confirm === password ? '' : t('validation.passwordMismatch');
};

export const checkAmount = (value, { min = 0, max = MAX_AMOUNT, label = t('validation.amount'), allowZero = true, required = true } = {}) => {
  const raw = String(value ?? '').trim();
  if (raw === '') return required ? t('validation.required', { label }) : '';
  const n = Number(raw);
  if (!Number.isFinite(n)) return t('validation.notNumber', { label });
  if (n < min || (!allowZero && n === 0)) return t(allowZero ? 'validation.atLeast' : 'validation.moreThan', { label, min });
  if (n > max) return t('validation.notExceed', { label, max: max.toLocaleString() });
  if (/\.\d{3,}$/.test(raw)) return t('validation.decimals', { label });
  return '';
};

// Manual payment references (PaymentUpload's rules, shared with PayBills):
// GCash is exactly 13 digits; a bank reference is up to 55 characters. Numeric-
// only trace numbers are valid for bank transfers. Anything else fits
// invoices.payment_reference.
// A bank transfer, whatever the bank: 'BDO', 'BPI (Manual)', 'Bank Transfer'…
export const isBankMethod = (method = '') => /bank|bdo|bpi/i.test(String(method));

export const checkPaymentReference = (reference, method = '') => {
  const ref = String(reference ?? '').trim();
  const m = String(method).toLowerCase();
  if (!ref) return t('validation.refRequired');
  if (m.includes('gcash')) {
    return /^\d{13}$/.test(ref) ? '' : t('validation.refGcash');
  }
  if (isBankMethod(m)) {
    if (ref.length > 55) return t('validation.refBank');
    return '';
  }
  return checkLength(ref, LIMITS.paymentReference, t('validation.refLabel'));
};

export const checkIntRange =(value, min, max, label = t('validation.value')) => {
  const n = Number(value);
  if (!Number.isInteger(n)) return t('validation.wholeNumber', { label });
  if (n < min || n > max) return t('validation.between', { label, min, max });
  return '';
};

// The preferred move-in date window in days from today, Settings → Rental
// (systemSettings moveInMinDays / moveInMaxDays; config.php move_in_window_days()).
// These are the shipped defaults, used until the settings have loaded.
export const MOVE_IN_WINDOW_DEFAULT = { min: 0, max: 365 };

// "October 26, 2027" for a local YYYY-MM-DD, in the chosen language.
const longDay = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(dateLocale(), { month: 'long', day: 'numeric', year: 'numeric' });
};

// First and last allowed day as YYYY-MM-DD, for the date input's min / max.
// availableFrom (YYYY-MM-DD): a unit that is still occupied but frees up on that
// day (Preview's "Coming Soon"). The earliest day moves up to it, and the
// latest stretches to reach it, as config.php move_in_date_error() does.
export const moveInBounds = (window = MOVE_IN_WINDOW_DEFAULT, availableFrom = null) => {
  const min = addDays(window.min);
  const max = addDays(Math.max(window.min, window.max));
  if (!availableFrom) return { min, max };
  return { min: availableFrom > min ? availableFrom : min, max: availableFrom > max ? availableFrom : max };
};

// Shown under the date field so the limit is not a sum the tenant has to do:
// "Choose a date from October 26, 2026 to October 26, 2027."
export const moveInRangeText = (window = MOVE_IN_WINDOW_DEFAULT, availableFrom = null) => {
  const { min, max } = moveInBounds(window, availableFrom);
  if (min === max) return t('validation.moveInSingle', { date: longDay(min) });
  return t('validation.moveInRange', { from: longDay(min), to: longDay(max) });
};

// Same rule as config.php move_in_date_error(): a real date inside the window.
// The messages name the actual first / last day.
export const checkMoveInDate = (value, window = MOVE_IN_WINDOW_DEFAULT, availableFrom = null) => {
  if (availableFrom && value && value < availableFrom) {
    return t('validation.moveInAvailable', { date: longDay(availableFrom) });
  }
  const { min, max } = moveInBounds(window, availableFrom);
  // The problem is read as a code, never by matching the (translated) message.
  const problem = dateProblem(value, { min, max });
  if (!problem) return '';
  if (problem === 'before') {
    return window.min === 0
      ? t('validation.moveInPast', { date: longDay(min) })
      : t('validation.moveInMinDays', { days: window.min, date: longDay(min) });
  }
  if (problem === 'after') return t('validation.moveInMaxDays', { days: window.max, date: longDay(max) });
  return dateMessage(problem, { label: t('validation.moveInLabel'), min, max });
};

// YYYY-MM-DD that is a real calendar day (rejects 2026-02-31), optionally within
// [min, max] given as YYYY-MM-DD strings.
// What is wrong with a date: 'required', 'invalid', 'before' (earlier than min),
// 'after' (later than max), or '' when it is fine. Callers that need to rewrite
// the message use this code instead of matching the wording.
export const dateProblem = (value, { min, max } = {}) => {
  const v = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'required';
  const [y, m, d] = v.split('-').map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  // Date.UTC rolls 2026-02-31 over to March, so compare the parts back.
  if (parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== m - 1 || parsed.getUTCDate() !== d) return 'invalid';
  if (min && v < min) return 'before';
  if (max && v > max) return 'after';
  return '';
};

const dateMessage = (problem, { min, max, label }) => {
  if (problem === 'required') return t('validation.required', { label });
  if (problem === 'invalid') return t('validation.dateInvalid', { label });
  if (problem === 'before') return t('validation.dateBefore', { label, date: min });
  if (problem === 'after') return t('validation.dateAfter', { label, date: max });
  return '';
};

export const checkDate = (value, { min, max, label = t('validation.date') } = {}) =>
  dateMessage(dateProblem(value, { min, max }), { min, max, label });

// Local YYYY-MM-DD for date inputs' min/max (toISOString() would give UTC).
export const localDateString = (date = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

// Local YYYY-MM-DD shifted by whole days / years from today (or `from`).
export const addDays = (days, from = new Date()) => {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return localDateString(d);
};

// Overflows like PHP's strtotime("+N months") (Aug 31 + 6 → Mar 3), so a
// limit computed here matches the server's.
export const addMonths = (months, from = new Date()) => {
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  return localDateString(d);
};

export const addYears = (years, from = new Date()) => {
  const d = new Date(from);
  d.setFullYear(d.getFullYear() + years);
  return localDateString(d);
};

// The furthest date a forward-looking date input accepts.
export const maxFutureDate = () => addYears(MAX_FUTURE_YEARS);

// End must not be before start. Empty values are left to checkDate/required.
export const checkDateRange = (start, end, { startLabel = t('validation.startDate'), endLabel = t('validation.endDate') } = {}) => {
  if (!start || !end) return '';
  return end < start ? t('validation.rangeBefore', { end: endLabel, start: startLabel.toLowerCase() }) : '';
};

// Local HH:mm for time inputs.
export const localTimeString = (date = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

// First non-empty message from a list of checks.
export const firstError = (...messages) => messages.find(Boolean) || '';
