// ==========================================
// SYSTEM DEFAULTS & SETTINGS PERSISTENCE
// ==========================================
// Shared configuration module for AMS system settings.
// All admin pages import from here to read configurable values.
// Values are persisted in localStorage and editable via AdminAccountSettings.

const DEFAULTS = {
  minLeaseDuration: 3,             // months
  overdueThresholdDays: 15,        // days before eviction flag
  autoFlagEviction: true,          // auto-flag when threshold exceeded
  maintenanceMonthlyBudget: 50000, // PHP
  tenantResponsibilityClause:
    'Per the Terms & Conditions of this lease agreement, the Tenant shall be responsible for any damage or maintenance issues caused by negligence, misuse, or unauthorized modifications to the leased unit. Costs for such repairs will be billed directly to the Tenant and are excluded from the building\'s maintenance budget allocation.',
};

const STORAGE_KEY = 'ams_system_settings';

export const getSystemSettings = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULTS, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.warn('Failed to load system settings from localStorage:', e);
  }
  return { ...DEFAULTS };
};

export const saveSystemSettings = (settings) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save system settings to localStorage:', e);
  }
};

export default DEFAULTS;
