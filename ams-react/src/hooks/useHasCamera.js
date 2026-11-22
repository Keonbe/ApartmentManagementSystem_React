import { useEffect, useState } from 'react';

// Whether this device has a camera, for the chat's "take a photo / record a
// video" buttons (Components/chat/CameraCapture.jsx): with none, they open the
// file manager instead of the camera window. navigator.mediaDevices lists device
// kinds without asking for permission (labels stay empty). Re-checked when a
// camera is plugged in or out. null while unknown (the camera window then tries).
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
  const [hasCamera, setHasCamera] = useState(cached);
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
