import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTimes, faArrowRight, faClock, faCheckCircle, faTimesCircle,
  faFileContract, faWrench, faCar, faVideo, faConciergeBell,
  faInfoCircle, faMoneyBillWave, faUsers, faCalendarPlus, faBell,
  faExpand, faExclamationTriangle, faPaperclip, faFilePdf, faCircleCheck, faHourglassHalf
} from '@fortawesome/free-solid-svg-icons';
import fileUrl from '../api/fileUrl';
import {
  ADMIN_NOTIFICATION_TARGETS,
  ADMIN_NOTIFICATION_LINKS,
  formatRelativeTime
} from '../config/notificationLinks';
import DocumentPreviewModal from './DocumentPreviewModal';
import Modal from './admin/Modal';
import { btn } from './admin/ui/styles';

const TYPE_CONFIG = {
  occupancy_request: { label: 'Occupancy Request', icon: faUsers, tone: 'purple' },
  household_request: { label: 'Household Change', icon: faUsers, tone: 'violet' },
  lease_extension_request: { label: 'Rent Extension', icon: faCalendarPlus, tone: 'emerald' },
  new_user: { label: 'New Account', icon: faUsers, tone: 'blue' },
  rent_application: { label: 'Rent Application', icon: faFileContract, tone: 'indigo' },
  maintenance_request: { label: 'Maintenance', icon: faWrench, tone: 'amber' },
  parking_reservation: { label: 'Parking', icon: faCar, tone: 'teal' },
  cctv_request: { label: 'CCTV Request', icon: faVideo, tone: 'slate' },
  service_request: { label: 'Service Booking', icon: faConciergeBell, tone: 'cyan' },
  inquiry: { label: 'Inquiry', icon: faInfoCircle, tone: 'sky' },
  complaint: { label: 'Complaint', icon: faExclamationTriangle, tone: 'red' },
  unit_waitlist: { label: 'Waitlist', icon: faClock, tone: 'sky' },
  payment_verification: { label: 'Payment Proof', icon: faMoneyBillWave, tone: 'emerald' },
  cash_payment_declared: { label: 'Cash Payment', icon: faMoneyBillWave, tone: 'emerald' },
  payment: { label: 'Payment', icon: faMoneyBillWave, tone: 'emerald' },
  payment_followup: { label: 'Overdue Payment', icon: faExclamationTriangle, tone: 'red' },
  document_followup: { label: 'Documents Needed', icon: faFileContract, tone: 'amber' },
  refund_request: { label: 'Refund Request', icon: faMoneyBillWave, tone: 'emerald' },
  move_out_request: { label: 'Move-Out Notice', icon: faCalendarPlus, tone: 'red' },
  visitor_registration: { label: 'Visitor', icon: faUsers, tone: 'purple' },
  visitor_overstay: { label: 'Visitor Alert', icon: faUsers, tone: 'red' },
};

