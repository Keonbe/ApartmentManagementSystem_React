// ==========================================
// SYSTEM DEFAULTS & SETTINGS PERSISTENCE
// ==========================================
// Shared configuration module for AMS system settings.
// All admin pages import from here to read configurable values.
// Values are retrieved from the backend API.

import api from '../api/axiosConfig';

const DEFAULTS = {
  minLeaseDuration: 3,             // months
  maxRentAheadMonths: 12,          // how far ahead an extension may reach (max 12)
  overdueThresholdDays: 15,        // days before eviction flag
  reservationHoldDays: 7,          // days a unit reservation holds a room
  maintenanceMonthlyBudget: 50000, // PHP
  tenantResponsibilityClause:
    'Per the Terms & Conditions of this rent agreement, the Tenant shall be responsible for any damage or maintenance issues caused by negligence, misuse, or unauthorized modifications to the rented unit. Costs for such repairs will be billed directly to the Tenant and are excluded from the building\'s maintenance budget allocation.',
  paymentMode: 'manual',
  paymentSandboxEnabled: true,
  paymentChGcashSandbox: true,
  paymentChBankSandbox: true,
  paymentChMaya: true,
  paymentChGcashManual: true,
  paymentChBankManual: true,
  paymentChInPerson: true,
  paymongoSecretKey: '',
  paymongoPublicKey: '',
  paymongoWebhookSecret: '',
  maxParkingSlots: 3,                          // total parking slots available
  parkingAllowedVehicleTypes: ['motorcycle'],  // vehicle types eligible for parking reservations
  parkingMonthlyFee: 300,                      // PHP per assigned slot per month
  parkingBillingMode: 'manual',                // 'manual' = admin bills each month, 'auto' = daily sweep bills it
  // Landlord details and payment accounts moved to the contract template
  // (Admin → Edit Contract, backend/contract_template.php).
  roomPreviewMode: 'images',            // public room preview: 'images' or 'floor_plan'
  maxOccupantsPerUnit: 8,                    // main tenant + household members

  // Notification channels. Both switches ship off: email needs SMTP credentials
  // and SMS costs money and needs a carrier-registered sender ID. The 'log'
  // driver runs the whole pipeline and sends nothing, which is the default.
  notificationsEmailEnabled: false,
  notificationsSmsEnabled: false,
  emailDriver: 'log',                        // 'log' (dry run) or 'smtp'
  smtpHost: 'smtp.gmail.com',
  smtpPort: 587,
  smtpUsername: '',
  smtpPassword: '',
  smtpFromName: 'AMS Notifications',
  smtpFromEmail: '',
  smsProvider: 'log',                        // 'log' (dry run) or 'semaphore'
  smsSenderName: 'AMS',
  smsSenderApproved: false,                  // Semaphore: post the sender name only once approved
  smsDailyCap: 100,                          // max SMS sent per day on a real provider; 0 = no cap
  smsApiKey: '',
  notificationsDispatchMode: 'queue',        // 'queue' or 'sync' (demo only)
  notificationsQuietStart: 21,
  notificationsQuietEnd: 7,
  notificationLogRetentionDays: 90,
  smsUnitCost: 0.5
};

// A cleared or garbled cap must not read as 0, which means "no cap".
const parseCap = (value) => {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? DEFAULTS.smsDailyCap : Math.max(0, n);
};

