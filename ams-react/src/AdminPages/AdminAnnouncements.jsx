import { useState, useEffect, useMemo, useCallback } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSave, faMobileAlt, faEnvelope, faDesktop, faCalendarAlt, faUsers, faPaperPlane, faSpinner, faLock, faExclamationTriangle, faPaperclip, faFilePdf,
} from '@fortawesome/free-solid-svg-icons';

import api from '../api/axiosConfig';
import { fileUrl } from '../api/fileUrl';
import { getSystemSettings } from '../config/systemSettings';
import { LIMITS, TITLE_MIN, checkText } from '../utils/validation';
import { apiErrorMessage } from '../utils/apiError';
import useFieldErrors from '../hooks/useFieldErrors';
import FieldError from '../Components/form/FieldError';
import FileChip from '../Components/form/FileChip';
import { FILE_RULES, acceptFor, checkFile } from '../utils/fileLimits';
import { invalidCls } from '../Components/form/formHelpers';
import { btn } from '../Components/admin/ui/styles';
import LoadError from '../Components/admin/ui/LoadError';
import { SkeletonCards } from '../Components/admin/ui/Skeleton';
import useLoadState from '../hooks/useLoadState';

const SEND_TO = ['All tenants', 'Specific unit'];
const TYPES = ['General', 'Urgent', 'Reminder'];

const channelIcons = { 'in-app': faDesktop, 'sms': faMobileAlt, 'email': faEnvelope };
const statusConfig = {
  sent: { label: 'Sent', color: 'bg-emerald-100 text-emerald-700' },
  scheduled: { label: 'Scheduled', color: 'bg-blue-100 text-blue-700' },
  draft: { label: 'Draft', color: 'bg-slate-100 text-slate-600' },
};
const tagStyleMap = { Urgent: 'bg-red-100 text-red-800', Reminder: 'bg-blue-100 text-blue-800', General: 'bg-slate-100 text-slate-600' };
// Tenancies create_announcement.php counts as current.
const CURRENT_STATUSES = ['active', 'Approved', 'pending-move-out'];
// draftId / draftAttachment: a reopened draft and the file it already holds;
// removeAttachment drops that file on the next save or send.
const EMPTY_FORM = { sendTo: 'All tenants', unit: '', type: 'General', title: '', body: '', channels: ['in-app'], attachment: null, draftId: null, draftAttachment: null, removeAttachment: false };

const INPUT = 'focus-glow w-full px-3 py-2 text-sm border border-slate-200 rounded-control bg-white text-slate-700 outline-none focus:border-indigo-500 transition-all';
const LABEL = 'block text-label font-medium text-slate-600 mb-1';

const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const getSmsPrefix =(type) => (type === 'General' || !type ? 'AMS: ' : `AMS ${type}: `);
const getSmsText = (type, title, body) => {
  const t = (title || '').trim();
  const b = (body || '').trim();
  if (!t && !b) return '';
  const prefix = getSmsPrefix(type);
  if (!t) return `${prefix}${b}`;
  if (!b) return `${prefix}${t}`;
  return `${prefix}${t} - ${b}`;
};

