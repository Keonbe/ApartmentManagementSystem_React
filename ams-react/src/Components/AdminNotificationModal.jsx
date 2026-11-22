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

const TYPE_CONFIG = {
  occupancy_request: { label: 'Occupancy Request', icon: faUsers, tone: 'purple' },
  household_request: { label: 'Household Change', icon: faUsers, tone: 'violet' },
  lease_extension_request: { label: 'Rent Extension', icon: faCalendarPlus, tone: 'emerald' },
  new_user: { label: 'New Account', icon: faUsers, tone: 'blue' },
  rent_application: { label: 'Rent Application', icon: faFileContract, tone: 'indigo' },
  signed_contract: { label: 'Signed Contract', icon: faFileContract, tone: 'amber' },
  notarized_contract: { label: 'Notarized Contract', icon: faFileContract, tone: 'amber' },
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
  const cfg = TYPE_CONFIG[type] || { label: 'Notification', icon: faBell };

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
      {/* Same layout as the tenant's notification dialog (TopBar / UserNotifications):
          title and close on top, the message, then the actions on the right. */}
      <Modal
        labelledBy="admin-notification-title"
        onClose={handleClose}
        busy={isProcessing}
        // bg-black (not slate-900, which the admin dark theme remaps) so the page
        // dims in both themes; the border keeps the dialog's edge visible in dark mode.
        overlayClassName="flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
        className="bg-white rounded-2xl w-full max-w-lg border border-slate-200 shadow-dialog flex flex-col max-h-[85vh] overflow-hidden animate-scale-in text-left"
      >
        <div className="p-5 border-b border-slate-100 flex justify-between items-start gap-3">
          <div className="min-w-0">
            <h3 id="admin-notification-title" className="text-lg font-bold text-slate-800 m-0 break-words">{notification.title}</h3>
            <p className="m-0 mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500">
              <FontAwesomeIcon icon={cfg.icon} className="text-[10px] text-slate-400" aria-hidden="true" />
              <span className="font-semibold text-slate-600">{cfg.label}</span>
              {createdAt && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="whitespace-nowrap" title={exactTime(createdAt) || undefined}>{formatRelativeTime(createdAt)}</span>
                </>
              )}
              {isPending ? (
                <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                  <span aria-hidden="true" className="text-slate-400 font-normal">·</span>
                  <FontAwesomeIcon icon={faHourglassHalf} className="text-[10px]" aria-hidden="true" /> Needs action
                </span>
              ) : notification.status === 'Resolved' && (
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                  <span aria-hidden="true" className="text-slate-400 font-normal">·</span>
                  <FontAwesomeIcon icon={faCircleCheck} className="text-[10px]" aria-hidden="true" /> Handled
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isProcessing}
            aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center -mt-2 -mr-2 text-slate-500 hover:text-slate-700 bg-transparent border-0 cursor-pointer disabled:opacity-50"
          >
            <FontAwesomeIcon icon={faTimes} aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto min-h-0">
          <p className="text-sm text-slate-600 whitespace-pre-wrap break-words m-0">{notification.message}</p>

          {attachment && (
            <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden">
              <button
                type="button"
                className="w-full p-0 border-0 cursor-pointer group relative flex items-center justify-center bg-slate-50 overflow-hidden"
                onClick={() => setPreviewAttachment(true)}
                aria-label="View the attachment full size"
              >
                {isPdf ? (
                  <iframe src={fullAttachmentUrl} className="w-full h-64 border-0 pointer-events-none" title="Attachment preview" />
                ) : (
                  <img src={fullAttachmentUrl} alt="Attachment preview" className="w-full max-h-64 object-contain" />
                )}
                <span className="absolute inset-0 bg-slate-900/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="bg-white/95 text-slate-800 text-xs font-bold px-3 py-1.5 rounded-lg shadow flex items-center gap-1.5">
                    <FontAwesomeIcon icon={faExpand} className="text-[11px]" aria-hidden="true" />
                    View full size
                  </span>
                </span>
              </button>
              <div className="px-3 py-2 border-t border-slate-200 flex items-center gap-2 text-xs font-semibold text-slate-500">
                <FontAwesomeIcon icon={isPdf ? faFilePdf : faPaperclip} className={isPdf ? 'text-red-500' : 'text-slate-400'} aria-hidden="true" />
                Attached {isPdf ? 'PDF' : 'image'}
              </div>
            </div>
          )}

          {nextStep && (
            <p className="m-0 mt-4 flex items-start gap-2 text-xs text-slate-500 leading-relaxed">
              <FontAwesomeIcon icon={faInfoCircle} className="mt-0.5 text-indigo-500" aria-hidden="true" />
              {nextStep}
            </p>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-wrap justify-end gap-2">
          {onReject && isPending && (
            <button type="button" onClick={() => onReject(notification)} disabled={isProcessing} className="min-h-[44px] px-5 inline-flex items-center gap-2 bg-white hover:bg-red-50 text-red-700 border border-red-200 text-sm font-bold rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              <FontAwesomeIcon icon={faTimesCircle} aria-hidden="true" /> Reject
            </button>
          )}
          {onApprove && isPending && (
            <button type="button" onClick={() => onApprove(notification)} disabled={isProcessing} className="min-h-[44px] px-5 inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-bold rounded-xl cursor-pointer border-0 disabled:opacity-50 disabled:cursor-not-allowed">
              <FontAwesomeIcon icon={faCheckCircle} aria-hidden="true" /> {isProcessing ? 'Working…' : 'Approve'}
            </button>
          )}
          {targetPath && (
            <button type="button" onClick={handleGoToPage} disabled={isProcessing} className="min-h-[44px] px-6 inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl cursor-pointer border-0 disabled:opacity-50 disabled:cursor-not-allowed">
              {targetLabel}
              <FontAwesomeIcon icon={faArrowRight} className="text-[10px]" aria-hidden="true" />
            </button>
          )}
          <button type="button" onClick={handleClose} disabled={isProcessing} className="min-h-[44px] px-6 bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold rounded-xl cursor-pointer border-0 disabled:opacity-50">
            Close
          </button>
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
