import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../api/axiosConfig';
import { isServiceSwitchOn } from '../config/settingsSchema';
import { SkeletonPage } from '../Components/tenant/Skeleton';

let cachedSettings = null;
let cacheTime = 0;
const CACHE_TTL = 10000; // 10 seconds

const fetchCachedSettings = async () => {
  const now = Date.now();
  if (cachedSettings && (now - cacheTime < CACHE_TTL)) {
    return cachedSettings;
  }
  try {
    const res = await api.get('/get_system_settings.php');
    if (res.data?.success && res.data?.settings) {
      cachedSettings = res.data.settings;
      cacheTime = now;
      return cachedSettings;
    }
  } catch (err) {
    console.error('Failed to load system settings in ServiceRouteGuard:', err);
  }
  return cachedSettings || {};
};

if (typeof window !== 'undefined') {
  window.addEventListener('system-settings-updated', () => {
    cachedSettings = null;
    cacheTime = 0;
  });
}

const isServiceKeyActive = (settings, settingKey) => {
  if (!settings) return true;
  if (Array.isArray(settingKey)) {
    return settingKey.some((key) => isServiceSwitchOn(settings[key]));
  }
  return isServiceSwitchOn(settings[settingKey]);
};

const getIsAdmin = () => {
  try {
    const loggedInUserStr = sessionStorage.getItem('loggedInUser') || localStorage.getItem('loggedInUser');
    const user = loggedInUserStr ? JSON.parse(loggedInUserStr) : null;
    return user?.role === 'admin';
  } catch {
    return false;
  }
};

export default function ServiceRouteGuard({ settingKey, fallbackPath = '/services', children }) {
  const isAdmin = getIsAdmin();
  const [loading, setLoading] = useState(() => !isAdmin && !cachedSettings);
  const [isAllowed, setIsAllowed] = useState(() => {
    if (isAdmin) return true;
    if (cachedSettings) {
      return isServiceKeyActive(cachedSettings, settingKey);
    }
    return true;
  });

  useEffect(() => {
    if (isAdmin) return;

    let isMounted = true;
    fetchCachedSettings().then((settings) => {
      if (isMounted) {
        setIsAllowed(isServiceKeyActive(settings, settingKey));
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isAdmin, settingKey]);

  if (loading) {
    return (
      <SkeletonPage label="Checking service status…" />
    );
  }

  if (!isAllowed) {
    return <Navigate to={fallbackPath} replace />;
  }

  return children;
}

