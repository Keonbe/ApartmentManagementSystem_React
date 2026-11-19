import { useState } from 'react';
import { getAvatarUrl } from '../../utils/avatarUrl';

// A person's profile picture, or their initials when there is none (or it fails
// to load). Sizes: xs 24, sm 32, md 40, lg 56 px. tone tints the initials.
const SIZES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-caption',
  md: 'h-10 w-10 text-label',
  lg: 'h-14 w-14 text-title',
};
const TONES = {
  indigo: 'bg-gradient-to-br from-indigo-500 to-violet-600 text-white',
  soft: 'bg-indigo-100 text-indigo-700',
  emerald: 'bg-emerald-100 text-emerald-800',
  slate: 'bg-slate-200 text-slate-600',
};

const initialsOf = (name) =>
  String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('') || '?';

export default function PersonAvatar({ name, src, size = 'md', tone = 'indigo', ring = false, className = '' }) {
  const url = getAvatarUrl(src);
  const [failed, setFailed] = useState(null);
  const showImage = url && failed !== url;
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold ${SIZES[size] || SIZES.md} ${showImage ? 'bg-slate-100' : TONES[tone] || TONES.indigo} ${ring ? 'ring-2 ring-white shadow-card' : ''} ${className}`}
    >
      {showImage
        ? <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" onError={() => setFailed(url)} />
        : initialsOf(name)}
    </span>
  );
}
