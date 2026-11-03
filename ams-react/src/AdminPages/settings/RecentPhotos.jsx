import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUpload, faSpinner, faInfoCircle, faCheck, faXmark } from '@fortawesome/free-solid-svg-icons';
import api from '../../api/axiosConfig';
import { publicAssetUrl } from '../../api/fileUrl';
import { Callout } from './SettingsSection';
import ConfirmDialog from '../../Components/ConfirmDialog';
import { checkFile } from '../../utils/fileLimits';
import ApartmentPic from '../../assets/Apartment_Pic.webp';

// Mirrors check_site_image_upload() in backend/config.php.
const PHOTO_RULE = { maxMB: 5, ext: ['jpg', 'jpeg', 'png', 'webp'], label: 'JPG, PNG or WEBP' };
const RECENT_LIMIT = 6; // SITE_IMAGE_KEEP in backend/config.php

// Where each kind uploads (the list and removal go through
// get_glass_backgrounds.php / delete_glass_background.php with `kind`).
const UPLOADS = {
  glass: { url: '/upload_glass_background.php', field: 'background' },
  preview: { url: '/upload_preview_image.php', field: 'image' },
};

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

// Upload button + the last six uploads of one kind ('glass' for Glass Mode,
// 'preview' for the Preview page hero), the built-in photo first. Picking one
// calls onChange(path) ('' = built-in); it goes live when the settings form is
// saved. `savedValue` is the photo tenants see now: marked Live, and neither
// it nor the picked one can be removed. `hint` is the line about what suits.
export default function RecentPhotos({ kind, inputId, value, savedValue = '', onChange, hint }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [recent, setRecent] = useState(null); // null while loading
  const [recentError, setRecentError] = useState('');
  const [removing, setRemoving] = useState(null); // the photo awaiting confirmation
  const [removeBusy, setRemoveBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api.get('/get_glass_backgrounds.php', { params: { kind } })
      .then((res) => {
        if (!alive) return;
        if (res.data.success && Array.isArray(res.data.backgrounds)) setRecent(res.data.backgrounds);
        else setRecentError(res.data.message || 'The recent photos did not load.');
      })
      .catch((err) => alive && setRecentError(errorText(err, 'The recent photos did not load.')));
    return () => { alive = false; };
  }, [kind]);

  const removePhoto = async () => {
    setRemoveBusy(true);
    try {
      const res = await api.post('/delete_glass_background.php', { path: removing.path, kind });
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
    const problem = checkFile(file, PHOTO_RULE);
    if (problem) {
      setUploadError(problem);
      return;
    }
    setUploadError('');
    setUploading(true);
    const formData = new FormData();
    formData.append(UPLOADS[kind].field, file);
    try {
      const res = await api.post(UPLOADS[kind].url, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data.success && res.data.image_path) {
        onChange(res.data.image_path);
        if (Array.isArray(res.data.backgrounds)) setRecent(res.data.backgrounds);
      } else {
        setUploadError(res.data.message || 'The image could not be uploaded.');
      }
    } catch (err) {
      setUploadError(errorText(err, 'The image could not be uploaded.'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      {/* relative: the sr-only input is absolutely positioned, and without a
          positioned parent it sat below the screen; opening the file dialog
          scrolled the whole admin page up and left a blank strip at the bottom. */}
      <div className="relative flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          id={inputId}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => handleFile(e.target.files?.[0])}
          disabled={uploading}
        />
        <label
          htmlFor={inputId}
          aria-disabled={uploading || undefined}
          className={`btn-interactive inline-flex items-center gap-2 px-4 py-2 rounded-control text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-colors ${uploading ? 'opacity-70 pointer-events-none' : 'cursor-pointer'}`}
        >
          <FontAwesomeIcon icon={uploading ? faSpinner : faUpload} spin={uploading} />
          {uploading ? 'Uploading…' : 'Upload a new photo'}
        </label>
        <span className="text-caption text-slate-500">
          {value ? 'Custom photo selected' : 'Default apartment photo selected'}
        </span>
      </div>
      {uploadError && <p role="alert" className="m-0 text-label text-red-600">{uploadError}</p>}

      <div className="space-y-2">
        <p className="m-0 text-body font-semibold text-slate-700">Recent photos</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <PhotoTile
            src={ApartmentPic}
            label="Default photo"
            selected={!value}
            live={!savedValue}
            onSelect={() => onChange('')}
          />
          {(recent || []).map((photo) => {
            const selected = value === photo.path;
            const live = savedValue === photo.path;
            const label = uploadedLabel(photo.uploaded_at);
            return (
              <PhotoTile
                key={photo.path}
                src={publicAssetUrl(photo.path)}
                label={label}
                selected={selected}
                live={live}
                onSelect={() => onChange(photo.path)}
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
        {PHOTO_RULE.label}, up to {PHOTO_RULE.maxMB} MB, at least 640 pixels wide or tall. {hint} The last {RECENT_LIMIT} photos
        stay here so you can switch back; older ones are deleted as you upload more. A photo you pick shows to tenants once
        you save the settings.
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
    </>
  );
}
