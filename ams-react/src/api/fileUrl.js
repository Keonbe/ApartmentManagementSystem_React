import { ASSET_BASE_URL } from './env';

// Backend stores upload paths web-relative to the backend root, usually with a
// "../" prefix (e.g. "../uploads/documents/lease.pdf"). Resolve them against the
// asset base from ./env.js (the backend root unless VITE_ASSET_BASE_URL says
// otherwise) so there is one source of truth for the host.
export const fileUrl = (path) => {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    return ASSET_BASE_URL + String(path).replace(/^(\.\.\/)+/, '');
};

export default fileUrl;
