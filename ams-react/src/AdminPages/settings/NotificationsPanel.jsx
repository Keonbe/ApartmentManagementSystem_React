import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faEnvelope, faCommentSms, faInfoCircle, faPaperPlane, faSpinner, faDollarSign, faClock,
} from '@fortawesome/free-solid-svg-icons';
import { SettingsSection, Field, WithUnit, Switch, Callout, INPUT, INPUT_MONO, INPUT_BASE, CHECKBOX } from './SettingsSection';
import { LIMITS } from '../../utils/validation';
import { blockNonIntegerKeys, blockNonNumericKeys, numberValue } from '../../Components/form/formHelpers';

const TEST_CHANNELS = [
  { key: 'sms', label: 'Test SMS' },
  { key: 'email', label: 'Test Email' },
  { key: 'both', label: 'Test Both' },
];

export default function NotificationsPanel({
  settings, updateSetting, isDirty,
  testingChannel, onTest, checkingBalance, smsBalance, onCheckBalance,
}) {
  const provider = settings.smsProvider || 'log';
  const dryChannels = [provider === 'log' && 'SMS', settings.emailDriver === 'log' && 'email'].filter(Boolean);

  return (
    <>
      {dryChannels.length > 0 && (
        <Callout tone="violet" icon={faInfoCircle} title={`Dry run active for ${dryChannels.join(' and ')}`}>
          A driver set to <span className="font-mono">Log</span> runs the whole pipeline — preferences, opt-outs,
          queue, retries — and records every message without contacting a provider; those messages are not sent and
          not charged. Use <strong>Send test</strong> below and read the message in the browser console (F12), or in{' '}
          <span className="font-mono">backend/logs/notification_outbox/</span>.
        </Callout>
      )}

      {/* ── SMS ── */}
      <SettingsSection
        icon={faCommentSms}
        tone="indigo"
        title="SMS"
        description="Text messages to tenants' mobile numbers."
        action={
          <Switch
            checked={settings.notificationsSmsEnabled}
            onChange={(v) => updateSetting('notificationsSmsEnabled', v)}
            label="SMS notifications"
          />
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="SMS Provider">
            <select value={provider} onChange={(e) => updateSetting('smsProvider', e.target.value)} className={INPUT}>
              <option value="log">Log (dry run — records, sends nothing)</option>
              <option value="semaphore">Semaphore (Philippines)</option>
            </select>
            {provider === 'semaphore' && (
              <p className="text-[11px] text-amber-600 m-0">
                Live: every SMS spends Semaphore credits. Admin actions queue their messages and the queue task
                delivers them within about a minute — it must be scheduled (see the go-live guide).
              </p>
            )}
          </Field>

          <Field label="Sender Name" htmlFor="setting-smsSenderName">
            <input
              id="setting-smsSenderName" name="smsSenderName"
              type="text" autoComplete="off"
              value={settings.smsSenderName || ''}
              onChange={(e) => updateSetting('smsSenderName', e.target.value)}
              placeholder="AMS"
              maxLength={11}
              className={INPUT_MONO}
            />
            {provider === 'semaphore' && (
              <>
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer mt-1">
                  <input
                    type="checkbox"
                    checked={!!settings.smsSenderApproved}
                    onChange={(e) => updateSetting('smsSenderApproved', e.target.checked)}
                    className={CHECKBOX}
                  />
                  Sender name approved by Semaphore
                </label>
                {!settings.smsSenderApproved && (
                  <p className="text-[11px] text-slate-500 m-0">
                    Until approved, messages go out under Semaphore's shared <span className="font-mono">SEMAPHORE</span> sender.
                    Check <em>Sender Names</em> in your Semaphore dashboard before ticking this.
                  </p>
                )}
              </>
            )}
          </Field>

          {provider === 'semaphore' && (
            <>
              <Field label="Semaphore API Key" htmlFor="setting-smsApiKey">
                <input
                  id="setting-smsApiKey" name="smsApiKey"
                  type="password" autoComplete="off" spellCheck={false} maxLength={LIMITS.smtpField}
                  value={settings.smsApiKey || ''}
                  onChange={(e) => updateSetting('smsApiKey', e.target.value)}
                  className={INPUT_MONO}
                />
              </Field>

              <Field label="Credit Balance" hint={isDirty ? 'Save your changes first — this uses the saved key.' : 'Uses the saved key. Semaphore allows 2 checks a minute, so a repeat within 60 s shows the last result.'}>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={onCheckBalance}
                    disabled={checkingBalance || isDirty}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold border-0 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <FontAwesomeIcon icon={checkingBalance ? faSpinner : faDollarSign} spin={checkingBalance} className="mr-2" />
                    Check balance
                  </button>
                  {smsBalance && !smsBalance.error && (
                    <span className="text-sm text-slate-800">
                      <strong>{smsBalance.credits}</strong> credits
                      {smsBalance.account && <span className="text-slate-500"> · {smsBalance.account}</span>}
                      {smsBalance.cached && smsBalance.checkedAt && (
                        <span className="text-slate-500">
                          {' '}· as of {new Date(smsBalance.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </span>
                  )}
                  {smsBalance?.error && <span className="text-xs text-rose-600">{smsBalance.error}</span>}
                </div>
              </Field>
            </>
          )}

          {provider !== 'log' && (
            <Field label="Daily SMS Cap" hint="Most SMS sent per day. Beyond it messages are recorded as skipped, not charged. 0 = no cap.">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={100000}
                step={1}
                aria-label="Daily SMS cap"
                value={settings.smsDailyCap ?? 100}
                onKeyDown={blockNonIntegerKeys}
                onChange={(e) => updateSetting('smsDailyCap', numberValue(e))}
                className={`${INPUT_BASE} w-32 font-mono`}
              />
            </Field>
          )}
        </div>
      </SettingsSection>

      {/* ── Email ── */}
      <SettingsSection
        icon={faEnvelope}
        tone="blue"
        title="Email"
        description="Emails to tenants' registered addresses."
        action={
          <Switch
            checked={settings.notificationsEmailEnabled}
            onChange={(v) => updateSetting('notificationsEmailEnabled', v)}
            label="Email notifications"
          />
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Delivery Method">
            <select value={settings.emailDriver || 'log'} onChange={(e) => updateSetting('emailDriver', e.target.value)} className={INPUT}>
              <option value="log">Log (dry run — records, sends nothing)</option>
              <option value="smtp">SMTP</option>
            </select>
          </Field>
          <Field label="From Name" htmlFor="setting-smtpFromName">
            <input
              id="setting-smtpFromName" name="smtpFromName"
              type="text" autoComplete="off" maxLength={LIMITS.landlordText}
              value={settings.smtpFromName || ''}
              onChange={(e) => updateSetting('smtpFromName', e.target.value)}
              placeholder="AMS Notifications"
              className={INPUT}
            />
          </Field>

          {settings.emailDriver === 'smtp' && (
            <>
              <Field label="SMTP Host" htmlFor="setting-smtpHost">
                <input type="text" id="setting-smtpHost" name="smtpHost" autoComplete="off" spellCheck={false} maxLength={LIMITS.smtpField} value={settings.smtpHost || ''} onChange={(e) => updateSetting('smtpHost', e.target.value)} placeholder="smtp.gmail.com" className={INPUT_MONO} />
              </Field>
              <Field label="SMTP Port" htmlFor="setting-smtpPort">
                <input type="number" id="setting-smtpPort" name="smtpPort" inputMode="numeric" min="1" max="65535" step="1" required value={settings.smtpPort ?? 587} onKeyDown={blockNonIntegerKeys} onChange={(e) => updateSetting('smtpPort', numberValue(e))} className={INPUT_MONO} />
              </Field>
              <Field label="SMTP Username" htmlFor="setting-smtpUsername">
                <input type="text" id="setting-smtpUsername" name="smtpUsername" autoComplete="off" spellCheck={false} maxLength={LIMITS.smtpField} value={settings.smtpUsername || ''} onChange={(e) => updateSetting('smtpUsername', e.target.value)} placeholder="you@gmail.com" className={INPUT_MONO} />
              </Field>
              <Field label="SMTP Password" htmlFor="setting-smtpPassword">
                <input type="password" id="setting-smtpPassword" name="smtpPassword" autoComplete="new-password" maxLength={LIMITS.smtpField} value={settings.smtpPassword || ''} onChange={(e) => updateSetting('smtpPassword', e.target.value)} placeholder="Google App Password" className={INPUT_MONO} />
              </Field>
              <Field label="From Email" htmlFor="setting-smtpFromEmail">
                <input type="email" id="setting-smtpFromEmail" name="smtpFromEmail" inputMode="email" autoComplete="off" maxLength={LIMITS.userEmail}
                  onBlur={(e) => { const v = e.target.value.trim().toLowerCase(); if (v !== e.target.value) updateSetting('smtpFromEmail', v); }} value={settings.smtpFromEmail || ''} onChange={(e) => updateSetting('smtpFromEmail', e.target.value)} placeholder="Defaults to the SMTP username" className={INPUT_MONO} />
              </Field>
            </>
          )}
        </div>
      </SettingsSection>

      {/* ── Delivery behaviour ── */}
      <SettingsSection
        icon={faClock}
        tone="violet"
        title="Delivery Rules"
        description="When messages go out, how long records are kept, and the cost estimate."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field
            label="Delivery Mode"
            hint="Queued returns instantly and delivers in the background. Immediate makes the tenant wait for the provider on every action — a 30-tenant announcement would hold the request open for all 30 sends."
          >
            <select
              value={settings.notificationsDispatchMode || 'queue'}
              onChange={(e) => updateSetting('notificationsDispatchMode', e.target.value)}
              className={INPUT}
            >
              <option value="queue">Queued (recommended)</option>
              <option value="sync">Immediate (demo only)</option>
            </select>
          </Field>

          <Field label="Quiet Hours (SMS)" hint="Non-urgent texts wait until the window ends. Overdue rent and urgent announcements are exempt.">
            <div className="flex items-center gap-3">
              <input
                type="number" inputMode="numeric" min="0" max="23" step="1" required
                aria-label="Quiet hours start"
                value={settings.notificationsQuietStart ?? 21}
                onKeyDown={blockNonIntegerKeys}
                onChange={(e) => updateSetting('notificationsQuietStart', numberValue(e))}
                className={`${INPUT_BASE} w-20 text-center`}
              />
              <span className="text-xs text-slate-500">to</span>
              <input
                type="number" inputMode="numeric" min="0" max="23" step="1" required
                aria-label="Quiet hours end"
                value={settings.notificationsQuietEnd ?? 7}
                onKeyDown={blockNonIntegerKeys}
                onChange={(e) => updateSetting('notificationsQuietEnd', numberValue(e))}
                className={`${INPUT_BASE} w-20 text-center`}
              />
              <span className="text-xs text-slate-500">(24-hour)</span>
            </div>
          </Field>

          <Field label="Delivery Log Retention" hint="Delivery records hold tenant numbers and addresses, so older rows are deleted automatically.">
            <WithUnit suffix="days">
              <input
                type="number" inputMode="numeric" min="1" max="3650" step="1" required
                aria-label="Delivery log retention in days"
                value={settings.notificationLogRetentionDays ?? 90}
                onKeyDown={blockNonIntegerKeys}
                onChange={(e) => updateSetting('notificationLogRetentionDays', numberValue(e))}
                className={`${INPUT_BASE} w-28`}
              />
            </WithUnit>
          </Field>

          <Field label="Cost per SMS" hint="Used to estimate the cost of an announcement before it is sent.">
            <WithUnit prefix="₱">
              <input
                type="number" inputMode="decimal" step="0.01" min="0" max="100" required
                aria-label="Cost per SMS"
                value={settings.smsUnitCost ?? 0.5}
                onKeyDown={blockNonNumericKeys}
                onChange={(e) => updateSetting('smsUnitCost', numberValue(e))}
                className={`${INPUT_BASE} w-28`}
              />
            </WithUnit>
          </Field>
        </div>
      </SettingsSection>

      {/* ── Test send ── */}
      <SettingsSection
        icon={faPaperPlane}
        tone="emerald"
        title="Send a Test"
        description="Sends to your own contact number and email address using the saved settings. The complete message is printed to the browser console (F12 → Console)."
      >
        <div className="flex flex-wrap items-center gap-2">
          {TEST_CHANNELS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => onTest(key)}
              disabled={testingChannel !== null || isDirty}
              className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-semibold cursor-pointer hover:bg-slate-100 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {testingChannel === key
                ? <><FontAwesomeIcon icon={faSpinner} spin className="mr-2" />Sending…</>
                : label}
            </button>
          ))}
          {isDirty && <span className="text-[11px] text-amber-600">Save your changes first — tests use the saved settings.</span>}
        </div>
      </SettingsSection>
    </>
  );
}
