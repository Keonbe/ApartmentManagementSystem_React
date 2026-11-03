import { faHourglassHalf, faBell, faDoorOpen, faInfoCircle, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { SettingsSection, Field, WithUnit, Switch, Callout, INPUT_NUMBER } from './SettingsSection';
import { blockNonIntegerKeys, numberValue } from '../../Components/form/formHelpers';

// Whole-number setting: empty stays empty (required stops the save).
const intInput = (settings, updateSetting, key, min, max, disabled = false) => ({
  id: `setting-${key}`,
  name: key,
  type: 'number',
  inputMode: 'numeric',
  min,
  max,
  step: 1,
  required: true,
  disabled,
  value: settings[key],
  onKeyDown: blockNonIntegerKeys,
  onChange: (e) => updateSetting(key, numberValue(e)),
});

// A switch with its label and explanation on one row.
function SwitchRow({ title, hint, checked, onChange, disabled = false }) {
  return (
    <div className={`flex items-start justify-between gap-4 ${disabled ? 'opacity-60' : ''}`}>
      <div className="min-w-0">
        <p className="m-0 text-body font-semibold text-slate-700">{title}</p>
        {hint && <p className="m-0 mt-0.5 text-caption text-slate-500 leading-relaxed">{hint}</p>}
      </div>
      <Switch checked={checked} onChange={disabled ? () => {} : onChange} label={title} />
    </div>
  );
}

const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const daysBefore = (end, n) => { const d = new Date(end); d.setDate(d.getDate() - n); return d; };

// Other Settings → Contract End: when tenants can still ask to extend, the
// rent-end reminder, and upcoming rooms on the Preview page. Saved with the
// rest of the settings form; the server checks the same rules.
export default function ContractEndPanel({ settings, updateSetting }) {
  const deadline = Number(settings.extensionDeadlineDays) || 0;
  const reminder = Number(settings.leaseEndReminderDays) || 0;
  const remindersOn = !!settings.leaseEndRemindersEnabled;
  const tooLate = deadline > 0 && reminder <= deadline;

  // A worked example with a contract ending 60 days from today.
  const exampleEnd = new Date();
  exampleEnd.setHours(0, 0, 0, 0);
  exampleEnd.setDate(exampleEnd.getDate() + 60);

  return (
    <>
      <SettingsSection
        icon={faHourglassHalf}
        tone="amber"
        title="Extension Deadline"
        description="How long before the rent ends tenants can still ask to extend it themselves."
      >
        <Field
          label="Close extension requests"
          htmlFor="setting-extensionDeadlineDays"
          hint="0 = tenants can ask until the last day. A request sent in time can still be approved after the deadline, and you can always extend a tenant from Units → Extend Rent."
        >
          <WithUnit suffix="days before the rent ends">
            <input {...intInput(settings, updateSetting, 'extensionDeadlineDays', 0, 90)} className={`${INPUT_NUMBER} w-24`} />
          </WithUnit>
        </Field>
      </SettingsSection>

      <SettingsSection
        icon={faBell}
        tone="indigo"
        title="Rent-End Reminder"
        description="Tells a tenant once that their rent is about to end, and until when they can ask to extend."
      >
        <SwitchRow
          title="Send the rent-end reminder"
          hint="Shown in the tenant's notifications. Turning it off sends nothing; turning it back on reminds everyone already inside the window."
          checked={remindersOn}
          onChange={(v) => updateSetting('leaseEndRemindersEnabled', v)}
        />
        <Field
          label="Send it"
          htmlFor="setting-leaseEndReminderDays"
          hint="Also counts a rent as “ending soon” on the admin dashboard and Contracts page."
          error={tooLate ? `Send it more than ${deadline} days before the end, so tenants hear about it before requests close.` : null}
        >
          <WithUnit suffix="days before the rent ends">
            <input
              {...intInput(settings, updateSetting, 'leaseEndReminderDays', 0, 180)}
              aria-describedby={tooLate ? 'setting-leaseEndReminderDays-error' : undefined}
              aria-invalid={tooLate || undefined}
              className={`${INPUT_NUMBER} w-24 ${tooLate ? 'border-red-400' : ''}`}
            />
          </WithUnit>
        </Field>
        <div className="space-y-4 rounded-card border border-slate-200 p-4">
          <SwitchRow
            title="Also by email"
            checked={!!settings.leaseEndReminderEmail}
            onChange={(v) => updateSetting('leaseEndReminderEmail', v)}
            disabled={!remindersOn}
          />
          <SwitchRow
            title="Also by SMS"
            checked={!!settings.leaseEndReminderSms}
            onChange={(v) => updateSetting('leaseEndReminderSms', v)}
            disabled={!remindersOn}
          />
          <p className="m-0 text-caption text-slate-500 leading-relaxed">
            Email and SMS also need the channel switched on in Notifications, and are skipped for tenants who opted out.
          </p>
        </div>
      </SettingsSection>

      <SettingsSection
        icon={faDoorOpen}
        tone="emerald"
        title="Upcoming Rooms"
        description="Units that will free up, shown on the Preview page with the date they become available."
      >
        <SwitchRow
          title="Show upcoming rooms on the Preview page"
          hint={deadline > 0
            ? 'A unit is listed once its tenant schedules a move-out, or once the extension deadline passes with no extension request. Only the date shows, never who is leaving.'
            : 'A unit is listed once its tenant schedules a move-out. Set an extension deadline above to also list units whose tenant did not ask to extend in time.'}
          checked={!!settings.upcomingRoomsEnabled}
          onChange={(v) => updateSetting('upcomingRoomsEnabled', v)}
        />
      </SettingsSection>

      <Callout tone={tooLate ? 'amber' : 'slate'} icon={tooLate ? faTriangleExclamation : faInfoCircle} title={`Example: a rent that ends ${fmt(exampleEnd)}`}>
        <ul className="m-0 pl-4 space-y-0.5">
          <li>{remindersOn ? `Reminder sent ${fmt(daysBefore(exampleEnd, reminder))}.` : 'No reminder is sent.'}</li>
          <li>{deadline > 0 ? `The tenant can ask to extend until ${fmt(daysBefore(exampleEnd, deadline))}.` : 'The tenant can ask to extend until the last day.'}</li>
          {settings.upcomingRoomsEnabled && deadline > 0 && (
            <li>{`If they have not asked by then, the unit shows on Preview as available from ${fmt(exampleEnd)}.`}</li>
          )}
        </ul>
      </Callout>
    </>
  );
}
