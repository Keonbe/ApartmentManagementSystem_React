import axios from "axios";
import { API_BASE_URL } from "./env";

// Base URL for all API requests, chosen per build target in ./env.js.
const api = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
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
    clearGuestChatStorage();
    window.dispatchEvent(new Event('auth-changed'));
}

export function clearGuestChatStorage() {
    for (const key of Object.keys(localStorage)) {
        if (key === 'ams_guest_token' || key.startsWith('ams_guest_')) localStorage.removeItem(key);
    }
    window.dispatchEvent(new Event('guest-chat-invalidated'));
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
// Any endpoint that dispatched an SMS/email returns notification_dispatch, and
// it gets printed here rather than in each admin page. On the 'log' drivers the
// console IS the message: nothing leaves the machine, so this is the only place
// the rendered text and HTML can be read as the admin works.
api.interceptors.response.use((response) => {
    const d = response.data?.notification_dispatch;
    if (d) {
        // With one live driver and one mock, name the channel that only recorded.
        const dryOnly = Object.entries(d.dry_run_channels || {}).filter(([, dry]) => dry).map(([ch]) => ch);
        const dryLabel = d.dry_run ? ' (DRY RUN, nothing sent)' : dryOnly.length ? ` (${dryOnly.join(', ')}: dry run)` : '';
        console.groupCollapsed(
            `%cAMS notification — ${response.config?.url || 'request'}${dryLabel}`,
            'color:#2563eb;font-weight:bold'
        );
        console.log('SMS:', d.sms, '· Email:', d.email);
        if (d.recipients !== undefined) console.log('Recipients:', d.recipients);
        console.log(`SMS text (${d.rendered?.sms_length} chars):\n${d.rendered?.sms_text}`);
        console.log('Email subject:', d.rendered?.subject);
        console.log('Email HTML:\n' + d.rendered?.email_html);
        console.groupEnd();
    }
    return response;
}, (error) => {
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
