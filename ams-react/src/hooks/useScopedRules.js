import { useEffect, useState } from 'react';
import api from '../api/axiosConfig';

// Admin-editable rules for one scope ('parking' or 'minors'), optionally with the age categories.
export default function useScopedRules(scope, withAgeCategories = false) {
  const [rules, setRules] = useState([]);
  const [ageCategories, setAgeCategories] = useState([]);
  const [minAge, setMinAge] = useState(null);
  useEffect(() => {
    let cancelled = false;
    api.get('house_rules.php', { params: { scope } })
      .then((res) => { if (!cancelled && res.data?.success) setRules(res.data.rules || []); })
      .catch(() => {});
    if (withAgeCategories) {
      api.get('get_system_settings.php')
        .then((res) => {
          if (cancelled) return;
          setAgeCategories(res.data?.settings?.age_categories || []);
          setMinAge(res.data?.settings?.min_household_age ?? null);
        })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [scope, withAgeCategories]);
  return { rules, ageCategories, minAge };
}

