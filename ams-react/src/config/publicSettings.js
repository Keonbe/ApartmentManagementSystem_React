import { useEffect, useState } from 'react';
import { getSystemSettings } from './systemSettings';

// Settings the tenant and guest pages read (the Glass backdrop, the Home page
// text): fetched once per page load and shared. null until it arrives; on a
// failed request getSystemSettings resolves with the defaults instead.
let cache = null;
let request = null;

export function usePublicSettings(enabled = true) {
  const [settings, setSettings] = useState(cache);

  useEffect(() => {
    if (!enabled || cache) return undefined;
    let alive = true;
    request ||= getSystemSettings().then((s) => (cache = s));
    request.then((s) => alive && setSettings(s));
    return () => { alive = false; };
  }, [enabled]);

  return settings;
}
