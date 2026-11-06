import { faUserShield, faFileContract, faCreditCard, faCar, faBell, faWrench, faClipboardList, faLayerGroup, faBolt, faChildren, faSquareParking, faIdCard, faImage, faHouse, faAddressCard, faVideo, faHourglassHalf, faEye, faKey, faLanguage } from '@fortawesome/free-solid-svg-icons';

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
    keys: ['minLeaseDuration', 'maxRentAheadMonths', 'reservationHoldDays', 'moveOutMinNoticeDays', 'moveOutMaxNoticeDays', 'moveInMinDays', 'moveInMaxDays', 'maxOccupantsPerUnit', 'roomPreviewMode'],
  },
  {
    id: 'requirements',
    label: 'Application Requirements',
    icon: faIdCard,
    description: 'The documents an applicant uploads with the rent application, and which are required.',
  },
  {
    id: 'payments',
    label: 'Payment Options',
    icon: faCreditCard,
    description: 'Enable or disable payment options, configure QR Ph slots and active QR code, overdue policy, and gateway settings.',
    keys: [
      'paymentWindowDays',
      'overdueThresholdDays',
      'paymentMode', 'paymentSandboxEnabled',
      'paymentChGcashManual', 'paymentChBankManual', 'paymentChQrphManual', 'paymentChInPerson',
      'paymentChGcashSandbox', 'paymentChBankSandbox', 'paymentChMaya',
      'duplicateReferencePolicy',
      'paymongoSecretKey', 'paymongoPublicKey', 'paymongoWebhookSecret',
      'qrphSlots', 'qrphActiveSlot',
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
    id: 'glass-mode',
    label: 'Glass Mode',
    icon: faImage,
    description: "The photo, tint and blur behind tenant pages in the Glass theme, and on Home.",
    keys: ['glassBgImage', 'glassOverlayOpacity', 'glassBlur', 'glassTint'],
  },
  {
    id: 'language',
    label: 'Language',
    icon: faLanguage,
    description: 'Whether tenants and guests can switch the site between English and Filipino.',
    keys: ['languageSwitchEnabled'],
  },
  {
    id: 'contract-end',
    label: 'Contract End',
    icon: faHourglassHalf,
    description: 'The deadline for extension requests, the rent-end reminder and its channels, and upcoming rooms on the Preview page.',
    keys: ['extensionDeadlineDays', 'leaseEndRemindersEnabled', 'leaseEndReminderDays', 'leaseEndReminderEmail', 'leaseEndReminderSms', 'upcomingRoomsEnabled'],
  },
  {
    id: 'preview-page',
    label: 'Preview Page',
    icon: faEye,
    description: 'The photo, badge, title, location and feature chips at the top of the public Preview page.',
    keys: ['previewHero'],
  },
  {
    id: 'home-page',
    label: 'Home Page',
    icon: faHouse,
    description: 'The badge, heading, location and description on the Home page, in English and Filipino, and which of them show.',
    keys: ['homeContent'],
  },
  {
    id: 'site',
    label: 'Site Maintenance',
    icon: faAddressCard,
    description: "The owner's phone number and addresses, and the GCash and bank accounts tenants pay to.",
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
    id: 'cctv',
    label: 'CCTV',
    icon: faVideo,
    description: 'The camera locations and incident types on the CCTV request form, and how far back footage is kept.',
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
    id: 'sign-in-codes',
    label: 'Sign-in Codes',
    icon: faKey,
    description: 'The emailed code a tenant enters when signing in on a new device: on or off for everyone, and per account.',
  },
  {
    id: 'house-rules',
    label: 'House Rules',
    icon: faClipboardList,
    description: 'Manage the policies displayed on the public apartment preview.',
  },
];

export const SETTINGS_TAB_IDS = SETTINGS_TABS.map((t) => t.id);

export const OTHER_SETTINGS_TABS = SETTINGS_TABS.filter(
  (t) => !['account', 'requirements', 'payments'].includes(t.id)
);
export const OTHER_SETTINGS_TAB_IDS = OTHER_SETTINGS_TABS.map((t) => t.id);

export const OTHER_SETTINGS_GROUPS = [
  {
    key: 'leasing',
    title: 'Leasing & Rates',
    accentDot: 'bg-indigo-500',
    tabIds: ['leasing', 'contract-end', 'floor-rent', 'utility-types', 'parking'],
  },
  {
    key: 'operations',
    title: 'Operations & Tenant Site',
    accentDot: 'bg-sky-500',
    tabIds: ['site', 'notifications', 'maintenance', 'cctv', 'home-page', 'preview-page', 'glass-mode', 'language'],
  },
  {
    key: 'policies',
    title: 'Rules & Policies',
    accentDot: 'bg-emerald-500',
    tabIds: ['house-rules', 'parking-rules', 'minors', 'sign-in-codes'],
  },
];

// Tabs that save on their own (their panel talks to its own endpoints), so the
// shared settings form and its save bar stay out of the way.
export const SELF_SAVING_TAB_IDS = ['site', 'house-rules','floor-rent', 'utility-types', 'cctv', 'parking-rules', 'minors', 'requirements', 'sign-in-codes'];
