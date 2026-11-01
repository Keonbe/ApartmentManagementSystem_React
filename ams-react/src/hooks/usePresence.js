import { useEffect, useState } from 'react';

// Keeps a popup mounted for `ms` after it closes so it can play its exit
// animation. Render while `mounted`; mark it closing (e.g. data-closing) while
// `closing`, which the CSS animates out.
export default function usePresence(open, ms = 160) {
  const [mounted, setMounted] = useState(open);
  // Opening mounts at once (adjusted during render, not in an effect).
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (open || !mounted) return undefined;
    const timer = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(timer);
  }, [open, mounted, ms]);

  return { mounted: mounted || open, closing: mounted && !open };
}
