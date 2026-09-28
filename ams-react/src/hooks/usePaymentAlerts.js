import { useEffect } from 'react';

const readMark = (key) => {
  try {
    const value = sessionStorage.getItem(key);
    return value === null ? null : Number(value);
  } catch {
    return null;
  }
};

const writeMark = (key, value) => {
  try {
    sessionStorage.setItem(key, String(value));
  } catch {
    // Storage blocked: alerts may repeat after a remount, nothing worse.
  }
};

// Spots newly arrived notifications worth surfacing (the bell dropdown opens
// with them highlighted). The bells remount on every route, so the last
// notification id already seen (the "mark") lives in sessionStorage under
// storageKey, not in component state. The first load of a session only sets the
// mark: notices that were already there never pop up, and none pops up twice.
//
// notifications: raw rows from get_notifications.php (id, is_read, ...).
// match(n):      true for the notifications that should pop up.
// onNew(list):   called with the matching new notifications.
export default function usePaymentAlerts(notifications, { storageKey, match, onNew }) {
  useEffect(() => {
    if (!storageKey || !notifications.length) return;
    const maxId = Math.max(...notifications.map((n) => Number(n.id) || 0));
    const mark = readMark(storageKey);
    if (mark === null) {
      writeMark(storageKey, maxId);
      return;
    }
    if (maxId <= mark) return;
    writeMark(storageKey, maxId);

    const fresh = notifications.filter((n) => Number(n.id) > mark && !Number(n.is_read) && match(n));
    if (fresh.length) onNew(fresh);
  }, [notifications, storageKey, match, onNew]);
}
