import { dateLocale } from '../config/i18n';

// "2026-12-01" (a room's availableFrom from get_rooms.php) → "Dec 1, 2026" in
// the page's language. Parsed as a local date: new Date('2026-12-01') would be
// UTC midnight and show the day before west of Greenwich.
export function formatAvailable(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  if (!y || !m || !d) return String(ymd);
  return new Date(y, m - 1, d).toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric', year: 'numeric' });
}