export const getSystemSettings = async () => {
  try {
    const response = await api.get('get_system_settings.php');
    if (response.data.success && response.data.settings) {
      const dbSettings = response.data.settings;
      return {
        minLeaseDuration: parseInt(dbSettings.min_lease_duration || DEFAULTS.minLeaseDuration),
        maxRentAheadMonths: parseInt(dbSettings.max_rent_ahead_months || DEFAULTS.maxRentAheadMonths),
        overdueThresholdDays: parseInt(dbSettings.overdue_threshold_days || DEFAULTS.overdueThresholdDays),
        reservationHoldDays: parseInt(dbSettings.reservation_hold_days || DEFAULTS.reservationHoldDays),
        maintenanceMonthlyBudget: parseFloat(dbSettings.maintenance_monthly_budget || DEFAULTS.maintenanceMonthlyBudget),
        tenantResponsibilityClause: dbSettings.tenant_responsibility_clause || DEFAULTS.tenantResponsibilityClause,
        paymentMode: (dbSettings.payment_mode === 'sandbox' || dbSettings.payment_mode === 'manual') ? dbSettings.payment_mode : DEFAULTS.paymentMode,
        paymentSandboxEnabled: dbSettings.payment_sandbox_enabled === '1' || dbSettings.payment_sandbox_enabled === 1 || dbSettings.payment_sandbox_enabled === true,
        paymentChGcashSandbox: dbSettings.payment_ch_gcash_sandbox === '1' || dbSettings.payment_ch_gcash_sandbox === 1 || dbSettings.payment_ch_gcash_sandbox === true,
        paymentChBankSandbox: dbSettings.payment_ch_bank_sandbox === '1' || dbSettings.payment_ch_bank_sandbox === 1 || dbSettings.payment_ch_bank_sandbox === true,
        paymentChMaya: dbSettings.payment_ch_maya === '1' || dbSettings.payment_ch_maya === 1 || dbSettings.payment_ch_maya === true,
        paymentChGcashManual: dbSettings.payment_ch_gcash_manual === '1' || dbSettings.payment_ch_gcash_manual === 1 || dbSettings.payment_ch_gcash_manual === true,
        paymentChBankManual: dbSettings.payment_ch_bank_manual === '1' || dbSettings.payment_ch_bank_manual === 1 || dbSettings.payment_ch_bank_manual === true,
        paymentChInPerson: dbSettings.payment_ch_in_person === '1' || dbSettings.payment_ch_in_person === 1 || dbSettings.payment_ch_in_person === true,
        paymongoSecretKey: dbSettings.paymongo_secret_key || DEFAULTS.paymongoSecretKey,
        paymongoPublicKey: dbSettings.paymongo_public_key || DEFAULTS.paymongoPublicKey,
        paymongoWebhookSecret: dbSettings.paymongo_webhook_secret || DEFAULTS.paymongoWebhookSecret,
        maxParkingSlots: parseInt(dbSettings.max_parking_slots || DEFAULTS.maxParkingSlots),
        parkingAllowedVehicleTypes: (() => {
          const raw = dbSettings.parking_allowed_vehicle_types;
          if (Array.isArray(raw)) return raw;
          if (typeof raw === 'string') {
            try {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) return parsed;
            } catch { /* fall through to default */ }
          }
          return DEFAULTS.parkingAllowedVehicleTypes;
        })(),
        parkingMonthlyFee: parseFloat(dbSettings.parking_monthly_fee || DEFAULTS.parkingMonthlyFee),
        parkingBillingMode: dbSettings.parking_billing_mode === 'auto' ? 'auto' : 'manual',
        roomPreviewMode: dbSettings.room_preview_mode === 'floor_plan' ? 'floor_plan' : 'images',
        maxOccupantsPerUnit: parseInt(dbSettings.max_occupants_per_unit || DEFAULTS.maxOccupantsPerUnit),

        // Notification channels. Credential fields arrive masked (••••1234) for
        // an admin and absent for anyone else; posting a mask back is treated
        // as "unchanged" by the backend, so they can be bound to inputs safely.
        notificationsEmailEnabled: dbSettings.notifications_email_enabled === '1' || dbSettings.notifications_email_enabled === 1,
        notificationsSmsEnabled: dbSettings.notifications_sms_enabled === '1' || dbSettings.notifications_sms_enabled === 1,
        emailDriver: dbSettings.email_driver === 'smtp' ? 'smtp' : 'log',
        smtpHost: dbSettings.smtp_host ?? DEFAULTS.smtpHost,
        smtpPort: parseInt(dbSettings.smtp_port || DEFAULTS.smtpPort),
        smtpUsername: dbSettings.smtp_username ?? '',
        smtpPassword: dbSettings.smtp_password ?? '',
        smtpFromName: dbSettings.smtp_from_name ?? DEFAULTS.smtpFromName,
        smtpFromEmail: dbSettings.smtp_from_email ?? '',
        smsProvider: dbSettings.sms_provider === 'semaphore' ? 'semaphore' : 'log',
        smsSenderName: dbSettings.sms_sender_name ?? DEFAULTS.smsSenderName,
        smsSenderApproved: dbSettings.sms_sender_approved === '1' || dbSettings.sms_sender_approved === 1,
        smsDailyCap: parseCap(dbSettings.sms_daily_cap),
        smsApiKey: dbSettings.sms_api_key ?? '',
        notificationsDispatchMode: dbSettings.notifications_dispatch_mode === 'sync' ? 'sync' : 'queue',
        notificationsQuietStart: parseInt(dbSettings.notifications_quiet_start ?? DEFAULTS.notificationsQuietStart),
        notificationsQuietEnd: parseInt(dbSettings.notifications_quiet_end ?? DEFAULTS.notificationsQuietEnd),
        notificationLogRetentionDays: parseInt(dbSettings.notification_log_retention_days || DEFAULTS.notificationLogRetentionDays),
        smsUnitCost: parseFloat(dbSettings.sms_unit_cost || DEFAULTS.smsUnitCost),
      };
    }
  } catch (e) {
    console.warn('Failed to load system settings from backend:', e);
  }
  return { ...DEFAULTS };
};

