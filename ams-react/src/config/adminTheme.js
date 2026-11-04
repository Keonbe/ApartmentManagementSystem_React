// Admin side Light / Dark (no Glass). The choice is kept per browser; with none
// saved, the system setting decides. While an admin page is open, Dark puts
// .admin-dark on <html> (themes.generated.css remaps the colours there, so
// dialogs and the chat widget outside the page follow too). AdminSidebar, which
// every admin page renders, applies it and takes it off again on the way out.
import { useEffect, useLayoutEffect, useState } from 'react';

const KEY = 'ams_admin_theme';
const EVENT = 'ams-admin-theme';
const CLASS = 'admin-dark';

export function getAdminTheme() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // No storage (private window): fall through to the system setting.
  }
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function setAdminTheme(theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Not remembered; still applied for this page.
  }
  document.documentElement.classList.toggle(CLASS, theme === 'dark');
  window.dispatchEvent(new CustomEvent(EVENT, { detail: theme }));
}

// Current theme, kept in step with the toggle on the same page.
export function useAdminTheme() {
  const [theme, setTheme] = useState(getAdminTheme);
  useEffect(() => {
    const onChange = (e) => setTheme(e.detail);
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  return theme;
}

// Puts the class on <html> for the life of an admin page. A layout effect, so
// the first paint is already in the right theme.
export function useApplyAdminTheme() {
  const theme = useAdminTheme();
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle(CLASS, theme === 'dark');
    return () => root.classList.remove(CLASS);
  }, [theme]);
}
