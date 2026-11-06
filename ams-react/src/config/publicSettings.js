import { useEffect, useState } from 'react';
import { getSystemSettings } from './systemSettings';
import { setEnglishOnly } from './i18n';

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

// Other Settings → Language: whether tenants and guests get the EN / FIL
// switch. Hidden until the setting arrives, so a switch the admin turned off
// never flashes on screen. Off also shows every page in English
// (setEnglishOnly keeps the tenant's saved choice for when it is back on).
export function useLanguageSwitch() {
  const settings = usePublicSettings();
  const enabled = settings ? settings.languageSwitchEnabled !== false : null;
  useEffect(() => {
    if (enabled !== null) setEnglishOnly(!enabled);
  }, [enabled]);
  return enabled === true;
}
