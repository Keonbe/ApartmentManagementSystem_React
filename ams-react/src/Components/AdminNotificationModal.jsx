import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTimes, faArrowRight, faClock, faCheckCircle, faTimesCircle,
  faFileContract, faWrench, faCar, faVideo, faConciergeBell,
  faInfoCircle, faMoneyBillWave, faUsers, faCalendarPlus, faBell,
  faExpand
} from '@fortawesome/free-solid-svg-icons';
import fileUrl from '../api/fileUrl';
import {
  ADMIN_NOTIFICATION_TARGETS,
  ADMIN_NOTIFICATION_LINKS,
  formatRelativeTime
} from '../config/notificationLinks';
import DocumentPreviewModal from './DocumentPreviewModal';

const TYPE_CONFIG = {
  occupancy_request: { label: 'Occupancy Request', icon: faUsers, color: 'bg-purple-100 text-purple-600', badge: 'bg-purple-100 text-purple-700' },
  household_request: { label: 'Household Change', icon: faUsers, color: 'bg-violet-100 text-violet-600', badge: 'bg-violet-100 text-violet-700' },
  lease_extension_request: { label: 'Rent Extension', icon: faCalendarPlus, color: 'bg-emerald-100 text-emerald-600', badge: 'bg-emerald-100 text-emerald-700' },
  rent_application: { label: 'Rent Application', icon: faFileContract, color: 'bg-indigo-100 text-indigo-600', badge: 'bg-indigo-100 text-indigo-700' },
  maintenance_request: { label: 'Maintenance', icon: faWrench, color: 'bg-amber-100 text-amber-600', badge: 'bg-amber-100 text-amber-700' },
  parking_reservation: { label: 'Parking', icon: faCar, color: 'bg-teal-100 text-teal-600', badge: 'bg-teal-100 text-teal-700' },
  cctv_request: { label: 'CCTV Request', icon: faVideo, color: 'bg-slate-100 text-slate-600', badge: 'bg-slate-100 text-slate-700' },
  service_request: { label: 'Service Booking', icon: faConciergeBell, color: 'bg-cyan-100 text-cyan-600', badge: 'bg-cyan-100 text-cyan-700' },
  inquiry: { label: 'Inquiry', icon: faInfoCircle, color: 'bg-sky-100 text-sky-600', badge: 'bg-sky-100 text-sky-700' },
  unit_waitlist: { label: 'Waitlist', icon: faClock, color: 'bg-sky-100 text-sky-600', badge: 'bg-sky-100 text-sky-700' },
  payment_verification: { label: 'Payment Proof', icon: faMoneyBillWave, color: 'bg-emerald-100 text-emerald-600', badge: 'bg-emerald-100 text-emerald-700' },
  cash_payment_declared: { label: 'Cash Payment', icon: faMoneyBillWave, color: 'bg-emerald-100 text-emerald-600', badge: 'bg-emerald-100 text-emerald-700' },
  payment: { label: 'Payment', icon: faMoneyBillWave, color: 'bg-emerald-100 text-emerald-600', badge: 'bg-emerald-100 text-emerald-700' },
  move_out_request: { label: 'Move-Out Notice', icon: faCalendarPlus, color: 'bg-rose-100 text-rose-600', badge: 'bg-rose-100 text-rose-700' },
  visitor_registration: { label: 'Visitor', icon: faUsers, color: 'bg-purple-100 text-purple-600', badge: 'bg-purple-100 text-purple-700' },
  visitor_overstay: { label: 'Visitor Alert', icon: faUsers, color: 'bg-rose-100 text-rose-600', badge: 'bg-rose-100 text-rose-700' },
};

