import { textIn } from './i18n';

// ==========================================
// Preview page hero (Admin → Other Settings → Preview Page)
// ==========================================
// setting preview_hero: { image, badge|title|location: { show, en, fil },
// features: [{ en, fil }] }. Empty badge/title/location text means the app's
// own wording (i18n.js). Limits match PREVIEW_HERO_* in backend/config.php.

export const PREVIEW_TEXT_FIELDS = [
  { key: 'badge', label: 'Badge', i18n: 'preview.featured', max: 40 },
  { key: 'title', label: 'Title', i18n: 'preview.title', max: 60 },
  { key: 'location', label: 'Location', i18n: 'preview.location', max: 80 },
];
export const PREVIEW_FEATURE_MAX_LEN = 40;
export const PREVIEW_FEATURE_MAX_COUNT = 6;
export const PREVIEW_HERO_PATTERN = /^site_assets\/preview_hero_[0-9]+_[a-f0-9]{8}\.(jpg|jpeg|png|webp)$/;

export const PREVIEW_HERO_DEFAULTS = {
  image: '',
  ...Object.fromEntries(PREVIEW_TEXT_FIELDS.map((f) => [f.key, { show: true, en: '', fil: '' }])),
  features: [
    { en: 'Motorcycle Parking', fil: 'Paradahan ng Motor' },
    { en: 'Bathroom per Room', fil: 'Banyo sa Bawat Kwarto' },
  ],
};

const str = (v) => (typeof v === 'string' ? v : '');

// Stored value (object, or JSON text) → the full shape; garbled parts read as defaults.
export function parsePreviewHero(raw) {
  let value = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { value = null; }
  }
  const source = value && typeof value === 'object' ? value : {};
  const out = {
    image: PREVIEW_HERO_PATTERN.test(str(source.image)) ? source.image : '',
    features: Array.isArray(source.features)
      ? source.features
        .filter((f) => f && typeof f === 'object')
        .slice(0, PREVIEW_FEATURE_MAX_COUNT)
        .map((f) => ({ en: str(f.en), fil: str(f.fil) }))
      : PREVIEW_HERO_DEFAULTS.features,
  };
  for (const f of PREVIEW_TEXT_FIELDS) {
    const item = source[f.key] && typeof source[f.key] === 'object' ? source[f.key] : {};
    out[f.key] = { show: typeof item.show === 'boolean' ? item.show : true, en: str(item.en), fil: str(item.fil) };
  }
  return out;
}

// The text to print for badge/title/location, or null when hidden. An empty
// Filipino box uses the admin's English text before the app's Filipino.
export function previewText(hero, key, lang) {
  const field = PREVIEW_TEXT_FIELDS.find((f) => f.key === key);
  const item = hero?.[key] ?? PREVIEW_HERO_DEFAULTS[key];
  if (!field || !item.show) return null;
  const own = lang === 'fil' ? (item.fil.trim() || item.en.trim()) : item.en.trim();
  return own || textIn(lang === 'fil' ? 'fil' : 'en', field.i18n);
}

// The feature chips in a language (Filipino falls back to English).
export function previewFeatures(hero, lang) {
  return (hero?.features ?? PREVIEW_HERO_DEFAULTS.features)
    .map((f) => (lang === 'fil' ? (f.fil.trim() || f.en.trim()) : f.en.trim()))
    .filter(Boolean);
}
