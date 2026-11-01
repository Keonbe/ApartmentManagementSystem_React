import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFileSignature, faListOl, faAddressCard, faEye, faHistory, faPlus, faTrash, faArrowUp, faArrowDown,
  faChevronDown, faChevronRight, faSave, faSpinner, faUndo, faCheckCircle, faExclamationTriangle, faTimes,
  faWallet, faUserShield, faCode, faInfoCircle, faRotateLeft, faSearch, faCopy, faPrint,
  faExpandAlt, faCompressAlt, faUsers, faEdit, faFileContract
} from '@fortawesome/free-solid-svg-icons';
import { SettingsSection, Field, Callout, INPUT } from './settings/SettingsSection';
import ContractDocument from '../Components/contract/ContractDocument';
import {
  BUILTIN_PLACEHOLDERS, BUILTIN_KEYS, PAYMENT_TYPES, CONTRACT_LIMITS as LIM, VARIABLE_KEY_RE, ACCOUNT_NUMBER_RE,
  fetchContractTemplate, fetchDefaultContractTemplate, fetchContractHistory, saveContractTemplate,
  unknownPlaceholders, pick, roman, newId,
} from '../Components/contract/contractTemplate';
import api from '../api/axiosConfig';
import { apiErrorMessage } from '../utils/apiError';
import { printElement } from '../utils/print';
import { btn } from '../Components/admin/ui/styles';
import Spinner from '../Components/admin/ui/Spinner';

// Simple GCash validation: 11-digit PH mobile (09xx) or +639xx, or the literal '*********'
const isValidGcashNumber = (num) => {
  if (!num || typeof num !== 'string') return false;
  const s = num.trim();
  if (s === '*********') return true;
  const clean = s.replace(/[\s\-()]/g, '');
  return /^(09\d{9}|\+639\d{9})$/.test(clean);
};

const TABS = [
  { id: 'terms', label: 'Clauses & Terms', icon: faListOl },
  { id: 'details', label: 'Details & Payments', icon: faAddressCard },
  { id: 'preview', label: 'Live Preview', icon: faEye },
  { id: 'history', label: 'Version History', icon: faHistory },
];

const DEFAULT_SAMPLE_DATA = {
  tenantName: 'Juan Dela Cruz',
  tenantPhone: '0917 123 4567',
  tenantEmail: 'juan.delacruz@example.com',
  tenantAddress: 'Sitio Engkanto, Brgy. Maguyam, Silang, Cavite',
  tenantPreviousAddress: 'Brgy. Biga, Silang, Cavite',
  roomName: 'A',
  monthlyRent: '₱5,000.00',
  advanceRent: '₱5,000.00',
  depositAmount: '₱5,000.00',
  entryDate: 'October 1, 2026',
  leaseEndDate: 'September 30, 2027',
  dueDateDay: 1,
  isTentative: false,
};

const SMALL_BTN = 'w-8 h-8 inline-flex items-center justify-center rounded-control border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors';
const DANGER_BTN = 'w-8 h-8 inline-flex items-center justify-center rounded-control border border-red-200 bg-white text-red-500 hover:bg-red-50 cursor-pointer transition-colors';
const ADD_BTN = 'inline-flex items-center gap-2 px-3.5 py-2 rounded-control text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

const blankText = () => ({ en: '', tl: '' });
const move = (list, from, to) => {
  if (to < 0 || to >= list.length) return;
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
};
const hasText = (t) => !!((t?.en || '').trim() || (t?.tl || '').trim());
const formatDateTime = (raw) => {
  if (!raw) return '';
  const d = new Date(raw.replace(' ', 'T'));
  return isNaN(d.getTime()) ? raw : d.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
};

function validate(t) {
  const errors = [];
  if (!(t.details.landlord_name || '').trim()) errors.push("Owner name is required (Details & Payments).");
  
  t.payment_accounts.forEach((a, i) => {
    const label = a.label?.trim() || `Account #${i + 1}`;
    if (!(a.label || '').trim()) errors.push(`Payment account #${i + 1} needs a name.`);
    if (a.account_number && !ACCOUNT_NUMBER_RE.test(a.account_number)) {
      errors.push(`Payment account #${i + 1} (${label}) number contains invalid characters.`);
    }
    // GCash specific mobile number validation
    if (a.type === 'gcash') {
      if (!a.account_number || !a.account_number.trim()) {
        errors.push(`Payment account #${i + 1} (${label}): GCash mobile number is required.`);
      } else if (!isValidGcashNumber(a.account_number)) {
        errors.push(`Payment account #${i + 1} (${label}): GCash number must be an 11-digit mobile number (e.g. 0917 123 4567) or *********.`);
      }
    }
  });

  const keys = new Set();
  t.variables.forEach((v, i) => {
    if (!VARIABLE_KEY_RE.test(v.key)) errors.push(`Custom value #${i + 1}: placeholder name must be 2-40 lowercase letters, digits or underscores, starting with a letter.`);
    else if (BUILTIN_KEYS.has(v.key)) errors.push(`Custom value #${i + 1}: {{${v.key}}} is already a built-in placeholder.`);
    else if (keys.has(v.key)) errors.push(`Custom value #${i + 1}: {{${v.key}}} is defined twice.`);
    keys.add(v.key);
    if (!(v.label || '').trim()) errors.push(`Custom value #${i + 1} needs a label.`);
  });

  if (!hasText(t.terms.title)) errors.push('The contract title is required.');
  if (!t.terms.sections.length) errors.push('The contract needs at least one section.');
  t.terms.sections.forEach((s, si) => {
    if (!hasText(s.title)) errors.push(`Section ${roman(si + 1)} needs a title.`);
    if (!s.clauses.length) errors.push(`Section ${roman(si + 1)} has no clauses; add one or remove the section.`);
    s.clauses.forEach((c, ci) => {
      if (!hasText(c.body)) errors.push(`Section ${roman(si + 1)}, clause ${ci + 1} has no text.`);
    });
  });
  return errors;
}

function countMissingTranslations(t) {
  let n = 0;
  const check = (x) => { if (hasText(x) && (!(x.en || '').trim() || !(x.tl || '').trim())) n += 1; };
  ['title', 'copy_label', 'subject', 'intro', 'signature_intro', 'closing_note'].forEach((k) => check(t.terms[k]));
  t.terms.sections.forEach((s) => { check(s.title); s.clauses.forEach((c) => { check(c.title); check(c.body); }); });
  return n;
}