export const saveSystemSettings = async (settings) => {
  try {
    const payload = {
      min_lease_duration: settings.minLeaseDuration,
      max_rent_ahead_months: String(settings.maxRentAheadMonths ?? DEFAULTS.maxRentAheadMonths),
      overdue_threshold_days: settings.overdueThresholdDays,
      reservation_hold_days: settings.reservationHoldDays,
      maintenance_monthly_budget: settings.maintenanceMonthlyBudget,
      tenant_responsibility_clause: settings.tenantResponsibilityClause,
      payment_mode: settings.paymentMode === 'sandbox' ? 'sandbox' : 'manual',
      payment_sandbox_enabled: settings.paymentSandboxEnabled ? '1' : '0',
      payment_ch_gcash_sandbox: settings.paymentChGcashSandbox ? '1' : '0',
      payment_ch_bank_sandbox: settings.paymentChBankSandbox ? '1' : '0',
      payment_ch_maya: settings.paymentChMaya ? '1' : '0',
      payment_ch_gcash_manual: settings.paymentChGcashManual ? '1' : '0',
      payment_ch_bank_manual: settings.paymentChBankManual ? '1' : '0',
      payment_ch_in_person: settings.paymentChInPerson ? '1' : '0',
      paymongo_secret_key: settings.paymongoSecretKey || '',
      paymongo_public_key: settings.paymongoPublicKey || '',
      paymongo_webhook_secret: settings.paymongoWebhookSecret || '',
      max_parking_slots: settings.maxParkingSlots,
      parking_allowed_vehicle_types: JSON.stringify(settings.parkingAllowedVehicleTypes || []),
      parking_monthly_fee: String(settings.parkingMonthlyFee ?? DEFAULTS.parkingMonthlyFee),
      parking_billing_mode: settings.parkingBillingMode === 'auto' ? 'auto' : 'manual',
      room_preview_mode: settings.roomPreviewMode === 'floor_plan' ? 'floor_plan' : 'images',
      max_occupants_per_unit: String(settings.maxOccupantsPerUnit ?? DEFAULTS.maxOccupantsPerUnit),

      // Notification channels. Credentials go back exactly as loaded: if the
      // admin did not edit a field it still holds the ••••1234 mask, which
      // update_system_settings.php skips rather than storing.
      notifications_email_enabled: settings.notificationsEmailEnabled ? '1' : '0',
      notifications_sms_enabled: settings.notificationsSmsEnabled ? '1' : '0',
      email_driver: settings.emailDriver === 'smtp' ? 'smtp' : 'log',
      smtp_host: settings.smtpHost || DEFAULTS.smtpHost,
      smtp_port: String(settings.smtpPort ?? DEFAULTS.smtpPort),
      smtp_username: settings.smtpUsername || '',
      smtp_password: settings.smtpPassword || '',
      smtp_from_name: settings.smtpFromName || DEFAULTS.smtpFromName,
      smtp_from_email: settings.smtpFromEmail || '',
      sms_provider: settings.smsProvider || DEFAULTS.smsProvider,
      sms_sender_name: settings.smsSenderName || DEFAULTS.smsSenderName,
      sms_sender_approved: settings.smsSenderApproved ? '1' : '0',
      sms_daily_cap: String(parseCap(settings.smsDailyCap)),
      sms_api_key: settings.smsApiKey || '',
      notifications_dispatch_mode: settings.notificationsDispatchMode === 'sync' ? 'sync' : 'queue',
      notifications_quiet_start: String(settings.notificationsQuietStart ?? DEFAULTS.notificationsQuietStart),
      notifications_quiet_end: String(settings.notificationsQuietEnd ?? DEFAULTS.notificationsQuietEnd),
      notification_log_retention_days: String(settings.notificationLogRetentionDays ?? DEFAULTS.notificationLogRetentionDays),
      sms_unit_cost: String(settings.smsUnitCost ?? DEFAULTS.smsUnitCost),
    };
    await api.post('update_system_settings.php', payload);
  } catch (e) {
    console.warn('Failed to save system settings to backend:', e);
    throw e;
  }
};

export default DEFAULTS;
