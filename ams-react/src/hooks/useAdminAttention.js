import { useEffect, useState } from 'react';
import api, { API_WRITE_EVENT } from '../api/axiosConfig';
import { ADMIN_NOTIFICATIONS_EVENT, ADMIN_PAYMENTS_EVENT } from '../config/notificationLinks';

// The Dashboard's "needs attention" counts (dashboard_stats.php?section=attention)
// for the admin sidebar badges. Every admin page renders its own sidebar, so the
// last answer is kept here for the whole tab: a new page shows it at once and
// refreshes it if it is older than FRESH_MS. Also refreshed every POLL_MS while
// the tab is visible, when the tab comes back, and shortly after anything is
// saved (API_WRITE_EVENT from axiosConfig, the bell's own events).
//   const attention = useAdminAttention(); // null until the first answer
const POLL_MS = 60_000;
const FRESH_MS = 15_000;
const AFTER_WRITE_MS = 800;

let cache = { attention: null, at: 0 };
let inflight = null;
let again = false; // a forced refresh asked for while one was running
const listeners = new Set();

function load(force) {
  if (!force && cache.at && Date.now() - cache.at < FRESH_MS) return;
  if (inflight) { if (force) again = true; return; }
  inflight = api.get('dashboard_stats.php', { params: { section: 'attention' } })
    .then((res) => {
      if (!res.data?.success || !res.data.attention) return;
      cache = { attention: res.data.attention, at: Date.now() };
      listeners.forEach((fn) => fn(cache.attention));
    })
    // No badges is better than a broken sidebar; the next poll tries again.
    .catch(() => {})
    .finally(() => {
      inflight = null;
      if (again) { again = false; load(true); }
    });
}

export default function useAdminAttention() {
  const [attention, setAttention] = useState(cache.attention);

  useEffect(() => {
    listeners.add(setAttention);
    load(false);
    const poll = setInterval(() => { if (document.visibilityState === 'visible') load(true); }, POLL_MS);
    let writeTimer = null;
    const afterWrite = () => {
      clearTimeout(writeTimer);
      writeTimer = setTimeout(() => load(true), AFTER_WRITE_MS);
    };
    const onVisible = () => { if (document.visibilityState === 'visible') load(false); };
    window.addEventListener(API_WRITE_EVENT, afterWrite);
    window.addEventListener(ADMIN_NOTIFICATIONS_EVENT, afterWrite);
    window.addEventListener(ADMIN_PAYMENTS_EVENT, afterWrite);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      listeners.delete(setAttention);
      clearInterval(poll);
      clearTimeout(writeTimer);
      window.removeEventListener(API_WRITE_EVENT, afterWrite);
      window.removeEventListener(ADMIN_NOTIFICATIONS_EVENT, afterWrite);
      window.removeEventListener(ADMIN_PAYMENTS_EVENT, afterWrite);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return attention;
}
