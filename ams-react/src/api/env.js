// Deployment settings, fixed at build time. Vite replaces every
// import.meta.env.VITE_* below with the value from the .env file of the build
// mode (see docs/deployment/dual-deployment-environment-plan.md §4):
//   npm run dev / build:local  -> .env.development (+ .env.development.local)
//   npm run build:saas         -> .env.production  (+ .env.production.local)
//   npm run build:selfhosted   -> .env.selfhosted  (+ .env.selfhosted.local)
// Nothing here is secret: every VITE_* value ends up in the public bundle.
// This is the only file that reads import.meta.env.

const withSlash = (url) => (url.endsWith('/') ? url : `${url}/`);

// Full URL of the PHP API folder. The XAMPP fallback exists only in dev
// builds; production builds refuse to start without VITE_API_BASE_URL
// (scripts/deploy-guard.mjs), and the dead branch is dropped from the bundle.
export const API_BASE_URL = withSlash(
    import.meta.env.VITE_API_BASE_URL
    || (import.meta.env.DEV ? 'http://localhost:8080/ApartmentManagementSystem_React/backend/api/' : '/api/')
);

// Optional origin for the chat Socket.IO service. Local development uses the
// sidecar's default port; production defaults to the current origin (which can
// be reverse-proxied to the WebSocket service).
export const CHAT_SOCKET_URL = import.meta.env.VITE_CHAT_SOCKET_URL
    || (import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin);

// Base URL that stored upload paths ("uploads/...") are resolved against.
// Defaults to the backend root, i.e. the API URL without its trailing "api/".
export const ASSET_BASE_URL = withSlash(
    import.meta.env.VITE_ASSET_BASE_URL || API_BASE_URL.replace(/api\/$/, '')
);

// Where the SPA itself is served (used for payment return links). When unset,
// the page's current address is used, which is right for XAMPP's dist/ path.
export const PUBLIC_URL = import.meta.env.VITE_PUBLIC_URL || '';

// Label only: 'local' | 'saas' | 'selfhosted'.
export const DEPLOYMENT_TARGET = import.meta.env.VITE_DEPLOYMENT_TARGET
    || (import.meta.env.DEV ? 'local' : import.meta.env.MODE);

// Base for a hash-route link back into this app, e.g. `${appReturnBase()}#/pay-bills`.
export const appReturnBase = () => (
    PUBLIC_URL ? withSlash(PUBLIC_URL) : `${window.location.origin}${window.location.pathname}`
);
