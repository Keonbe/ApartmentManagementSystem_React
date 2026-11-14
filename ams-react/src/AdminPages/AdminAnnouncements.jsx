import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSave, faMobileAlt, faEnvelope, faDesktop, faCalendarAlt, faUsers, faPaperPlane, faSpinner, faLock, faExclamationTriangle, faPaperclip, faFilePdf, faThumbtack,
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
import askConfirm from '../utils/askConfirm';

const SEND_TO = ['All tenants', 'Specific unit', 'Selected tenants'];
// send_to is stored as 'All Tenants', 'Unit B' or 'Tenants: 2,3,5' (user ids); this is the history label.
const audienceLabel = (sendTo) => {
  const m = /^Tenants: (.+)$/.exec(sendTo || '');
  if (!m) return sendTo;
  const n = m[1].split(',').filter(Boolean).length;
  return `${n} selected tenant${n === 1 ? '' : 's'}`;
};
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
const EMPTY_FORM = { sendTo: 'All tenants', unit: '', tenantIds: [], type: 'General', title: '', body: '', channels: ['in-app'], attachment: null, draftId: null, draftAttachment: null, removeAttachment: false, schedule: false, scheduledAt: '' };

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
  const [unitQuery, setUnitQuery] = useState('');
  const [unitMenuOpen, setUnitMenuOpen] = useState(false);
  const unitPickerRef = useRef(null);
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
    tenantIds: (v, all) => (all.sendTo !== 'Selected tenants' ? '' : (v || []).length ? '' : 'Choose at least one tenant.'),
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
  const values = { sendTo: form.sendTo, unit: form.unit, tenantIds: form.tenantIds, tag: form.type, title: form.title, body: form.body };
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
          is_pinned: Number(ann.is_pinned) === 1,
          status: statusConfig[ann.status] ? ann.status : 'sent',
          // Older rows stored "Email"; the API may also hand back a JSON string.
          channels: (Array.isArray(ann.channels) ? ann.channels : (() => {
            try { return JSON.parse(ann.channels || '[]'); } catch { return []; }
          })()).map(c => String(c).toLowerCase()).filter(c => channelIcons[c]),
          tagStyle: tagStyleMap[ann.tag] || tagStyleMap.General,
          date: new Date(ann.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          recipients: ann.recipient_count || 0,
          scheduledLabel: ann.scheduled_date && ann.status === 'scheduled'
            ? new Date(ann.scheduled_date.replace(' ', 'T')).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
            : '',
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

  useEffect(() => {
    if (!unitMenuOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!unitPickerRef.current?.contains(event.target)) setUnitMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setUnitMenuOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [unitMenuOpen]);

  // Units and tenant names come from get_rooms.php's admin-only occupancy history.
  const units = useMemo(() => {
    const namesByUnit = {};
    tenants.forEach(t => {
      if (!t.unit) return;
      const name = String(t.name || '').trim();
      if (name) (namesByUnit[t.unit] ||= []).push(name);
    });
    return Object.keys(namesByUnit)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map(name => ({ name, tenantNames: namesByUnit[name], count: namesByUnit[name].length }));
  }, [tenants]);

  const selectedUnit = units.find(u => u.name === form.unit);
  const selectedUnitLabel = selectedUnit ? `Unit ${selectedUnit.name} — ${selectedUnit.tenantNames.join(', ')}` : '';
  const filteredUnits = units.filter(u =>
    `Unit ${u.name} ${u.tenantNames.join(' ')}`.toLocaleLowerCase().includes(unitQuery.trim().toLocaleLowerCase())
  );

  const specific = form.sendTo === 'Specific unit';
  const chosenMode = form.sendTo === 'Selected tenants';
  const recipientCount = specific
    ? (units.find(u => u.name === form.unit)?.count || 0)
    : chosenMode ? form.tenantIds.length : tenants.length;

  // The tenant checklist: one entry per person (a unit can have several), filtered by a search box.
  const [tenantQuery, setTenantQuery] = useState('');
  const tenantChoices = useMemo(() => {
    const seen = new Set();
    return tenants
      .filter(t => t.user_id && !seen.has(t.user_id) && seen.add(t.user_id))
      .map(t => ({ id: Number(t.user_id), name: String(t.name || '').trim() || `Tenant ${t.user_id}`, unit: t.unit }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tenants]);
  const visibleChoices = tenantChoices.filter(c => `${c.name} unit ${c.unit}`.toLocaleLowerCase().includes(tenantQuery.trim().toLocaleLowerCase()));
  const toggleTenant = (id) => {
    setForm(p => ({ ...p, tenantIds: p.tenantIds.includes(id) ? p.tenantIds.filter(x => x !== id) : [...p.tenantIds, id] }));
    fields.clearError('tenantIds');
  };

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

    const scheduling = !draft && form.schedule;
    if (scheduling) {
      const when = form.scheduledAt ? new Date(form.scheduledAt) : null;
      if (!when || Number.isNaN(when.getTime())) { setNotice({ ok: false, text: 'Choose the date and time to send at.' }); return; }
      if (when.getTime() < Date.now() + 60 * 1000) { setNotice({ ok: false, text: 'Choose a time at least a minute from now.' }); return; }
    }

    setSending(draft ? 'draft' : 'send');
    try {
      const payload = {
        tag: form.type,
        title: clean.title,
        body: clean.body,
        sendTo: form.sendTo,
        unit: specific ? form.unit : '',
        ...(chosenMode ? { tenantIds: form.tenantIds } : {}),
        channels: form.channels,
        draft,
        ...(scheduling ? { scheduledAt: form.scheduledAt } : {}),
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
        Object.entries(payload).forEach(([key, value]) => body.append(key, key === 'channels' || key === 'tenantIds' ? JSON.stringify(value) : String(value)));
        body.append('attachment', form.attachment);
        // Without this axios turns the form into JSON (its default type) and drops the file.
        config = { headers: { 'Content-Type': 'multipart/form-data' } };
      }
      const response = await api.post('create_announcement.php', body, config);
      if (!response.data.success && !response.data.fieldErrors?.scheduledAt && fields.applyServerErrors(response)) return;
      setNotice({ ok: !!response.data.success, text: response.data.message || (response.data.success ? 'Done.' : 'Failed.') });
      if (response.data.success) {
        setForm(EMPTY_FORM);
        setAttachmentError('');
        setFileKey(Date.now());
        fetchAnnouncements();
      }
    } catch (err) {
      if (err?.response?.data?.fieldErrors?.scheduledAt || !fields.applyServerErrors(err)) setNotice({ ok: false, text: apiErrorMessage(err, 'Could not send the announcement.') });
    } finally {
      setSending(null);
    }
  };

  // History buttons on a scheduled announcement.
  const sendScheduledNow = async (item) => {
    if (sending || !(await askConfirm(`Send "${item.title}" now instead of ${item.scheduledLabel}?`))) return;
    setSending(`now-${item.id}`);
    try {
      const res = await api.post('create_announcement.php', { action: 'sendNow', id: item.id });
      setNotice({ ok: !!res.data.success, text: res.data.message || 'Done.' });
    } catch (err) {
      setNotice({ ok: false, text: apiErrorMessage(err, 'Could not send the announcement.') });
    } finally {
      setSending(null);
      fetchAnnouncements();
    }
  };
  // Pin or unpin a sent announcement (the tenants' feed lists pinned ones first).
  const togglePin = async (item) => {
    if (sending) return;
    setSending(`pin-${item.id}`);
    try {
      const res = await api.post('pin_announcement.php', { id: item.id, pinned: !item.is_pinned });
      setNotice({ ok: !!res.data.success, text: res.data.message || 'Done.' });
    } catch (err) {
      setNotice({ ok: false, text: apiErrorMessage(err, 'Could not change the pin.') });
    } finally {
      setSending(null);
      fetchAnnouncements();
    }
  };
  const unscheduleItem = async (item) => {
    if (sending) return;
    setSending(`back-${item.id}`);
    try {
      const res = await api.post('create_announcement.php', { action: 'unschedule', id: item.id });
      setNotice({ ok: !!res.data.success, text: res.data.message || 'Done.' });
      if (form.draftId === item.id) setForm(EMPTY_FORM);
    } catch (err) {
      setNotice({ ok: false, text: apiErrorMessage(err, 'Could not change the announcement.') });
    } finally {
      setSending(null);
      fetchAnnouncements();
    }
  };

  // History → "Open draft": load a saved draft into the composer. send_to is
  // stored as "All Tenants" or "Unit <name>".
  const openDraft = (item) => {
    const unitMatch = /^Unit (.+)$/.exec(item.send_to || '');
    const tenantsMatch = /^Tenants: (.+)$/.exec(item.send_to || '');
    setForm({
      ...EMPTY_FORM,
      sendTo: tenantsMatch ? 'Selected tenants' : unitMatch ? 'Specific unit' : 'All tenants',
      unit: unitMatch ? unitMatch[1] : '',
      tenantIds: tenantsMatch ? tenantsMatch[1].split(',').map(Number).filter(Boolean) : [],
      type: TYPES.includes(item.tag) ? item.tag : 'General',
      title: item.title || '',
      body: item.body || '',
      channels: item.channels.includes('in-app') ? item.channels : ['in-app', ...item.channels],
      draftId: item.id,
      draftAttachment: item.attachment_path || null,
      // A scheduled row reopens with its time (datetime-local wants YYYY-MM-DDTHH:MM).
      schedule: item.status === 'scheduled',
      scheduledAt: item.status === 'scheduled' && item.scheduled_date ? item.scheduled_date.slice(0, 16).replace(' ', 'T') : '',
    });
    setAttachmentError('');
    setFileKey(k => k + 1);
    fields.setErrors({});
    setNotice({ ok: true, text: item.status === 'scheduled' ? 'Scheduled announcement opened. Change it and schedule it again, or send it now.' : 'Draft opened. Save it again or send it.' });
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

  const sendLabel = form.schedule ? 'Schedule announcement' : specific ? (form.unit ? `Send to Unit ${form.unit}` : 'Send to unit') : 'Send to all tenants';
  // Earliest time the picker offers: one minute from now, in the browser's own time.
  const [minSchedule] = useState(() => { const d = new Date(Date.now() + 60 * 1000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); });

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
                  <select {...fields.fieldA11y('sendTo')} value={form.sendTo} onChange={e => { setForm(p => ({ ...p, sendTo: e.target.value, unit: '', tenantIds: [] })); fields.clearError('sendTo'); fields.clearError('tenantIds'); fields.clearError('unit'); }} className={INPUT + invalidCls(fields.errors.sendTo)}>
                    {SEND_TO.map(s => <option key={s}>{s}</option>)}
                  </select>
                  <FieldError id="announce-sendTo" error={fields.errors.sendTo} />
                </div>
                {specific && (
                  <div>
                    <label htmlFor="announce-unit" className={LABEL}>Unit</label>
                    <div ref={unitPickerRef} className="relative">
                      <div className={`flex items-center rounded-control border bg-white text-slate-900 transition-colors focus-within:ring-2 focus-within:ring-indigo-500 ${fields.errors.unit ? 'border-red-500' : 'border-slate-300 focus-within:border-indigo-500'}`}>
                        <input
                          id="announce-unit"
                          name="unit"
                          type="text"
                          role="combobox"
                          aria-autocomplete="list"
                          aria-expanded={unitMenuOpen}
                          aria-controls="announce-unit-options"
                          aria-invalid={!!fields.errors.unit}
                          aria-describedby={fields.errors.unit ? 'announce-unit-error' : undefined}
                          autoComplete="off"
                          placeholder={units.length ? 'Search or choose a unit…' : 'No occupied units'}
                          value={unitMenuOpen ? unitQuery : selectedUnitLabel}
                          onFocus={() => { setUnitQuery(''); setUnitMenuOpen(true); }}
                          onClick={() => { if (!unitMenuOpen) { setUnitQuery(''); setUnitMenuOpen(true); } }}
                          onChange={event => { setUnitQuery(event.target.value); setUnitMenuOpen(true); }}
                          onKeyDown={event => {
                            if (event.key === 'ArrowDown') { event.preventDefault(); setUnitMenuOpen(true); }
                          }}
                          className="min-w-0 flex-1 rounded-control bg-transparent px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none"
                        />
                        {form.unit && (
                          <button type="button" aria-label="Clear selected unit" onClick={() => {
                            setField('unit', '');
                            setUnitQuery('');
                            setUnitMenuOpen(true);
                          }} className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-800">
                            ✕
                          </button>
                        )}
                      </div>
                      {unitMenuOpen && (
                        <div id="announce-unit-options" role="listbox" aria-label="Units" className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto overscroll-contain rounded-control border border-slate-200 bg-white py-1 text-slate-800 shadow-lg [scrollbar-width:thin] [scrollbar-color:#94a3b8_transparent]">
                          {filteredUnits.length ? filteredUnits.map(u => {
                            const label = `Unit ${u.name} — ${u.tenantNames.join(', ')}`;
                            const selected = form.unit === u.name;
                            return (
                              <button key={u.name} type="button" role="option" aria-selected={selected}
                                onClick={() => {
                                  setField('unit', u.name);
                                  setUnitQuery('');
                                  setUnitMenuOpen(false);
                                }}
                                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-100 ${selected ? 'bg-indigo-50 font-medium text-indigo-600' : 'text-slate-800'}`}>
                                <span>{label}</span>
                                {selected && <span className="text-indigo-600" aria-hidden="true">✓</span>}
                              </button>
                            );
                          }) : (
                            <p className="m-0 px-3 py-2 text-sm text-slate-500">
                              {units.length ? `No units found matching '${unitQuery}'` : 'No occupied units available'}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
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

              {chosenMode && (
                <fieldset className="mb-3 m-0 rounded-control border border-slate-200 p-3">
                  <legend className="px-1 text-label font-medium text-slate-600">Tenants ({form.tenantIds.length} chosen)</legend>
                  <input
                    type="search"
                    aria-label="Search tenants"
                    placeholder="Search by name or unit"
                    value={tenantQuery}
                    onChange={e => setTenantQuery(e.target.value)}
                    className={`${INPUT} mb-2`}
                  />
                  <div className="max-h-56 overflow-y-auto space-y-0.5">
                    {visibleChoices.length ? visibleChoices.map(c => (
                      <label key={c.id} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded px-2 text-sm text-slate-800 hover:bg-slate-50">
                        <input type="checkbox" className="h-5 w-5 accent-indigo-600" checked={form.tenantIds.includes(c.id)} onChange={() => toggleTenant(c.id)} />
                        <span>{c.name} <span className="text-slate-600">· Unit {c.unit}</span></span>
                      </label>
                    )) : <p className="m-0 px-2 py-2 text-sm text-slate-600">{tenantChoices.length ? 'No tenant matches that search.' : 'No current tenants.'}</p>}
                  </div>
                  <FieldError id="announce-tenantIds" error={fields.errors.tenantIds} />
                </fieldset>
              )}
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

              <div className="mb-4">
                <label className="inline-flex items-center gap-2 text-label font-medium text-slate-700 cursor-pointer">
                  <input type="checkbox" checked={form.schedule} onChange={e => setForm(p => ({ ...p, schedule: e.target.checked, scheduledAt: e.target.checked ? p.scheduledAt : '' }))} />
                  Schedule for later
                </label>
                {form.schedule && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input type="datetime-local" aria-label="Send at" value={form.scheduledAt} min={minSchedule}
                      onChange={e => setForm(p => ({ ...p, scheduledAt: e.target.value }))} className={`${INPUT} !w-auto`} />
                    <span className="text-caption text-slate-500">Tenants are worked out when it is sent. You can edit, send it now or turn it back into a draft until then.</span>
                  </div>
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
                  <FontAwesomeIcon icon={sending === 'send' ? faSpinner : form.schedule ? faCalendarAlt : faPaperPlane} spin={sending === 'send'} />
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
                      {item.is_pinned && <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-caption font-semibold text-indigo-700"><FontAwesomeIcon icon={faThumbtack} /> Pinned</span>}
                    </div>
                    <p className="text-label text-slate-500 leading-relaxed m-0 mb-3">{item.body}</p>
                    {item.attachment_path && (
                      <a href={fileUrl(item.attachment_path)} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1.5 mb-3 px-2.5 py-1 rounded-control bg-indigo-50 text-indigo-700 text-caption font-semibold no-underline hover:bg-indigo-100">
                        <FontAwesomeIcon icon={faPaperclip} /> View attachment
                      </a>
                    )}
                    {item.status === 'scheduled' && (
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className="text-caption font-semibold text-blue-700">Scheduled for {item.scheduledLabel}</span>
                        <button type="button" onClick={() => openDraft(item)} disabled={!!sending || form.draftId === item.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-control bg-slate-100 text-slate-700 text-caption font-semibold border-0 cursor-pointer hover:bg-slate-200 disabled:opacity-60 disabled:cursor-default">
                          {form.draftId === item.id ? 'Open in composer' : 'Edit'}
                        </button>
                        <button type="button" onClick={() => sendScheduledNow(item)} disabled={!!sending}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-control bg-indigo-50 text-indigo-700 text-caption font-semibold border-0 cursor-pointer hover:bg-indigo-100 disabled:opacity-60 disabled:cursor-default">
                          Send now
                        </button>
                        <button type="button" onClick={() => unscheduleItem(item)} disabled={!!sending}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-control bg-slate-100 text-slate-700 text-caption font-semibold border-0 cursor-pointer hover:bg-slate-200 disabled:opacity-60 disabled:cursor-default">
                          Back to draft
                        </button>
                      </div>
                    )}
                    {item.status === 'sent' && (
                      <button type="button" onClick={() => togglePin(item)} disabled={!!sending} aria-pressed={item.is_pinned}
                        className="mb-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-control bg-slate-100 text-slate-700 text-caption font-semibold border-0 cursor-pointer hover:bg-slate-200 disabled:opacity-50">
                        <FontAwesomeIcon icon={faThumbtack} /> {item.is_pinned ? 'Unpin' : 'Pin to top'}
                      </button>
                    )}
                    {item.status === 'draft' && (
                      <button type="button" onClick={() => openDraft(item)} disabled={!!sending || form.draftId === item.id}
                        className="ml-2 inline-flex items-center gap-1.5 mb-3 px-2.5 py-1 rounded-control bg-slate-100 text-slate-700 text-caption font-semibold border-0 cursor-pointer hover:bg-slate-200 disabled:opacity-60 disabled:cursor-default">
                        {form.draftId === item.id ? 'Open in composer' : 'Open draft'}
                      </button>
                    )}
                    <div className="flex items-center flex-wrap gap-3 text-caption text-slate-500">
                      <span className="flex items-center gap-1"><FontAwesomeIcon icon={faCalendarAlt} /> {item.date}</span>
                      <span className="flex items-center gap-1"><FontAwesomeIcon icon={faUsers} /> {audienceLabel(item.send_to)} · {item.recipients} recipients</span>
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
