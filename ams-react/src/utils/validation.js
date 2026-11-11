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

export const checkRequired = (value, label = 'This field') =>
  String(value ?? '').trim() === '' ? `${label} is required.` : '';

export const checkLength = (value, max, label = 'This field') =>
  String(value ?? '').trim().length > max ? `${label} must be ${max} characters or fewer.` : '';

// Control characters other than tab/newline, and inline script tags. Text is
// escaped on output everywhere; this only stops junk from being stored.
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const UNSAFE_TEXT =/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]|<\s*script/i;

// Free text: trimmed first, so whitespace-only counts as empty.
export const checkText = (value, { label = 'This field', max, min = 0, required = true } = {}) => {
  const v = String(value ?? '').trim();
  if (!v) return required ? `${label} is required.` : '';
  if (min && v.length < min) return `${label} must be at least ${min} characters.`;
  if (max && v.length > max) return `${label} must be ${max} characters or fewer.`;
  if (UNSAFE_TEXT.test(v)) return `${label} contains characters that are not allowed.`;
  return '';
};

// Personal names: letters (any script, ñ included), spaces and . ' -
export const checkPersonName = (value, { label = 'Name', max = LIMITS.fullName, required = true } = {}) => {
  const base = checkText(value, { label, max, required });
  if (base) return base;
  const v = String(value ?? '').trim();
  if (!v) return '';
  if (/^[\d\s]+$/.test(v)) return `${label} cannot be only numbers.`;
  if (!/^[\p{L}\p{M}][\p{L}\p{M}\s.'-]*$/u.test(v)) return `${label} can only contain letters, spaces, periods, apostrophes and hyphens.`;
  return '';
};

export const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase();

export const checkEmail = (value, { max = LIMITS.email, required = true } = {}) => {
  const v = String(value ?? '').trim();
  if (!v) return required ? 'Email is required.' : '';
  // Same shape PHP's FILTER_VALIDATE_EMAIL accepts for ordinary addresses.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Please enter a valid email address (e.g. name@domain.com).';
  if (v.length > max) return `Email must be ${max} characters or fewer.`;
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
    ? '' : 'Contact number must be 7-30 characters of digits, spaces, +, - or ().';

// Length only: for Login and "current password" fields, where an older
// password that predates the complexity rules must still be accepted.
export const checkPassword = (password) => {
  const pw = String(password ?? '');
  if (pw.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters.`;
  if (new TextEncoder().encode(pw).length > PASSWORD_MAX_BYTES) return `Password must be ${PASSWORD_MAX_BYTES} characters or fewer.`;
  return '';
};

// Rules for a new password — the same ones password_policy_error() in
// backend/config.php enforces. Drives PasswordChecklist too.
export const PASSWORD_RULES = [
  { key: 'length', label: `At least ${PASSWORD_MIN} characters`, test: (pw) => pw.length >= PASSWORD_MIN },
  { key: 'upper', label: 'One uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { key: 'lower', label: 'One lowercase letter', test: (pw) => /[a-z]/.test(pw) },
  { key: 'digit', label: 'One number', test: (pw) => /\d/.test(pw) },
  { key: 'symbol', label: 'One symbol (e.g. ! @ # $)', test: (pw) => /[^A-Za-z0-9\s]/.test(pw) },
];

export const checkNewPassword = (password) => {
  const pw = String(password ?? '');
  if (!pw) return 'Password is required.';
  const lengthError = checkPassword(pw);
  if (lengthError) return lengthError;
  const missing = PASSWORD_RULES.filter((r) => !r.test(pw)).map((r) => r.label.toLowerCase());
  return missing.length ? `Password needs ${missing.join(', ')}.` : '';
};

export const checkPasswordMatch = (password, confirm) => {
  if (!String(confirm ?? '')) return 'Please confirm the password.';
  return confirm === password ? '' : 'Passwords do not match.';
};

export const checkAmount = (value, { min = 0, max = MAX_AMOUNT, label = 'Amount', allowZero = true, required = true } = {}) => {
  const raw = String(value ?? '').trim();
  if (raw === '') return required ? `${label} is required.` : '';
  const n = Number(raw);
  if (!Number.isFinite(n)) return `${label} must be a number.`;
  if (n < min || (!allowZero && n === 0)) return `${label} must be ${allowZero ? 'at least' : 'more than'} ${min}.`;
  if (n > max) return `${label} must not exceed ${max.toLocaleString()}.`;
  if (/\.\d{3,}$/.test(raw)) return `${label} can have at most 2 decimal places.`;
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
  if (!ref) return 'Reference number is required.';
  if (m.includes('gcash')) {
    return /^\d{13}$/.test(ref) ? '' : 'GCash reference number must be exactly 13 digits.';
  }
  if (isBankMethod(m)) {
    if (ref.length > 55) return 'Bank transfer reference must be 55 characters or fewer.';
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

// The preferred move-in date window in days from today, Settings → Rental
// (systemSettings moveInMinDays / moveInMaxDays; config.php move_in_window_days()).
// These are the shipped defaults, used until the settings have loaded.
export const MOVE_IN_WINDOW_DEFAULT = { min: 0, max: 365 };

// "October 26, 2027" for a local YYYY-MM-DD.
const longDay = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
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
  if (min === max) return `Move in on ${longDay(min)}, when the unit is free.`;
  return `Choose a date from ${longDay(min)} to ${longDay(max)}.`;
};

// Same rule as config.php move_in_date_error(): a real date inside the window.
// The messages name the actual first / last day.
export const checkMoveInDate = (value, window = MOVE_IN_WINDOW_DEFAULT, availableFrom = null) => {
  if (availableFrom && value && value < availableFrom) {
    return `This unit is available from ${longDay(availableFrom)}. Choose that day or later.`;
  }
  const { min, max } = moveInBounds(window, availableFrom);
  const error = checkDate(value, { label: 'The move-in date', min, max });
  if (!error) return '';
  if (/cannot be before/.test(error)) {
    return window.min === 0
      ? `The move-in date cannot be in the past. The earliest is ${longDay(min)}.`
      : `The move-in date must be at least ${window.min} day(s) from today: the earliest is ${longDay(min)}.`;
  }
  if (/cannot be after/.test(error)) return `The move-in date can be at most ${window.max} days from today: the latest is ${longDay(max)}.`;
  return error;
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
export const checkDateRange = (start, end, { startLabel = 'Start date', endLabel = 'End date' } = {}) => {
  if (!start || !end) return '';
  return end < start ? `${endLabel} cannot be before ${startLabel.toLowerCase()}.` : '';
};

// Local HH:mm for time inputs.
export const localTimeString = (date = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

// First non-empty message from a list of checks.
export const firstError = (...messages) => messages.find(Boolean) || '';
