// Admin → Reports: the date range a report covers and how it is cut into
// periods. Pure (no imports), so it is checked in plain Node.
//
//   mode   days | week | month | year   how the range was picked
//   from, to  'YYYY-MM-DD', both included (local dates)
//   group  day | week | month | year    one row / bar per period
//
// Weeks run Monday to Sunday, like get_reports.php. MAX_PERIODS mirrors
// REPORT_MAX_PERIODS in backend/reports.php.

export const RANGE_MODES = [
  { id: 'days', label: 'Days' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
];
export const GROUPS = [
  { id: 'day', label: 'Day', plural: 'days' },
  { id: 'week', label: 'Week', plural: 'weeks' },
  { id: 'month', label: 'Month', plural: 'months' },
  { id: 'year', label: 'Year', plural: 'years' },
];
export const MAX_PERIODS = { day: 366, week: 260, month: 120, year: 25 };
// Reports whose data only exists per month (meter readings).
export const MONTHLY_ONLY = ['utilities'];

const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (s) => {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && iso(parse(s)) === s;
const addDays = (s, n) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);

export const weekOf = (s) => {
  const d = parse(s);
  const monday = addDays(s, -((d.getDay() + 6) % 7));
  return { from: monday, to: addDays(monday, 6) };
};
export const monthOf = (y, m) => ({ from: `${y}-${pad(m)}-01`, to: iso(new Date(y, m, 0)) });
export const yearOf = (y) => ({ from: `${y}-01-01`, to: `${y}-12-31` });

// The canonical range of a mode around a date.
export function rangeFor(mode, anchor) {
  const d = parse(anchor);
  if (mode === 'week') return weekOf(anchor);
  if (mode === 'month') return monthOf(d.getFullYear(), d.getMonth() + 1);
  if (mode === 'year') return yearOf(d.getFullYear());
  return { from: anchor, to: anchor };
}

// One step back (-1) or forward (+1): the week, month or year before / after,
// or a day range of the same length.
export function shiftRange({ mode, from, to }, dir) {
  const d = parse(from);
  if (mode === 'week') return { from: addDays(from, 7 * dir), to: addDays(to, 7 * dir) };
  if (mode === 'month') {
    const m = new Date(d.getFullYear(), d.getMonth() + dir, 1);
    return monthOf(m.getFullYear(), m.getMonth() + 1);
  }
  if (mode === 'year') return yearOf(d.getFullYear() + dir);
  const len = daysBetween(from, to) + 1;
  return { from: addDays(from, len * dir), to: addDays(to, len * dir) };
}

// How many periods a range has when cut by `group` (as report_periods() counts).
export function periodCount(from, to, group) {
  const a = parse(from);
  const b = parse(to);
  if (group === 'day') return daysBetween(from, to) + 1;
  if (group === 'week') return Math.round((parse(weekOf(to).from) - parse(weekOf(from).from)) / (7 * 86400000)) + 1;
  if (group === 'month') return (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() + 1;
  return b.getFullYear() - a.getFullYear() + 1;
}

// The groupings a range may use for a report, each with why not when it may not.
export function groupOptions(from, to, report) {
  return GROUPS.map((g) => {
    if (MONTHLY_ONLY.includes(report) && (g.id === 'day' || g.id === 'week')) {
      return { ...g, disabled: true, reason: 'Meter readings are monthly.' };
    }
    const n = periodCount(from, to, g.id);
    if (n > MAX_PERIODS[g.id]) return { ...g, disabled: true, reason: `${n} ${g.plural} is too many (most ${MAX_PERIODS[g.id]}).` };
    return { ...g, disabled: false, reason: '' };
  });
}

// A sensible grouping for a range: about 7 to 31 periods where possible.
export function defaultGroup(mode, from, to, report) {
  let g;
  if (mode === 'week' || mode === 'month') g = 'day';
  else if (mode === 'year') g = 'month';
  else {
    const days = daysBetween(from, to) + 1;
    g = days <= 31 ? 'day' : days <= 183 ? 'week' : days <= 366 * 4 ? 'month' : 'year';
  }
  const options = groupOptions(from, to, report);
  if (options.find((o) => o.id === g)?.disabled) g = options.find((o) => !o.disabled)?.id || 'year';
  return g;
}

export function presets(today) {
  const t = parse(today);
  const y = t.getFullYear();
  const m = t.getMonth() + 1;
  const q = Math.floor((m - 1) / 3);
  const lastMonth = new Date(y, m - 2, 1);
  return [
    { id: 'today', label: 'Today', mode: 'days', from: today, to: today },
    { id: 'last7', label: 'Last 7 days', mode: 'days', from: addDays(today, -6), to: today },
    { id: 'last30', label: 'Last 30 days', mode: 'days', from: addDays(today, -29), to: today },
    { id: 'thisWeek', label: 'This week', mode: 'week', ...weekOf(today) },
    { id: 'lastWeek', label: 'Last week', mode: 'week', ...weekOf(addDays(today, -7)) },
    { id: 'thisMonth', label: 'This month', mode: 'month', ...monthOf(y, m) },
    { id: 'lastMonth', label: 'Last month', mode: 'month', ...monthOf(lastMonth.getFullYear(), lastMonth.getMonth() + 1) },
    { id: 'thisQuarter', label: 'This quarter', mode: 'days', from: monthOf(y, q * 3 + 1).from, to: monthOf(y, q * 3 + 3).to },
    { id: 'thisYear', label: 'This year', mode: 'year', ...yearOf(y) },
    { id: 'lastYear', label: 'Last year', mode: 'year', ...yearOf(y - 1) },
  ];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "Nov 9 – 15, 2026", "Oct 27 – Nov 2, 2026", "Dec 29, 2025 – Jan 4, 2026", "Nov 15, 2026".
export function spanLabel(from, to) {
  const a = parse(from);
  const b = parse(to);
  const day = (d, year = true) => `${MONTHS[d.getMonth()]} ${d.getDate()}${year ? `, ${d.getFullYear()}` : ''}`;
  if (from === to) return day(a);
  if (a.getFullYear() !== b.getFullYear()) return `${day(a)} – ${day(b)}`;
  if (a.getMonth() !== b.getMonth()) return `${day(a, false)} – ${day(b)}`;
  return `${day(a, false)} – ${b.getDate()}, ${b.getFullYear()}`;
}

// The range in words: "November 2026", "2026", "Week of Nov 9 – 15, 2026", or the span.
export function rangeLabel({ from, to }) {
  const a = parse(from);
  const b = parse(to);
  if (from === `${a.getFullYear()}-01-01` && to === `${a.getFullYear()}-12-31`) return String(a.getFullYear());
  const whole = monthOf(a.getFullYear(), a.getMonth() + 1);
  if (from === whole.from && to === whole.to) return `${MONTHS_LONG[a.getMonth()]} ${a.getFullYear()}`;
  if (from === weekOf(from).from && to === weekOf(from).to) return `Week of ${spanLabel(from, to)}`;
  if (a.getDate() === 1 && to === monthOf(b.getFullYear(), b.getMonth() + 1).to) {
    return a.getFullYear() === b.getFullYear()
      ? `${MONTHS_LONG[a.getMonth()]} – ${MONTHS_LONG[b.getMonth()]} ${b.getFullYear()}`
      : `${MONTHS_LONG[a.getMonth()]} ${a.getFullYear()} – ${MONTHS_LONG[b.getMonth()]} ${b.getFullYear()}`;
  }
  return spanLabel(from, to);
}

// A mode that fits a range read from the address bar.
export function modeOf(from, to) {
  if (rangeFor('week', from).from === from && rangeFor('week', from).to === to) return 'week';
  if (rangeFor('month', from).from === from && rangeFor('month', from).to === to) return 'month';
  if (rangeFor('year', from).from === from && rangeFor('year', from).to === to) return 'year';
  return 'days';
}
