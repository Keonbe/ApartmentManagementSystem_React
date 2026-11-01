import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faFont, faRotateLeft, faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import { SettingsSection, Field, Switch, PillOption, Callout, INPUT } from './SettingsSection';
import { GlassLayers } from '../../Components/UserTheme';
import HomeIntro from '../../Components/HomeIntro';
import { HOME_FIELDS, homeText } from '../../config/homeContent';
import { textIn } from '../../config/i18n';

const HINTS = {
  badge: 'The small label above the heading.',
  heading: 'The large title visitors see. Signed-in tenants see "Welcome Back, <name>" here instead.',
  location: 'The line with the map pin.',
  description: 'The paragraph under the location.',
};

const LANGS = [
  { id: 'en', label: 'English' },
  { id: 'fil', label: 'Filipino' },
];

// Other Settings → Home Page: edit or hide the four lines of text on Home.
// Saved with the rest of the settings form (home_content).
export default function HomePagePanel({ settings, updateSetting }) {
  const [previewLang, setPreviewLang] = useState('en');
  const content = settings.homeContent;

  const setItem = (key, patch) => {
    updateSetting('homeContent', { ...content, [key]: { ...content[key], ...patch } });
  };

  const texts = Object.fromEntries(HOME_FIELDS.map((f) => [f.key, homeText(content, f.key, previewLang)]));
  const allHidden = HOME_FIELDS.every((f) => !content[f.key].show);

  return (
    <>
      <SettingsSection
        icon={faEye}
        tone="violet"
        title="Preview"
        description="The Home page panel as a visitor sees it, over the Glass Mode photo."
        action={(
          <div className="flex gap-1.5" role="group" aria-label="Preview language">
            {LANGS.map((l) => (
              <PillOption key={l.id} selected={previewLang === l.id} onClick={() => setPreviewLang(l.id)}>
                {l.label}
              </PillOption>
            ))}
          </div>
        )}
      >
        <div className="relative overflow-hidden rounded-card border border-slate-200 bg-slate-900">
          <GlassLayers
            glassBgImage={settings.glassBgImage}
            glassOverlayOpacity={settings.glassOverlayOpacity}
            glassBlur={settings.glassBlur}
            glassTint={settings.glassTint}
            className="absolute inset-0"
          />
          <div className="relative p-4 sm:p-8">
            <div className="max-w-xl space-y-4 rounded-3xl border border-white/10 bg-slate-950/70 p-6 sm:p-8 shadow-2xl shadow-black/50">
              <HomeIntro compact {...texts} />
              {allHidden && (
                <p className="m-0 text-sm text-slate-400">All four lines are hidden; only the buttons show.</p>
              )}
              <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4" aria-hidden="true">
                <span className="rounded-xl border border-white/10 bg-white/10 px-3.5 py-2 text-xs font-medium text-white">
                  {textIn(previewLang, 'inquiry.homeCta')}
                </span>
                <span className="rounded-xl bg-indigo-500 px-3.5 py-2 text-xs font-medium text-white">
                  {textIn(previewLang, 'home.cta')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        icon={faFont}
        tone="indigo"
        title="Home Page Text"
        description="Change or hide each line. A box left empty keeps the original wording."
      >
        {HOME_FIELDS.map((f) => {
          const item = content[f.key];
          const edited = item.en !== '' || item.fil !== '';
          return (
            <div key={f.key} className="rounded-card border border-slate-200 p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[12rem]">
                  <p className="m-0 text-body font-bold text-slate-800">{f.label}</p>
                  <p className="m-0 text-caption text-slate-500">{HINTS[f.key]}</p>
                </div>
                {edited && (
                  <button
                    type="button"
                    onClick={() => setItem(f.key, { en: '', fil: '' })}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control text-label font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 cursor-pointer"
                  >
                    <FontAwesomeIcon icon={faRotateLeft} /> Original wording
                  </button>
                )}
                <span className="flex items-center gap-2 text-label font-semibold text-slate-600">
                  {item.show ? 'Shown' : 'Hidden'}
                  <Switch
                    checked={item.show}
                    onChange={(show) => setItem(f.key, { show })}
                    label={`Show the ${f.label.toLowerCase()} on the Home page`}
                  />
                </span>
              </div>

              <div className={`grid gap-3 sm:grid-cols-2 transition-opacity ${item.show ? '' : 'opacity-60'}`}>
                {LANGS.map((l) => {
                  const id = `home-${f.key}-${l.id}`;
                  const value = item[l.id];
                  // What shows when the box is empty (homeText's fallback order).
                  const placeholder = l.id === 'fil'
                    ? (item.en.trim() || textIn('fil', f.i18n))
                    : textIn('en', f.i18n);
                  const props = {
                    id,
                    name: id,
                    value,
                    maxLength: f.max,
                    placeholder,
                    onChange: (e) => setItem(f.key, { [l.id]: e.target.value }),
                    className: INPUT,
                  };
                  return (
                    <Field key={l.id} label={l.label} htmlFor={id} hint={`${value.length} / ${f.max} characters`}>
                      {f.key === 'description'
                        ? <textarea rows={4} {...props} className={`${INPUT} resize-y`} />
                        : <input type="text" {...props} />}
                    </Field>
                  );
                })}
              </div>
            </div>
          );
        })}

        <Callout tone="slate" icon={faInfoCircle}>
          A Filipino box left empty shows your English text, or the original Filipino wording when the English box is
          empty too. Text shows exactly as typed, except that line breaks become spaces. Changes reach the Home page
          once you save.
        </Callout>
      </SettingsSection>
    </>
  );
}
