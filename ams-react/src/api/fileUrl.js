import { API_BASE_URL, ASSET_BASE_URL } from './env';

// Uploaded documents (gov IDs, NBI clearances, payment proofs, leases,
// avatars, attachments) are no longer served as static files — uploads/ is
// blocked at the webserver and every one goes through the authenticated
// download_file.php endpoint instead (H2/B-8). This stays the single URL
// resolver: it just points at the new endpoint, carrying the session token
// as a query param since an <img>/<a> tag can't attach an Authorization
// header the way axios does for JSON requests.
export const fileUrl = (path) => {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    const token = sessionStorage.getItem('sessionToken') || localStorage.getItem('sessionToken') || '';
    const relative = String(path).replace(/^(\.\.\/)+/, '');
    return `${API_BASE_URL}download_file.php?path=${encodeURIComponent(relative)}&token=${encodeURIComponent(token)}`;
};

// Unlike fileUrl(), for genuinely public assets (unit showcase photos) that
// have no owner to authenticate against and must be visible to logged-out
// guests — served directly from backend/room_images/, not through the
// session-gated download_file.php.
export const publicAssetUrl = (path) => {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    return `${ASSET_BASE_URL}${String(path).replace(/^(\.\.\/)+/, '')}`;
};

export default fileUrl;
