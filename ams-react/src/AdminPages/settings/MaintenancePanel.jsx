import { faWrench, faBuilding, faInfoCircle, faFileContract } from '@fortawesome/free-solid-svg-icons';
import { SettingsSection, Field, WithUnit, Callout, INPUT, INPUT_NUMBER } from './SettingsSection';
import { LIMITS, MAX_AMOUNT } from '../../utils/validation';
import CharCount from '../../Components/form/CharCount';
import { blockNonIntegerKeys, numberValue } from '../../Components/form/formHelpers';

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
        <Field label="Monthly Budget Allocation" icon={faBuilding} htmlFor="setting-maintenanceMonthlyBudget">
          <WithUnit prefix="₱" suffix="/ month">
            {/* step used to be 1000, so only whole thousands were valid (₱1,500 was rejected). */}
            <input
              id="setting-maintenanceMonthlyBudget" name="maintenanceMonthlyBudget"
              type="number" inputMode="numeric" min="0" max={MAX_AMOUNT} step="1"
              onKeyDown={blockNonIntegerKeys}
              required
              value={settings.maintenanceMonthlyBudget}
              onChange={(e) => updateSetting('maintenanceMonthlyBudget', numberValue(e))}
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
        <Field label="Maintenance Responsibility Clause" htmlFor="setting-tenantResponsibilityClause">
          <textarea
            id="setting-tenantResponsibilityClause" name="tenantResponsibilityClause"
            maxLength={LIMITS.clause}
            value={settings.tenantResponsibilityClause}
            onChange={(e) => updateSetting('tenantResponsibilityClause', e.target.value)}
            rows={5}
            className={`${INPUT} resize-y leading-relaxed`}
          />
          <CharCount value={settings.tenantResponsibilityClause} max={LIMITS.clause} className="m-0" />
        </Field>
      </SettingsSection>
    </>
  );
}
