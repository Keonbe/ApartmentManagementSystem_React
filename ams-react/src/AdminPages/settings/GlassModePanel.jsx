import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faImage, faUpload, faRotateLeft, faSpinner, faSliders, faInfoCircle, faCheck, faXmark } from '@fortawesome/free-solid-svg-icons';
import api from '../../api/axiosConfig';
import { publicAssetUrl } from '../../api/fileUrl';
import { SettingsSection, Field, Callout } from './SettingsSection';
import { GlassLayers } from '../../Components/UserTheme';
import ConfirmDialog from '../../Components/ConfirmDialog';
import DEFAULTS from '../../config/systemSettings';
import { checkFile } from '../../utils/fileLimits';
import ApartmentPic from '../../assets/Apartment_Pic.webp';

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

const RECENT_LIMIT = 6; // GLASS_BG_KEEP in backend/config.php

const errorText = (err, fallback) => err?.response?.data?.message || err?.message || fallback;

const uploadedLabel = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? 'Uploaded photo'
    : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

// One choice in the recent-photos grid.
function PhotoTile({ src, label, selected, live, onSelect, onRemove }) {
  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={`group block w-full rounded-control border-2 p-0.5 text-left cursor-pointer transition-colors bg-white ${selected ? 'border-indigo-600' : 'border-transparent hover:border-slate-300'}`}
      >
        <span className="relative block aspect-video overflow-hidden rounded-[0.4rem] bg-slate-200">
          <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          {selected && (
            <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] text-white shadow">
              <FontAwesomeIcon icon={faCheck} />
            </span>
          )}
          {live && (
            <span className="absolute bottom-1.5 left-1.5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow">
              Live
            </span>
          )}
        </span>
        <span className="mt-1 block truncate px-0.5 text-caption font-semibold text-slate-600">{label}</span>
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove the photo uploaded ${label}`}
          title="Remove this photo"
          className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-0 bg-slate-900/70 text-xs text-white hover:bg-red-600 cursor-pointer transition-colors"
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>
      )}
    </div>
  );
}

// Other Settings → Glass Mode: the photo and tint behind tenant pages when a
// tenant picks the Glass theme (and always on Home). Saved with the rest of
// the settings form; an upload only becomes live on Save. The last six
// uploads stay on the server so the admin can switch back to one.
export default function GlassModePanel({ settings, updateSetting, savedBgImage = '' }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [recent, setRecent] = useState(null); // null while loading
  const [recentError, setRecentError] = useState('');
  const [removing, setRemoving] = useState(null); // the photo awaiting confirmation
  const [removeBusy, setRemoveBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api.get('/get_glass_backgrounds.php')
      .then((res) => {
        if (!alive) return;
        if (res.data.success && Array.isArray(res.data.backgrounds)) setRecent(res.data.backgrounds);
        else setRecentError(res.data.message || 'The recent photos did not load.');
      })
      .catch((err) => alive && setRecentError(errorText(err, 'The recent photos did not load.')));
    return () => { alive = false; };
  }, []);

  const removePhoto = async () => {
    setRemoveBusy(true);
    try {
      const res = await api.post('/delete_glass_background.php', { path: removing.path });
      if (Array.isArray(res.data.backgrounds)) setRecent(res.data.backgrounds);
      setRecentError('');
    } catch (err) {
      setRecentError(errorText(err, 'The photo could not be removed.'));
    } finally {
      setRemoveBusy(false);
      setRemoving(null);
    }
  };

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
        if (Array.isArray(res.data.backgrounds)) setRecent(res.data.backgrounds);
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
            {uploading ? 'Uploading…' : 'Upload a new photo'}
          </label>
          <span className="text-caption text-slate-500">
            {custom ? 'Custom photo selected' : 'Default apartment photo selected'}
          </span>
        </div>
        {uploadError && <p role="alert" className="m-0 text-label text-red-600">{uploadError}</p>}

        <div className="space-y-2">
          <p className="m-0 text-body font-semibold text-slate-700">Recent photos</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <PhotoTile
              src={ApartmentPic}
              label="Default photo"
              selected={!settings.glassBgImage}
              live={!savedBgImage}
              onSelect={() => updateSetting('glassBgImage', '')}
            />
            {(recent || []).map((photo) => {
              const selected = settings.glassBgImage === photo.path;
              const live = savedBgImage === photo.path;
              const label = uploadedLabel(photo.uploaded_at);
              return (
                <PhotoTile
                  key={photo.path}
                  src={publicAssetUrl(photo.path)}
                  label={label}
                  selected={selected}
                  live={live}
                  onSelect={() => updateSetting('glassBgImage', photo.path)}
                  // The photo tenants see now, or the one picked here, cannot be removed.
                  onRemove={selected || live ? undefined : () => setRemoving({ path: photo.path, label })}
                />
              );
            })}
          </div>
          {recent === null && !recentError && (
            <p className="m-0 text-caption text-slate-500"><FontAwesomeIcon icon={faSpinner} spin className="mr-1.5" />Loading recent photos…</p>
          )}
          {recentError && <p role="alert" className="m-0 text-label text-red-600">{recentError}</p>}
        </div>

        <Callout tone="slate" icon={faInfoCircle}>
          {BACKGROUND_RULE.label}, up to {BACKGROUND_RULE.maxMB} MB, at least 640 pixels wide or tall. A wide landscape
          photo works best. The last {RECENT_LIMIT} photos stay here so you can switch back; older ones are deleted as
          you upload more. A photo you pick shows to tenants once you save the settings.
        </Callout>

        {removing && (
          <ConfirmDialog
            title="Remove this photo?"
            message={`The photo uploaded ${removing.label} will be deleted from the server. This cannot be undone.`}
            confirmLabel="Remove photo"
            cancelLabel="Keep it"
            busy={removeBusy}
            onConfirm={removePhoto}
            onClose={() => setRemoving(null)}
          />
        )}
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
