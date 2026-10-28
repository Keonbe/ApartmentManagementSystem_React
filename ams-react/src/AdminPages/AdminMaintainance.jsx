import React, { useState, useMemo, useEffect, useCallback } from 'react';
import api from '../api/axiosConfig';
import { fileUrl } from '../api/fileUrl';
import { LIMITS, MAX_AMOUNT, TITLE_MIN, checkAmount, checkText } from '../utils/validation';
import { FILE_RULES, acceptFor, checkFile } from '../utils/fileLimits';
import { apiErrorMessage } from '../utils/apiError';
import { clickable } from '../utils/clickable';
import useFieldErrors from '../hooks/useFieldErrors';
import useFilePreview from '../hooks/useFilePreview';
import FieldError from '../Components/form/FieldError';
import CharCount from '../Components/form/CharCount';
import { blockNonNumericKeys, formatFileSize, invalidCls } from '../Components/form/formHelpers';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus, faSearch, faTableCells, faList, faClock, faWrench, faCheckCircle, faExclamationTriangle,
  faTimes, faMapPin, faCalendarAlt, faImage, faArrowRight, faUser, faFilter, faUpload, faPaperPlane,
  faShieldAlt, faChartBar, faInfoCircle, faFileContract, faBan, faUndo, faChevronDown
} from '@fortawesome/free-solid-svg-icons';
import { getSystemSettings } from '../config/systemSettings';
import Modal from '../Components/admin/Modal';
import {
  MAINTENANCE_CATEGORIES, MAINTENANCE_URGENCIES, MAINTENANCE_DEFAULT_URGENCY, MAINTENANCE_TRANSITIONS, MAINTENANCE_STATUS_STYLES,
  urgencyWeight, urgencyColor
} from '../config/maintenanceOptions';

const parseDate = (value) => (value ? new Date(String(value).replace(' ', 'T')) : null);

const formatDateTime = (value) => {
  const d = parseDate(value);
  return d ? d.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
};

const getRelativeTime = (value) => {
  const d = parseDate(value);
  if (!d) return '—';
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days > 30) return '1mo+ ago';
  return `${days}d ago`;
};

const formatDuration = (hours) => {
  if (hours === null || hours === undefined) return null;
  return hours < 24 ? `${hours}h` : `${Math.round((hours / 24) * 10) / 10} days`;
};

const formatCurrency = (n) => `₱${Number(n || 0).toLocaleString()}`;

const noteStamp = () =>
  new Date().toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

// Notes are stored as "[stamp] text" entries separated by blank lines; older free-text notes have no stamp.
const parseNotes = (text) =>
  (text || '').split(/\n{2,}/).map(chunk => chunk.trim()).filter(Boolean).map(chunk => {
    const match = chunk.match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
    return match ? { timestamp: match[1], text: match[2] } : { timestamp: null, text: chunk };
  });

const attachmentFor = (path) => {
  if (!path) return null;
  const kind = /\.(mp4|m4v|webm|mov|ogg)$/i.test(path) ? 'video' : /\.pdf$/i.test(path) ? 'pdf' : 'image';
  return { url: fileUrl(path), kind };
};

const toViewModel = (r) => ({
  dbId: r.id,
  code: `REQ-${String(r.id).padStart(3, '0')}`,
  title: r.title || r.category || 'Maintenance Request',
  category: r.category,
  urgency: r.urgency,
  unit: r.unit ? `Unit ${r.unit}` : 'Unit —',
  tenant: r.tenant || 'No tenant',
  status: r.status,
  description: r.description || '',
  preferredDate: r.preferredDate,
  preferredTime: r.preferredTime,
  permissionToEnter: r.permissionToEnter,
  assignedTo: r.assignedTo || '',
  estimatedCost: r.estimatedCost,
  actualCost: r.actualCost,
  tenantResponsible: r.tenantResponsible,
  rejectionReason: r.rejectionReason,
  workNotes: r.workNotes || '',
  createdAt: r.createdAt,
  acknowledgedAt: r.acknowledgedAt,
  startedAt: r.startedAt,
  resolvedAt: r.resolvedAt,
  resolutionHours: r.resolutionHours,
  attachment: attachmentFor(r.attachmentPath),
});

// localStorage flag: the budget panel's details are expanded ('1') or not.
const BUDGET_OPEN_KEY = 'ams_admin_maint_budget_open';

const COLUMNS = [
  { key: 'Pending', statuses: ['Pending'], icon: faClock, iconClass: 'text-amber-700' },
  { key: 'In Progress', statuses: ['In Progress'], icon: faWrench, iconClass: 'text-indigo-500' },
  { key: 'Completed', statuses: ['Completed'], icon: faCheckCircle, iconClass: 'text-emerald-700' },
  { key: 'Rejected / Cancelled', statuses: ['Rejected', 'Cancelled'], icon: faBan, iconClass: 'text-red-600' },
];

const emptyNewReq = { title: '', issueType: 'Plumbing', unit: '', priority: 'Medium', description: '' };

const timelineFor = (r) => {
  const closed = r.status === 'Rejected' || r.status === 'Cancelled';
  const steps = [
    { label: 'Reported', at: r.createdAt, icon: faClock, tone: 'text-amber-700' },
    { label: 'Acknowledged', at: r.acknowledgedAt, icon: faInfoCircle, tone: 'text-sky-500' },
  ];
  if (!closed || r.startedAt) steps.push({ label: 'Work Started', at: r.startedAt, icon: faWrench, tone: 'text-indigo-500' });
  if (closed) {
    steps.push({ label: r.status, at: r.status === 'Rejected' ? r.acknowledgedAt : null, icon: faBan, tone: 'text-red-600' });
  } else {
    steps.push({ label: 'Resolved', at: r.resolvedAt, icon: faCheckCircle, tone: 'text-emerald-700' });
  }
  return steps;
};

