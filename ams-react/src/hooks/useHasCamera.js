import { useEffect, useState } from 'react';

// Whether this device has a camera, for the chat's "take a photo / record a video"
// buttons: without one, a capture input just opens the file picker, which the
// attach button already does. navigator.mediaDevices lists device kinds without
// asking for permission (labels stay empty). Re-checked when a camera is plugged
// in or out. false while unknown, so the buttons never flash in and out.
let cached = null; // shared by every chat on the page

async function detect() {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return false;
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some((d) => d.kind === 'videoinput');
  } catch {
    return false;
  }
}

export default function useHasCamera() {
  const [hasCamera, setHasCamera] = useState(cached ?? false);
  useEffect(() => {
    let active = true;
    const refresh = () => detect().then((found) => { cached = found; if (active) setHasCamera(found); });
    refresh();
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh);
    return () => {
      active = false;
      navigator.mediaDevices?.removeEventListener?.('devicechange', refresh);
    };
  }, []);
  return hasCamera;
}
