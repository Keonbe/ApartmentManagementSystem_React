import { formatFileSize } from './formHelpers';

// The chosen file's name and size with a Remove button.
export default function FileChip({ file, onRemove, className = '' }) {
  if (!file) return null;
  return (
    <div className={`mt-2 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs ${className}`}>
      <span className="truncate text-slate-700" title={file.name}>
        {file.name} <span className="text-slate-400">({formatFileSize(file.size)})</span>
      </span>
      {onRemove && (
        <button type="button" onClick={onRemove} className="shrink-0 font-semibold text-red-500 hover:text-red-600">
          Remove
        </button>
      )}
    </div>
  );
}
