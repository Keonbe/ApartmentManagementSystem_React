import axios from "axios";
import { API_BASE_URL } from "./env";

// Base URL for all API requests, chosen per build target in ./env.js.
const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        "Content-Type": "application/json"
    }
});

// Removes everything a signed-in session leaves in the browser. Logout used to
// clear only sessionStorage, while every reader also falls back to localStorage.
export function clearStoredSession() {
    for (const store of [sessionStorage, localStorage]) {
        store.removeItem("loggedInUser");
        store.removeItem("sessionToken");
    }
}

api.interceptors.request.use((config) => {
    // The session token is the only identity sent. The X-User-Id / X-Admin-Id
    // headers this used to add were client-chosen values; the backend now
    // overwrites them from the session (config.php), so they carried nothing.
    const sessionToken = sessionStorage.getItem("sessionToken") || localStorage.getItem("sessionToken");
    if (sessionToken) {
        config.headers['Authorization'] = `Bearer ${sessionToken}`;
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});

// A 401 on a request that carried a token means the session is gone: expired,
// signed out elsewhere, or ended by a password reset, role change or archive.
// Without this the UI kept showing stale data and endless spinners while still
// believing it was signed in.
api.interceptors.response.use((response) => response, (error) => {
    const sentToken = error?.config?.headers?.Authorization;
    if (error?.response?.status === 401 && sentToken) {
        clearStoredSession();
        if (!window.location.pathname.startsWith('/login')) {
            window.location.assign('/login?expired=1');
        }
    }
    return Promise.reject(error);
});

export default api;
