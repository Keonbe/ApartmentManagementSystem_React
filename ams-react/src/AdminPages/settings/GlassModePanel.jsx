import { useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faImage, faUpload, faRotateLeft, faSpinner, faSliders, faInfoCircle, faCheck } from '@fortawesome/free-solid-svg-icons';
import api from '../../api/axiosConfig';
import { SettingsSection, Field, Callout } from './SettingsSection';
import { GlassLayers } from '../../Components/UserTheme';
import DEFAULTS from '../../config/systemSettings';
import { checkFile } from '../../utils/fileLimits';

// Mirrors upload_glass_background.php.
const BACKGROUND_RULE = { maxMB: 5, ext: ['jpg', 'jpeg', 'png', 'webp'], label: 'JPG, PNG or WEBP' };

const TINTS = [
  { hex: '#0f172a', name: 'Slate' },
  { hex: '#020617', name: 'Midnight' },
  { hex: '#1e1b4b', name: 'Indigo' },
  { hex: '#172554', name: 'Navy' },
  { hex: '#022c22', name: 'Forest' },
  { hex: '#3b0764', name: 'Plum' },
];

const RANGE = 'w-full accent-indigo-600 cursor-pointer';

// Other Settings → Glass Mode: the photo and tint behind tenant pages when a
// tenant picks the Glass theme (and always on Home). Saved with the rest of
// the settings form; an upload only becomes live on Save.
export default function GlassModePanel({ settings, updateSetting }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const handleFile = async (file) => {
    if (!file) return;
    const problem = checkFile(file, BACKGROUND_RULE);
    if (problem) {
      setUploadError(problem);
      return;
    }
    setUploadError('');
    setUploading(true);
    const formData = new FormData();
    formData.append('background', file);
    try {
      const res = await api.post('/upload_glass_background.php', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data.success && res.data.image_path) {
        updateSetting('glassBgImage', res.data.image_path);
      } else {
        setUploadError(res.data.message || 'The image could not be uploaded.');
      }
    } catch (err) {
      setUploadError(err?.response?.data?.message || err.message || 'The image could not be uploaded.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const resetLook = () => {
    updateSetting('glassOverlayOpacity', DEFAULTS.glassOverlayOpacity);
    updateSetting('glassBlur', DEFAULTS.glassBlur);
    updateSetting('glassTint', DEFAULTS.glassTint);
  };

  const custom = !!settings.glassBgImage;
  const tintIsPreset = TINTS.some((t) => t.hex === settings.glassTint);

  return (
    <>
      <SettingsSection
        icon={faImage}
        tone="violet"
        title="Glass Mode Background"
        description="The photo behind tenant pages in the Glass theme. The Home page always uses it."
      >
        {/* Live preview: the same layers tenants get, with a sample glass card. */}
        <div className="relative h-64 sm:h-72 rounded-card overflow-hidden border border-slate-200 bg-slate-900">
          <GlassLayers
            glassBgImage={settings.glassBgImage}
            glassOverlayOpacity={settings.glassOverlayOpacity}
            glassBlur={settings.glassBlur}
            glassTint={settings.glassTint}
            className="absolute inset-0"
          />
          <div className="absolute inset-0 flex items-center justify-center p-5">
            <div
              className="w-full max-w-sm rounded-2xl border p-5 text-left"
              style={{ backgroundColor: 'rgb(15 23 42 / 0.64)', borderColor: 'rgb(255 255 255 / 0.12)' }}
            >
              <p className="m-0 text-xs font-bold uppercase tracking-wider" style={{ color: '#a5b4fc' }}>Preview</p>
              <p className="m-0 mt-1 text-lg font-bold text-white">Welcome back, Maria</p>
              <p className="m-0 mt-1 text-sm" style={{ color: '#b7c3d3' }}>Your next bill is due on the 5th.</p>
              <span className="mt-3 inline-flex items-center rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white">Pay now</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            id="setting-glassBgImage"
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => handleFile(e.target.files?.[0])}
            disabled={uploading}
          />
          <label
            htmlFor="setting-glassBgImage"
            aria-disabled={uploading || undefined}
            className={`btn-interactive inline-flex items-center gap-2 px-4 py-2 rounded-control text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-colors ${uploading ? 'opacity-70 pointer-events-none' : 'cursor-pointer'}`}
          >
            <FontAwesomeIcon icon={uploading ? faSpinner : faUpload} spin={uploading} />
            {uploading ? 'Uploading…' : custom ? 'Replace photo' : 'Upload photo'}
          </label>
          {custom && (
            <button
              type="button"
              onClick={() => updateSetting('glassBgImage', '')}
              disabled={uploading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-control text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors disabled:opacity-60"
            >
              <FontAwesomeIcon icon={faRotateLeft} /> Use the default photo
            </button>
          )}
          <span className="text-caption text-slate-500">
            {custom ? 'Custom photo' : 'Default apartment photo'}
          </span>
        </div>
        {uploadError && <p role="alert" className="m-0 text-label text-red-600">{uploadError}</p>}

        <Callout tone="slate" icon={faInfoCircle}>
          {BACKGROUND_RULE.label}, up to {BACKGROUND_RULE.maxMB} MB, at least 640 pixels wide or tall. A wide landscape
          photo works best. A new photo shows to tenants once you save the settings.
        </Callout>
      </SettingsSection>

      <SettingsSection
        icon={faSliders}
        tone="indigo"
        title="Tint & Blur"
        description="A darker tint keeps text on glass cards easy to read over a busy photo."
        action={(
          <button
            type="button"
            onClick={resetLook}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control text-label font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 cursor-pointer"
          >
            <FontAwesomeIcon icon={faRotateLeft} /> Defaults
          </button>
        )}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label={`Tint strength: ${settings.glassOverlayOpacity}%`}
            htmlFor="setting-glassOverlayOpacity"
            hint="0 shows the photo as it is; 95 almost hides it."
          >
            <input
              id="setting-glassOverlayOpacity" name="glassOverlayOpacity"
              type="range" min="0" max="95" step="1"
              value={settings.glassOverlayOpacity}
              onChange={(e) => updateSetting('glassOverlayOpacity', Number(e.target.value))}
              className={RANGE}
            />
          </Field>
          <Field
            label={`Photo blur: ${settings.glassBlur}px`}
            htmlFor="setting-glassBlur"
            hint="A little blur gives a frosted look and calms a detailed photo."
          >
            <input
              id="setting-glassBlur" name="glassBlur"
              type="range" min="0" max="20" step="1"
              value={settings.glassBlur}
              onChange={(e) => updateSetting('glassBlur', Number(e.target.value))}
              className={RANGE}
            />
          </Field>
        </div>

        <Field label="Tint colour" htmlFor="setting-glassTint">
          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Tint colour presets">
            {TINTS.map((tint) => {
              const active = settings.glassTint === tint.hex;
              return (
                <button
                  key={tint.hex}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  title={tint.name}
                  onClick={() => updateSetting('glassTint', tint.hex)}
                  className={`inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full border text-label font-semibold cursor-pointer transition-colors ${active ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  <span className="w-5 h-5 rounded-full border border-black/10 flex items-center justify-center" style={{ backgroundColor: tint.hex }}>
                    {active && <FontAwesomeIcon icon={faCheck} className="text-[10px] text-white" />}
                  </span>
                  {tint.name}
                </button>
              );
            })}
            <label className={`inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full border text-label font-semibold cursor-pointer ${tintIsPreset ? 'border-slate-200 bg-white text-slate-600' : 'border-indigo-500 bg-indigo-50 text-indigo-700'}`}>
              <input
                id="setting-glassTint" name="glassTint"
                type="color"
                value={settings.glassTint}
                onChange={(e) => updateSetting('glassTint', e.target.value.toLowerCase())}
                className="w-5 h-5 p-0 border-0 rounded-full bg-transparent cursor-pointer"
              />
              Custom
            </label>
          </div>
        </Field>
      </SettingsSection>
    </>
  );
}
