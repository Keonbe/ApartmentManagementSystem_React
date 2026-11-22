import { faClock, faCircleCheck, faRotateLeft, faFileSignature } from '@fortawesome/free-solid-svg-icons';

// The office's check of a tenant's signed rent contract (backend/signed_contract.php):
// review = 'pending' | 'accepted' | 'rejected', or null when no copy is on file.
// Shared by Applications, Contracts and the review panel so the wording and colours match.
export const SIGNED_REVIEW = {
  pending: {
    label: 'To check', icon: faClock,
    chip: 'bg-amber-50 text-amber-800 ring-amber-200', box: 'border-amber-200 bg-amber-50/60', tile: 'bg-amber-100 text-amber-700',
    text: 'Uploaded by the tenant, waiting for your check.',
  },
  accepted: {
    label: 'Accepted', icon: faCircleCheck,
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200', box: 'border-emerald-200 bg-emerald-50/60', tile: 'bg-emerald-100 text-emerald-700',
    text: 'Checked and accepted.',
  },
  rejected: {
    label: 'New copy asked', icon: faRotateLeft,
    chip: 'bg-rose-50 text-rose-700 ring-rose-200', box: 'border-rose-200 bg-rose-50/60', tile: 'bg-rose-100 text-rose-700',
    text: 'Sent back to the tenant. Waiting for a new copy.',
  },
  none: {
    label: 'Not uploaded', icon: faFileSignature,
    chip: 'bg-slate-100 text-slate-600 ring-slate-200', box: 'border-slate-200 bg-slate-50', tile: 'bg-slate-200 text-slate-600',
    text: 'The tenant uploads it from Track Application after signing.',
  },
};

// Presets for "Ask for a new copy".
export const SIGNED_REJECT_REASONS = [
  'The photo is blurry or cut off',
  'A page is missing',
  'The contract is not signed',
  'This is not the rent contract',
];

export const isImagePath = (path) => /\.(png|jpe?g|webp|gif)$/i.test(String(path || ''));
