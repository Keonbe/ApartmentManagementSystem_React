import { useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCropSimple, faMagnifyingGlassMinus, faMagnifyingGlassPlus, faRotateLeft, faXmark } from '@fortawesome/free-solid-svg-icons';
import Modal from './Modal';

const VIEW = 288;     // the square crop frame, in CSS px
const MAX_ZOOM = 4;
const MAX_OUT = 1024; // the cropped image is at most this many px a side

// Square crop before an upload (Payment Options → QR Ph slots). Drag the photo
// (or use the arrow keys) to place it, zoom with the slider; "Crop & upload"
// hands back a PNG of the framed square, "Upload as is" the original file.
// The caller makes `url` with URL.createObjectURL(file) and revokes it on close.
//
//   <ImageCropModal file={f} url={u} onCancel={close} onConfirm={(file) => upload(file)} />
export default function ImageCropModal({ file, url, title = 'Crop image', busy = false, onCancel, onConfirm }) {
  const imgRef = useRef(null);
  const dragRef = useRef(null);
  const [nat, setNat] = useState(null); // natural { w, h } once the image loads
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 }); // image top-left inside the frame
  const [error, setError] = useState('');

  // At zoom 1 the image just covers the frame.
  const base = nat ? Math.max(VIEW / nat.w, VIEW / nat.h) : 1;
  const scale = base * zoom;
  const clamp = (p, s = scale) => (nat ? {
    x: Math.min(0, Math.max(VIEW - nat.w * s, p.x)),
    y: Math.min(0, Math.max(VIEW - nat.h * s, p.y)),
  } : p);

  const onLoad = (e) => {
    const w = e.currentTarget.naturalWidth;
    const h = e.currentTarget.naturalHeight;
    const s = Math.max(VIEW / w, VIEW / h);
    setNat({ w, h });
    setZoom(1);
    setPos({ x: (VIEW - w * s) / 2, y: (VIEW - h * s) / 2 });
  };

  // Zoom around the frame's centre, so the part in the middle stays there.
  const zoomTo = (z) => {
    const next = Math.min(MAX_ZOOM, Math.max(1, z));
    const nextScale = base * next;
    const cx = (VIEW / 2 - pos.x) / scale;
    const cy = (VIEW / 2 - pos.y) / scale;
    setZoom(next);
    setPos(clamp({ x: VIEW / 2 - cx * nextScale, y: VIEW / 2 - cy * nextScale }, nextScale));
  };

  const onPointerDown = (e) => {
    if (!nat) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    setPos(clamp({ x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }));
  };
  const onPointerUp = () => { dragRef.current = null; };

  const onKeyDown = (e) => {
    const step = e.shiftKey ? 40 : 10;
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) {
      e.preventDefault();
      setPos(clamp({ x: pos.x + moves[e.key][0], y: pos.y + moves[e.key][1] }));
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomTo(zoom + 0.25);
    } else if (e.key === '-') {
      e.preventDefault();
      zoomTo(zoom - 0.25);
    }
  };

  const crop = () => {
    const img = imgRef.current;
    if (!img || !nat) return;
    const side = VIEW / scale; // the framed square, in source pixels
    const out = Math.max(1, Math.round(Math.min(MAX_OUT, side)));
    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext('2d');
    // White under a transparent PNG, so the QR's dark modules stay readable.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out, out);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, -pos.x / scale, -pos.y / scale, side, side, 0, 0, out, out);
    canvas.toBlob((blob) => {
      if (!blob) { setError('This image could not be cropped. Upload it as is instead.'); return; }
      const name = (file?.name || 'image').replace(/\.[^.]+$/, '') + '-cropped.png';
      onConfirm(new File([blob], name, { type: 'image/png' }));
    }, 'image/png');
  };

  return (
    <Modal title={title} onClose={onCancel} busy={busy} className="bg-white rounded-dialog shadow-dialog w-full max-w-md mx-4 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200">
        <h2 className="m-0 flex items-center gap-2 text-base font-bold text-slate-900">
          <FontAwesomeIcon icon={faCropSimple} className="text-indigo-600" aria-hidden="true" />
          {title}
        </h2>
        <button type="button" onClick={onCancel} disabled={busy} aria-label="Close"
          className="w-9 h-9 rounded-full border-0 bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer disabled:opacity-50">
          <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
        </button>
      </div>

      <div className="p-5 flex flex-col items-center gap-4">
        <p className="m-0 text-sm text-slate-600 text-center">Drag to place the QR code inside the square and zoom so its edges just fit.</p>
        <div
          role="img"
          aria-label="Crop area. Arrow keys move the image, plus and minus zoom."
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          className="relative overflow-hidden rounded-xl border border-slate-300 bg-slate-100 cursor-grab active:cursor-grabbing touch-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          style={{ width: VIEW, height: VIEW }}
        >
          <img
            ref={imgRef}
            src={url}
            alt=""
            draggable={false}
            onLoad={onLoad}
            onError={() => setError('This file could not be opened as an image.')}
            className="absolute max-w-none pointer-events-none"
            style={nat ? { left: pos.x, top: pos.y, width: nat.w * scale, height: nat.h * scale } : { opacity: 0 }}
          />
          {/* Thirds, to line the code up. Decoration only. */}
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }, (_, i) => <span key={i} className="border border-white/40" />)}
          </span>
        </div>

        <div className="w-full flex items-center gap-3">
          <button type="button" onClick={() => zoomTo(zoom - 0.25)} disabled={!nat || zoom <= 1} aria-label="Zoom out"
            className="w-9 h-9 shrink-0 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-40">
            <FontAwesomeIcon icon={faMagnifyingGlassMinus} aria-hidden="true" />
          </button>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={!nat}
            onChange={(e) => zoomTo(Number(e.target.value))}
            aria-label="Zoom"
            className="flex-1 accent-indigo-600"
          />
          <button type="button" onClick={() => zoomTo(zoom + 0.25)} disabled={!nat || zoom >= MAX_ZOOM} aria-label="Zoom in"
            className="w-9 h-9 shrink-0 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-40">
            <FontAwesomeIcon icon={faMagnifyingGlassPlus} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => nat && onLoad({ currentTarget: imgRef.current })} disabled={!nat} aria-label="Reset"
            title="Reset"
            className="w-9 h-9 shrink-0 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-40">
            <FontAwesomeIcon icon={faRotateLeft} aria-hidden="true" />
          </button>
        </div>

        {error && <p role="alert" className="m-0 w-full text-sm font-semibold text-rose-700">{error}</p>}
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 px-5 py-4 bg-slate-50 border-t border-slate-200">
        <button type="button" onClick={onCancel} disabled={busy}
          className="min-h-[40px] px-4 rounded-lg border-0 bg-transparent text-sm font-semibold text-slate-600 hover:text-slate-900 cursor-pointer disabled:opacity-50">
          Cancel
        </button>
        <button type="button" onClick={() => onConfirm(file)} disabled={busy}
          className="min-h-[40px] px-4 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50">
          Upload as is
        </button>
        <button type="button" onClick={crop} disabled={busy || !nat}
          className="min-h-[40px] px-4 rounded-lg border-0 bg-indigo-600 hover:bg-indigo-500 text-sm font-bold text-white cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-2">
          <FontAwesomeIcon icon={faCropSimple} aria-hidden="true" />
          {busy ? 'Uploading…' : 'Crop & upload'}
        </button>
      </div>
    </Modal>
  );
}
