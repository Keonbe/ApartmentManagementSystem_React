import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCamera, faVideo, faTimes, faCircle, faStop, faRotateLeft, faCheck, faFolderOpen } from '@fortawesome/free-solid-svg-icons';
import useDialog from '../../hooks/useDialog';
import useHasCamera from '../../hooks/useHasCamera';

// The chat's "Take a photo" / "Record a video" button (ChatWidget, Messages,
// Inquiries). The button is always there:
//   - on a phone or tablet it opens the device's own camera (capture input);
//   - on a computer with a webcam it opens a small camera window here
//     (getUserMedia: take the photo, or record and stop, then Use or Retake);
//   - with no camera, or when the browser blocks it, it opens the file manager
//     instead (the same picker as the paperclip, limited to images or videos).
// onFile(file) gets the File; the caller runs its usual size / type check.
//   <CameraCapture mode="photo" onFile={attach} t={t} />  // t: the chat's i18n, optional
const MAX_VIDEO_SECONDS = 60;
const VIDEO_BITS = 2_500_000; // ~19 MB a minute, under the chat's 25 MB video limit

const EN = {
  'chat.takePhoto': 'Take a photo with the camera',
  'chat.takePhotoTitle': 'Take a photo with the camera (max 10 MB)',
  'chat.recordVideo': 'Record a video with the camera',
  'chat.recordVideoTitle': 'Record a video with the camera (max 25 MB)',
  'camera.photoTitle': 'Take a photo',
  'camera.videoTitle': 'Record a video',
  'camera.close': 'Close the camera',
  'camera.starting': 'Starting the camera…',
  'camera.blocked': 'The browser did not allow the camera. Allow it in the address bar, or choose a file instead.',
  'camera.failed': 'The camera could not be started.',
  'camera.chooseFile': 'Choose a file instead',
  'camera.capture': 'Take photo',
  'camera.record': 'Start recording',
  'camera.stop': 'Stop recording',
  'camera.retake': 'Retake',
  'camera.usePhoto': 'Use photo',
  'camera.useVideo': 'Use video',
  'camera.recording': 'Recording {time} / {max}',
};

const isTouchDevice = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
// WebM first (what Chrome, Edge and Firefox record), MP4 for Safari.
const RECORD_TYPES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
const pickRecordType = () => RECORD_TYPES.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || '';
const stamp = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

export default function CameraCapture({ mode = 'photo', onFile, t, disabled = false, className = '', iconClassName = '' }) {
  // The chat's own wording when it passes t (English or Filipino), else English.
  const label = (key, vars) => {
    const text = t ? t(key, vars) : null;
    if (text && text !== key) return text;
    return (EN[key] || key).replace(/\{(\w+)\}/g, (m, name) => (vars && name in vars ? String(vars[name]) : m));
  };
  const isVideo = mode === 'video';
  const hasCamera = useHasCamera(); // null while unknown
  const captureInputRef = useRef(null); // phones: the device camera
  const fileInputRef = useRef(null);    // no camera: the file manager
  const [open, setOpen] = useState(false);

  const handleInput = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) onFile?.(file);
  };

  const start = () => {
    if (disabled) return;
    if (isTouchDevice()) { captureInputRef.current?.click(); return; }
    // Known to have no camera, or a browser without camera access: straight to the files
    // (inside the click, so the browser lets the picker open).
    if (hasCamera === false || !navigator.mediaDevices?.getUserMedia) { fileInputRef.current?.click(); return; }
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={disabled}
        aria-label={label(isVideo ? 'chat.recordVideo' : 'chat.takePhoto')}
        title={label(isVideo ? 'chat.recordVideoTitle' : 'chat.takePhotoTitle')}
        className={className || 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full cursor-pointer text-slate-500 bg-transparent border-0 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'}
      >
        <FontAwesomeIcon icon={isVideo ? faVideo : faCamera} className={iconClassName} aria-hidden="true" />
      </button>
      <input ref={captureInputRef} type="file" accept={isVideo ? 'video/*' : 'image/*'} capture="environment" className="hidden" tabIndex={-1} aria-hidden="true" onChange={handleInput} />
      <input ref={fileInputRef} type="file" accept={isVideo ? 'video/*' : 'image/*'} className="hidden" tabIndex={-1} aria-hidden="true" onChange={handleInput} />
      {open && (
        <CameraWindow
          isVideo={isVideo}
          label={label}
          onClose={() => setOpen(false)}
          onFile={(file) => { setOpen(false); onFile?.(file); }}
          onChooseFile={() => { setOpen(false); fileInputRef.current?.click(); }}
        />
      )}
    </>
  );
}

