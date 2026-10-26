import { faUserShield, faFileContract, faCreditCard, faCar, faBell, faWrench, faClipboardList, faLayerGroup, faBolt, faChildren, faSquareParking, faIdCard } from '@fortawesome/free-solid-svg-icons';

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
    description: 'Rental rules, occupancy limits and the public room preview.',
    keys: ['minLeaseDuration', 'maxRentAheadMonths', 'reservationHoldDays', 'moveOutMinNoticeDays', 'moveOutMaxNoticeDays', 'maxOccupantsPerUnit', 'roomPreviewMode'],
  },
  {
    id: 'requirements',
    label: 'Application Requirements',
    icon: faIdCard,
    description: 'The documents an applicant uploads with the rent application, and which are required.',
  },
  {
    id: 'payments',
    label: 'Payments',
    icon: faCreditCard,
    description: 'Overdue and eviction policy, payment channels and the PayMongo gateway.',
    keys: [
      'paymentWindowDays',
      'overdueThresholdDays',
      'paymentMode', 'paymentSandboxEnabled',
      'paymentChGcashManual', 'paymentChBankManual', 'paymentChInPerson',
      'paymentChGcashSandbox', 'paymentChBankSandbox', 'paymentChMaya',
      'duplicateReferencePolicy',
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
  {
    id: 'floor-rent',
    label: 'Floor Rent',
    icon: faLayerGroup,
    description: "A fixed monthly rent for each floor. New units start at their floor's rent.",
  },
  {
    id: 'utility-types',
    label: 'Utilities',
    icon: faBolt,
    description: 'Other utilities beyond water and electricity, such as internet or gas.',
  },
  {
    id: 'parking-rules',
    label: 'Parking Rules',
    icon: faSquareParking,
    description: 'Rules shown before a parking reservation is submitted.',
  },
  {
    id: 'minors',
    label: 'Children & Pets',
    icon: faChildren,
    description: 'Age categories for infants, toddlers and minors, and the rules for children and pets.',
  },
  {
    id: 'house-rules',
    label: 'House Rules',
    icon: faClipboardList,
    description: 'Manage the policies displayed on the public apartment preview.',
  },
];

export const SETTINGS_TAB_IDS = SETTINGS_TABS.map((t) => t.id);

// Tabs that save on their own (their panel talks to its own endpoints), so the
// shared settings form and its save bar stay out of the way.
export const SELF_SAVING_TAB_IDS = ['house-rules', 'floor-rent', 'utility-types', 'parking-rules', 'minors', 'requirements'];
