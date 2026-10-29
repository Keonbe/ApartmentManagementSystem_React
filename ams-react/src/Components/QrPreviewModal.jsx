import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faDownload, faQrcode, faCopy, faCheck } from '@fortawesome/free-solid-svg-icons';
import { publicAssetUrl } from '../api/fileUrl';

export default function QrPreviewModal({
  isOpen,
  onClose,
  imagePath,
  title = 'QR Ph (Scan to Pay)',
  accountName,
  accountNumber,
}) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !imagePath) return null;

  const fullUrl = publicAssetUrl(imagePath);

  const handleCopyAccount = () => {
    if (!accountNumber) return;
    try {
      navigator.clipboard?.writeText(accountNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback ignore
    }
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-fade-in select-none"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-lg md:max-w-xl lg:max-w-2xl max-h-[94vh] overflow-hidden animate-scale-in border border-slate-100 flex flex-col text-slate-800 relative my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 sm:px-8 sm:py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100">
              <FontAwesomeIcon icon={faQrcode} className="text-base" />
            </span>
            <div className="min-w-0">
              <h3 className="text-lg font-black text-slate-900 m-0 truncate">
                {title}
              </h3>
              <p className="text-xs text-slate-500 m-0 font-medium">Interoperable QR Ph standard • GCash, Maya & Banks</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 flex items-center justify-center bg-transparent border-0 cursor-pointer transition-colors shrink-0"
          >
            <FontAwesomeIcon icon={faTimes} className="text-base" />
          </button>
        </div>

        {/* Large Centered QR Image */}
        <div className="p-6 sm:p-8 flex flex-col items-center bg-slate-50/50 overflow-y-auto">
          <div className="w-full max-w-[440px] sm:max-w-[480px] aspect-square rounded-3xl bg-white p-4 sm:p-5 border-2 border-slate-200 shadow-lg flex items-center justify-center">
            <img
              src={fullUrl}
              alt={title}
              className="w-full h-full object-contain rounded-2xl select-none"
            />
          </div>

          {/* Account Details Pill */}
          {(accountName || accountNumber) && (
            <div className="w-full max-w-[440px] sm:max-w-[480px] mt-5 p-4 bg-white rounded-2xl border border-slate-200/90 shadow-xs space-y-2 text-left">
              {accountName && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500 font-semibold text-xs shrink-0">Account Name:</span>
                  <span className="font-extrabold text-slate-900 text-sm truncate max-w-[240px] text-right">{accountName}</span>
                </div>
              )}
              {accountNumber && (
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
                  <span className="text-slate-500 font-semibold text-xs shrink-0">Account / Mobile No:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-indigo-600 text-sm sm:text-base tracking-wide">{accountNumber}</span>
                    <button
                      type="button"
                      onClick={handleCopyAccount}
                      className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-bold border border-indigo-200/60 cursor-pointer transition-colors inline-flex items-center gap-1.5"
                      title="Copy account number"
                    >
                      <FontAwesomeIcon icon={copied ? faCheck : faCopy} className="text-xs" />
                      <span>{copied ? 'Copied!' : 'Copy'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-slate-500 text-center max-w-[440px] sm:max-w-[480px] mt-4 mb-0 leading-relaxed font-medium">
            Scan using GCash, Maya, BDO, BPI, or any Philippine banking app, then enter the reference number and upload your receipt below.
          </p>
        </div>

        {/* Modal Actions */}
        <div className="px-6 py-4 sm:px-8 sm:py-4 border-t border-slate-100 bg-white flex items-center justify-end gap-3 shrink-0">
          <a
            href={fullUrl}
            download="qr_ph_payment.png"
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl cursor-pointer no-underline border-0 shadow-md shadow-indigo-600/20 transition-all inline-flex items-center gap-2 hover:-translate-y-0.5 active:translate-y-0"
          >
            <FontAwesomeIcon icon={faDownload} />
            <span>Save to Gallery</span>
          </a>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl cursor-pointer border-0 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

