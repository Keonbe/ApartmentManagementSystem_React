// How report values read on screen, in Excel and in PDF (formats from
// backend/reports.php: money | int | number | percent | hours | text | date).
// Pure, so it is checked in plain Node.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const NUMERIC_FORMATS = ['money', 'int', 'number', 'percent', 'hours'];
export const isNumericFormat = (format) => NUMERIC_FORMATS.includes(format);

const grouped = (n, decimals) => Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

// 'YYYY-MM-DD' (or a datetime) → "Nov 15, 2026".
export const formatDate = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ''));
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : String(v ?? '');
};

// One value as text. { currency: false } leaves the ₱ off (PDF tables say
// "amounts in PHP" once instead, since its standard fonts have no ₱);
// { compact: true } drops ".00" from a whole amount (the stat cards).
export function formatValue(value, format, { currency = true, compact = false } = {}) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  switch (format) {
    case 'money': return Number.isFinite(n) ? `${n < 0 ? '-' : ''}${currency ? '₱' : ''}${grouped(Math.abs(n), compact && Number.isInteger(n) ? 0 : 2)}` : String(value);
    case 'int': return Number.isFinite(n) ? grouped(n, 0) : String(value);
    case 'number': return Number.isFinite(n) ? Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(value);
    case 'percent': return Number.isFinite(n) ? `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 1 })}%` : String(value);
    case 'hours':
      if (!Number.isFinite(n)) return String(value);
      return n < 48 ? `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 1 })} h` : `${(n / 24).toLocaleString('en-US', { maximumFractionDigits: 1 })} days`;
    case 'date': return formatDate(value);
    default: return String(value);
  }
}

// Chart axis: ₱1.2M, ₱45k, 80%, 1.5k.
export function formatShort(value, format) {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const scaled = abs >= 1e6 ? `${+(abs / 1e6).toFixed(1)}M` : abs >= 1e3 ? `${+(abs / 1e3).toFixed(1)}k` : `${+abs.toFixed(abs < 10 && format !== 'int' ? 1 : 0)}`;
  if (format === 'money') return `${sign}₱${scaled}`;
  if (format === 'percent') return `${sign}${+abs.toFixed(0)}%`;
  return `${sign}${scaled}`;
}

// The change from the previous range, in percent (null when it cannot be said).
export function changePct(value, previous) {
  if (value === null || value === undefined || previous === null || previous === undefined) return null;
  const v = Number(value);
  const p = Number(previous);
  if (!Number.isFinite(v) || !Number.isFinite(p)) return null;
  if (p === 0) return v === 0 ? 0 : null;
  return Math.round(((v - p) / Math.abs(p)) * 1000) / 10;
}

// A percent metric changes in points, not percent of itself.
export function changeText(metric) {
  if (metric.previous === undefined) return null;
  if (metric.format === 'percent') {
    if (metric.value === null || metric.previous === null) return null;
    const d = Math.round((Number(metric.value) - Number(metric.previous)) * 10) / 10;
    return `${d >= 0 ? '+' : ''}${d} pts`;
  }
  const pct = changePct(metric.value, metric.previous);
  return pct === null ? null : `${pct >= 0 ? '+' : ''}${pct}%`;
}

// Text a file name can carry: "Income statement November 2026.xlsx".
export const fileSafe = (s) => String(s).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
