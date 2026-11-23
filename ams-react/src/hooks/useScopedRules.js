import { useCallback, useEffect, useState } from 'react';
import api from '../api/axiosConfig';

// Admin-editable rules for one scope ('parking' or 'minors'), optionally with the age categories.
// `error` is true when a request failed (so an empty list is not mistaken for "no rules");
// `retry()` loads again.
export default function useScopedRules(scope, withAgeCategories = false) {
  const [rules, setRules] = useState([]);
  const [ageCategories, setAgeCategories] = useState([]);
  const [minAge, setMinAge] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    let cancelled = false;
    const fail = () => { if (!cancelled) setError(true); };
    const timer = window.setTimeout(() => {
      setError(false);
      api.get('house_rules.php', { params: { scope } })
        .then((res) => {
          if (cancelled) return;
          if (res.data?.success) setRules(res.data.rules || []); else fail();
        })
        .catch(fail);
      if (withAgeCategories) {
        api.get('get_system_settings.php')
          .then((res) => {
            if (cancelled) return;
            if (res.data?.success === false) { fail(); return; }
            setAgeCategories(res.data?.settings?.age_categories || []);
            setMinAge(res.data?.settings?.min_household_age ?? null);
          })
          .catch(fail);
      }
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [scope, withAgeCategories, attempt]);
  return { rules, ageCategories, minAge, error, retry };
}
