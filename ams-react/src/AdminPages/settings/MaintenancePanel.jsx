import { faWrench, faBuilding, faInfoCircle, faFileContract } from '@fortawesome/free-solid-svg-icons';
import { SettingsSection, Field, WithUnit, Callout, INPUT, INPUT_NUMBER } from './SettingsSection';

const formatCurrency = (n) => `₱${Number(n).toLocaleString()}`;

export default function MaintenancePanel({ settings, updateSetting }) {
  return (
    <>
      <SettingsSection
        icon={faWrench}
        tone="amber"
        title="Maintenance Budget"
        description="Used for maintenance cost comparison reports and over-budget alerts."
      >
        <Field label="Monthly Budget Allocation" icon={faBuilding}>
          <WithUnit prefix="₱" suffix="/ month">
            <input
              type="number" min="0" step="1000"
              value={settings.maintenanceMonthlyBudget}
              onChange={(e) => updateSetting('maintenanceMonthlyBudget', Number(e.target.value))}
              className={`${INPUT_NUMBER} w-40`}
            />
          </WithUnit>
        </Field>

        <Callout tone="amber" icon={faInfoCircle} title="Budget Summary">
          Monthly allocation: <strong>{formatCurrency(settings.maintenanceMonthlyBudget)}</strong> ·{' '}
          Annual projection: <strong>{formatCurrency(settings.maintenanceMonthlyBudget * 12)}</strong>
        </Callout>
      </SettingsSection>

      <SettingsSection
        icon={faFileContract}
        tone="violet"
        title="Tenant Responsibility Clause"
        description='Referenced when a maintenance request is flagged "Tenant Responsible" — it defines which repairs are chargeable to the tenant.'
      >
        <Field label="Maintenance Responsibility Clause">
          <textarea
            value={settings.tenantResponsibilityClause}
            onChange={(e) => updateSetting('tenantResponsibilityClause', e.target.value)}
            rows={5}
            className={`${INPUT} resize-y leading-relaxed`}
          />
        </Field>
      </SettingsSection>
    </>
  );
}