// A memoized card: with fetchRequests() replacing the whole `requests` array on
// every save, this mainly helps the kanban/list re-render cost when filters or
// search change without touching row content, not the modal-typing case below.
const RequestCard = React.memo(function RequestCard({ req, onOpen }) {
  return (
    <div {...clickable(() => onOpen(req))} className="card-interactive bg-white rounded-lg p-4 border border-slate-200 shadow-sm hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
      <div className="mb-2">
        <div className="flex gap-1.5 flex-wrap min-w-0">
          <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${urgencyColor(req.urgency)}`}>{req.urgency || '—'}</span>
          <span className="px-2 py-0.5 rounded text-[11px] font-semibold border border-slate-200 bg-slate-50 text-slate-600">{req.category || 'Uncategorized'}</span>
          {req.tenantResponsible && (
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-violet-100 text-violet-700 border border-violet-200">Tenant Bill</span>
          )}
          {(req.status === 'Rejected' || req.status === 'Cancelled') && (
            <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${MAINTENANCE_STATUS_STYLES[req.status]}`}>{req.status}</span>
          )}
        </div>
      </div>
      {/* The code sits by the title so the tags above get the card's full width
          (beside them, two tags no longer fit on one line in a board column). */}
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h4 className="text-sm font-bold text-slate-800 m-0 leading-snug min-w-0">{req.title}</h4>
        <span className="shrink-0 whitespace-nowrap text-[11px] text-slate-500 font-mono group-hover:text-indigo-600 transition-colors">{req.code}</span>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-[11px] text-slate-500 gap-2">
          <span className="flex items-center gap-1.5 truncate"><FontAwesomeIcon icon={faUser} className="text-[10px]" /> {req.tenant} · {req.unit}</span>
          <span className="flex items-center gap-1 shrink-0"><FontAwesomeIcon icon={faClock} className="text-[10px]" /> {getRelativeTime(req.createdAt)}</span>
        </div>
        <div className="flex justify-between items-center mt-1 border-t border-slate-100 pt-2">
          {req.assignedTo ? (
            <span className="text-[11px] font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">{req.assignedTo}</span>
          ) : (
            <span className="text-[11px] font-medium text-slate-500 italic">Unassigned</span>
          )}
          <div className="flex items-center gap-2">
            {(req.actualCost ?? req.estimatedCost) > 0 && (
              <span className="text-[11px] font-bold text-emerald-700">{formatCurrency(req.actualCost ?? req.estimatedCost)}</span>
            )}
            {req.attachment && (
              <span className="text-[11px] text-slate-500 flex items-center gap-1"><FontAwesomeIcon icon={faImage} /> 1</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

// Owns its own form state. Previously this state lived in AdminMaintainance,
// so every keystroke re-ran the whole board's render (including every kanban
// card) just to update one text input — isolating it here means typing only
// re-renders this small modal.
function NewRequestModal({ rooms, onClose, onSubmit, isSubmitting }) {
  const [newReq, setNewReq] = useState(emptyNewReq);
  const [newPhoto, setNewPhoto, photoUrl] = useFilePreview();

  // Keys match create_maintenance_request.php's form fields.
  const form = useFieldErrors({
    title: (v) => checkText(v, { label: 'Title', min: TITLE_MIN, max: LIMITS.maintenanceTitle }),
    unit: (v) => (rooms.some(r => r.id === v) ? '' : 'Select a unit.'),
    issueType: (v) => (MAINTENANCE_CATEGORIES.some(c => c.value === v) ? '' : 'Choose a category.'),
    priority: (v) => (MAINTENANCE_URGENCIES.some(u => u.value === v) ? '' : 'Choose a priority.'),
    description: (v) => checkText(v, { label: 'Details', max: LIMITS.message, required: false }),
    photo: (f) => (f ? checkFile(f, FILE_RULES.maintenance) : ''),
  }, { idPrefix: 'newreq-' });
  const values = { ...newReq, photo: newPhoto };

  const occupantOf = (unitId) => rooms.find(r => r.id === unitId)?.tenant || '';
  const setField = (key, value) => {
    setNewReq({ ...newReq, [key]: value });
    form.clearError(key);
  };
  const blurText = (key) => {
    const v = newReq[key].trim();
    if (v !== newReq[key]) setNewReq({ ...newReq, [key]: v });
    if (v) form.validateField(key, { ...values, [key]: v });
  };
  const fieldCls = (key, base) => base + invalidCls(form.errors[key]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (isSubmitting) return;
    const clean = { ...newReq, title: newReq.title.trim(), description: newReq.description.trim() };
    setNewReq(clean);
    if (!form.validateAll({ ...clean, photo: newPhoto })) return;

    const formData = new FormData();
    formData.append('title', clean.title);
    formData.append('unit', clean.unit);
    formData.append('issueType', clean.issueType);
    formData.append('priority', clean.priority);
    formData.append('description', clean.description);
    if (newPhoto) formData.append('photo', newPhoto);

    const ok = await onSubmit(formData, form);
    if (ok) {
      setNewReq(emptyNewReq);
      setNewPhoto(null);
      form.setErrors({});
    }
  };

  const LABEL = 'block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1';
  const FIELD = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-white focus:border-indigo-500';

  return (
    <Modal title="Create New Request" onClose={onClose} busy={isSubmitting} as="form" overlayClassName="flex items-center justify-center bg-black/50 backdrop-blur-sm" className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col overflow-hidden" onSubmit={handleSubmit} noValidate>
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
          <h2 className="text-lg font-bold text-slate-800 m-0">Create New Request</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="text-slate-500 hover:text-slate-600 bg-transparent border-0 cursor-pointer"><FontAwesomeIcon icon={faTimes} className="text-lg" /></button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <div>
            <label htmlFor="newreq-title" className={LABEL}>Title *</label>
            <input type="text" {...form.fieldA11y('title')} autoComplete="off" maxLength={LIMITS.maintenanceTitle} value={newReq.title}
              onChange={e => setField('title', e.target.value)} onBlur={() => blurText('title')}
              className={fieldCls('title', FIELD)} placeholder="Brief description of the issue" />
            <FieldError id="newreq-title" error={form.errors.title} />
          </div>

          <div>
            <label htmlFor="newreq-unit" className={LABEL}>Unit *</label>
            <select {...form.fieldA11y('unit')} value={newReq.unit} onChange={e => setField('unit', e.target.value)} className={fieldCls('unit', FIELD)}>
              <option value="" disabled>Select a unit…</option>
              {rooms.map(room => (
                <option key={room.id} value={room.id}>Unit {room.id}{room.tenant ? ` — ${room.tenant}` : ' (vacant)'}</option>
              ))}
            </select>
            <FieldError id="newreq-unit" error={form.errors.unit} />
            {newReq.unit && (
              <p className="text-[11px] text-slate-500 m-0 mt-1">
                {occupantOf(newReq.unit) ? `Ticket will be linked to ${occupantOf(newReq.unit)}.` : 'Vacant unit — no tenant will be notified.'}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="newreq-issueType" className={LABEL}>Category</label>
              <select {...form.fieldA11y('issueType')} value={newReq.issueType} onChange={e => setField('issueType', e.target.value)} className={fieldCls('issueType', FIELD)}>
                {MAINTENANCE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.value}</option>)}
              </select>
              <FieldError id="newreq-issueType" error={form.errors.issueType} />
            </div>
            <div>
              <label htmlFor="newreq-priority" className={LABEL}>Priority</label>
              <select {...form.fieldA11y('priority')} value={newReq.priority} onChange={e => setField('priority', e.target.value)} className={fieldCls('priority', FIELD)}>
                {MAINTENANCE_URGENCIES.map(u => <option key={u.value} value={u.value}>{u.value}</option>)}
              </select>
              <FieldError id="newreq-priority" error={form.errors.priority} />
            </div>
          </div>

          <div>
            <label htmlFor="newreq-description" className={LABEL}>Details</label>
            <textarea rows={3} {...form.fieldA11y('description')} maxLength={LIMITS.message} value={newReq.description}
              onChange={e => setField('description', e.target.value)} onBlur={() => blurText('description')}
              className={fieldCls('description', 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-slate-50 focus:bg-white focus:border-indigo-500 resize-none')}
              placeholder="Provide more details about the problem..."></textarea>
            <FieldError id="newreq-description" error={form.errors.description} />
            <CharCount value={newReq.description} max={LIMITS.message} />
          </div>

          <div>
            <label htmlFor="newreq-photo" className={LABEL}>Reference Photo or Video</label>
            <div className={`w-full border-2 border-dashed border-slate-300 rounded-lg p-4 text-center relative bg-slate-50 hover:bg-slate-100 hover:border-indigo-400 transition-colors${invalidCls(form.errors.photo)}`}>
              <input
                type="file"
                {...form.fieldA11y('photo')}
                accept={acceptFor(FILE_RULES.maintenance)}
                onChange={e => {
                  const file = e.target.files?.[0] || null;
                  const fileError = checkFile(file, FILE_RULES.maintenance);
                  form.setFieldError('photo', fileError);
                  if (fileError) { e.target.value = ''; setNewPhoto(null); return; }
                  setNewPhoto(file);
                }}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <FontAwesomeIcon icon={faUpload} className="text-slate-500 mb-2 text-lg" />
              <p className="text-xs text-slate-600 m-0">Click or drag a file here to attach</p>
              <p className="text-[11px] text-slate-500 m-0 mt-0.5">JPG, PNG, WEBP, MP4, WEBM or MOV · up to {FILE_RULES.maintenance.maxMB}MB</p>
            </div>
            <FieldError id="newreq-photo" error={form.errors.photo} />
            {newPhoto && (
              <div className="flex items-center gap-3 mt-3 p-2 bg-indigo-50/50 rounded-lg border border-indigo-100">
                <div className="w-12 h-12 rounded bg-indigo-100 border border-indigo-200 flex items-center justify-center shrink-0 overflow-hidden">
                  {newPhoto.type.startsWith('video/') ? (
                    <span className="text-[11px] font-bold text-indigo-700">VIDEO</span>
                  ) : (
                    <img src={photoUrl} alt="Thumbnail" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-700 truncate m-0">{newPhoto.name}</p>
                  <p className="text-[11px] text-emerald-700 font-semibold m-0">{formatFileSize(newPhoto.size)} · Ready for upload</p>
                </div>
                <button type="button" onClick={() => { setNewPhoto(null); form.clearError('photo'); }} className="text-xs text-red-600 hover:text-red-700 bg-transparent border-0 cursor-pointer font-bold px-2 py-1">Remove</button>
              </div>
            )}
          </div>
        </div>
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex gap-2 shrink-0">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="flex-1 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-100 cursor-pointer transition-colors disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={isSubmitting} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 border-0 cursor-pointer transition-colors disabled:opacity-50">
            {isSubmitting ? 'Creating...' : 'Create Request'}
          </button>
        </div>
      </Modal>
  );
}

// Owns its assignee/estimate/note drafts locally. The parent mounts this with
// key={req.dbId}, so switching to a different request remounts it fresh
// instead of syncing props into state via an effect.
function DetailModal({ req, settings, saving, onClose, onMoveTo, onOpenAction, onToggleTenantResponsible, onSaveField, onAddNote }) {
  const [assigneeDraft, setAssigneeDraft] = useState(req.assignedTo || '');
  const [estimateDraft, setEstimateDraft] = useState(req.estimatedCost ?? '');
  const [newNote, setNewNote] = useState('');

  const allowedNext = MAINTENANCE_TRANSITIONS[req.status] || [];
  const isClosed = req.status === 'Rejected' || req.status === 'Cancelled';

  // These fields save on blur, so each is checked before it is sent.
  const form = useFieldErrors({
    assignedTo: (v) => checkText(v, { label: 'Assignee', max: LIMITS.assignedTo, required: false }),
    estimatedCost: (v) => checkAmount(v, { label: 'Estimated cost', required: false }),
    workNote: (v) => checkText(v, { label: 'Note', max: LIMITS.notes, required: false }),
  }, { idPrefix: 'detail-' });

  const saveAssignee = () => {
    const v = assigneeDraft.trim();
    setAssigneeDraft(v);
    if (form.validateField('assignedTo', { assignedTo: v })) return;
    if (v !== (req.assignedTo || '')) onSaveField({ assignedTo: v });
  };

  const saveEstimate = () => {
    if (form.validateField('estimatedCost', { estimatedCost: estimateDraft })) return;
    if (String(estimateDraft) !== String(req.estimatedCost ?? '')) {
      onSaveField({ estimatedCost: estimateDraft === '' ? null : Number(estimateDraft) });
    }
  };

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    if (form.validateField('workNote', { workNote: newNote })) return;
    const entry = `[${noteStamp()}] ${newNote.trim()}`;
    const workNotes = req.workNotes ? `${req.workNotes}\n\n${entry}` : entry;
    onAddNote(workNotes);
    setNewNote('');
  };

  return (
    <Modal title={`${req.title}`} onClose={onClose} overlayClassName="flex items-center justify-center bg-black/40 backdrop-blur-sm" className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 overflow-hidden flex flex-col md:flex-row max-h-[90vh]">

        {/* Left side: Detail & Timeline */}
        <div className="flex-1 flex flex-col border-r border-slate-200 max-h-[90vh]">
          <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-start bg-slate-50 shrink-0">
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded">{req.code}</span>
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${urgencyColor(req.urgency)}`}>{req.urgency}</span>
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${MAINTENANCE_STATUS_STYLES[req.status] || ''}`}>{req.status}</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold border border-slate-200 bg-white text-slate-600">{req.category}</span>
                {req.tenantResponsible && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-violet-100 text-violet-700 border border-violet-200">Tenant Responsible</span>
                )}
              </div>
              <h2 className="text-xl font-bold text-slate-800 m-0 leading-tight">{req.title}</h2>
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-1.5 flex-wrap">
                <span className="flex items-center gap-1.5 font-medium"><FontAwesomeIcon icon={faMapPin} className="text-indigo-500" /> {req.tenant} · {req.unit}</span>
                {req.preferredDate && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span className="flex items-center gap-1.5"><FontAwesomeIcon icon={faCalendarAlt} className="text-slate-500" /> Preferred: {req.preferredDate} ({req.preferredTime})</span>
                  </>
                )}
                <span className="text-slate-300">•</span>
                <span>{req.permissionToEnter ? 'Permission to enter granted' : 'Tenant must be present'}</span>
              </div>
              {req.actualCost !== null && req.actualCost !== undefined && req.status === 'Completed' && (
                <p className="text-sm font-bold text-emerald-700 m-0 mt-2">Actual Cost: {formatCurrency(req.actualCost)}</p>
              )}
            </div>
            <button aria-label="Close" onClick={onClose} className="p-1 md:hidden text-slate-500 hover:text-slate-600 bg-transparent border-0 cursor-pointer"><FontAwesomeIcon icon={faTimes} className="text-lg" /></button>
          </div>

          <div className="p-6 overflow-y-auto flex-1 space-y-6">
            {req.status === 'Rejected' && req.rejectionReason && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
                <strong>Rejected:</strong> {req.rejectionReason}
              </div>
            )}

            <div>
              <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2 m-0">Description</h4>
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 text-sm text-slate-700 leading-relaxed">{req.description || 'No description provided.'}</div>
            </div>

            <div className="bg-violet-50 border border-violet-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FontAwesomeIcon icon={faShieldAlt} className="text-violet-600" />
                  <div>
                    <p className="text-sm font-bold text-slate-800 m-0">Tenant Responsible</p>
                    <p className="text-[11px] text-slate-500 m-0 mt-0.5">If enabled, this cost is billed to the tenant (per Terms & Conditions)</p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!req.tenantResponsible}
                  aria-label="Tenant responsible"
                  disabled={saving || isClosed}
                  onClick={onToggleTenantResponsible}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-300 border-0 cursor-pointer disabled:opacity-50 ${req.tenantResponsible ? 'bg-violet-600' : 'bg-slate-300'}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ${req.tenantResponsible ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              {req.tenantResponsible && settings?.tenantResponsibilityClause && (
                <div className="mt-3 bg-white border border-violet-100 rounded-lg p-3 text-[11px] text-violet-700 leading-relaxed">
                  <FontAwesomeIcon icon={faFileContract} className="mr-1.5 text-violet-400" />
                  {settings.tenantResponsibilityClause.substring(0, 200)}...
                </div>
              )}
            </div>

            {req.attachment && (
              <div>
                <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2 m-0">Attached Media</h4>
                {req.attachment.kind === 'video' ? (
                  <video controls preload="metadata" src={req.attachment.url} className="w-full max-w-md rounded-lg bg-slate-900 border border-slate-200">
                    Your browser cannot play this video. <a href={req.attachment.url} target="_blank" rel="noopener noreferrer">Download it</a>.
                  </video>
                ) : req.attachment.kind === 'pdf' ? (
                  <a href={req.attachment.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-600 bg-indigo-50 px-3 py-2 rounded-lg">
                    <FontAwesomeIcon icon={faFileContract} /> Open PDF attachment
                  </a>
                ) : (
                  <a href={req.attachment.url} target="_blank" rel="noopener noreferrer" className="block w-40 h-28 rounded-lg overflow-hidden border border-slate-200 hover:border-indigo-500 transition-colors">
                    <img src={req.attachment.url} alt="Maintenance attachment" className="w-full h-full object-cover" />
                  </a>
                )}
              </div>
            )}

            <div>
              <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-3 m-0">Timeline</h4>
              <div className="space-y-3">
                {timelineFor(req).map(step => (
                  <div key={step.label} className="flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 ${step.at ? 'bg-white border-slate-200' : 'bg-slate-50 border-dashed border-slate-200'}`}>
                      <FontAwesomeIcon icon={step.icon} className={`text-[11px] ${step.at ? step.tone : 'text-slate-300'}`} />
                    </div>
                    <div className="flex-1 flex items-center justify-between border-b border-slate-100 pb-2 gap-2">
                      <span className={`text-xs font-bold ${step.at ? 'text-slate-800' : 'text-slate-500'}`}>{step.label}</span>
                      <time className="font-mono text-[11px] text-slate-500">{step.at ? formatDateTime(step.at) : 'Not yet'}</time>
                    </div>
                  </div>
                ))}
              </div>
              {req.resolutionHours !== null && req.resolutionHours !== undefined && (
                <p className="text-xs text-slate-500 m-0 mt-3">Total resolution time: <strong className="text-slate-700">{formatDuration(req.resolutionHours)}</strong></p>
              )}
            </div>
          </div>

          {allowedNext.length > 0 && (
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center shrink-0 gap-2 flex-wrap">
              <div className="flex gap-2">
                {allowedNext.includes('Rejected') && (
                  <button disabled={saving} onClick={() => onOpenAction('reject')} className="flex items-center gap-2 px-4 py-2 bg-white text-red-600 border border-red-200 text-sm font-semibold rounded-lg hover:bg-red-50 cursor-pointer transition-colors disabled:opacity-50">
                    <FontAwesomeIcon icon={faBan} /> Reject
                  </button>
                )}
                {req.status === 'In Progress' && allowedNext.includes('Pending') && (
                  <button disabled={saving} onClick={() => onMoveTo('Pending')} className="flex items-center gap-2 px-4 py-2 bg-white text-slate-600 border border-slate-200 text-sm font-semibold rounded-lg hover:bg-slate-100 cursor-pointer transition-colors disabled:opacity-50">
                    <FontAwesomeIcon icon={faUndo} /> Back to Pending
                  </button>
                )}
                {req.status === 'Completed' && allowedNext.includes('In Progress') && (
                  <button disabled={saving} onClick={() => onMoveTo('In Progress')} className="flex items-center gap-2 px-4 py-2 bg-white text-slate-600 border border-slate-200 text-sm font-semibold rounded-lg hover:bg-slate-100 cursor-pointer transition-colors disabled:opacity-50">
                    <FontAwesomeIcon icon={faUndo} /> Reopen
                  </button>
                )}
              </div>
              {req.status === 'Pending' && (
                <button disabled={saving} onClick={() => onOpenAction('start')} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 shadow-sm border-0 cursor-pointer transition-colors disabled:opacity-50">
                  Start Work <FontAwesomeIcon icon={faArrowRight} />
                </button>
              )}
              {req.status === 'In Progress' && (
                <button disabled={saving} onClick={() => onOpenAction('complete')} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 shadow-sm border-0 cursor-pointer transition-colors disabled:opacity-50">
                  Mark Completed <FontAwesomeIcon icon={faCheckCircle} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right side: Assignment, Cost & Notes */}
        <div className="w-full md:w-80 flex flex-col bg-slate-50 shrink-0">
          <div className="px-6 py-4 border-b border-slate-200 hidden md:flex justify-end bg-slate-50">
            <button aria-label="Close" onClick={onClose} className="p-1 text-slate-500 hover:text-slate-600 bg-transparent border-0 cursor-pointer"><FontAwesomeIcon icon={faTimes} className="text-xl" /></button>
          </div>

          <div className="p-6 flex-1 flex flex-col overflow-hidden">
            {!isClosed && (
              <div className="mb-4 shrink-0 space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Priority</label>
                  <select
                    value={req.urgency}
                    disabled={saving}
                    onChange={e => onSaveField({ urgency: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-white focus:border-indigo-500 cursor-pointer"
                  >
                    {req.urgency === MAINTENANCE_DEFAULT_URGENCY && (
                      <option value={MAINTENANCE_DEFAULT_URGENCY} disabled>Needs Triage — select a priority</option>
                    )}
                    {MAINTENANCE_URGENCIES.map(u => <option key={u.value} value={u.value}>{u.value}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="detail-assignedTo" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Assigned Personnel</label>
                  <input
                    type="text"
                    {...form.fieldA11y('assignedTo')}
                    autoComplete="off"
                    maxLength={LIMITS.assignedTo}
                    value={assigneeDraft}
                    disabled={saving}
                    onChange={e => { setAssigneeDraft(e.target.value); form.clearError('assignedTo'); }}
                    onBlur={saveAssignee}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    placeholder="Assign someone..."
                    className={"w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-white focus:border-indigo-500" + invalidCls(form.errors.assignedTo)}
                  />
                  <FieldError id="detail-assignedTo" error={form.errors.assignedTo} />
                </div>
                <div>
                  <label htmlFor="detail-estimatedCost" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Estimated Cost (₱)</label>
                  <input
                    type="number"
                    {...form.fieldA11y('estimatedCost')}
                    inputMode="decimal"
                    min="0"
                    max={MAX_AMOUNT}
                    step="0.01"
                    value={estimateDraft}
                    disabled={saving}
                    onChange={e => { setEstimateDraft(e.target.value); form.clearError('estimatedCost'); }}
                    onBlur={saveEstimate}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); else blockNonNumericKeys(e); }}
                    placeholder="e.g. 1500"
                    className={"w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-white focus:border-indigo-500" + invalidCls(form.errors.estimatedCost)}
                  />
                  <FieldError id="detail-estimatedCost" error={form.errors.estimatedCost} />
                </div>
              </div>
            )}

            <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-3 m-0 shrink-0">Work Notes</h4>
            <div className="flex-1 overflow-y-auto mb-4 space-y-3 pr-1">
              {parseNotes(req.workNotes).map((note, idx) => (
                <div key={idx} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                  <p className="text-xs text-slate-700 m-0 leading-relaxed whitespace-pre-wrap">{note.text}</p>
                  {note.timestamp && <p className="text-[11px] text-slate-500 font-medium m-0 mt-2 text-right">{note.timestamp}</p>}
                </div>
              ))}
              {!req.workNotes && (
                <div className="text-center py-4 text-slate-500 text-xs italic">No notes added yet.</div>
              )}
            </div>

            <div className="shrink-0 relative">
              <textarea {...form.fieldA11y('workNote')} aria-label="Add a work note" maxLength={LIMITS.notes} value={newNote} onChange={e => { setNewNote(e.target.value); form.clearError('workNote'); }} rows={2} className={"w-full px-3 py-2 pr-10 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-white focus:border-indigo-500 resize-none shadow-sm" + invalidCls(form.errors.workNote)} placeholder="Add a note..."></textarea>
              <button type="button" aria-label="Add note" onClick={handleAddNote} disabled={!newNote.trim() || saving} className="absolute right-2 bottom-3 w-7 h-7 rounded bg-indigo-50 flex items-center justify-center text-indigo-600 border-0 cursor-pointer disabled:opacity-50 hover:bg-indigo-100 transition-colors"><FontAwesomeIcon icon={faPaperPlane} className="text-xs" /></button>
            </div>
            <FieldError id="detail-workNote" error={form.errors.workNote} />
            <CharCount value={newNote} max={LIMITS.notes} />
          </div>
        </div>

      </Modal>
  );
}

// Also owns its drafts locally, seeded fresh on each mount (the parent only
// renders this while actionModal is set, so it naturally mounts/unmounts).
function ActionModal({ type, req, saving, onConfirm, onClose }) {
  const [assigneeDraft, setAssigneeDraft] = useState('');
  const [estimateDraft, setEstimateDraft] = useState(req.estimatedCost ?? '');
  const [actualCostDraft, setActualCostDraft] = useState(req.actualCost ?? req.estimatedCost ?? '');
  const [rejectReason, setRejectReason] = useState('');

  // Each action checks only the fields it shows.
  const FIELDS_BY_TYPE = { start: ['assignedTo', 'estimatedCost'], complete: ['actualCost'], reject: ['rejectionReason'] };
  const form = useFieldErrors({
    assignedTo: (v) => checkText(v, { label: 'Assignee', max: LIMITS.assignedTo, required: false }),
    estimatedCost: (v) => checkAmount(v, { label: 'Estimated cost', required: false }),
    actualCost: (v) => checkAmount(v, { label: 'Actual cost' }),
    rejectionReason: (v) => checkText(v, { label: 'Reason', max: LIMITS.reason }),
  }, { idPrefix: 'action-' });
  const values = { assignedTo: assigneeDraft, estimatedCost: estimateDraft, actualCost: actualCostDraft, rejectionReason: rejectReason };

  const handleConfirm = (e) => {
    e?.preventDefault();
    if (saving) return;
    if (!form.validateAll(values, FIELDS_BY_TYPE[type] || [])) return;
    let payload;
    if (type === 'start') {
      payload = { status: 'In Progress' };
      if (assigneeDraft.trim()) payload.assignedTo = assigneeDraft.trim();
      if (estimateDraft !== '') payload.estimatedCost = Number(estimateDraft);
    } else if (type === 'complete') {
      payload = { status: 'Completed', actualCost: Number(actualCostDraft) };
    } else if (type === 'reject') {
      payload = { status: 'Rejected', rejectionReason: rejectReason.trim() };
    }
    if (payload) onConfirm(payload);
  };

  return (
    <Modal busy={saving} title={`${type === 'start' ? 'Start Work' : type === 'complete' ? 'Mark as Completed' : 'Reject Request'}`} onClose={onClose} overlayClassName="flex items-center justify-center bg-black/40 backdrop-blur-sm" className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 max-h-[90vh] overflow-y-auto p-6">
        <h3 className="text-lg font-bold text-slate-800 mb-1 mt-0">
          {type === 'start' ? 'Start Work' : type === 'complete' ? 'Mark as Completed' : 'Reject Request'}
        </h3>
        <p className="text-sm text-slate-500 mb-4 mt-0">{req.code} · {req.title}</p>

        {type === 'start' && (
          <div className="space-y-3 mb-5">
            <div>
              <label htmlFor="action-assignedTo" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Assign To</label>
              <input type="text" {...form.fieldA11y('assignedTo')} autoComplete="off" maxLength={LIMITS.assignedTo} value={assigneeDraft}
                onChange={e => { setAssigneeDraft(e.target.value); form.clearError('assignedTo'); }}
                onBlur={() => { const v = assigneeDraft.trim(); setAssigneeDraft(v); form.validateField('assignedTo', { ...values, assignedTo: v }); }}
                placeholder="Personnel or contractor" className={"w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-slate-50 focus:bg-white focus:border-indigo-500" + invalidCls(form.errors.assignedTo)} />
              <FieldError id="action-assignedTo" error={form.errors.assignedTo} />
            </div>
            <div>
              <label htmlFor="action-estimatedCost" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Estimated Cost (₱)</label>
              <input type="number" {...form.fieldA11y('estimatedCost')} inputMode="decimal" min="0" max={MAX_AMOUNT} step="0.01" value={estimateDraft}
                onKeyDown={blockNonNumericKeys}
                onChange={e => { setEstimateDraft(e.target.value); form.clearError('estimatedCost'); }}
                onBlur={() => form.validateField('estimatedCost', values)}
                placeholder="Optional" className={"w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-slate-50 focus:bg-white focus:border-indigo-500" + invalidCls(form.errors.estimatedCost)} />
              <FieldError id="action-estimatedCost" error={form.errors.estimatedCost} />
            </div>
          </div>
        )}

        {type === 'complete' && (
          <div className="mb-5">
            <label htmlFor="action-actualCost" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Actual Cost (₱) *</label>
            <input type="number" {...form.fieldA11y('actualCost')} inputMode="decimal" min="0" max={MAX_AMOUNT} step="0.01" value={actualCostDraft}
              onKeyDown={blockNonNumericKeys}
              onChange={e => { setActualCostDraft(e.target.value); form.clearError('actualCost'); }}
              onBlur={() => form.validateField('actualCost', values)}
              placeholder="Enter 0 if there was no cost" className={"w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-slate-50 focus:bg-white focus:border-indigo-500" + invalidCls(form.errors.actualCost)} />
            <FieldError id="action-actualCost" error={form.errors.actualCost} />
            {req.estimatedCost !== null && req.estimatedCost !== undefined && (
              <p className="text-[11px] text-slate-500 m-0 mt-1">Estimate was {formatCurrency(req.estimatedCost)}.</p>
            )}
          </div>
        )}

        {type === 'reject' && (
          <div className="mb-5">
            <label htmlFor="action-rejectionReason" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Reason *</label>
            <textarea rows={3} {...form.fieldA11y('rejectionReason')} maxLength={LIMITS.reason} value={rejectReason}
              onChange={e => { setRejectReason(e.target.value); form.clearError('rejectionReason'); }}
              onBlur={() => { const v = rejectReason.trim(); setRejectReason(v); if (v) form.validateField('rejectionReason', { ...values, rejectionReason: v }); }}
              placeholder="Explain why this request is being rejected" className={"w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none text-slate-800 bg-slate-50 focus:bg-white focus:border-indigo-500 resize-none" + invalidCls(form.errors.rejectionReason)} />
            <FieldError id="action-rejectionReason" error={form.errors.rejectionReason} />
            <CharCount value={rejectReason} max={LIMITS.reason} />
            <p className="text-[11px] text-slate-500 m-0 mt-1">The tenant will be notified with this reason.</p>
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            className={`flex-1 py-2 text-white rounded text-sm font-semibold border-0 cursor-pointer transition-colors disabled:opacity-40 ${type === 'reject' ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
          >
            {saving ? 'Saving…' : 'Confirm'}
          </button>
          <button onClick={onClose} className="flex-1 py-2 bg-white border border-slate-300 text-slate-700 rounded text-sm font-semibold hover:bg-slate-50 cursor-pointer transition-colors">Cancel</button>
        </div>
      </Modal>
  );
}

const AdminMaintainance = () => {
  const [requests, setRequests] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loadingReqs, setLoadingReqs] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [viewMode, setViewMode] = useState('kanban');
  // The budget breakdown is secondary to the task board: one summary line by
  // default, remembered per browser. Storage can be blocked (private mode), so
  // every access is guarded and the page works without it.
  const [budgetOpen, setBudgetOpen] = useState(() => {
    try { return localStorage.getItem(BUDGET_OPEN_KEY) === '1'; } catch { return false; }
  });
  const toggleBudget = () => {
    const next = !budgetOpen;
    setBudgetOpen(next);
    try { localStorage.setItem(BUDGET_OPEN_KEY, next ? '1' : '0'); } catch { /* storage blocked */ }
  };
  const [saving, setSaving] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState('All');
  const [filterType, setFilterType] = useState('All');

  const [selectedId, setSelectedId] = useState(null);
  const [actionModal, setActionModal] = useState(null);

  const [showNewModal, setShowNewModal] = useState(false);
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);

  const fetchRequests = useCallback(async () => {
    try {
      const res = await api.get('get_maintenance_requests.php');
      if (res.data?.success && Array.isArray(res.data.requests)) {
        setRequests(res.data.requests.map(toViewModel));
        setLoadError('');
      } else {
        setLoadError(res.data?.message || 'Failed to load maintenance requests.');
      }
    } catch (err) {
      setLoadError(err.response?.data?.message || 'Failed to load maintenance requests.');
    } finally {
      setLoadingReqs(false);
    }
  }, []);

  useEffect(() => {
    const load = async () => { await fetchRequests(); };
    load();
    getSystemSettings().then(setSettings).catch(() => setSettings(null));
    api.get('get_rooms.php').then(res => { if (res.data?.success) setRooms(res.data.rooms || []); }).catch(() => {});
  }, [fetchRequests]);

  const selectedReq = requests.find(r => r.dbId === selectedId) || null;

  // Every write refetches, so the board always shows what the database actually holds.
  const update = async (dbId, payload) => {
    setSaving(true);
    try {
      const res = await api.post('update_maintenance_status.php', { id: dbId, ...payload });
      if (!res.data?.success) {
        alert(res.data?.message || 'Update failed.');
        return false;
      }
      return true;
    } catch (err) {
      alert(err.response?.data?.message || 'Update failed. Please try again.');
      return false;
    } finally {
      await fetchRequests();
      setSaving(false);
    }
  };

  const filteredRequests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return requests
      .filter(r => {
        const matchSearch = !q || [r.title, r.unit, r.tenant, r.code].some(v => (v || '').toLowerCase().includes(q));
        const matchPriority = filterPriority === 'All' || r.urgency === filterPriority;
        const matchType = filterType === 'All' || r.category === filterType;
        return matchSearch && matchPriority && matchType;
      })
      .sort((a, b) => urgencyWeight(b.urgency) - urgencyWeight(a.urgency) || (parseDate(a.createdAt) - parseDate(b.createdAt)));
  }, [requests, searchQuery, filterPriority, filterType]);

  const monthlyBudget = settings?.maintenanceMonthlyBudget ?? 50000;
  const monthLabel = new Date().toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });

  const budgetData = useMemo(() => {
    const now = new Date();
    const costOf = r => Number(r.actualCost ?? r.estimatedCost ?? 0);
    const resolvedThisMonth = requests.filter(r => {
      const d = parseDate(r.resolvedAt);
      return r.status === 'Completed' && d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const building = resolvedThisMonth.filter(r => !r.tenantResponsible);
    const totalSpent = building.reduce((sum, r) => sum + costOf(r), 0);
    const tenantCharged = resolvedThisMonth.filter(r => r.tenantResponsible).reduce((sum, r) => sum + costOf(r), 0);

    const categories = {};
    building.forEach(r => { categories[r.category] = (categories[r.category] || 0) + costOf(r); });
    const perUnit = {};
    resolvedThisMonth.forEach(r => { perUnit[r.unit] = (perUnit[r.unit] || 0) + costOf(r); });

    return {
      totalSpent, tenantCharged, categories, perUnit,
      remaining: monthlyBudget - totalSpent,
      usedPct: monthlyBudget > 0 ? Math.round((totalSpent / monthlyBudget) * 100) : 0,
      isOverBudget: totalSpent > monthlyBudget,
    };
  }, [requests, monthlyBudget]);

  const maxCategorySpend = Math.max(...Object.values(budgetData.categories), 1);

  const openDetail = (req) => setSelectedId(req.dbId);
  const closeDetail = () => { setSelectedId(null); setActionModal(null); };

  const moveTo = async (status) => {
    if (!selectedReq || !window.confirm(`Move ${selectedReq.code} to ${status}?`)) return;
    await update(selectedReq.dbId, status ? { status } : {});
  };

  const handleFieldSave = (payload) => {
    if (selectedReq) update(selectedReq.dbId, payload);
  };

  const handleAddNoteSave = (workNotes) => {
    if (selectedReq) update(selectedReq.dbId, { workNotes });
  };

  const handleToggleTenantResponsible = () => {
    if (selectedReq) update(selectedReq.dbId, { tenantResponsible: !selectedReq.tenantResponsible });
  };

  const handleActionConfirm = async (payload) => {
    if (!selectedReq) return;
    if (await update(selectedReq.dbId, payload)) setActionModal(null);
  };

  // `fieldForm` is the modal's useFieldErrors(), so a server field error lands on its input.
  const handleCreateRequest = async (formData, fieldForm) => {
    setIsSubmittingNew(true);
    try {
      const res = await api.post('create_maintenance_request_admin.php', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (res.data?.success) {
        await fetchRequests();
        setShowNewModal(false);
        return true;
      } else {
        if (!fieldForm?.applyServerErrors(res)) alert(res.data?.message || 'Failed to create maintenance request.');
        return false;
      }
    } catch (err) {
      if (!fieldForm?.applyServerErrors(err)) alert(apiErrorMessage(err, 'Failed to create maintenance request.'));
      return false;
    } finally {
      setIsSubmittingNew(false);
    }
  };

  return (
    <div className="admin-shell flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left bg-slate-50">
        <Header title="Maintenance Tasks" />

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Budget Panel: one summary line; the tiles and breakdowns open under Details. */}
            <section aria-label="Maintenance budget" className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <h3 className="text-sm font-bold text-slate-800 m-0 flex items-center gap-2 shrink-0">
                  <FontAwesomeIcon icon={faChartBar} className="text-amber-700" aria-hidden="true" />
                  Budget, {monthLabel}
                </h3>
                <p className={`m-0 text-xs ${budgetData.isOverBudget ? 'text-red-700 font-semibold' : 'text-slate-600'}`}>
                  {budgetData.isOverBudget ? (
                    <>Over by {formatCurrency(Math.abs(budgetData.remaining))} · {formatCurrency(budgetData.totalSpent)} spent of {formatCurrency(monthlyBudget)}</>
                  ) : (
                    <><strong className="text-slate-800">{formatCurrency(budgetData.totalSpent)}</strong> of {formatCurrency(monthlyBudget)} spent · {formatCurrency(budgetData.tenantCharged)} billed to tenants · {formatCurrency(budgetData.remaining)} left</>
                  )}
                </p>
                <div className="flex-1 min-w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden" aria-hidden="true">
                  <div className={`h-full rounded-full transition-all duration-500 ${budgetData.isOverBudget ? 'bg-red-500' : budgetData.usedPct >= 80 ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, budgetData.usedPct)}%` }}></div>
                </div>
                <button
                  type="button"
                  onClick={toggleBudget}
                  aria-expanded={budgetOpen}
                  aria-controls="maint-budget-details"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer shrink-0"
                >
                  Details
                  <FontAwesomeIcon icon={faChevronDown} className={`text-[10px] transition-transform ${budgetOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
              </div>
              {budgetOpen && (
              <div id="maint-budget-details" className="p-6 border-t border-slate-200">
                <p className="text-[11px] text-slate-500 m-0 mb-4">Counts requests resolved this month. Monthly budget is set in Settings.</p>
                <div className="stagger-children grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 text-center">
                    <p className="text-lg font-bold text-slate-800 m-0">{formatCurrency(monthlyBudget)}</p>
                    <p className="text-[11px] text-slate-500 font-semibold m-0 mt-0.5">Monthly Budget</p>
                  </div>
                  <div className={`rounded-lg p-3 border text-center ${budgetData.isOverBudget ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-100'}`}>
                    <p className={`text-lg font-bold m-0 ${budgetData.isOverBudget ? 'text-red-600' : 'text-emerald-700'}`}>{formatCurrency(budgetData.totalSpent)}</p>
                    <p className={`text-[11px] font-semibold m-0 mt-0.5 ${budgetData.isOverBudget ? 'text-red-600' : 'text-emerald-700'}`}>Spent (Building)</p>
                  </div>
                  <div className="bg-violet-50 rounded-lg p-3 border border-violet-100 text-center">
                    <p className="text-lg font-bold text-violet-700 m-0">{formatCurrency(budgetData.tenantCharged)}</p>
                    <p className="text-[11px] text-violet-600 font-semibold m-0 mt-0.5">Tenant Responsible</p>
                  </div>
                  <div className={`rounded-lg p-3 border text-center ${budgetData.isOverBudget ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-100'}`}>
                    <p className={`text-lg font-bold m-0 ${budgetData.isOverBudget ? 'text-red-600' : 'text-slate-700'}`}>{formatCurrency(budgetData.remaining)}</p>
                    <p className="text-[11px] text-slate-500 font-semibold m-0 mt-0.5">Remaining</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 text-center">
                    <p className="text-lg font-bold text-indigo-600 m-0">{budgetData.usedPct}%</p>
                    <p className="text-[11px] text-slate-500 font-semibold m-0 mt-0.5">Budget Used</p>
                  </div>
                </div>

                <div className="mb-6">
                  <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                    <span>₱0</span>
                    <span>{formatCurrency(monthlyBudget)}</span>
                  </div>
                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${budgetData.isOverBudget ? 'bg-red-500' : budgetData.usedPct >= 80 ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, budgetData.usedPct)}%` }}></div>
                  </div>
                  {budgetData.isOverBudget && (
                    <div className="flex items-center gap-2 mt-2 text-xs text-red-600 font-semibold">
                      <FontAwesomeIcon icon={faExclamationTriangle} /> Budget exceeded by {formatCurrency(Math.abs(budgetData.remaining))}!
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3 m-0">Spend by Category</h4>
                    <div className="space-y-2.5">
                      {Object.entries(budgetData.categories).map(([cat, amount]) => (
                        <div key={cat}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-semibold text-slate-700">{cat}</span>
                            <span className="text-slate-500">{formatCurrency(amount)}</span>
                          </div>
                          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${(amount / maxCategorySpend) * 100}%` }}></div>
                          </div>
                        </div>
                      ))}
                      {Object.keys(budgetData.categories).length === 0 && (
                        <p className="text-xs text-slate-500 m-0">No building-paid maintenance resolved this month.</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3 m-0">Spend by Unit</h4>
                    <div className="space-y-2">
                      {Object.entries(budgetData.perUnit).sort((a, b) => b[1] - a[1]).map(([unit, amount]) => (
                        <div key={unit} className="flex items-center justify-between bg-slate-50 rounded-lg p-2 border border-slate-100">
                          <span className="text-xs font-semibold text-slate-700">{unit}</span>
                          <span className="text-xs font-bold text-indigo-600">{formatCurrency(amount)}</span>
                        </div>
                      ))}
                      {Object.keys(budgetData.perUnit).length === 0 && (
                        <p className="text-xs text-slate-500 m-0">No unit costs recorded.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              )}
            </section>

            {/* View Controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex bg-white rounded-lg border border-slate-200 p-1 shrink-0">
                <button onClick={() => setViewMode('kanban')} className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-semibold border-0 cursor-pointer ${viewMode === 'kanban' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 bg-transparent hover:bg-slate-50'}`}><FontAwesomeIcon icon={faTableCells} /> Kanban</button>
                <button onClick={() => setViewMode('list')} className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-semibold border-0 cursor-pointer ${viewMode === 'list' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 bg-transparent hover:bg-slate-50'}`}><FontAwesomeIcon icon={faList} /> List</button>
              </div>

              <div className="flex items-center gap-3 flex-1 w-full md:w-auto md:justify-end flex-wrap">
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 focus-within:border-indigo-500 transition-all shadow-sm w-full md:max-w-xs">
                  <FontAwesomeIcon icon={faSearch} className="text-slate-500 text-xs" />
                  <input aria-label="Search maintenance requests" maxLength={LIMITS.search} type="text" placeholder="Search title, unit, tenant..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="flex-1 bg-transparent text-sm outline-none border-0 p-0 text-slate-800 bg-white" />
                </div>

                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2 py-2 shadow-sm w-full sm:w-auto min-w-0">
                  <FontAwesomeIcon icon={faFilter} className="text-slate-500 text-xs ml-2" />
                  <select aria-label="Filter by priority" value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="min-w-0 flex-1 sm:flex-none bg-transparent text-sm outline-none border-0 text-slate-700 cursor-pointer">
                    <option value="All">All Priorities</option>
                    <option value={MAINTENANCE_DEFAULT_URGENCY}>{MAINTENANCE_DEFAULT_URGENCY}</option>
                    {[...MAINTENANCE_URGENCIES].reverse().map(u => <option key={u.value} value={u.value}>{u.value}</option>)}
                  </select>
                  <div className="w-px h-4 bg-slate-200 mx-1"></div>
                  <select aria-label="Filter by category" value={filterType} onChange={e => setFilterType(e.target.value)} className="min-w-0 flex-1 sm:flex-none bg-transparent text-sm outline-none border-0 text-slate-700 cursor-pointer">
                    <option value="All">All Categories</option>
                    {MAINTENANCE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.value}</option>)}
                  </select>
                </div>

                <button onClick={() => setShowNewModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 shadow-sm border-0 cursor-pointer transition-colors"><FontAwesomeIcon icon={faPlus} /> New Request</button>
              </div>
            </div>

            {loadError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-center gap-2">
                <FontAwesomeIcon icon={faExclamationTriangle} /> {loadError}
              </div>
            )}

            {/* Kanban / List Board */}
            {loadingReqs ? (
              <div className="py-16 text-center text-slate-500 text-sm font-medium bg-white border border-slate-200 rounded-xl shadow-sm">
                Loading maintenance requests…
              </div>
            ) : viewMode === 'kanban' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                {COLUMNS.map(col => {
                  const reqs = filteredRequests.filter(r => col.statuses.includes(r.status));
                  return (
                    <div key={col.key} className="flex flex-col h-[calc(100vh-24rem)] min-h-[400px] bg-slate-100 rounded-xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <FontAwesomeIcon icon={col.icon} className={col.iconClass} />
                          <h3 className="text-sm font-bold text-slate-800 m-0">{col.key}</h3>
                        </div>
                        <span className="bg-white text-slate-500 text-xs font-bold px-2 py-0.5 rounded-full border border-slate-200">{reqs.length}</span>
                      </div>
                      <div className="stagger-children flex-1 overflow-y-auto space-y-3 pr-1">
                        {reqs.map(req => <RequestCard key={req.dbId} req={req} onOpen={openDetail} />)}
                        {reqs.length === 0 && <p className="text-xs text-slate-600 text-center mt-6">Nothing here.</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                      <th className="py-3 px-4">ID</th>
                      <th className="py-3 px-4">Issue</th>
                      <th className="py-3 px-4">Tenant / Unit</th>
                      <th className="py-3 px-4">Priority / Category</th>
                      <th className="py-3 px-4">Cost</th>
                      <th className="py-3 px-4">Assignee</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="stagger-children">
                    {filteredRequests.map(req => (
                      <tr key={req.dbId} {...clickable(() => openDetail(req), { role: null })} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500">
                        <td className="py-3 px-4 font-mono text-xs text-slate-500">{req.code}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-800">{req.title}</span>
                            {req.tenantResponsible && <span className="px-1.5 py-0.5 text-[11px] font-bold bg-violet-100 text-violet-700 rounded">T</span>}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-700">{req.tenant} <span className="text-slate-500 text-xs ml-1">({req.unit})</span></td>
                        <td className="py-3 px-4">
                          <div className="flex gap-1.5">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${urgencyColor(req.urgency)}`}>{req.urgency || '—'}</span>
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold border border-slate-200 bg-white text-slate-600">{req.category}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs font-semibold text-slate-600">{(req.actualCost ?? req.estimatedCost) !== null && (req.actualCost ?? req.estimatedCost) !== undefined ? formatCurrency(req.actualCost ?? req.estimatedCost) : '—'}</td>
                        <td className="py-3 px-4 text-xs font-medium text-slate-600">{req.assignedTo || '—'}</td>
                        <td className="py-3 px-4"><span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${MAINTENANCE_STATUS_STYLES[req.status] || ''}`}>{req.status}</span></td>
                      </tr>
                    ))}
                    {filteredRequests.length === 0 && (
                      <tr><td colSpan="7" className="py-8 text-center text-slate-500 text-sm">No maintenance requests found matching criteria.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

          </div>
        </div>
      </main>

      {showNewModal && (
        <NewRequestModal
          rooms={rooms}
          onClose={() => setShowNewModal(false)}
          onSubmit={handleCreateRequest}
          isSubmitting={isSubmittingNew}
        />
      )}

      {selectedReq && (
        <DetailModal
          key={selectedReq.dbId}
          req={selectedReq}
          settings={settings}
          saving={saving}
          onClose={closeDetail}
          onMoveTo={moveTo}
          onOpenAction={setActionModal}
          onToggleTenantResponsible={handleToggleTenantResponsible}
          onSaveField={handleFieldSave}
          onAddNote={handleAddNoteSave}
        />
      )}

      {actionModal && selectedReq && (
        <ActionModal
          type={actionModal}
          req={selectedReq}
          saving={saving}
          onConfirm={handleActionConfirm}
          onClose={() => setActionModal(null)}
        />
      )}

    </div>
  );
};

export default AdminMaintainance;
