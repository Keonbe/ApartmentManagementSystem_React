// One row per plain system setting: how it is read from get_system_settings.php,
// what it defaults to, and how it is written back to update_system_settings.php
// (which holds the matching bounds in its $SETTING_RULES). Structured settings
// (the QR Ph slots, the Glass backdrop, the home page
// text) keep their own parsers in systemSettings.js.
//
// Pure (no api/axios import), so the parsing can be checked in plain Node.
//
//   type    int | float | bool | enum | text | secret
//   key     the camelCase name the app uses     db   the system_settings key
//   min     int/float: parsed values below it are raised to it
//   values  enum: the allowed values (anything else reads as the default)
//   missingIsOn   bool: a setting with no row yet reads as on (default is read as off)
//   emptyIsDefault   text: a blank value reads and saves as the default
//   readOnly   not part of the save payload (no UI writes it)

export const SETTINGS_SCHEMA = [
  { key: 'minLeaseDuration', db: 'min_lease_duration', type: 'int', default: 3 },                    // months
  { key: 'maxRentAheadMonths', db: 'max_rent_ahead_months', type: 'int', default: 12 },              // how far ahead an extension may reach (max 12)
  { key: 'paymentWindowDays', db: 'payment_window_days', type: 'int', default: 3 },                  // days to pay before an unpaid checkout / move-in invoice lapses
  { key: 'overdueThresholdDays', db: 'overdue_threshold_days', type: 'int', default: 15 },          // days before the eviction flag
  { key: 'reservationHoldDays', db: 'reservation_hold_days', type: 'int', default: 7 },             // days a unit reservation holds a room
  { key: 'moveOutMinNoticeDays', db: 'move_out_min_notice_days', type: 'int', default: 15 },        // a move-out date is at least this many days away
  { key: 'moveOutMaxNoticeDays', db: 'move_out_max_notice_days', type: 'int', default: 30 },        // ...and at most this many
  { key: 'moveInMinDays', db: 'move_in_min_days', type: 'int', default: 0 },                        // a preferred move-in date is at least this many days away (0 = today)
  { key: 'moveInMaxDays', db: 'move_in_max_days', type: 'int', default: 365 },                      // ...and at most this many
  { key: 'inquiryMoveInMaxMonths', db: 'inquiry_move_in_max_months', type: 'int', default: 6, min: 1 }, // Send an Inquiry: move-in date today to +N months
  { key: 'leaseEndReminderDays', db: 'lease_end_reminder_days', type: 'int', default: 30 },        // a term is "ending soon" this many days before it ends (0 = only on the day)
  // Other Settings → Contract End (ranges match update_system_settings.php).
  { key: 'extensionDeadlineDays', db: 'extension_deadline_days', type: 'int', default: 0, min: 0 }, // tenants may ask to extend until this many days before the end; 0 = no deadline
  { key: 'leaseEndRemindersEnabled', db: 'lease_end_reminders_enabled', type: 'bool', default: true, missingIsOn: true }, // the rent-end reminder (in-app)...
  { key: 'leaseEndReminderEmail', db: 'lease_end_reminder_email', type: 'bool', default: true, missingIsOn: true },       // ...also by email
  { key: 'leaseEndReminderSms', db: 'lease_end_reminder_sms', type: 'bool', default: true, missingIsOn: true },         // ...also by SMS
  { key: 'upcomingRoomsEnabled', db: 'upcoming_rooms_enabled', type: 'bool', default: true, missingIsOn: true },       // Preview lists units that will free up
  { key: 'languageSwitchEnabled', db: 'language_switch_enabled', type: 'bool', default: true, missingIsOn: true },     // tenants and guests see the EN / FIL switch; off = English only
  { key: 'maintenanceMonthlyBudget', db: 'maintenance_monthly_budget', type: 'float', default: 50000 }, // PHP
  {
    key: 'tenantResponsibilityClause', db: 'tenant_responsibility_clause', type: 'text', emptyIsDefault: true,
    default: 'Per the Terms & Conditions of this rent agreement, the Tenant shall be responsible for any damage or maintenance issues caused by negligence, misuse, or unauthorized modifications to the rented unit. Costs for such repairs will be billed directly to the Tenant and are excluded from the building\'s maintenance budget allocation.',
  },

  { key: 'paymentMode', db: 'payment_mode', type: 'enum', values: ['manual', 'sandbox', 'both'], default: 'manual' },
  { key: 'paymentSandboxEnabled', db: 'payment_sandbox_enabled', type: 'bool', default: true },
  { key: 'paymentChGcashSandbox', db: 'payment_ch_gcash_sandbox', type: 'bool', default: true },
  { key: 'paymentChBankSandbox', db: 'payment_ch_bank_sandbox', type: 'bool', default: true },
  { key: 'paymentChMaya', db: 'payment_ch_maya', type: 'bool', default: true },
  { key: 'paymentChGcashManual', db: 'payment_ch_gcash_manual', type: 'bool', default: true },
  { key: 'paymentChBankManual', db: 'payment_ch_bank_manual', type: 'bool', default: true },
  { key: 'paymentChInPerson', db: 'payment_ch_in_person', type: 'bool', default: true },
  { key: 'paymentChQrphManual', db: 'payment_ch_qrph_manual', type: 'bool', default: true, missingIsOn: true },
  { key: 'qrphActiveSlot', db: 'qrph_active_slot', type: 'int', default: 1, min: 1 },
  { key: 'duplicateReferencePolicy', db: 'duplicate_reference_policy', type: 'enum', values: ['warn', 'block'], default: 'warn' }, // reused GCash / bank reference: warn = flag to the admin, block = refuse
  { key: 'paymongoSecretKey', db: 'paymongo_secret_key', type: 'secret', default: '' },
  { key: 'paymongoPublicKey', db: 'paymongo_public_key', type: 'secret', default: '' },
  { key: 'paymongoWebhookSecret', db: 'paymongo_webhook_secret', type: 'secret', default: '' },

  { key: 'parkingMonthlyFee', db: 'parking_monthly_fee', type: 'float', default: 300 },              // PHP per assigned slot per month
  { key: 'parkingBillingMode', db: 'parking_billing_mode', type: 'enum', values: ['manual', 'auto'], default: 'manual' }, // manual = admin bills each month, auto = the daily sweep bills it
  // Admin → Parking → gear (the slots themselves are in parking_slots.php).
  { key: 'parkingFree', db: 'parking_free', type: 'bool', default: false },                          // new requests cost nothing and are never billed
  { key: 'parkingMaxDurationMonths', db: 'parking_max_duration_months', type: 'int', default: 6, min: 1 }, // longest permit a tenant may ask for (1-12)
  { key: 'parkingMaxPerTenant', db: 'parking_max_per_tenant', type: 'int', default: 1, min: 1 },   // open reservations per tenant (1-5)
  // Landlord details and payment accounts moved to the contract template
  // (Admin → Edit Contract, backend/contract_template.php).
  { key: 'roomPreviewMode', db: 'room_preview_mode', type: 'enum', values: ['images', 'floor_plan'], default: 'images' }, // public room preview
  { key: 'maxOccupantsPerUnit', db: 'max_occupants_per_unit', type: 'int', default: 8 },              // main tenant + household members
  { key: 'occupantSurchargePerPerson', db: 'occupant_surcharge_per_person', type: 'float', default: 1000, min: 0 }, // added to the rent for each occupant above includedOccupants
  { key: 'includedOccupants', db: 'included_occupants', type: 'int', default: 4, min: 1 },          // people the room rate covers; more (up to maxOccupantsPerUnit) pay the charge above

  // Notification channels. Both switches ship off: email needs SMTP credentials
  // and SMS costs money and needs a carrier-registered sender ID. The 'log'
  // driver runs the whole pipeline and sends nothing, which is the default.
  { key: 'notificationsEmailEnabled', db: 'notifications_email_enabled', type: 'bool', default: false },
  { key: 'notificationsSmsEnabled', db: 'notifications_sms_enabled', type: 'bool', default: false },
  { key: 'emailDriver', db: 'email_driver', type: 'enum', values: ['log', 'smtp'], default: 'log' },  // log = dry run
  { key: 'smtpHost', db: 'smtp_host', type: 'text', emptyIsDefault: true, default: 'smtp.gmail.com' },
  { key: 'smtpPort', db: 'smtp_port', type: 'int', default: 587 },
  { key: 'smtpUsername', db: 'smtp_username', type: 'secret', default: '' },
  { key: 'smtpPassword', db: 'smtp_password', type: 'secret', default: '' },
  { key: 'smtpFromName', db: 'smtp_from_name', type: 'text', emptyIsDefault: true, default: 'AMS Notifications' },
  { key: 'smtpFromEmail', db: 'smtp_from_email', type: 'secret', default: '' },
  { key: 'smsProvider', db: 'sms_provider', type: 'enum', values: ['log', 'semaphore'], default: 'log' }, // log = dry run
  { key: 'smsSenderName', db: 'sms_sender_name', type: 'text', emptyIsDefault: true, default: 'AMS' },
  { key: 'smsSenderApproved', db: 'sms_sender_approved', type: 'bool', default: false },              // Semaphore: post the sender name only once approved
  { key: 'smsDailyCap', db: 'sms_daily_cap', type: 'int', default: 100, min: 0 },                    // max SMS a day on a real provider; 0 = no cap
  { key: 'smsApiKey', db: 'sms_api_key', type: 'secret', default: '' },
  { key: 'notificationsDispatchMode', db: 'notifications_dispatch_mode', type: 'enum', values: ['queue', 'sync'], default: 'queue' }, // sync = demo only
  { key: 'notificationsQuietStart', db: 'notifications_quiet_start', type: 'int', default: 21 },
  { key: 'notificationsQuietEnd', db: 'notifications_quiet_end', type: 'int', default: 7 },
  { key: 'notificationLogRetentionDays', db: 'notification_log_retention_days', type: 'int', default: 90 }, // 0 = keep forever
  { key: 'smsUnitCost', db: 'sms_unit_cost', type: 'float', default: 0.5 },
];

