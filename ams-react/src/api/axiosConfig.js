import axios from "axios";

// This is the base URL for all API requests. It is set to the URL of the XAMPP server.
const api = axios.create({
    baseURL: "http://localhost/ApartmentManagementSystem_React/backend/api/",
    headers: {
        "Content-Type": "application/json"
    }
});

api.interceptors.request.use((config) => {
    const loggedInUserStr = sessionStorage.getItem("loggedInUser");
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
    return config;
}, (error) => {
    return Promise.reject(error);
});

export default api;