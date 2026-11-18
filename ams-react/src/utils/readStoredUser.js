// The signed-in user the login page stored (sessionStorage first, then
// localStorage). A value that is missing, not JSON, or not an object gives the
// fallback instead of throwing: a throw while a route guard renders blanks the
// whole app, and the page could not even recover through /login.
//
// A corrupt value is removed so the next read (and a reload) starts clean.
// `stores` is only for tests.
const KEY = 'loggedInUser';

function defaultStores() {
  const list = [];
  for (const name of ['sessionStorage', 'localStorage']) {
    try {
      const store = globalThis[name];
      if (store) list.push(store);
    } catch {
      // Storage blocked (private window, site data off): treat as empty.
    }
  }
  return list;
}

export function readStoredUser(fallback = null, stores = defaultStores()) {
  for (const store of stores) {
    let raw;
    try {
      raw = store.getItem(KEY);
    } catch {
      continue;
    }
    if (!raw) continue;
    try {
      const user = JSON.parse(raw);
      if (user && typeof user === 'object' && !Array.isArray(user)) return user;
    } catch {
      // fall through to the cleanup below
    }
    try {
      store.removeItem(KEY);
    } catch {
      // nothing more to do
    }
  }
  return fallback;
}