const AdminAnnouncements = () => {
  const [announcements, setAnnouncements] = useState([]);
  // loading | error | ready for the history list (a failed refresh keeps it).
  const historyState = useLoadState();
  const [tenants, setTenants] = useState([]);
  // Settings → Notifications → Cost per SMS, for the estimate next to the recipient count.
  const [smsUnitCost, setSmsUnitCost] = useState(0.5);
  useEffect(() => {
    getSystemSettings().then(s => setSmsUnitCost(Number.isFinite(s.smsUnitCost) ? s.smsUnitCost : 0.5));
  }, []);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fileKey, setFileKey] = useState(() => Date.now());
  const [attachmentError, setAttachmentError] = useState('');
  const chooseAttachment = (file) => {
    const error = checkFile(file, FILE_RULES.announcement);
    setAttachmentError(error);
    setForm(f => ({ ...f, attachment: error ? null : (file || null) }));
    if (error) setFileKey(Date.now()); // clear the rejected file from the input
  };
  // A preview of the chosen file, so the admin can see it was picked. Whether
  // it is an image is derived from the file; the image's object URL is owned
  // by the <img>'s ref callback (React 19 runs the returned cleanup when the
  // file changes or the image unmounts), so each URL is revoked exactly once.
  const attachmentFile = form.attachment;
  const attachmentIsImage = !!attachmentFile && attachmentFile.type.startsWith('image/');
  const attachmentImgRef = useCallback((img) => {
    if (!img || !attachmentFile) return undefined;
    const url = URL.createObjectURL(attachmentFile);
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [attachmentFile]);
  const clearAttachment = () => { setAttachmentError(''); setForm(f => ({ ...f, attachment: null })); setFileKey(Date.now()); };
  const removeDraftAttachment = () => setForm(f => ({ ...f, draftAttachment: null, removeAttachment: true }));
  const [sending, setSending] = useState(null); // 'send' | 'draft' | null
  const [notice, setNotice] = useState(null);   // { ok, text }
  // Keys match create_announcement.php's body (tag/body are the form's type/body).
  const isSmsActive = form.channels.includes('sms');
  const smsText = getSmsText(form.type, form.title, form.body);
  const smsLength = smsText.length;
  const isSmsOverLimit = isSmsActive && smsLength > 160;

  const fields = useFieldErrors({
    sendTo: (v) => (SEND_TO.includes(v) ? '' : 'Choose who receives this.'),
    unit: (v, all) => (all.sendTo !== 'Specific unit' ? '' : v ? '' : 'Choose the unit to send this announcement to.'),
    tag: (v) => (TYPES.includes(v) ? '' : 'Choose a type.'),
    title: (v) => checkText(v, { label: 'Title', min: TITLE_MIN, max: LIMITS.announcementTitle }),
    body: (v, all) => {
      const err = checkText(v, { label: 'Message', max: LIMITS.message });
      if (err) return err;
      if (all?.isSmsActive && all?.smsLength > 160) {
        return `SMS exceeds the 160-character limit (${all.smsLength}/160). Please shorten the message or uncheck SMS delivery to send.`;
      }
      return '';
    },
  }, { idPrefix: 'announce-' });
  const values = { sendTo: form.sendTo, unit: form.unit, tag: form.type, title: form.title, body: form.body };
  const setField = (key, value, formKey = key) => {
    setForm(p => ({ ...p, [formKey]: value }));
    fields.clearError(key);
    if (key === 'tag' || key === 'title') {
      fields.clearError('body');
    }
  };
  const blurText = (key) => {
    const v = form[key].trim();
    if (v !== form[key]) setForm(p => ({ ...p, [key]: v }));
    if (v) fields.validateField(key, { ...values, [key]: v, isSmsActive, smsLength });
  };

  const fetchTenants = async () => {
    try {
      const res = await api.get('/get_tenants.php');
      if (res.data.success) setTenants(res.data.data.filter(t => CURRENT_STATUSES.includes(t.status)));
    } catch (err) {
      console.error('Error fetching tenants:', err);
    }
  };

  const fetchAnnouncements = async () => {
    try {
      const response = await api.get('get_announcements.php');
      if (response.data.success) {
        setAnnouncements(response.data.announcements.map(ann => ({
          ...ann,
          status: statusConfig[ann.status] ? ann.status : 'sent',
          // Older rows stored "Email"; the API may also hand back a JSON string.
          channels: (Array.isArray(ann.channels) ? ann.channels : (() => {
            try { return JSON.parse(ann.channels || '[]'); } catch { return []; }
          })()).map(c => String(c).toLowerCase()).filter(c => channelIcons[c]),
          tagStyle: tagStyleMap[ann.tag] || tagStyleMap.General,
          date: new Date(ann.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          recipients: ann.recipient_count || 0,
        })));
        historyState.ready();
      } else {
        historyState.fail();
      }
    } catch (error) {
      console.error(error);
      historyState.fail();
    }
  };

  useEffect(() => {
    const load = async () => { await Promise.all([fetchAnnouncements(), fetchTenants()]); };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount; the loaders only call stable useLoadState callbacks
  }, []);

  // Units that have a current tenant, with how many tenants each.
  const units = useMemo(() => {
    const counts = {};
    tenants.forEach(t => { if (t.unit) counts[t.unit] = (counts[t.unit] || 0) + 1; });
    return Object.keys(counts)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map(name => ({ name, count: counts[name] }));
  }, [tenants]);

  const specific = form.sendTo === 'Specific unit';
  const recipientCount = specific
    ? (units.find(u => u.name === form.unit)?.count || 0)
    : tenants.length;

  const handleSend = async (draft) => {
    if (sending) return;
    setNotice(null);
    const clean = { ...form, title: form.title.trim(), body: form.body.trim() };
    setForm(clean);
    const cleanSmsText = getSmsText(form.type, clean.title, clean.body);
    const cleanSmsLength = cleanSmsText.length;
    const cleanSmsOver = isSmsActive && cleanSmsLength > 160;

    if (!fields.validateAll({
      ...values,
      title: clean.title,
      body: clean.body,
      isSmsActive: !draft && isSmsActive,
      smsLength: cleanSmsLength,
    })) return;

    if (!draft && cleanSmsOver) {
      fields.setFieldError('body', `SMS message exceeds 160 characters (${cleanSmsLength}/160). Please shorten the text or uncheck SMS delivery to send.`);
      setNotice({
        ok: false,
        text: `SMS message exceeds 160 characters (${cleanSmsLength}/160). Please shorten the text or uncheck SMS delivery to send.`,
      });
      return;
    }

    setSending(draft ? 'draft' : 'send');
    try {
      const payload = {
        tag: form.type,
        title: clean.title,
        body: clean.body,
        sendTo: form.sendTo,
        unit: specific ? form.unit : '',
        channels: form.channels,
        draft,
        // A reopened draft is updated (or sent) in place, keeping its file
        // unless it was removed or replaced.
        ...(form.draftId ? { draftId: form.draftId, removeAttachment: form.removeAttachment } : {}),
      };
      // A file can only travel in a form post; create_announcement.php reads
      // either shape. Drafts keep their attachment too.
      let body = payload;
      let config;
      if (form.attachment) {
        body = new FormData();
        Object.entries(payload).forEach(([key, value]) => body.append(key, key === 'channels' ? JSON.stringify(value) : String(value)));
        body.append('attachment', form.attachment);
        // Without this axios turns the form into JSON (its default type) and drops the file.
        config = { headers: { 'Content-Type': 'multipart/form-data' } };
      }
      const response = await api.post('create_announcement.php', body, config);
      if (!response.data.success && fields.applyServerErrors(response)) return;
      setNotice({ ok: !!response.data.success, text: response.data.message || (response.data.success ? 'Done.' : 'Failed.') });
      if (response.data.success) {
        setForm(EMPTY_FORM);
        setAttachmentError('');
        setFileKey(Date.now());
        fetchAnnouncements();
      }
    } catch (err) {
      if (!fields.applyServerErrors(err)) setNotice({ ok: false, text: apiErrorMessage(err, 'Could not send the announcement.') });
    } finally {
      setSending(null);
    }
  };

  // History → "Open draft": load a saved draft into the composer. send_to is
  // stored as "All Tenants" or "Unit <name>".
  const openDraft = (item) => {
    const unitMatch = /^Unit (.+)$/.exec(item.send_to || '');
    setForm({
      ...EMPTY_FORM,
      sendTo: unitMatch ? 'Specific unit' : 'All tenants',
      unit: unitMatch ? unitMatch[1] : '',
      type: TYPES.includes(item.tag) ? item.tag : 'General',
      title: item.title || '',
      body: item.body || '',
      channels: item.channels.includes('in-app') ? item.channels : ['in-app', ...item.channels],
      draftId: item.id,
      draftAttachment: item.attachment_path || null,
    });
    setAttachmentError('');
    setFileKey(k => k + 1);
    fields.setErrors({});
    setNotice({ ok: true, text: 'Draft opened. Save it again or send it.' });
    // The composer sits above the history: bring it into view.
    requestAnimationFrame(() => document.getElementById(fields.idFor('title'))?.focus());
  };
  const closeDraft = () => {
    setForm(EMPTY_FORM);
    setAttachmentError('');
    setFileKey(k => k + 1);
    fields.setErrors({});
    setNotice(null);
  };

  // In-app always goes out; only SMS and email are optional.
  const toggleChannel = (ch) => {
    if (ch === 'in-app') return;
    setForm(prev => {
      const nextChannels = prev.channels.includes(ch) ? prev.channels.filter(c => c !== ch) : [...prev.channels, ch];
      return { ...prev, channels: nextChannels };
    });
    if (ch === 'sms') {
      fields.clearError('body');
    }
  };

  const sendLabel = specific ? (form.unit ? `Send to Unit ${form.unit}` : 'Send to unit') : 'Send to all tenants';

  return (
    <div className="admin-shell flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />

      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left bg-slate-50">
        <Header title="Announcements" />

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-4xl mx-auto space-y-6">

            {/* Compose Announcement */}
            <div className="bg-white border border-slate-200 rounded-card p-6 shadow-card">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="text-title font-bold text-slate-800 m-0">{form.draftId ? 'Edit Draft' : 'Compose Announcement'}</h3>
                {form.draftId && (
                  <button type="button" onClick={closeDraft} className="text-label font-semibold text-slate-500 hover:text-slate-700 bg-transparent border-0 cursor-pointer p-0">
                    Close draft
                  </button>
                )}
              </div>

              <div className={`grid grid-cols-1 gap-3 mb-3 ${specific ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                <div>
                  <label htmlFor="announce-sendTo" className={LABEL}>Send to</label>
                  <select {...fields.fieldA11y('sendTo')} value={form.sendTo} onChange={e => { setForm(p => ({ ...p, sendTo: e.target.value, unit: '' })); fields.clearError('sendTo'); fields.clearError('unit'); }} className={INPUT + invalidCls(fields.errors.sendTo)}>
                    {SEND_TO.map(s => <option key={s}>{s}</option>)}
                  </select>
                  <FieldError id="announce-sendTo" error={fields.errors.sendTo} />
                </div>
                {specific && (
                  <div>
                    <label htmlFor="announce-unit" className={LABEL}>Unit</label>
                    <select {...fields.fieldA11y('unit')} value={form.unit} onChange={e => setField('unit', e.target.value)} className={INPUT + invalidCls(fields.errors.unit)}>
                      <option value="" disabled>{units.length ? 'Choose a unit…' : 'No occupied units'}</option>
                      {units.map(u => (
                        <option key={u.name} value={u.name}>Unit {u.name} ({u.count} tenant{u.count === 1 ? '' : 's'})</option>
                      ))}
                    </select>
                    <FieldError id="announce-unit" error={fields.errors.unit} />
                  </div>
                )}
                <div>
                  <label htmlFor="announce-tag" className={LABEL}>Type</label>
                  <select {...fields.fieldA11y('tag')} value={form.type} onChange={e => setField('tag', e.target.value, 'type')} className={INPUT + invalidCls(fields.errors.tag)}>
                    {TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                  <FieldError id="announce-tag" error={fields.errors.tag} />
                </div>
              </div>

              <div className="mb-3">
                <label htmlFor="announce-title" className={LABEL}>Title</label>
                <input type="text" {...fields.fieldA11y('title')} autoComplete="off" placeholder="Announcement title" maxLength={LIMITS.announcementTitle} value={form.title}
                  onChange={e => setField('title', e.target.value)} onBlur={() => blurText('title')} className={INPUT + invalidCls(fields.errors.title)} />
                <FieldError id="announce-title" error={fields.errors.title} />
              </div>

              <div className="mb-4">
                <label htmlFor="announce-body" className={LABEL}>Message</label>
                <textarea {...fields.fieldA11y('body')} placeholder="Type your message here..." rows={4} maxLength={LIMITS.message} value={form.body}
                  onChange={e => setField('body', e.target.value)} onBlur={() => blurText('body')}
                  className={"focus-glow w-full px-3 py-2 text-sm border border-slate-200 rounded-control bg-slate-50 text-slate-800 placeholder-slate-400 resize-none outline-none focus:bg-white focus:border-indigo-500 transition-all" + invalidCls(fields.errors.body)} />
                <FieldError id="announce-body" error={fields.errors.body} />
                <p className="sr-only" aria-live="polite">
                  {form.body.length} / {LIMITS.message} characters
                </p>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mt-1 text-caption">
                  <div>
                    {isSmsOverLimit ? (
                      <span className="inline-flex items-center gap-1.5 text-red-600 font-semibold">
                        <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-500" />
                        SMS exceeds 160-character limit ({smsLength}/160)
                      </span>
                    ) : isSmsActive && smsLength > 0 ? (
                      <span className="text-slate-500">
                        SMS preview: {smsLength}/160 characters (1 segment)
                      </span>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500">{form.body.length} / {LIMITS.message} characters</span>
                    {isSmsActive && (
                      <span className={isSmsOverLimit ? 'font-semibold text-red-600 ml-1.5' : 'text-slate-500 ml-1.5'}>
                        · SMS: {smsLength}/160 {isSmsOverLimit ? `(+${smsLength - 160} over)` : ''}
                      </span>
                    )}
                  </div>
                </div>

                {isSmsOverLimit && (
                  <div className="mt-2.5 p-3 rounded-control bg-red-50 border border-red-200 text-red-800 text-label flex items-start gap-2.5 shadow-card">
                    <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-500 text-sm mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <p className="font-semibold m-0">SMS character limit exceeded</p>
                      <p className="m-0 text-red-700 leading-relaxed">
                        The combined announcement text formatted for SMS is <strong>{smsLength} characters</strong> (exceeds the 160-character limit by {smsLength - 160}). Sending via SMS is blocked until the title or message is shortened, or SMS delivery is unchecked.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Attachment Input */}
              <div className="mb-4">
                <label htmlFor="announcement-attachment" className="block text-label font-medium text-slate-600 mb-2">Attachment (Optional)</label>
                <input
                  id="announcement-attachment"
                  key={fileKey} type="file"
                  accept={acceptFor(FILE_RULES.announcement)}
                  onChange={e => chooseAttachment(e.target.files[0])}
                  aria-describedby="announcement-attachment-hint"
                  className="w-full text-body text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-control file:border-0 file:text-body file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
                <p id="announcement-attachment-hint" className="text-caption text-slate-500 m-0 mt-1">
                  One file: {FILE_RULES.announcement.label}, up to {FILE_RULES.announcement.maxMB} MB. Tenants open it from the announcement in their notifications; it is not sent with the SMS or email. "Save draft" keeps it with the draft.
                </p>
                {attachmentError && <p role="alert" className="text-label text-red-600 m-0 mt-1">{attachmentError}</p>}
                {/* The file a reopened draft already holds; a newly chosen file replaces it. */}
                {form.draftAttachment && !form.attachment && (
                  <div className="mt-2 inline-flex items-center gap-2 rounded-control border border-slate-200 bg-slate-50 px-3 py-1.5 text-label text-slate-600">
                    <FontAwesomeIcon icon={faPaperclip} className="text-indigo-500" />
                    <a href={fileUrl(form.draftAttachment)} target="_blank" rel="noreferrer" className="font-semibold text-indigo-700 no-underline hover:underline">Saved attachment</a>
                    <button type="button" onClick={removeDraftAttachment} className="text-red-600 font-semibold bg-transparent border-0 cursor-pointer p-0">Remove</button>
                  </div>
                )}
                <FileChip file={form.attachment} onRemove={clearAttachment} />
                {attachmentFile && (
                  <div className="mt-2 inline-flex items-center justify-center rounded-control border border-slate-200 bg-slate-50 overflow-hidden">
                    {attachmentIsImage
                      ? <img ref={attachmentImgRef} alt="Attachment preview" className="max-h-40 max-w-full object-contain" />
                      : <div className="flex items-center gap-2 px-4 py-3 text-label text-slate-600"><FontAwesomeIcon icon={faFilePdf} className="text-red-600 text-base" /> PDF attached</div>}
                  </div>
                )}
              </div>

              {/* Delivery Channels */}
              <div className="mb-4">
                <label className="block text-label font-medium text-slate-600 mb-2">Delivery Channels</label>
                <div className="flex flex-wrap gap-2">
                  {[{ key: 'in-app', label: 'In-App', icon: faDesktop }, { key: 'sms', label: 'SMS', icon: faMobileAlt }, { key: 'email', label: 'Email', icon: faEnvelope }].map(ch => (
                    <button key={ch.key} type="button" onClick={() => toggleChannel(ch.key)}
                      title={ch.key === 'in-app' ? 'In-app is always sent' : undefined}
                      className={`btn-interactive flex items-center gap-2 px-3 py-2 rounded-control text-label font-semibold border ${ch.key === 'in-app' ? 'cursor-default' : 'cursor-pointer'} transition-all ${form.channels.includes(ch.key) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-400'}`}>
                      <FontAwesomeIcon icon={ch.icon} /> {ch.label}
                      {ch.key === 'in-app' && <FontAwesomeIcon icon={faLock} className="text-[9px] opacity-70" />}
                    </button>
                  ))}
                </div>
                <p className="text-caption text-slate-500 m-0 mt-2">
                  SMS and email reach only tenants who have them enabled and not opted out. SMS is capped at 160 characters (1 segment) per announcement.
                </p>
              </div>

              {/* Recipient Count */}
              <div className="mb-4 bg-slate-50 border border-slate-100 rounded-control p-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-label text-slate-600">
                <FontAwesomeIcon icon={faUsers} className="text-indigo-500" />
                <span>Will be sent to <strong className="text-slate-800">{recipientCount} tenant{recipientCount === 1 ? '' : 's'}</strong></span>
                {/* "Up to": tenants without SMS enabled, or opted out, are skipped. One SMS each (160-char cap). */}
                {isSmsActive && (
                  <span className="text-slate-500">
                    · Estimated SMS cost: up to {recipientCount} × {peso(smsUnitCost)} = <strong className="text-slate-800">{peso(recipientCount * smsUnitCost)}</strong>
                  </span>
                )}
              </div>

              {notice && (
                <div role={notice.ok ? 'status' : 'alert'} className={`mb-4 rounded-control px-3 py-2 text-label font-medium ${notice.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                  {notice.text}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => handleSend(false)} disabled={!!sending || isSmsOverLimit}
                  title={isSmsOverLimit ? `SMS length (${smsLength}/160) exceeds the 160-character limit. Shorten text or uncheck SMS.` : undefined}
                  className={btn('primary', 'sm', 'btn-interactive')}>
                  <FontAwesomeIcon icon={sending === 'send' ? faSpinner : faPaperPlane} spin={sending === 'send'} />
                  {sendLabel}
                </button>
                <button type="button" onClick={() => handleSend(true)} disabled={!!sending}
                  className={btn('secondary', 'sm', 'btn-interactive')}>
                  <FontAwesomeIcon icon={sending === 'draft' ? faSpinner : faSave} spin={sending === 'draft'} /> Save draft
                </button>
              </div>
            </div>

            {/* Announcement History */}
            <div>
              <h4 className="text-label font-medium text-slate-600 mb-3 m-0">Announcement History</h4>
              <div className="stagger-children space-y-3 mt-2">
                {historyState.isLoading && <SkeletonCards count={3} className="space-y-3" label="Loading announcements…" />}
                {historyState.isError && <div className="bg-white border border-slate-200 rounded-card"><LoadError title="Couldn't load past announcements" onRetry={() => { historyState.retry(); fetchAnnouncements(); }} /></div>}
                {historyState.isReady && announcements.length === 0 && (
                  <p className="text-label text-slate-500 m-0">No announcements yet.</p>
                )}
                {historyState.isReady && announcements.map(item => (
                  <div key={item.id} className="card-interactive bg-white border border-slate-200 rounded-card p-5 shadow-card transition-all hover:border-indigo-400">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className={`rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap inline-flex ${item.tagStyle}`}>{item.tag}</span>
                      <span className={`rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap inline-flex ${statusConfig[item.status].color}`}>{statusConfig[item.status].label}</span>
                      <span className="text-body font-semibold text-slate-800">{item.title}</span>
                    </div>
                    <p className="text-label text-slate-500 leading-relaxed m-0 mb-3">{item.body}</p>
                    {item.attachment_path && (
                      <a href={fileUrl(item.attachment_path)} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1.5 mb-3 px-2.5 py-1 rounded-control bg-indigo-50 text-indigo-700 text-caption font-semibold no-underline hover:bg-indigo-100">
                        <FontAwesomeIcon icon={faPaperclip} /> View attachment
                      </a>
                    )}
                    {item.status === 'draft' && (
                      <button type="button" onClick={() => openDraft(item)} disabled={!!sending || form.draftId === item.id}
                        className="ml-2 inline-flex items-center gap-1.5 mb-3 px-2.5 py-1 rounded-control bg-slate-100 text-slate-700 text-caption font-semibold border-0 cursor-pointer hover:bg-slate-200 disabled:opacity-60 disabled:cursor-default">
                        {form.draftId === item.id ? 'Open in composer' : 'Open draft'}
                      </button>
                    )}
                    <div className="flex items-center flex-wrap gap-3 text-caption text-slate-500">
                      <span className="flex items-center gap-1"><FontAwesomeIcon icon={faCalendarAlt} /> {item.date}</span>
                      <span className="flex items-center gap-1"><FontAwesomeIcon icon={faUsers} /> {item.send_to} · {item.recipients} recipients</span>
                      <div className="flex items-center gap-1">
                        {item.channels.map(ch => (
                          <span key={ch} className="w-5 h-5 rounded-control bg-slate-100 flex items-center justify-center" title={ch}>
                            <FontAwesomeIcon icon={channelIcons[ch]} className="text-[9px] text-slate-500" />
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminAnnouncements;