export default function AdminNotificationModal({
  notification,
  isOpen = true,
  onClose,
  onIgnore,
  onGoToPage,
  onApprove,
  onReject,
  isProcessing = false
}) {
  const [previewAttachment, setPreviewAttachment] = useState(false);

  if (!isOpen || !notification) return null;

  const type = notification.type;
  const cfg = TYPE_CONFIG[type] || {
    label: 'Notification',
    icon: faBell,
    color: 'bg-slate-100 text-slate-600',
    badge: 'bg-slate-100 text-slate-700'
  };

  const target = ADMIN_NOTIFICATION_TARGETS[type];
  const targetPath = target?.path || ADMIN_NOTIFICATION_LINKS[type];
  const targetLabel = target?.label || 'Go to Page';

  const attachment = notification.attachment_path || notification.attachmentPath;
  const createdAt = notification.created_at || notification.createdAt;
  const isPending = notification.status === 'Pending';
  const fullAttachmentUrl = attachment ? fileUrl(attachment) : null;
  const isPdf = attachment && attachment.toLowerCase().endsWith('.pdf');

  const handleIgnore = () => {
    if (onIgnore) {
      onIgnore(notification);
    } else if (onClose) {
      onClose();
    }
  };

  const handleGoToPage = () => {
    if (onGoToPage) {
      onGoToPage(notification, targetPath);
    } else if (onClose) {
      onClose();
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in select-none"
        onClick={handleIgnore}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-[88vh] overflow-hidden animate-scale-in text-left border border-slate-100 relative"
        >
          {/* Header */}
          <div className="p-5 sm:p-6 border-b border-slate-100 flex items-start justify-between gap-3 bg-slate-50/70">
            <div className="flex items-start gap-3 min-w-0">
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-xs ${cfg.color}`}>
                <FontAwesomeIcon icon={cfg.icon} className="text-base" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.badge}`}>
                    {cfg.label}
                  </span>
                  {isPending && (
                    <span className="bg-amber-100 text-amber-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-amber-200">
                      Pending Action
                    </span>
                  )}
                  {createdAt && (
                    <span className="text-[10px] text-slate-400 font-medium">
                      {formatRelativeTime(createdAt)}
                    </span>
                  )}
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 m-0 leading-snug">
                  {notification.title}
                </h3>
              </div>
            </div>

            <button
              type="button"
              onClick={handleIgnore}
              aria-label="Close"
              className="text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 w-8 h-8 rounded-full flex items-center justify-center bg-transparent border-0 cursor-pointer transition-colors shrink-0 -mt-1 -mr-1"
            >
              <FontAwesomeIcon icon={faTimes} className="text-sm" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 sm:p-6 overflow-y-auto space-y-4">
            <p className="text-sm text-slate-700 whitespace-pre-wrap m-0 leading-relaxed font-normal">
              {notification.message}
            </p>

            {/* Attachment preview */}
            {attachment && (
              <div className="mt-3 border border-slate-200 rounded-2xl overflow-hidden bg-slate-50 shadow-xs">
                <div className="px-3.5 py-2 border-b border-slate-200 bg-white flex items-center justify-between text-xs text-slate-600 font-semibold">
                  <span>Attached File ({isPdf ? 'PDF Document' : 'Image'})</span>
                  <button
                    type="button"
                    onClick={() => setPreviewAttachment(true)}
                    className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer bg-transparent border-0 text-xs font-bold p-0"
                  >
                    <FontAwesomeIcon icon={faExpand} className="text-[10px]" />
                    <span>View Full Size</span>
                  </button>
                </div>

                <div
                  className="cursor-pointer group relative flex items-center justify-center bg-slate-100 overflow-hidden"
                  onClick={() => setPreviewAttachment(true)}
                >
                  {isPdf ? (
                    <iframe
                      src={fullAttachmentUrl}
                      className="w-full h-56 border-0 pointer-events-none"
                      title="Attachment Preview"
                    />
                  ) : (
                    <img
                      src={fullAttachmentUrl}
                      alt="Attachment preview"
                      className="w-full max-h-56 object-contain transition-transform duration-200 group-hover:scale-102"
                    />
                  )}
                  <div className="absolute inset-0 bg-slate-900/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="bg-white/95 text-slate-800 text-xs font-bold px-3 py-1.5 rounded-xl shadow-md flex items-center gap-1.5">
                      <FontAwesomeIcon icon={faExpand} className="text-[11px]" />
                      Click to expand
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={handleIgnore}
              className="px-5 py-2.5 bg-white hover:bg-slate-100 active:scale-[0.98] text-slate-700 text-xs font-bold rounded-xl cursor-pointer border border-slate-200 shadow-xs transition-all"
            >
              Ignore
            </button>

            <div className="flex items-center gap-2">
              {/* Optional decision buttons if approve/reject are provided directly */}
              {onApprove && isPending && (
                <button
                  type="button"
                  onClick={() => onApprove(notification)}
                  disabled={isProcessing}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-xs font-bold rounded-xl cursor-pointer border-0 shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  <FontAwesomeIcon icon={faCheckCircle} />
                  <span>Approve</span>
                </button>
              )}

              {onReject && isPending && (
                <button
                  type="button"
                  onClick={() => onReject(notification)}
                  disabled={isProcessing}
                  className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 active:scale-[0.98] text-rose-600 text-xs font-bold rounded-xl cursor-pointer border border-rose-200 transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  <FontAwesomeIcon icon={faTimesCircle} />
                  <span>Reject</span>
                </button>
              )}

              {/* Navigation button */}
              {targetPath && (
                <button
                  type="button"
                  onClick={handleGoToPage}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-xs font-bold rounded-xl cursor-pointer border-0 shadow-sm shadow-indigo-100 transition-all flex items-center gap-2"
                >
                  <span>{targetLabel}</span>
                  <FontAwesomeIcon icon={faArrowRight} className="text-[10px]" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Full preview modal if user clicks attachment */}
      {previewAttachment && fullAttachmentUrl && (
        <DocumentPreviewModal
          isOpen={previewAttachment}
          onClose={() => setPreviewAttachment(false)}
          title={notification.title || 'Attachment Preview'}
          fileUrl={fullAttachmentUrl}
          isImage={!isPdf}
        />
      )}
    </>
  );
}

