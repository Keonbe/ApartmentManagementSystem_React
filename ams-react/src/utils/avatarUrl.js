import api from '../api/axiosConfig';

export const getAvatarUrl = (avatarUrl) => {
  if (!avatarUrl) return null;

  const trimmedUrl = String(avatarUrl).trim();
  if (!trimmedUrl) return null;
  if (/^(https?:)?\/\//i.test(trimmedUrl)) return trimmedUrl;

  const cleanPath = trimmedUrl.replace(/\\/g, '/').replace(/^\/+/, '');
  const backendPath = cleanPath.replace(/^.*?backend\//i, '').replace(/^\/+/, '');
  const backendBaseUrl = new URL('../', api.defaults.baseURL);

  return new URL(backendPath, backendBaseUrl).href;
};