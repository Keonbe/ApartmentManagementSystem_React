// ==========================================
// SYSTEM DEFAULTS & SETTINGS PERSISTENCE
// ==========================================
// Shared configuration module for AMS system settings.
// All admin pages import from here to read configurable values.
// Values are retrieved from the backend API.
//
// The plain settings (numbers, switches, choices, text) are described once in
// config/settingsSchema.js; this file adds the structured ones (QR Ph slots,
// parking vehicle types, the Glass backdrop, the home page text) and the
// load / save calls.

import api from '../api/axiosConfig';
import { HOME_CONTENT_DEFAULTS, parseHomeContent } from './homeContent';
import { SCHEMA_DEFAULTS, parseSchemaSettings, encodeSchemaSettings } from './settingsSchema';
import { PREVIEW_HERO_DEFAULTS, parsePreviewHero } from './previewHero';

// QR Ph slots in Payment Options (QRPH_SLOT_COUNT in config.php). There were 5;
// slots stored above 3 are dropped when the settings load, and an active slot
// above 3 falls back to 1, so the next save cleans the stored list.
export const QRPH_SLOT_COUNT = 3;

const DEFAULTS = {
  ...SCHEMA_DEFAULTS,
  qrphSlots: Array.from({ length: QRPH_SLOT_COUNT }, (_, i) => (
    { slot: i + 1, label: `QR Ph Slot ${i + 1}`, image_path: '', account_name: '', account_number: '' }
  )),

  // Glass theme backdrop on the tenant side (Other Settings → Glass Mode).
  // Ranges match update_system_settings.php.
  glassBgImage: '',                          // site_assets/… upload; '' = the built-in apartment photo
  glassOverlayOpacity: 78,                   // tint over the photo, 0-95 %
  glassBlur: 0,                              // photo blur, 0-20 px
  glassTint: '#0f172a',                      // tint colour, #rrggbb

  // Home page text (Other Settings → Home Page); see config/homeContent.js.
  homeContent: HOME_CONTENT_DEFAULTS,

  // Preview page hero (Other Settings → Preview Page); see config/previewHero.js.
  previewHero: PREVIEW_HERO_DEFAULTS
};

// A whole number within [min, max]; anything else (missing, garbled) is the
// fallback. 0 is a real value for both glass ranges, so no || here.
const intInRange = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};

export const GLASS_BG_PATTERN = /^site_assets\/glass_bg_[0-9]+_[a-f0-9]{8}\.(jpg|jpeg|png|webp)$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

// The Glass backdrop settings, normalised the way the backend validates them,
// so a bad stored value falls back instead of reaching a style attribute.
export const parseGlassAppearance = (raw = {}) => ({
  glassBgImage: GLASS_BG_PATTERN.test(raw.glass_bg_image ?? '') ? raw.glass_bg_image : '',
  glassOverlayOpacity: intInRange(raw.glass_overlay_opacity, 0, 95, DEFAULTS.glassOverlayOpacity),
  glassBlur: intInRange(raw.glass_blur, 0, 20, DEFAULTS.glassBlur),
  glassTint: HEX_COLOR.test(raw.glass_tint ?? '') ? raw.glass_tint.toLowerCase() : DEFAULTS.glassTint,
});

const inSlotRange = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= QRPH_SLOT_COUNT ? n : 1;
};

// A JSON list stored as text (or already an array); the fallback otherwise.
const parseList = (raw, fallback) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* fall through to the fallback */ }
  }
  return fallback;
};

// On failure it returns the defaults, which suits pages that only read a value.
// A page that saves passes { strict: true } and gets an error instead: showing
// defaults there as if they were saved would let Save overwrite the real values.
export const getSystemSettings = async ({ strict = false } = {}) => {
  try {
    const response = await api.get('get_system_settings.php');
    if (response.data.success && response.data.settings) {
      const dbSettings = response.data.settings;
      return {
        // Credential fields arrive masked (••••1234) for an admin and absent for
        // anyone else; posting a mask back is treated as "unchanged" by the
        // backend, so they can be bound to inputs safely.
        ...parseSchemaSettings(dbSettings),
        qrphSlots: parseList(dbSettings.qrph_slots, DEFAULTS.qrphSlots)
          .filter((s) => Number(s?.slot) >= 1 && Number(s?.slot) <= QRPH_SLOT_COUNT),
        qrphActiveSlot: inSlotRange(dbSettings.qrph_active_slot),
        ...parseGlassAppearance(dbSettings),
        homeContent: parseHomeContent(dbSettings.home_content),
        previewHero: parsePreviewHero(dbSettings.preview_hero),
      };
    }
    if (strict) throw new Error(response.data?.message || 'The settings did not load.');
  } catch (e) {
    if (strict) throw e;
    console.warn('Failed to load system settings from backend:', e);
  }
  return { ...DEFAULTS };
};

export const saveSystemSettings = async (settings) => {
  try {
    const payload = {
      // Credentials go back exactly as loaded: if the admin did not edit a field
      // it still holds the ••••1234 mask, which update_system_settings.php skips
      // rather than storing.
      ...encodeSchemaSettings(settings),
      qrph_slots: settings.qrphSlots || DEFAULTS.qrphSlots,
      glass_bg_image: settings.glassBgImage ?? '',
      glass_overlay_opacity: String(settings.glassOverlayOpacity ?? DEFAULTS.glassOverlayOpacity),
      glass_blur: String(settings.glassBlur ?? DEFAULTS.glassBlur),
      glass_tint: settings.glassTint || DEFAULTS.glassTint,
      home_content: parseHomeContent(settings.homeContent),
      preview_hero: parsePreviewHero(settings.previewHero),
    };
    await api.post('update_system_settings.php', payload);
  } catch (e) {
    console.warn('Failed to save system settings to backend:', e);
    throw e;
  }
};

export default DEFAULTS;
