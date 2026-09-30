import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faVideo } from '@fortawesome/free-solid-svg-icons';

export default function ChatAttachmentPreview({ file, previewUrl, onRemove }) {
  if (!file) return null;

  const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name);

  return (
    <div className="relative inline-flex max-w-full items-center rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      {isVideo ? (
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-800">
          <video src={previewUrl} muted playsInline preload="metadata" aria-label="Video attachment preview" className="h-full w-full object-cover" />
          <FontAwesomeIcon icon={faVideo} className="absolute bottom-1 right-1 rounded bg-black/60 p-1 text-[10px] text-white" />
        </div>
      ) : (
        <img src={previewUrl} alt="Image attachment preview" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
      )}
      <button type="button" onClick={onRemove} aria-label="Remove attachment" className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border-0 bg-slate-700 text-white shadow hover:bg-slate-900">
        <FontAwesomeIcon icon={faTimes} className="text-xs" />
      </button>
    </div>
  );
}