const SCHEMA_BY_KEY = Object.fromEntries(SETTINGS_SCHEMA.map((row) => [row.key, row]));

export const SCHEMA_DEFAULTS = Object.fromEntries(SETTINGS_SCHEMA.map((row) => [row.key, row.default]));

// A stored boolean is '1' or 'true' (the service switches are stored 'true' / 'false').
export const isSettingOn = (raw) => raw === '1' || raw === 1 || raw === true || raw === 'true';

// A service switch (service_*_active) is off only when stored 'false'; a switch
// with no row yet is on. Mirrors the backend gates (`=== 'false'`).
export const isServiceSwitchOn = (raw) => raw !== 'false' && raw !== false;

// A whole number / amount, or the fallback when the value is missing or garbled.
// 0 is a real value, so there is no `||` here.
const numberOr = (raw, fallback, parse) => {
  const n = parse(raw);
  return Number.isFinite(n) ? n : fallback;
};

const parseOne = (row, raw) => {
  switch (row.type) {
    case 'int':
    case 'float': {
      const n = numberOr(raw, row.default, row.type === 'int' ? (v) => parseInt(v, 10) : parseFloat);
      return row.min !== undefined ? Math.max(row.min, n) : n;
    }
    case 'bool':
      return raw === undefined || raw === null ? Boolean(row.missingIsOn) : isSettingOn(raw);
    case 'enum':
      return row.values.includes(raw) ? raw : row.default;
    case 'text':
      return row.emptyIsDefault ? (raw || row.default) : (raw ?? row.default);
    default:
      return raw ?? row.default;
  }
};

const encodeOne = (row, value) => {
  switch (row.type) {
    case 'int':
    case 'float': {
      const v = value ?? row.default;
      return String(row.min !== undefined && Number.isFinite(Number(v)) ? Math.max(row.min, Number(v)) : v);
    }
    case 'bool':
      return value ? '1' : '0';
    case 'enum':
      return row.values.includes(value) ? value : row.default;
    case 'text':
      return row.emptyIsDefault ? (value || row.default) : (value ?? row.default);
    default:
      return value || '';
  }
};

// The settings object the app uses, from the get_system_settings.php `settings` map.
export const parseSchemaSettings = (db = {}) =>
  Object.fromEntries(SETTINGS_SCHEMA.map((row) => [row.key, parseOne(row, db[row.db])]));

// The update_system_settings.php payload for the schema settings: every row that
// is not read-only, as the string the endpoint expects.
export const encodeSchemaSettings = (settings = {}) =>
  Object.fromEntries(SETTINGS_SCHEMA.filter((row) => !row.readOnly)
    .map((row) => [row.db, encodeOne(row, settings[row.key])]));

export const schemaRow = (key) => SCHEMA_BY_KEY[key];
