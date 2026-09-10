import api from './axiosConfig';

// Backend stores upload paths web-relative to the backend root, usually with a
// "../" prefix (e.g. "../uploads/documents/lease.pdf"). Resolve them against the
// same origin the API client uses so there is one source of truth for the host.
const BACKEND_ROOT = api.defaults.baseURL.replace(/api\/?$/, '');

export const fileUrl = (path) => {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    return BACKEND_ROOT + String(path).replace(/^(\.\.\/)+/, '');
};

export default fileUrl;
