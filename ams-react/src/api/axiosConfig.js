import axios from "axios";

// This is the base URL for all API requests. It is set to the URL of the XAMPP server.
const api = axios.create({
    baseURL: "http://localhost:8080/ApartmentManagementSystem_React/backend/api/",
    headers: {
        "Content-Type": "application/json"
    }
});

api.interceptors.request.use((config) => {
    const loggedInUserStr = sessionStorage.getItem("loggedInUser") || localStorage.getItem("loggedInUser");
    if (loggedInUserStr) {
        try {
            const loggedInUser = JSON.parse(loggedInUserStr);
            if (loggedInUser.id) {
                config.headers['X-User-Id'] = loggedInUser.id;
            }
            if (loggedInUser.role === 'admin' && loggedInUser.id) {
                config.headers['X-Admin-Id'] = loggedInUser.id;
            }
        } catch (e) {
            console.error(e);
        }
    }

    // The real proof of identity. X-User-Id / X-Admin-Id above are kept only
    // for endpoints not yet migrated to the session-token gate — the backend
    // never trusts them on their own once an endpoint uses require_admin()/
    // require_user()/require_owner_or_admin() or the updated verify_admin().
    const sessionToken = sessionStorage.getItem("sessionToken") || localStorage.getItem("sessionToken");
    if (sessionToken) {
        config.headers['Authorization'] = `Bearer ${sessionToken}`;
    }

    return config;
}, (error) => {
    return Promise.reject(error);
});

export default api;