function CameraWindow({ isVideo, label, onClose, onFile, onChooseFile }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const [status, setStatus] = useState('starting'); // starting | live | recording | review | error
  const [error, setError] = useState(''); // blocked | failed
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState(null); // { file, url }
  const dialogRef = useDialog(true, onClose);
  const chooseFileRef = useRef(onChooseFile);
  useEffect(() => { chooseFileRef.current = onChooseFile; });

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  // Opens the camera on mount and again on each retry (attempt); stops it on close.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const video = { width: { ideal: 1280 }, height: { ideal: 720 } };
    const open = async () => {
      try {
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video, audio: isVideo });
        } catch (err) {
          // A video without sound is better than none (no microphone, or the mic was refused).
          if (!isVideo || (err?.name === 'NotFoundError' && !(await hasVideoInput()))) throw err;
          stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        }
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        if (!cancelled) setStatus('live');
      } catch (err) {
        if (cancelled) return;
        const name = err?.name;
        // No camera after all: straight to the file manager (still within the click).
        if (name === 'NotFoundError' || name === 'OverconstrainedError') { chooseFileRef.current(); return; }
        // Blocked or broken: say why, with the same way out.
        setError(name === 'NotAllowedError' || name === 'SecurityError' ? 'blocked' : 'failed');
        setStatus('error');
      }
    };
    open();
    return () => {
      cancelled = true;
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      stopStream();
    };
  }, [attempt, isVideo, stopStream]);

  // The review's object URL is let go when it is replaced or the window closes.
  useEffect(() => () => { if (result?.url) URL.revokeObjectURL(result.url); }, [result]);

  // The recording stops itself at the time limit.
  useEffect(() => {
    if (status !== 'recording') return undefined;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [status]);
  useEffect(() => {
    if (status === 'recording' && seconds >= MAX_VIDEO_SECONDS) stopRecording();
  }, [seconds, status]);

  const takePhoto = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `photo-${stamp()}.jpg`, { type: 'image/jpeg' });
      setResult({ file, url: URL.createObjectURL(file) });
      setStatus('review');
    }, 'image/jpeg', 0.9);
  };

  const startRecording = () => {
    if (!streamRef.current || !window.MediaRecorder) { setError('failed'); setStatus('error'); return; }
    const type = pickRecordType();
    const recorder = new MediaRecorder(streamRef.current, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: VIDEO_BITS });
    chunksRef.current = [];
    recorder.ondataavailable = (event) => { if (event.data?.size) chunksRef.current.push(event.data); };
    recorder.onstop = () => {
      const mime = (recorder.mimeType || type || 'video/webm').split(';')[0];
      const blob = new Blob(chunksRef.current, { type: mime });
      if (!blob.size) { setStatus('live'); return; }
      const file = new File([blob], `video-${stamp()}.${mime === 'video/mp4' ? 'mp4' : 'webm'}`, { type: mime });
      setResult({ file, url: URL.createObjectURL(file) });
      setStatus('review');
    };
    recorderRef.current = recorder;
    recorder.start(1000);
    setSeconds(0);
    setStatus('recording');
  };

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }

  const retake = () => {
    setResult(null);
    setSeconds(0);
    if (streamRef.current) { setStatus('live'); return; }
    setStatus('starting');
    setError('');
    setAttempt((n) => n + 1);
  };

  const title = label(isVideo ? 'camera.videoTitle' : 'camera.photoTitle');
  const roundBtn = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border-0 px-5 text-sm font-bold cursor-pointer transition-colors';

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} className="w-[min(40rem,100%)] overflow-hidden rounded-2xl bg-slate-900 text-white shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="m-0 text-sm font-bold">{title}</p>
          <button type="button" onClick={onClose} aria-label={label('camera.close')} className="flex h-10 w-10 items-center justify-center rounded-full border-0 bg-white/10 text-white cursor-pointer hover:bg-white/20">
            <FontAwesomeIcon icon={faTimes} aria-hidden="true" />
          </button>
        </div>
        <div className="relative aspect-video w-full bg-black">
          {/* Mirrored like a mirror while live; the photo or video itself is not. */}
          <video ref={videoRef} muted playsInline className={`h-full w-full object-contain -scale-x-100 ${status === 'review' || status === 'error' ? 'hidden' : ''}`} />
          {status === 'review' && result && (isVideo
            ? <video src={result.url} controls playsInline className="h-full w-full object-contain" />
            : <img src={result.url} alt="" className="h-full w-full object-contain" />)}
          {status === 'starting' && <p className="absolute inset-0 m-0 flex items-center justify-center text-sm text-slate-300">{label('camera.starting')}</p>}
          {status === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <p role="alert" className="m-0 max-w-sm text-sm text-slate-200">{label(`camera.${error}`)}</p>
              <button type="button" onClick={onChooseFile} data-autofocus className={`${roundBtn} bg-white text-slate-900 hover:bg-slate-200`}>
                <FontAwesomeIcon icon={faFolderOpen} aria-hidden="true" /> {label('camera.chooseFile')}
              </button>
            </div>
          )}
          {status === 'recording' && (
            <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold" role="status">
              <FontAwesomeIcon icon={faCircle} className="text-[8px] animate-pulse" aria-hidden="true" />
              {label('camera.recording', { time: clock(seconds), max: clock(MAX_VIDEO_SECONDS) })}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 px-4 py-4">
          {status === 'live' && !isVideo && (
            <button type="button" onClick={takePhoto} data-autofocus className={`${roundBtn} bg-white text-slate-900 hover:bg-slate-200`}>
              <FontAwesomeIcon icon={faCamera} aria-hidden="true" /> {label('camera.capture')}
            </button>
          )}
          {status === 'live' && isVideo && (
            <button type="button" onClick={startRecording} data-autofocus className={`${roundBtn} bg-red-600 text-white hover:bg-red-700`}>
              <FontAwesomeIcon icon={faCircle} aria-hidden="true" /> {label('camera.record')}
            </button>
          )}
          {status === 'recording' && (
            <button type="button" onClick={stopRecording} data-autofocus className={`${roundBtn} bg-white text-slate-900 hover:bg-slate-200`}>
              <FontAwesomeIcon icon={faStop} aria-hidden="true" /> {label('camera.stop')}
            </button>
          )}
          {status === 'review' && result && (
            <>
              <button type="button" onClick={retake} className={`${roundBtn} bg-white/10 text-white hover:bg-white/20`}>
                <FontAwesomeIcon icon={faRotateLeft} aria-hidden="true" /> {label('camera.retake')}
              </button>
              <button type="button" onClick={() => onFile(result.file)} data-autofocus className={`${roundBtn} bg-indigo-500 text-white hover:bg-indigo-600`}>
                <FontAwesomeIcon icon={faCheck} aria-hidden="true" /> {label(isVideo ? 'camera.useVideo' : 'camera.usePhoto')}
              </button>
            </>
          )}
          {(status === 'live' || status === 'starting') && (
            <button type="button" onClick={onChooseFile} className="border-0 bg-transparent px-2 text-xs font-semibold text-slate-300 underline cursor-pointer hover:text-white">
              {label('camera.chooseFile')}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

async function hasVideoInput() {
  try {
    return (await navigator.mediaDevices.enumerateDevices()).some((d) => d.kind === 'videoinput');
  } catch {
    return false;
  }
}
