import { textIn } from './i18n';

// ==========================================
// Home page text (Admin → Other Settings → Home Page)
// ==========================================
// setting home_content: { badge: { show, en, fil }, heading, location, description }.
// Empty text means the app's own wording (i18n.js). Limits match
// HOME_CONTENT_FIELDS in backend/config.php.

export const HOME_FIELDS = [
  { key: 'badge', label: 'Badge', i18n: 'home.badge', max: 60 },
  { key: 'heading', label: 'Heading', i18n: 'home.heading', max: 80 },
  { key: 'location', label: 'Location', i18n: 'home.location', max: 80 },
  { key: 'description', label: 'Description', i18n: 'home.description', max: 400 },
];

export const HOME_CONTENT_DEFAULTS = Object.fromEntries(
  HOME_FIELDS.map((f) => [f.key, { show: true, en: '', fil: '' }])
);

// Stored value (object, or JSON text from an older response) → the full shape;
// anything missing or garbled reads as the default for that item.
export function parseHomeContent(raw) {
  let value = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { value = null; }
  }
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(HOME_FIELDS.map((f) => {
    const item = source[f.key] && typeof source[f.key] === 'object' ? source[f.key] : {};
    return [f.key, {
      show: typeof item.show === 'boolean' ? item.show : true,
      en: typeof item.en === 'string' ? item.en : '',
      fil: typeof item.fil === 'string' ? item.fil : '',
    }];
  }));
}

// The text to print for one item in a language, or null when it is hidden.
// Filipino left empty uses the English text the admin wrote, and only falls
// back to the app's Filipino when both are empty (a changed address must not
// show the old one to Filipino readers).
export function homeText(content, key, lang) {
  const field = HOME_FIELDS.find((f) => f.key === key);
  const item = content?.[key] ?? HOME_CONTENT_DEFAULTS[key];
  if (!field || !item.show) return null;
  const own = lang === 'fil' ? (item.fil.trim() || item.en.trim()) : item.en.trim();
  return own || textIn(lang === 'fil' ? 'fil' : 'en', field.i18n);
}
