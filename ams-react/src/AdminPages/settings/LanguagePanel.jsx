import { faLanguage, faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import { SettingsSection, Switch, Callout } from './SettingsSection';

// Other Settings → Language: the EN / FIL switch on the tenant and guest pages
// (the account menu for signed-in users, the top bar for guests, the sign-in
// pages). Saved with the rest of the settings form.
export default function LanguagePanel({ settings, updateSetting }) {
  const on = !!settings.languageSwitchEnabled;
  return (
    <>
      <SettingsSection
        icon={faLanguage}
        tone="blue"
        title="Language Switch"
        description="Let tenants and guests switch the site between English and Filipino."
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="m-0 text-body font-semibold text-slate-700">Show the English / Filipino switch</p>
            <p className="m-0 mt-0.5 text-caption text-slate-500 leading-relaxed">
              Signed-in users find it in their account menu; guests see it on the top bar and the sign-in pages.
            </p>
          </div>
          <Switch checked={on} onChange={(v) => updateSetting('languageSwitchEnabled', v)} label="Show the English / Filipino switch" />
        </div>
      </SettingsSection>

      <Callout tone="slate" icon={faInfoCircle} title={on ? 'Switch shown' : 'Switch hidden'}>
        {on
          ? 'Each visitor picks their language; the choice is remembered on their device.'
          : 'Every tenant and guest page shows in English. A Filipino choice someone made earlier is kept and comes back if you turn the switch on again.'}
      </Callout>
    </>
  );
}
