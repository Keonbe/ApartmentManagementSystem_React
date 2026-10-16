import { useEffect, useState } from 'react';
import api from '../api/axiosConfig';

// Every active rule (house, children and pets, parking) in one request, in display order.
// `enabled` lets a modal fetch only while it is open. `error` is true when the request failed.
export default function useAllRules(enabled = true) {
  const [rules, setRules] = useState([]);
  const [settled, setSettled] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api.get('house_rules.php', { params: { scope: 'all' } })
        .then((res) => {
          if (cancelled) return;
          const ok = res.data?.success && Array.isArray(res.data.rules);
          if (ok) setRules(res.data.rules);
          setError(!ok);
        })
        .catch(() => { if (!cancelled) setError(true); })
        .finally(() => { if (!cancelled) setSettled(true); });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [enabled]);

  // Loading until the first answer arrives (a reopened modal shows the rules it already has).
  return { rules, loading: enabled && !settled, error };
}
