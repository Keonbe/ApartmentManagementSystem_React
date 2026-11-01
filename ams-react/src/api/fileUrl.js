import { API_BASE_URL } from './env';

// Uploaded documents (gov IDs and other application documents, payment proofs, leases,
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

// Unlike fileUrl(), for genuinely public images (unit photos in room_images/,
// payment QR codes in qr_codes/, Glass theme photos in site_assets/) that have
// no owner to authenticate against and must be visible to logged-out guests.
// Served by public_file.php, not as static files: a server that exposes only
// the api/ folder (the deployed one) has no URL for the folders beside it.
export const publicAssetUrl = (path) => {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    const relative = String(path).replace(/^(\.\.\/)+/, '');
    return `${API_BASE_URL}public_file.php?path=${encodeURIComponent(relative)}`;
};

export default fileUrl;
