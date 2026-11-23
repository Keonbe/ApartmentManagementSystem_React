// A form's unsent text kept in sessionStorage, so a refresh, a Back, or a tab
// that reloads does not lose it. Only plain field values: never a file, a
// password or an anti-spam field. Every call is safe when storage is blocked.
export function readDraft(key) {
  try {
    const raw = sessionStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// An all-empty draft removes the key instead of storing noise.
export function saveDraft(key, values) {
  try {
    const hasValue = Object.values(values).some((v) => v !== '' && v != null && v !== false);
    if (hasValue) sessionStorage.setItem(key, JSON.stringify(values));
    else sessionStorage.removeItem(key);
  } catch { /* storage blocked or full: the form still works */ }
}

export function clearDraft(key) {
  try { sessionStorage.removeItem(key); } catch { /* ignore */ }
}
