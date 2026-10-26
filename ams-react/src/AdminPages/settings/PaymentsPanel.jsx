import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faExclamationTriangle, faDollarSign, faShieldAlt, faInfoCircle, faCreditCard, faLock,
} from '@fortawesome/free-solid-svg-icons';
import { SettingsSection, Field, WithUnit, Callout, INPUT, INPUT_MONO, INPUT_NUMBER, CHECKBOX } from './SettingsSection';
import { LIMITS } from '../../utils/validation';
import { blockNonIntegerKeys, numberValue } from '../../Components/form/formHelpers';

const PAYMENT_MODES = [
  { value: 'manual', label: 'Manual only', hint: 'Proof upload / in person' },
  { value: 'sandbox', label: 'Sandbox only', hint: 'PayMongo test mode' },
];

// A channel outside the current mode's family is never offered to tenants
// (get_payment_channels.php), so it renders unchecked and locked; the saved
// value is kept and comes back when the mode is switched again.
function ChannelRow({ label, sublabel, checked, onChange, disabled = false }) {
  return (
    <label className={`flex items-center justify-between gap-3 p-2 rounded-lg transition-colors ${
      disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50 cursor-pointer'
    }`}>
      <span>
        <span className="text-xs font-medium text-slate-700 block">{label}</span>
        {sublabel && <span className="text-[10px] text-slate-400">{sublabel}</span>}
      </span>
      <input
        type="checkbox"
        checked={!disabled && !!checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className={`${CHECKBOX} disabled:cursor-not-allowed`}
      />
    </label>
  );
}

function ModeBadge({ active, mode }) {
  return active
    ? <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-semibold">Active</span>
    : <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-semibold">Off in {mode} mode</span>;
}

export default function PaymentsPanel({ settings, updateSetting }) {
  const isSandbox = settings.paymentMode === 'sandbox';
  const modeName = isSandbox ? 'Sandbox' : 'Manual';

  return (
    <>
      <SettingsSection
        icon={faExclamationTriangle}
        tone="rose"
        title="Overdue & Eviction Policy"
        description="When an unpaid tenant is listed for eviction review."
      >
        <Field label="Payment Window" htmlFor="setting-paymentWindowDays" icon={faDollarSign} hint="How long a tenant has to pay a move-in invoice or finish an online checkout. After that an unfinished checkout is released and an unpaid move-in application is cancelled automatically.">
          <WithUnit suffix="days">
            <input
              id="setting-paymentWindowDays" name="paymentWindowDays"
              type="number" inputMode="numeric" min="1" max="30" step="1" required
              value={settings.paymentWindowDays}
              onKeyDown={blockNonIntegerKeys}
              onChange={(e) => updateSetting('paymentWindowDays', numberValue(e))}
              className={`${INPUT_NUMBER} w-24`}
            />
          </WithUnit>
        </Field>

        <Field label="Overdue Payment Threshold" htmlFor="setting-overdueThresholdDays" icon={faDollarSign} hint="Tenants past this threshold are listed for eviction review on the Contracts page.">
          <WithUnit suffix="days overdue">
            <input
              id="setting-overdueThresholdDays" name="overdueThresholdDays"
              type="number" inputMode="numeric" min="1" max="365" step="1" required
              value={settings.overdueThresholdDays}
              onKeyDown={blockNonIntegerKeys}
              onChange={(e) => updateSetting('overdueThresholdDays', numberValue(e))}
              className={`${INPUT_NUMBER} w-24`}
            />
          </WithUnit>
        </Field>

        <Callout tone="rose" icon={faInfoCircle} title="Active Eviction Policy">
          Tenants overdue more than <strong>{settings.overdueThresholdDays} days</strong> appear in the eviction
          banner on the Contracts page, where you can flag them for review. Flagging is never automatic.
        </Callout>
      </SettingsSection>

      <SettingsSection
        icon={faCreditCard}
        tone="indigo"
        title="Payment Channels"
        description="Which ways of paying tenants see at checkout."
      >
        <Field label="Operating Payment Mode" hint="Controls which channel types are surfaced to tenants during checkout.">
          <div className="flex flex-wrap gap-3">
            {PAYMENT_MODES.map((mode) => (
              <label
                key={mode.value}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border cursor-pointer transition-colors ${
                  settings.paymentMode === mode.value ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="paymentMode"
                  value={mode.value}
                  checked={settings.paymentMode === mode.value}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateSetting('paymentMode', val);
                    if (val === 'sandbox') updateSetting('paymentSandboxEnabled', true);
                  }}
                  className="text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <span>
                  <span className="text-sm font-semibold text-slate-700 block">{mode.label}</span>
                  <span className="text-[11px] text-slate-500">{mode.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Manual & In-Person</span>
              <ModeBadge active={!isSandbox} mode={modeName} />
            </div>
            <div className="space-y-1">
              <ChannelRow label="GCash (Receipt Upload)" disabled={isSandbox} checked={settings.paymentChGcashManual} onChange={(v) => updateSetting('paymentChGcashManual', v)} />
              <ChannelRow label="BDO / BPI Bank Transfer (Receipt Upload)" disabled={isSandbox} checked={settings.paymentChBankManual} onChange={(v) => updateSetting('paymentChBankManual', v)} />
              <ChannelRow label="In-Person Payment" sublabel="Scheduled office visit · offered in both modes" checked={settings.paymentChInPerson} onChange={(v) => updateSetting('paymentChInPerson', v)} />
            </div>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Sandbox (PayMongo)</span>
              <ModeBadge active={isSandbox} mode={modeName} />
            </div>
            <div className="space-y-1">
              <ChannelRow label="GCash Sandbox" disabled={!isSandbox} checked={settings.paymentChGcashSandbox} onChange={(v) => updateSetting('paymentChGcashSandbox', v)} />
              <ChannelRow label="Bank Transfer Sandbox" disabled={!isSandbox} checked={settings.paymentChBankSandbox} onChange={(v) => updateSetting('paymentChBankSandbox', v)} />
              <ChannelRow label="Maya Sandbox" disabled={!isSandbox} checked={settings.paymentChMaya} onChange={(v) => updateSetting('paymentChMaya', v)} />
            </div>
          </div>
        </div>

        <p className="text-[11px] text-slate-500">
          Tenants see the {isSandbox ? 'PayMongo sandbox' : 'receipt-upload'} channels plus In-Person.
          Switch the mode above to use the other family; your channel choices are kept.
        </p>

        <Field
          label="Reused Payment Reference"
          htmlFor="setting-duplicateReferencePolicy"
          hint={settings.duplicateReferencePolicy === 'block'
            ? 'A GCash or bank reference already used on another payment is refused, for tenant proofs and desk recording.'
            : 'A GCash or bank reference already used on another payment is accepted and flagged on the payment for you to check.'}
        >
          <select
            id="setting-duplicateReferencePolicy" name="duplicateReferencePolicy"
            value={settings.duplicateReferencePolicy === 'block' ? 'block' : 'warn'}
            onChange={(e) => updateSetting('duplicateReferencePolicy', e.target.value)}
            className={`${INPUT} sm:max-w-xs`}
          >
            <option value="warn">Warn admin only</option>
            <option value="block">Block reuse</option>
          </select>
        </Field>
      </SettingsSection>

      <SettingsSection
        icon={faShieldAlt}
        tone="blue"
        title="PayMongo Gateway"
        description="API keys for online payments. Live mode is locked; everything runs in sandbox."
      >
        <Field label="Environment Mode" hint="Live configuration is locked. All transactions will be processed in Sandbox Mode.">
          <div className="flex items-center gap-6 mt-1 text-sm text-slate-700">
            <label className="flex items-center gap-2 opacity-50 cursor-not-allowed" title="Live mode is currently locked by system administrator.">
              <input type="radio" name="paymongoEnv" value="live" checked={false} disabled className="cursor-not-allowed" />
              <span>Live (Production) <FontAwesomeIcon icon={faLock} className="text-[10px] ml-1" /></span>
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="paymongoEnv" value="sandbox" checked readOnly className="text-indigo-600 focus:ring-indigo-500" />
              <span>Sandbox (Testing)</span>
            </label>
          </div>
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Sandbox Secret Key" htmlFor="setting-paymongoSecretKey">
            <input
              id="setting-paymongoSecretKey" name="paymongoSecretKey"
              type="password" autoComplete="off" spellCheck={false} maxLength={LIMITS.smtpField}
              value={settings.paymongoSecretKey || ''}
              onChange={(e) => updateSetting('paymongoSecretKey', e.target.value)}
              placeholder="sk_test_..."
              className={INPUT_MONO}
            />
          </Field>
          <Field label="Sandbox Public Key" htmlFor="setting-paymongoPublicKey" hint="Not used yet. Checkout runs on the server with the secret key; kept for a future client-side checkout.">
            <input
              id="setting-paymongoPublicKey" name="paymongoPublicKey"
              type="text" autoComplete="off" spellCheck={false} maxLength={LIMITS.smtpField}
              value={settings.paymongoPublicKey || ''}
              onChange={(e) => updateSetting('paymongoPublicKey', e.target.value)}
              placeholder="pk_test_..."
              className={INPUT_MONO}
            />
          </Field>
          <Field label="Webhook Secret Key" htmlFor="setting-paymongoWebhookSecret" hint="Required for signature verification. Obtain this from the PayMongo Webhooks dashboard.">
            <input
              id="setting-paymongoWebhookSecret" name="paymongoWebhookSecret"
              type="password" autoComplete="off" spellCheck={false} maxLength={LIMITS.smtpField}
              value={settings.paymongoWebhookSecret || ''}
              onChange={(e) => updateSetting('paymongoWebhookSecret', e.target.value)}
              placeholder="whsk_..."
              className={INPUT_MONO}
            />
          </Field>
        </div>
      </SettingsSection>
    </>
  );
}