// Full class strings per tone so Tailwind keeps them (the admin dark theme
// remaps these shades). bar = the strip on top, icon = the round badge,
// badge = the type chip.
const TONES = {
  purple: { bar: 'bg-purple-500', icon: 'bg-purple-100 text-purple-600', badge: 'bg-purple-100 text-purple-700' },
  violet: { bar: 'bg-violet-500', icon: 'bg-violet-100 text-violet-600', badge: 'bg-violet-100 text-violet-700' },
  emerald: { bar: 'bg-emerald-500', icon: 'bg-emerald-100 text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
  blue: { bar: 'bg-blue-500', icon: 'bg-blue-100 text-blue-600', badge: 'bg-blue-100 text-blue-700' },
  indigo: { bar: 'bg-indigo-500', icon: 'bg-indigo-100 text-indigo-600', badge: 'bg-indigo-100 text-indigo-700' },
  amber: { bar: 'bg-amber-500', icon: 'bg-amber-100 text-amber-700', badge: 'bg-amber-100 text-amber-700' },
  teal: { bar: 'bg-teal-500', icon: 'bg-teal-100 text-teal-600', badge: 'bg-teal-100 text-teal-700' },
  slate: { bar: 'bg-slate-400', icon: 'bg-slate-100 text-slate-600', badge: 'bg-slate-100 text-slate-700' },
  cyan: { bar: 'bg-cyan-500', icon: 'bg-cyan-100 text-cyan-600', badge: 'bg-cyan-100 text-cyan-700' },
  sky: { bar: 'bg-sky-500', icon: 'bg-sky-100 text-sky-700', badge: 'bg-sky-100 text-sky-700' },
  red: { bar: 'bg-red-500', icon: 'bg-red-100 text-red-600', badge: 'bg-red-100 text-red-700' },
};

// "Nov 7, 2026, 3:12 PM" from the API's "2026-11-07 15:12:00".
const exactTime = (value) => {
  const d = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
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
  const cfg = TYPE_CONFIG[type] || { label: 'Notification', icon: faBell, tone: 'slate' };
  const tone = TONES[cfg.tone] || TONES.slate;

  const target = ADMIN_NOTIFICATION_TARGETS[type];
  const targetPath = target?.path || ADMIN_NOTIFICATION_LINKS[type];
  const targetLabel = target?.label || 'Go to Page';

  const attachment = notification.attachment_path || notification.attachmentPath;
  const createdAt = notification.created_at || notification.createdAt;
  const isPending = notification.status === 'Pending';
  const fullAttachmentUrl = attachment ? fileUrl(attachment) : null;
  const isPdf = attachment && attachment.toLowerCase().endsWith('.pdf');
  const decideHere = isPending && (onApprove || onReject);

  // Closing marks the notice read (onIgnore); a pending request stays pending.
  const handleClose = () => {
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

  const nextStep = decideHere
    ? 'Approve or reject it here. It leaves the pending list once decided.'
    : isPending && targetPath
      ? `Open ${targetLabel.replace(/^Go to /i, '')} to review and decide. It leaves the pending list once decided.`
      : null;

  return (
    <>
      <Modal
        labelledBy="admin-notification-title"
        onClose={handleClose}
        busy={isProcessing}
        overlayClassName="flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in"
        className="bg-white rounded-dialog w-full max-w-lg shadow-dialog flex flex-col max-h-[88vh] overflow-hidden animate-scale-in text-left border border-slate-200 relative"
      >
        <div className={`h-1.5 shrink-0 ${tone.bar}`} aria-hidden="true" />

        {/* Header */}
        <div className="px-5 sm:px-6 pt-5 pb-4 flex items-start gap-4">
          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shrink-0 ${tone.icon}`}>
            <FontAwesomeIcon icon={cfg.icon} className="text-lg" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`rounded-full px-2.5 py-0.5 text-caption font-semibold whitespace-nowrap ${tone.badge}`}>
                {cfg.label}
              </span>
              {isPending ? (
                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-caption font-semibold whitespace-nowrap bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200">
                  <FontAwesomeIcon icon={faHourglassHalf} className="text-[10px]" /> Needs action
                </span>
              ) : notification.status === 'Resolved' && (
                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-caption font-semibold whitespace-nowrap bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200">
                  <FontAwesomeIcon icon={faCircleCheck} className="text-[10px]" /> Handled
                </span>
              )}
            </div>
            <h2 id="admin-notification-title" className="mt-2 mb-0 text-title font-bold text-slate-900 leading-snug break-words">
              {notification.title}
            </h2>
            {createdAt && (
              <p className="m-0 mt-1 flex flex-wrap items-center gap-x-1.5 text-caption text-slate-500">
                <FontAwesomeIcon icon={faClock} className="text-[10px]" />
                <span className="whitespace-nowrap">{formatRelativeTime(createdAt)}</span>
                {exactTime(createdAt) && <span className="whitespace-nowrap text-slate-400">· {exactTime(createdAt)}</span>}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={isProcessing}
            aria-label="Close"
            className="text-slate-500 hover:text-slate-800 hover:bg-slate-100 w-9 h-9 rounded-full flex items-center justify-center bg-transparent border-0 cursor-pointer transition-colors shrink-0 -mt-1 -mr-2 disabled:opacity-50"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 sm:px-6 pb-5 overflow-y-auto space-y-4 min-h-0">
          <div className="rounded-card border border-slate-200 bg-slate-50 px-4 py-3.5">
            <p className="text-body text-slate-700 whitespace-pre-wrap break-words m-0 leading-relaxed">
              {notification.message}
            </p>
          </div>

          {attachment && (
            <div className="border border-slate-200 rounded-card overflow-hidden bg-white">
              <div className="px-3.5 py-2 border-b border-slate-200 flex items-center justify-between gap-2 text-label text-slate-600 font-semibold">
                <span className="flex items-center gap-2">
                  <FontAwesomeIcon icon={isPdf ? faFilePdf : faPaperclip} className={isPdf ? 'text-red-500' : 'text-slate-400'} />
                  Attached {isPdf ? 'PDF' : 'image'}
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewAttachment(true)}
                  className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 cursor-pointer bg-transparent border-0 text-label font-semibold p-0"
                >
                  <FontAwesomeIcon icon={faExpand} className="text-[10px]" />
                  View full size
                </button>
              </div>
              <button
                type="button"
                className="w-full p-0 border-0 cursor-pointer group relative flex items-center justify-center bg-slate-100 overflow-hidden"
                onClick={() => setPreviewAttachment(true)}
                aria-label="View the attachment full size"
              >
                {isPdf ? (
                  <iframe src={fullAttachmentUrl} className="w-full h-56 border-0 pointer-events-none" title="Attachment preview" />
                ) : (
                  <img src={fullAttachmentUrl} alt="Attachment preview" className="w-full max-h-56 object-contain transition-[scale] duration-200 group-hover:scale-102" />
                )}
                <span className="absolute inset-0 bg-slate-900/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="bg-white/95 text-slate-800 text-label font-bold px-3 py-1.5 rounded-card shadow-raised flex items-center gap-1.5">
                    <FontAwesomeIcon icon={faExpand} className="text-[11px]" />
                    Click to expand
                  </span>
                </span>
              </button>
            </div>
          )}

          {nextStep && (
            <p className="m-0 flex items-start gap-2 text-caption text-slate-500 leading-relaxed">
              <FontAwesomeIcon icon={faInfoCircle} className="mt-0.5 text-indigo-500" />
              {nextStep}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
          <button type="button" onClick={handleClose} disabled={isProcessing} className={btn('ghost', 'sm', 'justify-center')}>
            Close
          </button>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2">
            {onReject && isPending && (
              <button type="button" onClick={() => onReject(notification)} disabled={isProcessing} className={btn('danger-outline', 'sm', 'justify-center')}>
                <FontAwesomeIcon icon={faTimesCircle} />
                <span>Reject</span>
              </button>
            )}
            {onApprove && isPending && (
              <button type="button" onClick={() => onApprove(notification)} disabled={isProcessing} className={btn('success', 'sm', 'justify-center')}>
                <FontAwesomeIcon icon={faCheckCircle} />
                <span>{isProcessing ? 'Working…' : 'Approve'}</span>
              </button>
            )}
            {targetPath && (
              <button type="button" onClick={handleGoToPage} disabled={isProcessing} className={btn(decideHere ? 'secondary' : 'primary', 'sm', 'justify-center')}>
                <span>{targetLabel}</span>
                <FontAwesomeIcon icon={faArrowRight} className="text-[10px]" />
              </button>
            )}
          </div>
        </div>
      </Modal>

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