function BiInput({ id, label, value, onChange, multiline = false, rows = 3, max, required = false, onFieldFocus, hint }) {
  const v = value || blankText();
  const empty = required && !hasText(v);
  const oneSided = hasText(v) && (!(v.en || '').trim() || !(v.tl || '').trim());

  const copyToTl = () => {
    if (v.en && !v.tl) {
      onChange({ ...v, tl: v.en });
    }
  };

  const box = (lang) => {
    const props = {
      id: `${id}-${lang}`,
      value: v[lang] || '',
      maxLength: max,
      onChange: (e) => onChange({ ...v, [lang]: e.target.value }),
      onFocus: (e) => onFieldFocus?.(e.target, (next) => onChange({ ...v, [lang]: next })),
      className: `${INPUT} ${empty ? 'border-red-300' : ''} ${multiline ? 'leading-relaxed resize-y' : ''}`,
    };
    const len = (v[lang] || '').length;
    return (
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center justify-between">
          <label htmlFor={props.id} className="text-label font-medium text-slate-600 capitalize">
            {lang === 'en' ? 'English' : 'Tagalog'}
          </label>
          {lang === 'tl' && v.en && !v.tl && (
            <button
              type="button"
              onClick={copyToTl}
              className="text-caption text-indigo-600 hover:text-indigo-800 bg-transparent border-0 cursor-pointer font-semibold flex items-center gap-1"
            >
              <FontAwesomeIcon icon={faCopy} /> Copy from English
            </button>
          )}
        </div>
        {multiline ? <textarea rows={rows} {...props} /> : <input type="text" autoComplete="off" {...props} />}
        {max && len > max * 0.8 && <span className="text-caption text-slate-500 self-end">{len}/{max}</span>}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="text-body font-semibold text-slate-700">{label}{required && <span className="text-red-500"> *</span>}</span>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {box('en')}
        {box('tl')}
      </div>
      {empty && <p className="text-caption text-red-500 m-0">Required in at least one language.</p>}
      {!empty && oneSided && <p className="text-caption text-amber-700 m-0">One language is blank — the other will be shown in its place.</p>}
      {hint && <p className="text-caption text-slate-500 m-0 leading-relaxed">{hint}</p>}
    </div>
  );
}

function PlaceholderBar({ variables, onInsert }) {
  const chip = (key, label, custom) => (
    <button
      key={key}
      type="button"
      title={`${label} — click to insert {{${key}}}`}
      onMouseDown={(e) => { e.preventDefault(); onInsert(`{{${key}}}`); }}
      className={`rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap font-mono cursor-pointer transition-colors ${
        custom
          ? 'bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100'
          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
      }`}
    >
      {`{{${key}}}`}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5 p-3 rounded-card bg-slate-50 border border-slate-200 text-label">
      <span className="font-medium text-slate-600 text-label mr-1">Insert dynamic value:</span>
      {BUILTIN_PLACEHOLDERS.map((p) => chip(p.key, p.label, false))}
      {(variables || []).map((v) => chip(v.key, v.label, true))}
    </div>
  );
}

// siteOnly: Settings → Site Maintenance. Shows only the owner details and
// payment accounts (the same template document, saved as a new version), so
// phone, GCash and bank numbers can be kept current without the clause editor.
const AdminContractEditor = ({ embedded = false, siteOnly = false }) => {
  const [tab, setTab] = useState('terms');
  const [meta, setMeta] = useState(null);
  const [draft, setDraft] = useState(null);
  const [savedJson, setSavedJson] = useState(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [toast, setToast] = useState(null);

  // Clauses UX states
  const [collapsedSections, setCollapsedSections] = useState({});
  const [clauseSearch, setClauseSearch] = useState('');

  // History state
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Preview state & Real Tenant selector
  const [previewLang, setPreviewLang] = useState('en');
  const [realTenants, setRealTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState('sample');
  const [customPreviewData, setCustomPreviewData] = useState(DEFAULT_SAMPLE_DATA);
  const [showCustomDataEditor, setShowCustomDataEditor] = useState(false);

  // Active input ref for placeholder chip insertion
  const activeFieldRef = useRef({ input: null, setVal: null });
  const onFieldFocus = useCallback((input, setVal) => {
    activeFieldRef.current = { input, setVal };
  }, []);

  const handleInsertPlaceholder = (token) => {
    const { input, setVal } = activeFieldRef.current;
    if (!input || !setVal) return;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const current = input.value || '';
    const next = current.slice(0, start) + token + current.slice(end);
    setVal(next);
    setTimeout(() => {
      input.focus();
      input.setSelectionRange(start + token.length, start + token.length);
    }, 0);
  };

  const update = useCallback((fn) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const copy = JSON.parse(JSON.stringify(prev));
      fn(copy);
      return copy;
    });
  }, []);

  // Fetches the template and fills the editor. Every setState runs in a
  // promise callback (fetchContractTemplate is async, so it never throws
  // synchronously), which lets the mount effect below call it directly.
  // .then().catch() keeps the old try/catch: an error while applying the
  // response is reported as a load error too.
  const fetchTemplate = () => fetchContractTemplate(null, { full: true })
    .then((data) => {
      const t = data.template;
      // Default empty GCash or Bank account numbers to *********
      (t.payment_accounts || []).forEach((a) => {
        if ((a.type === 'gcash' || a.type === 'bank') && !a.account_number) {
          a.account_number = '*********';
        }
      });
      setMeta({
        id: data.id,
        version: data.version,
        is_default: data.is_default,
        updated_at: data.created_at,
        updated_by: data.created_by_name,
      });
      setDraft(t);
      setSavedJson(JSON.stringify(t));
      setNote('');
      setConflict(null);
    })
    .catch((err) => {
      setLoadError(err.message || 'Failed to load contract template.');
    });

  // "Try again" / "Reload latest version": clear the old error first.
  const load = () => {
    setLoadError(null);
    return fetchTemplate();
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const versions = await fetchContractHistory();
      setHistory(versions);
    } catch (err) {
      console.error('History load failed:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchTenants = () => api.get('/get_tenants.php')
    .then((res) => {
      if (res.data.success && Array.isArray(res.data.data)) {
        setRealTenants(res.data.data);
      }
    })
    .catch((e) => {
      console.error('Failed to load tenants for contract preview:', e);
    });

  useEffect(() => {
    fetchTemplate();
    if (!siteOnly) fetchTenants();
  }, []);

  // Opening the Version History tab (re)loads the list. Called from the tab
  // click, only when the tab actually changes, like the old [tab] effect.
  const selectTab = (id) => {
    if (id === 'history' && tab !== 'history') loadHistory();
    setTab(id);
  };

  // When a real tenant is selected in Preview (or the tenant list arrives),
  // repopulate the preview data. Adjusted while rendering instead of in an
  // effect: the stored pair says which selection/list the data was built for.
  const [previewSource, setPreviewSource] = useState({ id: selectedTenantId, tenants: realTenants });
  if (previewSource.id !== selectedTenantId || previewSource.tenants !== realTenants) {
    setPreviewSource({ id: selectedTenantId, tenants: realTenants });
    if (selectedTenantId === 'sample') {
      setCustomPreviewData(DEFAULT_SAMPLE_DATA);
    } else {
      const t = realTenants.find((item) => String(item.id) === String(selectedTenantId));
      if (t) {
        const rentNum = Number(String(t.rent ?? '').replace(/[^\d.]/g, '')) || 5000;
        const rentFormatted = `₱${rentNum.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
        setCustomPreviewData({
          tenantName: t.name || 'Tenant Name',
          tenantPhone: t.contact_no || t.phone || '0917 123 4567',
          tenantEmail: t.email || 'tenant@example.com',
          tenantAddress: t.address || `Room ${t.unit}, Apartment AMS`,
          tenantPreviousAddress: t.previousAddress || '',
          roomName: t.unit || 'A',
          monthlyRent: rentFormatted,
          advanceRent: rentFormatted,
          depositAmount: rentFormatted,
          entryDate: t.lease_start || 'October 1, 2026',
          leaseEndDate: t.lease_end || 'September 30, 2027',
          dueDateDay: 1,
          isTentative: false,
        });
      }
    }
  }

  const contractDocRef = useRef(null);
  const handlePrint = useCallback(() => {
    printElement(contractDocRef.current, { variant: 'document' });
  }, []);

  useEffect(() => {
    let prevTitle = '';
    const onBeforePrint = () => {
      prevTitle = document.title;
      document.title = '';
      window.scrollTo(0, 0);
      document.querySelectorAll('*').forEach((el) => {
        if (el.scrollTop) el.scrollTop = 0;
      });
    };
    const onAfterPrint = () => {
      if (prevTitle) document.title = prevTitle;
    };
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', onAfterPrint);
    };
  }, []);

  const isDirty = useMemo(() => {
    if (!draft || !savedJson) return false;
    return JSON.stringify(draft) !== savedJson;
  }, [draft, savedJson]);

  const errors = useMemo(() => (draft ? validate(draft) : []), [draft]);
  const unknown = useMemo(() => (draft ? unknownPlaceholders(draft) : []), [draft]);
  const missingTranslations = useMemo(() => (draft ? countMissingTranslations(draft) : 0), [draft]);

  const handleSave = async () => {
    if (!draft || errors.length > 0 || saving) return;
    setSaving(true);
    setConflict(null);
    try {
      const res = await saveContractTemplate(draft, meta?.version || 0, note);
      if (res.success) {
        setMeta((prev) => ({
          ...prev,
          version: res.version,
          is_default: false,
          updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
          updated_by: 'You',
        }));
        setSavedJson(JSON.stringify(draft));
        setNote('');
        setToast({
          type: 'success',
          title: 'Saved successfully',
          message: siteOnly
            ? 'Contracts, invoices and the payment page now show these details.'
            : `Contract Version ${res.version} is now in force.`,
        });
        setTimeout(() => setToast(null), 5000);
      }
    } catch (err) {
      if (err.response?.status === 409) {
        setConflict(err.response.data?.message || 'The contract was updated by someone else.');
      } else {
        alert(apiErrorMessage(err, 'Failed to save contract.'));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    if (!savedJson) return;
    if (window.confirm('Discard all unsaved changes and revert to the saved version?')) {
      setDraft(JSON.parse(savedJson));
      setNote('');
      setConflict(null);
    }
  };

  const handleResetDefault = async () => {
    if (!window.confirm('Reset all terms, sections and clauses to system defaults? Landlord details and accounts will remain.')) return;
    try {
      const def = await fetchDefaultContractTemplate();
      update((d) => {
        d.terms = def.terms;
        d.variables = def.variables;
      });
      setToast({ type: 'success', title: 'Reset to defaults', message: 'Terms and clauses reset. Click "Save" below to publish.' });
      setTimeout(() => setToast(null), 5000);
    } catch (err) {
      alert(apiErrorMessage(err, 'Failed to load default template.'));
    }
  };

  const handleLoadVersion = async (v) => {
    if (!window.confirm(`Load Version ${v.version} into the editor? You can review it before saving.`)) return;
    try {
      const data = await fetchContractTemplate(v.id, { full: true });
      setDraft(data.template);
      setTab('terms');
      setToast({ type: 'info', title: `Loaded Version ${v.version}`, message: 'Loaded into the editor. Save to make it the active version.' });
      setTimeout(() => setToast(null), 5000);
    } catch (err) {
      alert(apiErrorMessage(err, 'Failed to load version.'));
    }
  };

  // Section manipulation helpers
  const toggleSectionCollapse = (sectionId) => {
    setCollapsedSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  const expandAllSections = () => setCollapsedSections({});
  const collapseAllSections = () => {
    if (!draft?.terms?.sections) return;
    const all = {};
    draft.terms.sections.forEach((s) => { all[s.id] = true; });
    setCollapsedSections(all);
  };

  const addSection = () => update((d) => {
    const num = d.terms.sections.length + 1;
    d.terms.sections.push({
      id: newId('sec'),
      title: { en: `Section ${roman(num)}`, tl: `Seksyon ${roman(num)}` },
      clauses: [
        { id: newId('cl'), title: blankText(), body: blankText() },
      ],
    });
  });

  const addClause = (si) => update((d) => {
    d.terms.sections[si].clauses.push({
      id: newId('cl'),
      title: blankText(),
      body: blankText(),
    });
  });

  const addAccount = () => update((d) => {
    d.payment_accounts.push({
      id: newId('acct'),
      type: 'gcash',
      label: 'GCash',
      account_number: '*********',
      account_name: '',
      note: blankText(),
    });
  });

  const setAccountType = (i, type) => update((d) => {
    d.payment_accounts[i].type = type;
    if (type === 'gcash') {
      d.payment_accounts[i].label = 'GCash';
      if (!d.payment_accounts[i].account_number) d.payment_accounts[i].account_number = '*********';
    } else if (type === 'bank') {
      d.payment_accounts[i].label = 'Bank Transfer';
      if (!d.payment_accounts[i].account_number) d.payment_accounts[i].account_number = '*********';
    } else if (type === 'cash') {
      d.payment_accounts[i].label = 'Cash Payment';
    }
  });

  // Filter clauses if search query is active
  const filteredSections = useMemo(() => {
    const sections = draft?.terms?.sections;
    if (!sections) return [];
    if (!clauseSearch.trim()) return sections;
    const q = clauseSearch.toLowerCase();
    return sections.filter((s) => {
      const matchSec = (s.title?.en || '').toLowerCase().includes(q) || (s.title?.tl || '').toLowerCase().includes(q);
      const matchClauses = s.clauses.some((c) =>
        (c.title?.en || '').toLowerCase().includes(q) ||
        (c.title?.tl || '').toLowerCase().includes(q) ||
        (c.body?.en || '').toLowerCase().includes(q) ||
        (c.body?.tl || '').toLowerCase().includes(q)
      );
      return matchSec || matchClauses;
    });
  }, [draft, clauseSearch]);

  // ── RENDER TERMS TAB ──
  const renderTerms = () => (
    <div className="space-y-6">
      <PlaceholderBar variables={draft.variables} onInsert={handleInsertPlaceholder} />

      <SettingsSection icon={faFileContract} tone="indigo" title="Contract Header" description="Displayed at the top of the official printed and online contract.">
        <BiInput id="terms-title" label="Contract Title" required max={LIM.heading} value={draft.terms.title}
          onChange={(val) => update((d) => { d.terms.title = val; })} onFieldFocus={onFieldFocus} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <BiInput id="terms-copy" label="Copy Label" max={LIM.heading} value={draft.terms.copy_label}
            onChange={(val) => update((d) => { d.terms.copy_label = val; })} onFieldFocus={onFieldFocus}
            hint='Optional badge, e.g. "(Tenant Copy)" or "(Original Copy)".' />
          <BiInput id="terms-subject" label="Subject Heading" max={LIM.heading} value={draft.terms.subject}
            onChange={(val) => update((d) => { d.terms.subject = val; })} onFieldFocus={onFieldFocus}
            hint='e.g. "SUBJECT: RESIDENTIAL APARTMENT RENT".' />
        </div>
        <BiInput id="terms-intro" label="Preamble / Introduction" multiline rows={2} max={LIM.body} value={draft.terms.intro}
          onChange={(val) => update((d) => { d.terms.intro = val; })} onFieldFocus={onFieldFocus} />
      </SettingsSection>

      {/* Sections Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-card border border-slate-200">
        <div className="flex items-center gap-3">
          <h3 className="text-body font-bold text-slate-800 m-0">
            Contract Sections ({draft.terms.sections.length})
          </h3>
          <div className="flex items-center gap-1.5 text-label text-slate-500">
            <button type="button" onClick={expandAllSections} className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded-control border-0 cursor-pointer text-slate-700 font-semibold">
              <FontAwesomeIcon icon={faExpandAlt} className="mr-1 text-[10px]" /> Expand All
            </button>
            <button type="button" onClick={collapseAllSections} className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded-control border-0 cursor-pointer text-slate-700 font-semibold">
              <FontAwesomeIcon icon={faCompressAlt} className="mr-1 text-[10px]" /> Collapse All
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 max-w-xs w-full">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-control px-2.5 py-1.5 w-full">
            <FontAwesomeIcon icon={faSearch} className="text-slate-500 text-xs" />
            <input
              type="text"
              placeholder="Search clauses..."
              value={clauseSearch}
              onChange={(e) => setClauseSearch(e.target.value)}
              className="bg-transparent border-0 outline-none text-label w-full text-slate-700"
            />
            {clauseSearch && (
              <button aria-label="Clear search" type="button" onClick={() => setClauseSearch('')} className="bg-transparent border-0 text-slate-500 hover:text-slate-600 cursor-pointer p-0 text-label">
                <FontAwesomeIcon icon={faTimes} />
              </button>
            )}
          </div>
        </div>
      </div>

      {filteredSections.map((section, si) => {
        const isCollapsed = collapsedSections[section.id];
        return (
          <div key={section.id} className="bg-white border border-slate-200 rounded-card overflow-hidden shadow-card transition-all">
            <div className="px-5 py-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <button aria-label={isCollapsed ? 'Expand section' : 'Collapse section'} aria-expanded={!isCollapsed}
                  type="button"
                  onClick={() => toggleSectionCollapse(section.id)}
                  className="w-6 h-6 flex items-center justify-center text-slate-500 hover:text-slate-600 bg-transparent border-0 cursor-pointer p-0 text-label"
                >
                  <FontAwesomeIcon icon={isCollapsed ? faChevronRight : faChevronDown} />
                </button>
                <span className="w-7 h-7 rounded-control bg-indigo-100 text-indigo-700 font-bold text-label flex items-center justify-center shrink-0">
                  {roman(si + 1)}
                </span>
                <span className="font-bold text-body text-slate-800 truncate">
                  {pick(section.title, 'en') || `Section ${roman(si + 1)}`}
                </span>
                <span className="text-label text-slate-500">({section.clauses.length} clauses)</span>
              </div>

              <div className="flex items-center gap-1.5">
                <button aria-label="Move section up" type="button" className={SMALL_BTN} disabled={si === 0} onClick={() => update((d) => move(d.terms.sections, si, si - 1))}>
                  <FontAwesomeIcon icon={faArrowUp} className="text-[10px]" />
                </button>
                <button aria-label="Move section down" type="button" className={SMALL_BTN} disabled={si === draft.terms.sections.length - 1} onClick={() => update((d) => move(d.terms.sections, si, si + 1))}>
                  <FontAwesomeIcon icon={faArrowDown} className="text-[10px]" />
                </button>
                <button aria-label="Delete section"
                  type="button"
                  className={DANGER_BTN}
                  onClick={() => {
                    if (window.confirm(`Delete Section ${roman(si + 1)} and its ${section.clauses.length} clause(s)?`)) {
                      update((d) => { d.terms.sections.splice(si, 1); });
                    }
                  }}
                >
                  <FontAwesomeIcon icon={faTrash} className="text-[10px]" />
                </button>
              </div>
            </div>

            {!isCollapsed && (
              <div className="p-5 space-y-5">
                <BiInput id={`sec-${section.id}-title`} label="Section Title" required max={LIM.heading} value={section.title}
                  onChange={(val) => update((d) => { d.terms.sections[si].title = val; })} onFieldFocus={onFieldFocus} />

                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-label font-medium text-slate-600">Clauses</span>
                    <button type="button" className={ADD_BTN} onClick={() => addClause(si)}>
                      <FontAwesomeIcon icon={faPlus} /> Add clause
                    </button>
                  </div>

                  {section.clauses.map((clause, ci) => (
                    <div key={clause.id} className="border border-slate-200/80 rounded-card p-4 bg-slate-50/40 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-label font-bold text-slate-600">Clause #{ci + 1}</span>
                        <div className="flex items-center gap-1">
                          <button aria-label="Move clause up" type="button" className={SMALL_BTN} disabled={ci === 0} onClick={() => update((d) => move(d.terms.sections[si].clauses, ci, ci - 1))}>
                            <FontAwesomeIcon icon={faArrowUp} className="text-[10px]" />
                          </button>
                          <button aria-label="Move clause down" type="button" className={SMALL_BTN} disabled={ci === section.clauses.length - 1} onClick={() => update((d) => move(d.terms.sections[si].clauses, ci, ci + 1))}>
                            <FontAwesomeIcon icon={faArrowDown} className="text-[10px]" />
                          </button>
                          <button aria-label="Delete clause"
                            type="button"
                            className={DANGER_BTN}
                            onClick={() => {
                              if (window.confirm(`Remove clause #${ci + 1}?`)) {
                                update((d) => { d.terms.sections[si].clauses.splice(ci, 1); });
                              }
                            }}
                          >
                            <FontAwesomeIcon icon={faTrash} className="text-[10px]" />
                          </button>
                        </div>
                      </div>

                      <BiInput id={`${clause.id}-title`} label="Clause Subheading" max={LIM.heading} value={clause.title}
                        onChange={(val) => update((d) => { d.terms.sections[si].clauses[ci].title = val; })} onFieldFocus={onFieldFocus} />
                      <BiInput id={`${clause.id}-body`} label="Clause Text" required multiline rows={4} max={LIM.body} value={clause.body}
                        onChange={(val) => update((d) => { d.terms.sections[si].clauses[ci].body = val; })} onFieldFocus={onFieldFocus} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="flex justify-center pt-2">
        <button type="button" className={btn('primary', 'md', 'btn-interactive')} onClick={addSection}>
          <FontAwesomeIcon icon={faPlus} /> Add New Section
        </button>
      </div>

      <SettingsSection icon={faFileSignature} tone="violet" title="Signatures & Closing Reminder" description="Always appears at the conclusion of the contract document.">
        <BiInput id="terms-sig" label="Signature Statement" multiline rows={2} max={LIM.body} value={draft.terms.signature_intro}
          onChange={(val) => update((d) => { d.terms.signature_intro = val; })} onFieldFocus={onFieldFocus} />
        <BiInput id="terms-closing" label="Closing Reminder" multiline rows={3} max={LIM.body} value={draft.terms.closing_note}
          onChange={(val) => update((d) => { d.terms.closing_note = val; })} onFieldFocus={onFieldFocus} />
      </SettingsSection>
    </div>
  );

  // ── RENDER DETAILS & PAYMENTS TAB ──
  const renderDetails = () => (
    <div className="space-y-6">
      {/* Landlord Info */}
      <SettingsSection
        icon={faUserShield} tone="violet" title="Apartment Owner & Lessor Details"
        description="Official landlord information applied across all tenancy contracts."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Owner / Landlord Name *" htmlFor="detail-landlord_name" hint="{{landlord_name}}">
            <input
              id="detail-landlord_name" type="text" autoComplete="off" maxLength={LIM.detail}
              value={draft.details.landlord_name || ''}
              onChange={(e) => update((d) => { d.details.landlord_name = e.target.value; })}
              className={`${INPUT} ${!(draft.details.landlord_name || '').trim() ? 'border-red-300' : ''}`}
            />
          </Field>
          <Field label="Owner Contact Number" htmlFor="detail-landlord_contact" hint="{{landlord_contact}}">
            <input
              id="detail-landlord_contact" type="text" autoComplete="off" maxLength={LIM.detail}
              value={draft.details.landlord_contact || ''}
              onChange={(e) => update((d) => { d.details.landlord_contact = e.target.value; })}
              className={INPUT}
            />
          </Field>
          <Field label="Owner Official Address" htmlFor="detail-landlord_address" hint="{{landlord_address}}">
            <input
              id="detail-landlord_address" type="text" autoComplete="off" maxLength={LIM.detail}
              value={draft.details.landlord_address || ''}
              onChange={(e) => update((d) => { d.details.landlord_address = e.target.value; })}
              className={INPUT}
            />
          </Field>
          <Field label="Apartment / Property Address" htmlFor="detail-property_address" hint="{{property_address}}">
            <input
              id="detail-property_address" type="text" autoComplete="off" maxLength={LIM.detail}
              value={draft.details.property_address || ''}
              onChange={(e) => update((d) => { d.details.property_address = e.target.value; })}
              className={INPUT}
            />
          </Field>
        </div>
      </SettingsSection>

      {/* Payment Accounts */}
      <SettingsSection
        icon={faWallet} tone="emerald" title="Payment Accounts & Channels"
        description="Listed wherever {{payment_methods}} appears. Mobile numbers and account details for tenant rent payments."
      >
        {draft.payment_accounts.length === 0 && <p className="text-body text-slate-500 m-0">No payment accounts configured.</p>}
        {draft.payment_accounts.map((a, i) => {
          const isGcash = a.type === 'gcash';
          const badNumber = a.account_number && !ACCOUNT_NUMBER_RE.test(a.account_number);
          const gcashInvalid = isGcash && a.account_number && !isValidGcashNumber(a.account_number);

          return (
            <div key={a.id} className="rounded-card border border-slate-200 p-4 space-y-3 bg-white shadow-card">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap capitalize ${isGcash ? 'bg-blue-100 text-blue-700' : a.type === 'bank' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                    {a.type}
                  </span>
                  <span className="text-label font-bold text-slate-700">{a.label || `Account #${i + 1}`}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button aria-label="Move account up" type="button" className={SMALL_BTN} disabled={i === 0} onClick={() => update((d) => move(d.payment_accounts, i, i - 1))}>
                    <FontAwesomeIcon icon={faArrowUp} className="text-[10px]" />
                  </button>
                  <button aria-label="Move account down" type="button" className={SMALL_BTN} disabled={i === draft.payment_accounts.length - 1} onClick={() => update((d) => move(d.payment_accounts, i, i + 1))}>
                    <FontAwesomeIcon icon={faArrowDown} className="text-[10px]" />
                  </button>
                  <button aria-label="Delete account"
                    type="button"
                    className={DANGER_BTN}
                    onClick={() => {
                      if (window.confirm(`Remove ${a.label || 'this account'}?`)) {
                        update((d) => { d.payment_accounts.splice(i, 1); });
                      }
                    }}
                  >
                    <FontAwesomeIcon icon={faTrash} className="text-[10px]" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Field label="Type" htmlFor={`acct-${a.id}-type`}>
                  <select id={`acct-${a.id}-type`} value={a.type} onChange={(e) => setAccountType(i, e.target.value)} className={INPUT}>
                    {PAYMENT_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </Field>

                <Field label="Account Label *" htmlFor={`acct-${a.id}-label`}>
                  <input
                    id={`acct-${a.id}-label`} type="text" autoComplete="off" maxLength={LIM.accountLabel} value={a.label}
                    onChange={(e) => update((d) => { d.payment_accounts[i].label = e.target.value; })}
                    className={`${INPUT} ${!a.label.trim() ? 'border-red-300' : ''}`}
                  />
                </Field>

                <Field
                  label={isGcash ? 'GCash Mobile Number *' : a.type === 'cash' ? 'Account Number (optional)' : 'Account / Card Number'}
                  htmlFor={`acct-${a.id}-number`}
                  error={
                    gcashInvalid
                      ? 'GCash must be an 11-digit mobile number starting with 09 (e.g. 0917 123 4567).'
                      : badNumber
                      ? 'Letters, digits, spaces and - ( ) + / * # only.'
                      : undefined
                  }
                  hint={isGcash ? '11-digit mobile (09xx)' : 'Bank account or card number'}
                >
                  <input
                    id={`acct-${a.id}-number`}
                    type="text"
                    autoComplete="off"
                    inputMode={isGcash ? 'tel' : 'text'}
                    maxLength={LIM.accountNumber}
                    value={a.account_number}
                    onChange={(e) => {
                      const val = e.target.value;
                      // Restrict GCash input to valid characters
                      if (isGcash) {
                        const clean = val.replace(/[^0-9 *#()+-]/g, '');
                        update((d) => { d.payment_accounts[i].account_number = clean; });
                      } else {
                        update((d) => { d.payment_accounts[i].account_number = val; });
                      }
                    }}
                    className={`${INPUT} font-mono ${badNumber || gcashInvalid ? 'border-red-300' : ''}`}
                    placeholder={isGcash ? '0917 123 4567' : 'Account number'}
                  />
                </Field>

                <Field label="Account Holder Name" htmlFor={`acct-${a.id}-name`}>
                  <input
                    id={`acct-${a.id}-name`} type="text" autoComplete="off" maxLength={LIM.accountName} value={a.account_name}
                    onChange={(e) => update((d) => { d.payment_accounts[i].account_name = e.target.value; })} className={INPUT}
                    placeholder="e.g. Elizabeth A."
                  />
                </Field>
              </div>

              <BiInput id={`acct-${a.id}-note`} label="Payment Instructions / Note" max={LIM.accountNote} value={a.note}
                onChange={(val) => update((d) => { d.payment_accounts[i].note = val; })}
                hint={isGcash ? 'e.g. Send screenshot of transaction receipt' : 'e.g. Savings Account'} />
            </div>
          );
        })}

        <button type="button" className={ADD_BTN} onClick={addAccount} disabled={draft.payment_accounts.length >= LIM.accounts}>
          <FontAwesomeIcon icon={faPlus} /> Add Payment Channel
        </button>
      </SettingsSection>

      {/* Custom Values */}
      {!siteOnly && <SettingsSection
        icon={faCode} tone="blue" title="Custom Dynamic Values & Placeholders"
        description="Define custom {{variables}} for fees, occupancy limits, and notice terms that automatically populate across all clauses."
      >
        <div className="space-y-3">
          {draft.variables.map((v, i) => {
            const badKey = !VARIABLE_KEY_RE.test(v.key) || BUILTIN_KEYS.has(v.key) || draft.variables.some((o, j) => j !== i && o.key === v.key);
            return (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-start bg-slate-50/50 p-3 rounded-card border border-slate-200">
                <Field label="Label *" htmlFor={`var-${i}-label`}>
                  <input id={`var-${i}-label`} type="text" autoComplete="off" maxLength={LIM.variableLabel} value={v.label}
                    onChange={(e) => update((d) => { d.variables[i].label = e.target.value; })}
                    className={`${INPUT} ${!v.label.trim() ? 'border-red-300' : ''}`} />
                </Field>
                <Field label="Placeholder Tag" htmlFor={`var-${i}-key`} error={badKey ? 'Lowercase letters, digits, _' : undefined}>
                  <div className="flex items-center gap-1 font-mono text-body text-slate-500">
                    {'{{'}
                    <input id={`var-${i}-key`} type="text" autoComplete="off" maxLength={40} value={v.key}
                      onChange={(e) => update((d) => { d.variables[i].key = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'); })}
                      className={`${INPUT} font-mono ${badKey ? 'border-red-300' : ''}`} />
                    {'}}'}
                  </div>
                </Field>
                <Field label="Value" htmlFor={`var-${i}-value`}>
                  <input id={`var-${i}-value`} type="text" autoComplete="off" maxLength={LIM.variableValue} value={v.value}
                    onChange={(e) => update((d) => { d.variables[i].value = e.target.value; })} className={INPUT} />
                </Field>
                <button type="button" className={`${DANGER_BTN} sm:mt-6`} aria-label="Remove variable" onClick={() => update((d) => { d.variables.splice(i, 1); })}>
                  <FontAwesomeIcon icon={faTrash} className="text-[10px]" />
                </button>
              </div>
            );
          })}
        </div>

        <button type="button" className={ADD_BTN} disabled={draft.variables.length >= LIM.variables}
          onClick={() => update((d) => { d.variables.push({ key: `variable_${d.variables.length + 1}`, label: '', value: '' }); })}>
          <FontAwesomeIcon icon={faPlus} /> Add Custom Dynamic Value
        </button>
      </SettingsSection>}
    </div>
  );

  // ── RENDER LIVE PREVIEW TAB ──
  const renderPreview = () => (
    <div className="space-y-5 print:space-y-0">
      {/* Preview Controls Bar */}
      <div className="print:hidden preview-controls-bar bg-white border border-slate-200 rounded-card p-4 shadow-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Tenant Selector for Live Dynamic Adjustment */}
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-label font-medium text-slate-700 flex items-center gap-1.5 capitalize">
              <FontAwesomeIcon icon={faUsers} className="text-indigo-600" />
              Preview as Tenant:
            </span>
            <select
              value={selectedTenantId}
              onChange={(e) => setSelectedTenantId(e.target.value)}
              className="px-3 py-1.5 text-label font-semibold border border-slate-300 rounded-card bg-slate-50 text-slate-800 outline-none cursor-pointer focus:border-indigo-500 max-w-xs shadow-card"
            >
              <option value="sample">Sample Preview: Juan Dela Cruz (Room A)</option>
              {realTenants.map((t) => {
                const rentStr = String(t.rent ?? '').trim();
                const rentDisplay = rentStr ? (rentStr.startsWith('₱') ? rentStr : `₱${rentStr}`) : '';
                return (
                  <option key={t.id} value={t.id}>
                    {t.name} (Unit {t.unit}){rentDisplay ? ` — ${rentDisplay}` : ''}
                  </option>
                );
              })}
            </select>
            <button
              type="button"
              onClick={() => setShowCustomDataEditor(!showCustomDataEditor)}
              className="px-2.5 py-1.5 text-label font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-card cursor-pointer transition-colors"
            >
              <FontAwesomeIcon icon={faEdit} className="mr-1" />
              {showCustomDataEditor ? 'Hide Fields' : 'Customize Preview Info'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Language Selector */}
            <div className="flex bg-slate-100 p-1 rounded-card border border-slate-200">
              {[['en', 'English'], ['tl', 'Tagalog']].map(([code, label]) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setPreviewLang(code)}
                  className={`px-3 py-1 rounded-control text-label font-bold cursor-pointer border-0 transition-all ${
                    previewLang === code ? 'bg-white text-indigo-600 shadow-card' : 'bg-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Test Print Button */}
            <button
              type="button"
              onClick={handlePrint}
              className={btn('secondary', 'sm', 'btn-interactive')}
            >
              <FontAwesomeIcon icon={faPrint} /> Print / PDF
            </button>
          </div>
        </div>

        {/* Dynamic Tenant Info Editor Drawer */}
        {showCustomDataEditor && (
          <div className="pt-3 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/50 p-3 rounded-card animate-fadeIn">
            <div>
              <label className="text-label font-medium text-slate-600 block mb-1">Tenant Name</label>
              <input
                type="text"
                value={customPreviewData.tenantName || ''}
                onChange={(e) => setCustomPreviewData((p) => ({ ...p, tenantName: e.target.value }))}
                className="w-full text-label px-2.5 py-1.5 border border-slate-200 rounded-control bg-white outline-none"
              />
            </div>
            <div>
              <label className="text-label font-medium text-slate-600 block mb-1">Room / Unit</label>
              <input
                type="text"
                value={customPreviewData.roomName || ''}
                onChange={(e) => setCustomPreviewData((p) => ({ ...p, roomName: e.target.value }))}
                className="w-full text-label px-2.5 py-1.5 border border-slate-200 rounded-control bg-white outline-none"
              />
            </div>
            <div>
              <label className="text-label font-medium text-slate-600 block mb-1">Monthly Rent</label>
              <input
                type="text"
                value={customPreviewData.monthlyRent || ''}
                onChange={(e) => setCustomPreviewData((p) => ({ ...p, monthlyRent: e.target.value }))}
                className="w-full text-label px-2.5 py-1.5 border border-slate-200 rounded-control bg-white outline-none"
              />
            </div>
            <div>
              <label className="text-label font-medium text-slate-600 block mb-1">Tenant Phone</label>
              <input
                type="text"
                value={customPreviewData.tenantPhone || ''}
                onChange={(e) => setCustomPreviewData((p) => ({ ...p, tenantPhone: e.target.value }))}
                className="w-full text-label px-2.5 py-1.5 border border-slate-200 rounded-control bg-white outline-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Render Official Contract Document with Dynamic Data */}
      <div ref={contractDocRef} className="max-w-3xl mx-auto shadow-dialog rounded-card overflow-hidden print:max-w-none print:shadow-none print:rounded-none print:overflow-visible print:m-0 print:p-0">
        <ContractDocument
          template={draft}
          lang={previewLang}
          data={customPreviewData}
        />
      </div>
    </div>
  );

  // ── RENDER HISTORY TAB ──
  const renderHistory = () => (
    <SettingsSection
      icon={faHistory} tone="amber" title="Version History & Audit Log"
      description="All saved versions are preserved. Loading a previous version loads its terms into the editor."
    >
      {historyLoading && <Spinner label="Loading history…" className="justify-start py-2" />}
      {!historyLoading && history.length === 0 && (
        <p className="text-body text-slate-500 m-0">No saved versions yet — built-in default is currently active.</p>
      )}
      {history.length > 0 && (
        <ul className="list-none m-0 p-0 divide-y divide-slate-100">
          {history.map((v) => (
            <li key={v.id} className="py-3 flex flex-wrap items-center gap-3">
              <span className="w-12 h-8 rounded-control bg-slate-100 text-slate-700 text-label font-bold flex items-center justify-center shrink-0">v{v.version}</span>
              <div className="flex-1 min-w-0">
                <p className="m-0 text-body font-semibold text-slate-800">
                  {formatDateTime(v.created_at)}{v.created_by_name ? ` · ${v.created_by_name}` : ' · System'}
                  {v.version === meta?.version && (
                    <span className="rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap ml-2 text-emerald-700 bg-emerald-50 ring-emerald-200 ring-1 ring-inset">
                      In Force
                    </span>
                  )}
                </p>
                <p className="m-0 text-label text-slate-500 truncate">{v.note || 'No change note recorded'}</p>
              </div>
              {v.version !== meta?.version && (
                <button type="button" onClick={() => handleLoadVersion(v)}
                  className={btn('secondary', 'sm')}>
                  <FontAwesomeIcon icon={faRotateLeft} /> Load into Editor
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </SettingsSection>
  );

  const showSaveBar = isDirty || saving;

  const editorContent = (
    <div className="space-y-6 print:space-y-0">
      {/* Top Meta Header */}
      <div className="print:hidden editor-meta-header flex flex-wrap items-start justify-between gap-4 bg-white p-5 rounded-card border border-slate-200 shadow-card">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-section font-bold text-slate-900 m-0">{siteOnly ? 'Contact & Payment Details' : 'Rent Contract Template'}</h2>
            {meta?.version && (
              <span className="rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap bg-indigo-50 ring-indigo-200 text-indigo-700 ring-1 ring-inset">
                Version {meta.version}
              </span>
            )}
          </div>
          <p className="text-label text-slate-500 m-0 mt-1">
            {!meta ? 'Loading…'
              : meta.is_default ? 'Using built-in contract defaults.'
              : `Saved ${formatDateTime(meta.updated_at)}${meta.updated_by ? ` by ${meta.updated_by}` : ''}`}
          </p>
          {siteOnly && (
            <p className="text-label text-slate-500 m-0 mt-1">
              The owner&apos;s phone number, addresses, GCash and bank accounts shown on rent contracts, invoices and the tenant payment page.
              Each save is kept as a contract version (Contracts → Contract Template Editor → Version History); contracts already issued show the new values too.
            </p>
          )}
        </div>
        {draft && !siteOnly && (
          <button type="button" onClick={handleResetDefault}
            className={btn('secondary', 'sm')}>
            <FontAwesomeIcon icon={faUndo} /> Reset Clauses to Default
          </button>
        )}
      </div>

      {loadError && (
        <Callout tone="rose" icon={faExclamationTriangle} title="Could not load the contract template">
          {loadError}{' '}
          <button type="button" onClick={load} className="font-bold underline bg-transparent border-0 p-0 cursor-pointer text-red-700">Try again</button>
        </Callout>
      )}

      {conflict && (
        <Callout tone="amber" icon={faExclamationTriangle} title="Template has changed">
          {conflict}{' '}
          <button type="button" onClick={() => { load(); loadHistory(); }} className="font-bold underline bg-transparent border-0 p-0 cursor-pointer text-amber-800">
            Reload latest version
          </button>
        </Callout>
      )}

      {draft && (
        <>
          {/* Main Tabs Navigation */}
          {!siteOnly && <nav className="print:hidden editor-tabs-nav flex gap-1.5 overflow-x-auto bg-white border border-slate-200 rounded-card p-1.5 shadow-card" aria-label="Contract editor tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => selectTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-card text-label font-bold whitespace-nowrap border-0 cursor-pointer transition-all ${
                  tab === t.id
                    ? 'bg-indigo-600 text-white shadow-card'
                    : 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <FontAwesomeIcon icon={t.icon} className="text-xs" />
                <span>{t.label}</span>
                {t.id === 'terms' && (
                  <span className={`rounded-full px-2 py-0.5 text-caption font-semibold whitespace-nowrap ml-1 ${tab === t.id ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-600'}`}>
                    {draft.terms.sections.length}
                  </span>
                )}
              </button>
            ))}
          </nav>}

          {/* Issue Warnings */}
          {(errors.length > 0 || (!siteOnly && (unknown.length > 0 || missingTranslations > 0))) && tab !== 'history' && (
            <div className="print:hidden space-y-3">
              {errors.length > 0 && (
                <Callout tone="rose" icon={faExclamationTriangle} title={`${errors.length} issue${errors.length === 1 ? '' : 's'} to fix before saving`}>
                  <ul className="m-0 pl-4 space-y-0.5">{errors.slice(0, 6).map((e) => <li key={e}>{e}</li>)}</ul>
                  {errors.length > 6 && <p className="m-0 mt-1">…and {errors.length - 6} more.</p>}
                </Callout>
              )}
              {!siteOnly && unknown.length > 0 && (
                <Callout tone="amber" icon={faInfoCircle} title="Unknown placeholders found">
                  {unknown.map((k) => `{{${k}}}`).join(', ')} {unknown.length === 1 ? 'is' : 'are'} not recognized. Check spelling or add under Details & Payments → Custom Dynamic Values.
                </Callout>
              )}
            </div>
          )}

          {siteOnly ? renderDetails() : (
            <>
              {tab === 'terms' && renderTerms()}
              {tab === 'details' && renderDetails()}
              {tab === 'preview' && renderPreview()}
              {tab === 'history' && renderHistory()}
            </>
          )}
        </>
      )}

      {/* Sticky Save Bar */}
      {showSaveBar && (
        <div className="print:hidden save-bar sticky bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md px-6 py-3 shadow-raised rounded-card animate-fadeIn">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-label font-bold text-slate-800">{siteOnly ? 'Unsaved changes' : 'Unsaved template changes'}</span>
            </div>
            <div className="flex-1 max-w-md min-w-[14rem]">
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={LIM.note}
                placeholder="Change summary (e.g. Updated GCash number & signatures)"
                aria-label="Change note"
                className={`${INPUT} text-label py-1.5`}
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDiscard}
                disabled={saving}
                className={btn('secondary', 'sm')}
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || errors.length > 0}
                className={btn('primary', 'sm', 'btn-interactive')}
              >
                <FontAwesomeIcon icon={saving ? faSpinner : faSave} spin={saving} />
                {saving ? 'Saving…' : 'Save as New Version'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toast && (
        <div className="print:hidden fixed bottom-6 right-6 z-50 max-w-sm w-full bg-white rounded-card shadow-dialog border border-slate-200 p-4 flex items-start gap-3 animate-fadeIn" role="status">
          <div className={`w-8 h-8 rounded-card flex items-center justify-center shrink-0 text-white ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-indigo-500'}`}>
            <FontAwesomeIcon icon={faCheckCircle} className="text-sm" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-label font-bold text-slate-800 m-0">{toast.title}</h4>
            <p className="text-label text-slate-500 mt-0.5 m-0 leading-relaxed">{toast.message}</p>
          </div>
          <button aria-label="Dismiss" type="button" onClick={() => setToast(null)} className="text-slate-500 hover:text-slate-600 bg-transparent border-0 cursor-pointer p-1">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
      )}
    </div>
  );

  if (embedded) {
    return editorContent;
  }

  return (
    <div className="admin-shell flex h-screen w-full font-sans bg-slate-50 text-slate-900 print:h-auto print:block print:bg-white print:overflow-visible">
      <div className="print:hidden">
        <Sidebar />
      </div>
      <main className="flex-1 flex flex-col h-screen overflow-hidden text-left bg-slate-50 print:h-auto print:block print:bg-white print:overflow-visible print:p-0">
        <div className="print:hidden">
          <Header title="Contract Editor" />
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 print:p-0 print:overflow-visible print:block">
          <div className="max-w-6xl mx-auto print:max-w-none print:m-0 print:p-0">
            {editorContent}
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminContractEditor;
