import { flushSync } from 'react-dom';

// Runs a state change that repaints the whole page (theme, language) inside a
// View Transition, so it animates instead of snapping:
//   kind 'theme' – the new look spreads in a circle from the switch that was
//                  pressed (pass that button as `from`);
//   kind 'lang'  – the text cross-fades.
// The styles are in assets/styles/themes.user.css (::view-transition-*).
// Browsers without the API, and reduced motion, just apply the change.
export function withViewTransition(update, { kind, from } = {}) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (typeof document.startViewTransition !== 'function' || reduce) {
    update();
    return;
  }

  const root = document.documentElement;
  if (root.dataset.vt) {
    // One is already running: apply this change without a second animation.
    update();
    return;
  }
  root.dataset.vt = kind;
  if (from?.getBoundingClientRect) {
    const box = from.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    root.style.setProperty('--vt-x', `${x}px`);
    root.style.setProperty('--vt-y', `${y}px`);
    root.style.setProperty('--vt-r', `${r}px`);
  }

  // flushSync: the DOM must hold the new state when the callback returns.
  const transition = document.startViewTransition(() => flushSync(update));
  transition.finished.finally(() => {
    delete root.dataset.vt;
  });
}
