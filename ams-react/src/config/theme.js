import { useState, useEffect } from 'react';
import DEFAULTS, { getSystemSettings } from './systemSettings';

// ==========================================
// User-side colour theme: Light, Dark or Glass
// ==========================================
// Kept per browser, like the language (config/i18n.js). Chosen from the
// account menu in the TopBar; Home always shows Glass. The styling lives in
// assets/styles/themes.user.css, the wrapper in Components/UserTheme.jsx.

export const THEMES = ['light', 'dark', 'glass'];
export const DEFAULT_THEME = 'light';

const STORAGE_KEY = 'ams_user_theme';
const CHANGE_EVENT = 'ams_theme_changed';

const valid = (value) => (THEMES.includes(value) ? value : DEFAULT_THEME);

export function getTheme() {
  try {
    return valid(localStorage.getItem(STORAGE_KEY));
  } catch {
    // Storage blocked (private window, site data off): the default it is.
    return DEFAULT_THEME;
  }
}

export function setTheme(theme) {
  if (!THEMES.includes(theme)) return;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Not saved, but the event below still switches this tab.
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: theme }));
}

export function useTheme() {
  const [theme, setThemeState] = useState(getTheme);

  useEffect(() => {
    const onChange = (e) => setThemeState(valid(e.detail));
    // Another tab changed it.
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) setThemeState(valid(e.newValue));
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return { theme, setTheme };
}

// ------------------------------------------
// Glass backdrop: photo, tint, overlay, blur
// ------------------------------------------
// Set by the admin (Other Settings → Glass Mode). Loaded once per page load
// and shared; the defaults show until then, or if the request fails.

export const GLASS_DEFAULTS = {
  glassBgImage: DEFAULTS.glassBgImage,
  glassOverlayOpacity: DEFAULTS.glassOverlayOpacity,
  glassBlur: DEFAULTS.glassBlur,
  glassTint: DEFAULTS.glassTint,
};

let glassCache = null;
let glassRequest = null;

const pickGlass = (s) => ({
  glassBgImage: s.glassBgImage,
  glassOverlayOpacity: s.glassOverlayOpacity,
  glassBlur: s.glassBlur,
  glassTint: s.glassTint,
});

export function useGlassAppearance(enabled = true) {
  const [appearance, setAppearance] = useState(glassCache || GLASS_DEFAULTS);

  useEffect(() => {
    if (!enabled || glassCache) return undefined;
    let alive = true;
    // getSystemSettings never rejects: it falls back to the defaults.
    glassRequest ||= getSystemSettings().then((s) => (glassCache = pickGlass(s)));
    glassRequest.then((a) => alive && setAppearance(a));
    return () => { alive = false; };
  }, [enabled]);

  return appearance;
}

// "#0f172a" + 72 → the tint as rgba() at that opacity, nudged lighter at the
// top and darker at the bottom so headings read and the footer settles.
export function glassTintGradient(tint, overlayPercent) {
  const hex = /^#[0-9a-fA-F]{6}$/.test(tint) ? tint : GLASS_DEFAULTS.glassTint;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const a = Math.min(95, Math.max(0, Number(overlayPercent) || 0)) / 100;
  const at = (k) => `rgba(${r}, ${g}, ${b}, ${Math.min(0.97, a * k).toFixed(3)})`;
  return `linear-gradient(180deg, ${at(0.88)} 0%, ${at(1)} 55%, ${at(1.1)} 100%)`;
}
