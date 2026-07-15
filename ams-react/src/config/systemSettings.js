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
};

const STORAGE_KEY = 'ams_system_settings';

export const getSystemSettings = async () => {
  try {
    const response = await api.get('get_system_settings.php');
    if (response.data.success && response.data.settings) {
      const dbSettings = response.data.settings;
      return {
        minLeaseDuration: parseInt(dbSettings.min_lease_duration || DEFAULTS.minLeaseDuration),
        overdueThresholdDays: parseInt(dbSettings.overdue_threshold_days || DEFAULTS.overdueThresholdDays),
        autoFlagEviction: (dbSettings.auto_flag_eviction === 1 || dbSettings.auto_flag_eviction === true || dbSettings.auto_flag_eviction === '1'),
        maintenanceMonthlyBudget: parseFloat(dbSettings.maintenance_monthly_budget || DEFAULTS.maintenanceMonthlyBudget),
        tenantResponsibilityClause: dbSettings.tenant_responsibility_clause || DEFAULTS.tenantResponsibilityClause
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
      tenant_responsibility_clause: settings.tenantResponsibilityClause
    };
    await api.post('update_system_settings.php', payload);
  } catch (e) {
    console.warn('Failed to save system settings to backend:', e);
    throw e;
  }
};

export default DEFAULTS;
