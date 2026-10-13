// Where a notification leads when clicked, by notification type. Types are the
// ones the backend writes (create_notification() / notify_admins_queue() in
// backend/config.php). A type missing from a map simply has no link.

export const TENANT_NOTIFICATION_LINKS = {
  rent_due: { path: '/pay-bills', label: 'Pay Bill' },
  overdue: { path: '/pay-bills', label: 'Pay Bill' },
  billing: { path: '/pay-bills', label: 'View Bill' },
  payment: { path: '/payment-history', label: 'Payment History' },
  refund_update: { path: '/my-refunds', label: 'My Refunds' },
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
  household_request: { path: '/my-room', label: 'My Room' },
  waitlist_update: { path: '/track-application', label: 'View Status' },
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
  cash_payment_declared: '/admin-payments',
  payment: '/admin-payments',
  refund_request: '/admin-refunds',
  payment_followup: '/admin-notifications',
  document_followup: '/admin-notifications',
  move_out_request: '/admin-tenants',
  occupancy_request: '/admin-notifications',
  household_request: '/admin-notifications',
  unit_waitlist: '/admin-inquiries',
  lease_extension_request: '/admin-notifications',
  visitor_registration: '/admin-visitors',
  visitor_overstay: '/admin-visitors',
};

export const ADMIN_NOTIFICATION_TARGETS = {
  rent_application: { path: '/admin-applications', label: 'Go to Applications' },
  maintenance_request: { path: '/admin-maintenance', label: 'Go to Maintenance' },
  cctv_request: { path: '/admin-cctv', label: 'Go to CCTV' },
  parking_reservation: { path: '/admin-parking', label: 'Go to Parking' },
  service_request: { path: '/admin-services', label: 'Go to Services' },
  inquiry: { path: '/admin-inquiries', label: 'Go to Inquiries' },
  unit_waitlist: { path: '/admin-inquiries', label: 'Go to Inquiries' },
  payment_verification: { path: '/admin-payments', label: 'Go to Payments' },
  cash_payment_declared: { path: '/admin-payments', label: 'Go to Payments' },
  payment: { path: '/admin-payments', label: 'Go to Payments' },
  refund_request: { path: '/admin-refunds', label: 'Go to Refunds' },
  payment_followup: { path: '/admin-notifications', label: 'Go to Follow-ups' },
  document_followup: { path: '/admin-notifications', label: 'Go to Follow-ups' },
  move_out_request: { path: '/admin-tenants', label: 'Go to Tenants' },
  occupancy_request: { path: '/admin-notifications', label: 'Go to Requests' },
  household_request: { path: '/admin-notifications', label: 'Go to Requests' },
  lease_extension_request: { path: '/admin-notifications', label: 'Go to Requests' },
  visitor_registration: { path: '/admin-visitors', label: 'Go to Visitors' },
  visitor_overstay: { path: '/admin-visitors', label: 'Go to Visitors' },
};

// Fired after any change to notifications (read, delete, preferences) so every
// bell and list on the page refetches.
export const TENANT_NOTIFICATIONS_EVENT = 'user_notifications_updated';
export const ADMIN_NOTIFICATIONS_EVENT = 'admin_notifications_updated';

export const NOTIFICATION_POLL_MS = 60000;

// Payment alerts (the bell dropdown opens on every page). Polled faster while
// one side is waiting on the other: the tenant after submitting, the admin always.
export const PAYMENT_WATCH_POLL_MS = 20000;

// Titles of the tenant's 'payment' notifications, as the backend writes them
// (settle_invoice / settle_payment_key, reject_payment_proof, paymongo_webhook,
// upload_payment_proof, pay_bill, schedule_payment).
export const TENANT_PAYMENT_ALERT_TITLES = {
  'Payment Received': 'success',
  'Payment Proof Rejected': 'error',
  'Payment Failed': 'error',
};
export const TENANT_PAYMENT_AWAITING_TITLES = ['Payment Submitted', 'Cash Payment Declared', 'Payment Scheduled', 'Payment Being Verified'];

// Admin queue types that mean "a tenant paid; verify it".
export const ADMIN_PAYMENT_ALERT_TYPES = ['payment_verification', 'cash_payment_declared'];

// All admin queue types that require attention when newly arrived.
export const ADMIN_ALERT_TYPES = [
  'payment_verification', 'cash_payment_declared', 'payment', 'refund_request', 'payment_followup', 'document_followup',
  'rent_application', 'maintenance_request', 'cctv_request',
  'parking_reservation', 'service_request', 'inquiry',
  'occupancy_request', 'household_request', 'lease_extension_request',
  'move_out_request', 'visitor_registration', 'visitor_overstay',
  'unit_waitlist',
];

// Fired when the admin header sees a new payment to verify, so AdminPayments reloads.
export const ADMIN_PAYMENTS_EVENT = 'admin_payments_updated';

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
