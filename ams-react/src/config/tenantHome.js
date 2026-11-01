// Where a signed-in user starts. A tenant's home is My Room (Home is for
// guests and applicants); an applicant with an application in progress lands
// on Track Application but can still open Home.

// my_room.php statuses that make the user a tenant (a confirmed move-in).
export const TENANT_STATUSES = ['active', 'pending-move-out'];
// An application the user is still waiting on or has to act on.
const IN_PROGRESS_STATUSES = ['pending', 'pending review', 'approved', 'action required', 'pending deposit'];

export const isTenantStatus = (status) => TENANT_STATUSES.includes(String(status || '').toLowerCase());

// The page to open after sign-in, from my_room.php's `data` (null = no application).
export function landingPathFor(room) {
  if (!room) return '/home';
  const status = String(room.status || '').toLowerCase();
  if (TENANT_STATUSES.includes(status)) return '/my-room';
  if (IN_PROGRESS_STATUSES.includes(status) || room.has_pending_first_payment) return '/track-application';
  return '/home';
}

// The last room check, per user and per tab, so a tenant's TopBar and the Home
// redirect are right on the first paint instead of after my_room.php answers.
const CACHE_KEY = 'ams_has_room';

export function readRoomCache(userId) {
  if (userId == null) return null;
  try {
    const [id, has] = (sessionStorage.getItem(CACHE_KEY) || '').split(':');
    return id === String(userId) ? has === '1' : null;
  } catch {
    return null;
  }
}

export function writeRoomCache(userId, hasRoom) {
  if (userId == null) return;
  try {
    sessionStorage.setItem(CACHE_KEY, `${userId}:${hasRoom ? 1 : 0}`);
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
