// Where a signed-in user starts. A tenant's home is My Room (Home is for
// guests and applicants); an applicant with an application in progress lands
// on Track Application but can still open Home.
import { createContext, useContext } from 'react';

// my_room.php statuses that make the user a tenant (a confirmed move-in).
export const TENANT_STATUSES = ['active', 'pending-move-out'];
// An application the user is still waiting on or has to act on.
const IN_PROGRESS_STATUSES = ['pending', 'pending review', 'approved', 'action required', 'pending deposit'];

export const isTenantStatus = (status) => TENANT_STATUSES.includes(String(status || '').toLowerCase());

// What the latest application makes the user: 'tenant', 'applicant' (any
// application, even a rejected or cancelled one) or 'none' (never applied).
export const roomKindFor = (status) => (!status ? 'none' : isTenantStatus(status) ? 'tenant' : 'applicant');

// The page to open after sign-in, from my_room.php's `data` (null = no application).
export function landingPathFor(room) {
  if (!room) return '/home';
  const status = String(room.status || '').toLowerCase();
  if (TENANT_STATUSES.includes(status)) return '/my-room';
  if (IN_PROGRESS_STATUSES.includes(status) || room.has_pending_first_payment) return '/track-application';
  return '/home';
}

// The last room check, per user and per tab: "<userId>:<kind>:<checked at ms>".
// The TopBar and the Home redirect are right on the first paint, and App.jsx
// asks the server again only once the check is ROOM_RECHECK_MS old (it used to
// ask on every page change).
const CACHE_KEY = 'ams_has_room';
const KINDS = ['tenant', 'applicant', 'none'];
export const ROOM_RECHECK_MS = 60000;

// { kind, at } or null (none cached for this user).
export function readRoomCache(userId) {
  if (userId == null) return null;
  try {
    const [id, kind, at] = (sessionStorage.getItem(CACHE_KEY) || '').split(':');
    return id === String(userId) && KINDS.includes(kind) ? { kind, at: Number(at) || 0 } : null;
  } catch {
    return null;
  }
}

// at = 0 keeps the kind but marks it stale, so the next check asks the server.
export function writeRoomCache(userId, kind, at = Date.now()) {
  if (userId == null) return;
  try {
    sessionStorage.setItem(CACHE_KEY, `${userId}:${kind}:${at}`);
  } catch {
    // Not cached: the next page load checks again.
  }
}

export function clearRoomCache() {
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    // Nothing to clear.
  }
}

// App.jsx provides the room check to the TopBar and to pages that change it
// (a new application): { hasApplication, refreshRoomStatus }.
export const RoomStatusContext = createContext({ hasApplication: false, refreshRoomStatus: () => {} });
export const useRoomStatus = () => useContext(RoomStatusContext);
