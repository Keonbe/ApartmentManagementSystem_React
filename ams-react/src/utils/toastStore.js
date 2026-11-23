// Pure list behind utils/toast.jsx (kept apart so it can be unit-tested without a DOM).
export const TOAST_MS = { success: 5000, info: 6000, error: 8000 };
const MAX_VISIBLE = 5;

export function createToastStore(setTimer = setTimeout, clearTimer = clearTimeout) {
  let items = [];
  let nextId = 1;
  const timers = new Map();
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn(items));

  const dismiss = (id) => {
    if (timers.has(id)) { clearTimer(timers.get(id)); timers.delete(id); }
    const before = items.length;
    items = items.filter((x) => x.id !== id);
    if (items.length !== before) emit();
  };

  const push = (tone, message, { duration } = {}) => {
    const text = message == null ? '' : String(message).trim();
    if (!text) return 0;
    // The same message twice in a row (double click) refreshes instead of stacking.
    const dup = items.find((x) => x.tone === tone && x.message === text);
    if (dup) dismiss(dup.id);
    const id = nextId++;
    items = [...items, { id, tone, message: text }].slice(-MAX_VISIBLE);
    timers.set(id, setTimer(() => dismiss(id), duration ?? TOAST_MS[tone] ?? TOAST_MS.info));
    emit();
    return id;
  };

  return {
    push,
    dismiss,
    getItems: () => items,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
