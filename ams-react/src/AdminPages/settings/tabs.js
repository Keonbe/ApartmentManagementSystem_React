import { faUserShield, faFileContract, faCreditCard, faCar, faBell, faWrench } from '@fortawesome/free-solid-svg-icons';

// The Settings page's sections. `keys` are the systemSettings.js fields each
// tab edits: they drive the per-tab "unsaved changes" dot, so a field added to
// a panel must be listed here too. Account has none — its profile and password
// forms save on their own, not through system settings.
export const SETTINGS_TABS = [
  {
    id: 'account',
    label: 'Account',
    icon: faUserShield,
    description: 'Your administrator profile and password.',
  },
  {
    id: 'leasing',
    label: 'Rental',
    icon: faFileContract,
    description: 'Rent rules, occupancy limits and the details printed on rent contracts.',
    keys: [
      'minLeaseDuration', 'reservationHoldDays', 'maxOccupantsPerUnit', 'roomPreviewMode',
      'landlordName', 'landlordAddress', 'propertyAddress', 'landlordContact',
    ],
  },
  {
    id: 'payments',
    label: 'Payments',
    icon: faCreditCard,
    description: 'Overdue and eviction policy, payment channels and the PayMongo gateway.',
    keys: [
      'overdueThresholdDays', 'autoFlagEviction',
      'paymentMode', 'paymentSandboxEnabled',
      'paymentChGcashManual', 'paymentChBankManual', 'paymentChInPerson',
      'paymentChGcashSandbox', 'paymentChBankSandbox', 'paymentChMaya',
      'paymongoSecretKey', 'paymongoPublicKey', 'paymongoWebhookSecret',
    ],
  },
  {
    id: 'parking',
    label: 'Parking',
    icon: faCar,
    description: 'Slot capacity, the monthly fee and how it is billed.',
    keys: ['maxParkingSlots', 'parkingMonthlyFee', 'parkingBillingMode', 'parkingAllowedVehicleTypes'],
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: faBell,
    description: 'SMS and email delivery to tenants.',
    keys: [
      'notificationsEmailEnabled', 'emailDriver', 'smtpFromName', 'smtpHost', 'smtpPort',
      'smtpUsername', 'smtpPassword', 'smtpFromEmail',
      'notificationsSmsEnabled', 'smsProvider', 'smsSenderName', 'smsSenderApproved', 'smsApiKey', 'smsDailyCap',
      'notificationsDispatchMode', 'notificationsQuietStart', 'notificationsQuietEnd',
      'notificationLogRetentionDays', 'smsUnitCost',
    ],
  },
  {
    id: 'maintenance',
    label: 'Maintenance',
    icon: faWrench,
    description: 'The monthly maintenance budget and the tenant-responsibility clause.',
    keys: ['maintenanceMonthlyBudget', 'tenantResponsibilityClause'],
  },
];

export const SETTINGS_TAB_IDS = SETTINGS_TABS.map((t) => t.id);
