// Props that make a non-button element (a card, list row or table row) work from
// the keyboard: focusable, and Enter / Space run the same handler as a click.
// Spread it where the element used to have `onClick`. Pass `{ role: null }` for a
// <tr> so the table row keeps its own semantics.
export function clickable(handler, { role = 'button' } = {}) {
  return {
    ...(role ? { role } : {}),
    tabIndex: 0,
    onClick: handler,
    onKeyDown: (e) => {
      if (e.target !== e.currentTarget) return; // keys typed in a child control
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handler(e);
      }
    },
  };
}
