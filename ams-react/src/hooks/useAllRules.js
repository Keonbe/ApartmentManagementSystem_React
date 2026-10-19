import { useEffect, useState } from 'react';
import api from '../api/axiosConfig';

// Shared by every user of the hook, so a modal opens with rules another component already loaded.
let cachedRules = null;
let inFlight = null;

function fetchRules() {
  if (!inFlight) {
    inFlight = api.get('house_rules.php', { params: { scope: 'all' } })
      .then((res) => {
        if (!(res.data?.success && Array.isArray(res.data.rules))) throw new Error('bad response');
        cachedRules = res.data.rules;
        return cachedRules;
      })
      .finally(() => { inFlight = null; });
  }
  return inFlight;
}

// Every active rule (house, children and pets, parking) in one request, in display order.
// `enabled` lets a modal fetch only while it is open. `error` is true when the request failed.
// Cached rules show at once and are refreshed in the background on each enable.
export default function useAllRules(enabled = true) {
  const [fetched, setFetched] = useState(null);
  const [settled, setSettled] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetchRules()
        .then((rules) => { if (!cancelled) { setFetched(rules); setError(false); } })
        .catch(() => { if (!cancelled) setError(true); })
        .finally(() => { if (!cancelled) setSettled(true); });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [enabled]);

  const rules = fetched ?? cachedRules ?? [];
  // A failed refresh keeps showing the cached rules rather than an error.
  return { rules, loading: enabled && !settled && cachedRules === null, error: error && cachedRules === null };
}
