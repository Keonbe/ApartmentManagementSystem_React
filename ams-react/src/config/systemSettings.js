// ==========================================
// SYSTEM DEFAULTS & SETTINGS PERSISTENCE
// ==========================================
// Shared configuration module for AMS system settings.
// All admin pages import from here to read configurable values.
// Values are retrieved from the backend API.

import api from '../api/axiosConfig';

const DEFAULTS = {
  minLeaseDuration: 3,             // months
  overdueThresholdDays: 15,        // days before eviction flag
  autoFlagEviction: true,          // auto-flag when threshold exceeded
  maintenanceMonthlyBudget: 50000, // PHP
  tenantResponsibilityClause:
    'Per the Terms & Conditions of this lease agreement, the Tenant shall be responsible for any damage or maintenance issues caused by negligence, misuse, or unauthorized modifications to the leased unit. Costs for such repairs will be billed directly to the Tenant and are excluded from the building\'s maintenance budget allocation.',
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
  paymongoWebhookSecret: ''
};


export const getSystemSettings = async () => {
  try {
    const response = await api.get('get_system_settings.php');
    if (response.data.success && response.data.settings) {
      const dbSettings = response.data.settings;
      return {
        minLeaseDuration: parseInt(dbSettings.min_lease_duration || dbSettings.minLeaseDuration || DEFAULTS.minLeaseDuration),
        overdueThresholdDays: parseInt(dbSettings.overdue_threshold_days || dbSettings.overdueThresholdDays || DEFAULTS.overdueThresholdDays),
        autoFlagEviction: (dbSettings.auto_flag_eviction === 1 || dbSettings.auto_flag_eviction === true || dbSettings.auto_flag_eviction === '1' || dbSettings.autoFlagEviction === true),
        maintenanceMonthlyBudget: parseFloat(dbSettings.maintenance_monthly_budget || dbSettings.maintenanceMonthlyBudget || DEFAULTS.maintenanceMonthlyBudget),
        tenantResponsibilityClause: dbSettings.tenant_responsibility_clause || dbSettings.tenantResponsibilityClause || DEFAULTS.tenantResponsibilityClause,
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
      overdue_threshold_days: settings.overdueThresholdDays,
      auto_flag_eviction: settings.autoFlagEviction ? 1 : 0,
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
    };
    await api.post('update_system_settings.php', payload);
  } catch (e) {
    console.warn('Failed to save system settings to backend:', e);
    throw e;
  }
};

export default DEFAULTS;
