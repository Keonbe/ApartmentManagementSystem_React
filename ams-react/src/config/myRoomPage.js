// ==========================================
// My Room page (Admin → Other Settings → My Room)
// ==========================================
// my_room_layout:   { sections: [{ id, show }] }  the order of My Room's sections
//                   and which of them show. The room tag always shows.
// garbage_schedule: [{ day, what, time, period }]  the collection days the
//                   Garbage collection card highlights this week.
// Limits and section ids match update_system_settings.php. Pure (no api import),
// so the parsing can be checked in plain Node.

export const MY_ROOM_SECTIONS = [
  { id: 'important', label: 'Important info', hint: 'Overdue bills, a coming move-out, rent ending soon and household requests in review. Only appears when there is something.' },
  { id: 'room', label: 'Room tag and next bill', hint: 'The room tag, the next bill, the rent period and the shortcuts.', locked: true },
  { id: 'garbage', label: 'Garbage collection', hint: 'This week, with the collection days highlighted. Stays hidden while no schedule is posted.' },
  { id: 'household', label: 'Household', hint: 'Who lives in the unit, and the request to change the number of occupants.' },
  { id: 'manageRent', label: 'Manage your rent', hint: 'Extending the rent and giving move-out notice. While hidden, tenants cannot send either from My Room.' },
  { id: 'houseRules', label: 'House rules', hint: 'The house rules, folded until opened.' },
];

const SECTION_IDS = MY_ROOM_SECTIONS.map((s) => s.id);
const LOCKED = new Set(MY_ROOM_SECTIONS.filter((s) => s.locked).map((s) => s.id));

export const MY_ROOM_LAYOUT_DEFAULTS = { sections: SECTION_IDS.map((id) => ({ id, show: true })) };

const fromJson = (raw) => {
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch { return null; }
};

// Stored value (object or JSON text) → every known section exactly once, in the
// saved order; unknown or repeated ids are dropped, and a section missing from
// the saved list (one added later) is appended, shown.
export function parseMyRoomLayout(raw) {
  const value = fromJson(raw);
  const list = Array.isArray(value?.sections) ? value.sections : [];
  const seen = new Set();
  const sections = [];
  for (const item of list) {
    const id = item?.id;
    if (!SECTION_IDS.includes(id) || seen.has(id)) continue;
    seen.add(id);
    sections.push({ id, show: LOCKED.has(id) ? true : item.show !== false });
  }
  for (const id of SECTION_IDS) if (!seen.has(id)) sections.push({ id, show: true });
  return { sections };
}

// ── Garbage collection schedule ──
export const EVERY_DAY = 'Every day';
// Index 0 is Monday: the week on the card starts on Monday.
export const GARBAGE_WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const GARBAGE_DAYS = [EVERY_DAY, ...GARBAGE_WEEKDAYS];
// '' = no particular time of day (rows saved before periods existed read as this).
export const GARBAGE_PERIODS = ['morning', 'afternoon', 'evening'];
export const GARBAGE_MAX_ROWS = 14;
export const GARBAGE_WHAT_MAX = 60;
export const GARBAGE_TIME_MAX = 30;

// Stored value (list or JSON text) → clean rows; a row without a known day or
// a description is dropped.
export function parseGarbageSchedule(raw) {
  const value = fromJson(raw);
  if (!Array.isArray(value)) return [];
  return value
    .filter((r) => r && GARBAGE_DAYS.includes(r.day) && typeof r.what === 'string' && r.what.trim() !== '')
    .slice(0, GARBAGE_MAX_ROWS)
    .map((r) => ({
      day: r.day,
      what: r.what.trim(),
      time: typeof r.time === 'string' ? r.time.trim() : '',
      period: GARBAGE_PERIODS.includes(r.period) ? r.period : '',
    }));
}

// The rows as the admin typed them, trimmed, for saving: nothing is dropped, so
// a row the server refuses is reported instead of disappearing.
export const encodeGarbageSchedule = (rows) => (Array.isArray(rows) ? rows : []).map((r) => ({
  day: r.day,
  what: String(r.what ?? '').trim(),
  time: String(r.time ?? '').trim(),
  period: r.period ?? '',
}));

const periodRank = (p) => (p === '' ? GARBAGE_PERIODS.length : GARBAGE_PERIODS.indexOf(p));
const dayRank = (d) => GARBAGE_DAYS.indexOf(d);

// Rows in reading order: Every day first, then Monday to Sunday, morning first.
export const sortGarbageRows = (rows) => [...rows].sort((a, b) => dayRank(a.day) - dayRank(b.day) || periodRank(a.period) - periodRank(b.period));

// What is collected on a weekday (0 = Monday), morning first.
export const collectionsOn = (rows, weekday) => rows
  .filter((r) => r.day === EVERY_DAY || r.day === GARBAGE_WEEKDAYS[weekday])
  .sort((a, b) => periodRank(a.period) - periodRank(b.period));

// A date's weekday with Monday as 0.
export const mondayIndex = (date) => (date.getDay() + 6) % 7;
