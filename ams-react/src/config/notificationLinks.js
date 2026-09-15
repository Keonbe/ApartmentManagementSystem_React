// Where a notification leads when clicked, by notification type. Types are the
// ones the backend writes (create_notification() / notify_admins_queue() in
// backend/config.php). A type missing from a map simply has no link.

export const TENANT_NOTIFICATION_LINKS = {
  rent_due: { path: '/pay-bills', label: 'Pay Bill' },
  overdue: { path: '/pay-bills', label: 'Pay Bill' },
  billing: { path: '/pay-bills', label: 'View Bill' },
  payment: { path: '/payment-history', label: 'Payment History' },
  maintenance_update: { path: '/my-requests', label: 'View Request' },
  service_status: { path: '/my-requests', label: 'View Request' },
  cctv_request: { path: '/my-requests', label: 'View Request' },
  parking_reservation: { path: '/parking-reservation', label: 'View Parking' },
  application_update: { path: '/track-application', label: 'Track Application' },
  inquiry_update: { path: '/track-application', label: 'View Status' },
  unit_reservation: { path: '/track-application', label: 'View Status' },
  contract_update: { path: '/view-contract', label: 'View Contract' },
  move_out_update: { path: '/my-room', label: 'My Room' },
  occupancy_request: { path: '/my-room', label: 'My Room' },
  lease_extension_request: { path: '/my-room', label: 'My Room' },
  visitor_log: { path: '/visitor-management', label: 'View Visitors' },
  info: { path: '/announcements', label: 'Announcements' },
  warning: { path: '/announcements', label: 'Announcements' },
  action: { path: '/announcements', label: 'Announcements' },
};

export const ADMIN_NOTIFICATION_LINKS = {
  rent_application: '/admin-applications',
  maintenance_request: '/admin-maintenance',
  cctv_request: '/admin-cctv',
  parking_reservation: '/admin-parking',
  service_request: '/admin-services',
  inquiry: '/admin-inquiries',
  payment_verification: '/admin-payments',
  occupancy_request: '/admin-notifications',
  lease_extension_request: '/admin-notifications',
};

// Fired after any change to notifications (read, delete, preferences) so every
// bell and list on the page refetches.
export const TENANT_NOTIFICATIONS_EVENT = 'user_notifications_updated';
export const ADMIN_NOTIFICATIONS_EVENT = 'admin_notifications_updated';

export const NOTIFICATION_POLL_MS = 60000;

export const formatRelativeTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(String(dateStr).replace(' ', 'T'));
  if (isNaN(d.getTime())) return dateStr;
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
