import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faEye, faImage, faFont, faListCheck, faRotateLeft, faPlus, faTrash, faArrowUp, faArrowDown, faInfoCircle,
} from '@fortawesome/free-solid-svg-icons';
import { SettingsSection, Field, Switch, PillOption, Callout, INPUT } from './SettingsSection';
import PreviewHero from '../../Components/PreviewHero';
import {
  PREVIEW_TEXT_FIELDS, PREVIEW_FEATURE_MAX_LEN, PREVIEW_FEATURE_MAX_COUNT, previewText, previewFeatures,
} from '../../config/previewHero';
import { textIn } from '../../config/i18n';
import RecentPhotos from './RecentPhotos';

const LANGS = [
  { id: 'en', label: 'English' },
  { id: 'fil', label: 'Filipino' },
];

const HINTS = {
  badge: 'The small pill above the title.',
  title: 'The large heading.',
  location: 'The line with the map pin.',
};

const ICON_BTN = 'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800 cursor-pointer disabled:opacity-40 disabled:cursor-default';

// Other Settings → Preview Page: the hero banner at the top of the public
// Preview page. Saved with the rest of the settings form (preview_hero); an
// uploaded photo only goes live on Save, and the last six stay to switch back to.
export default function PreviewPagePanel({ settings, updateSetting, savedImage = '' }) {
  const [previewLang, setPreviewLang] = useState('en');
  const hero = settings.previewHero;

  const setHero = (patch) => updateSetting('previewHero', { ...hero, ...patch });
  const setItem = (key, patch) => setHero({ [key]: { ...hero[key], ...patch } });
  const setFeature = (i, patch) => setHero({ features: hero.features.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const moveFeature = (i, by) => {
    const next = [...hero.features];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    setHero({ features: next });
  };

  const full = hero.features.length >= PREVIEW_FEATURE_MAX_COUNT;

  return (
    <>
      <SettingsSection
        icon={faEye}
        tone="violet"
        title="Preview"
        description="The top of the Preview page as visitors see it."
        action={(
          <div className="flex gap-1.5" role="group" aria-label="Preview language">
            {LANGS.map((l) => (
              <PillOption key={l.id} selected={previewLang === l.id} onClick={() => setPreviewLang(l.id)}>{l.label}</PillOption>
            ))}
          </div>
        )}
      >
        <div className="rounded-card bg-slate-50 p-3 sm:p-4 border border-slate-200">
          <PreviewHero
            image={hero.image}
            badge={previewText(hero, 'badge', previewLang)}
            title={previewText(hero, 'title', previewLang)}
            location={previewText(hero, 'location', previewLang)}
            features={previewFeatures(hero, previewLang)}
          />
        </div>
      </SettingsSection>

      <SettingsSection icon={faImage} tone="indigo" title="Photo" description="The picture on the left of the banner. A building or room photo works best.">
        <RecentPhotos
          kind="preview"
          inputId="setting-previewHeroImage"
          value={hero.image}
          savedValue={savedImage}
          onChange={(image) => setHero({ image })}
          hint="A building or room photo works best."
        />
      </SettingsSection>

      <SettingsSection icon={faFont} tone="indigo" title="Text" description="Change or hide each line. A box left empty keeps the original wording.">
        {PREVIEW_TEXT_FIELDS.map((f) => {
          const item = hero[f.key];
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
                  <Switch checked={item.show} onChange={(show) => setItem(f.key, { show })} label={`Show the ${f.label.toLowerCase()}`} />
                </span>
              </div>
              <div className={`grid gap-3 sm:grid-cols-2 transition-opacity ${item.show ? '' : 'opacity-60'}`}>
                {LANGS.map((l) => {
                  const id = `preview-${f.key}-${l.id}`;
                  const value = item[l.id];
                  const placeholder = l.id === 'fil' ? (item.en.trim() || textIn('fil', f.i18n)) : textIn('en', f.i18n);
                  return (
                    <Field key={l.id} label={l.label} htmlFor={id} hint={`${value.length} / ${f.max} characters`}>
                      <input
                        id={id}
                        type="text"
                        value={value}
                        maxLength={f.max}
                        placeholder={placeholder}
                        onChange={(e) => setItem(f.key, { [l.id]: e.target.value })}
                        className={INPUT}
                      />
                    </Field>
                  );
                })}
              </div>
            </div>
          );
        })}
      </SettingsSection>

      <SettingsSection
        icon={faListCheck}
        tone="emerald"
        title="Features"
        description={`The chips under the location, like “Motorcycle Parking”. Up to ${PREVIEW_FEATURE_MAX_COUNT}.`}
        action={(
          <button
            type="button"
            onClick={() => setHero({ features: [...hero.features, { en: '', fil: '' }] })}
            disabled={full}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control text-label font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 cursor-pointer disabled:opacity-50 disabled:cursor-default"
          >
            <FontAwesomeIcon icon={faPlus} /> Add feature
          </button>
        )}
      >
        {hero.features.length === 0 && (
          <p className="m-0 text-sm text-slate-500">No features. The banner shows without chips.</p>
        )}
        <ol className="m-0 p-0 list-none space-y-3">
          {hero.features.map((feature, i) => {
            const n = i + 1;
            const missing = feature.en.trim() === '';
            return (
              <li key={i} className="rounded-card border border-slate-200 p-3 sm:p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{n}</span>
                  <div className="grid flex-1 min-w-[14rem] gap-3 sm:grid-cols-2">
                    <Field
                      label="English"
                      htmlFor={`preview-feature-${i}-en`}
                      error={missing ? 'Write the English text, or remove this feature.' : null}
                    >
                      <input
                        id={`preview-feature-${i}-en`}
                        type="text"
                        value={feature.en}
                        maxLength={PREVIEW_FEATURE_MAX_LEN}
                        required
                        aria-invalid={missing || undefined}
                        aria-describedby={missing ? `preview-feature-${i}-en-error` : undefined}
                        placeholder="e.g. Free Wi-Fi"
                        onChange={(e) => setFeature(i, { en: e.target.value })}
                        className={INPUT}
                      />
                    </Field>
                    <Field label="Filipino" htmlFor={`preview-feature-${i}-fil`} hint="Empty uses the English text.">
                      <input
                        id={`preview-feature-${i}-fil`}
                        type="text"
                        value={feature.fil}
                        maxLength={PREVIEW_FEATURE_MAX_LEN}
                        placeholder={feature.en.trim() || 'hal. Libreng Wi-Fi'}
                        onChange={(e) => setFeature(i, { fil: e.target.value })}
                        className={INPUT}
                      />
                    </Field>
                  </div>
                  <div className="flex gap-1.5 sm:mt-7">
                    <button type="button" className={ICON_BTN} onClick={() => moveFeature(i, -1)} disabled={i === 0} aria-label={`Move feature ${n} up`} title="Move up">
                      <FontAwesomeIcon icon={faArrowUp} />
                    </button>
                    <button type="button" className={ICON_BTN} onClick={() => moveFeature(i, 1)} disabled={i === hero.features.length - 1} aria-label={`Move feature ${n} down`} title="Move down">
                      <FontAwesomeIcon icon={faArrowDown} />
                    </button>
                    <button
                      type="button"
                      className={`${ICON_BTN} hover:!text-red-600 hover:!border-red-200`}
                      onClick={() => setHero({ features: hero.features.filter((_, j) => j !== i) })}
                      aria-label={`Remove feature ${n}`}
                      title="Remove"
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        <Callout tone="slate" icon={faInfoCircle}>
          Text shows exactly as typed, at most {PREVIEW_FEATURE_MAX_LEN} characters each. Changes reach the Preview page once you save.
        </Callout>
      </SettingsSection>
    </>
  );
}
