// Admin-editable lease contract: API calls, placeholder vocabulary and the
// clause-text parser shared by the tenant view (ViewContract), the admin
// editor preview and anything that shows the landlord's payment accounts.
// The document shape is described in backend/contract_template.php.

import api from '../../api/axiosConfig';

// {{key}} tokens filled per tenant. Must match CONTRACT_BUILTIN_PLACEHOLDERS
// in backend/contract_template.php.
export const BUILTIN_PLACEHOLDERS = [
  { key: 'landlord_name', label: 'Owner name' },
  { key: 'landlord_address', label: "Owner's address" },
  { key: 'landlord_contact', label: 'Owner contact number' },
  { key: 'property_address', label: 'Property address' },
  { key: 'tenant_name', label: 'Tenant name' },
  { key: 'tenant_phone', label: 'Tenant phone' },
  { key: 'room', label: 'Room letter' },
  { key: 'monthly_rent', label: 'Monthly rent' },
  { key: 'advance_rent', label: 'Advance rent' },
  { key: 'security_deposit', label: 'Security deposit' },
  { key: 'move_in_date', label: 'Move-in date (marks tentative dates)' },
  { key: 'lease_start', label: 'Rent start date' },
  { key: 'lease_end', label: 'Rent end date' },
  { key: 'due_day', label: 'Monthly due day' },
  { key: 'payment_methods', label: 'Payment accounts list (on its own line)' },
];
export const BUILTIN_KEYS = new Set(BUILTIN_PLACEHOLDERS.map((p) => p.key));

export const PAYMENT_TYPES = [
  { value: 'gcash', label: 'GCash' },
  { value: 'bank', label: 'Bank' },
  { value: 'ewallet', label: 'Other e-wallet' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
];

// Mirrors CONTRACT_LIMITS in backend/contract_template.php.
export const CONTRACT_LIMITS = {
  sections: 20,
  clauses: 30,
  accounts: 10,
  variables: 30,
  heading: 200,
  body: 5000,
  detail: 150,
  accountNumber: 40,
  accountName: 100,
  accountLabel: 60,
  accountNote: 150,
  variableLabel: 60,
  variableValue: 200,
  note: 255,
};

export const VARIABLE_KEY_RE = /^[a-z][a-z0-9_]{1,39}$/;
export const ACCOUNT_NUMBER_RE = /^[0-9A-Za-z *#().+/-]+$/;

// GET the template in force. `versionId` = the version a contract was issued
// under (its clauses; details and accounts stay current).
export async function fetchContractTemplate(versionId = null, { full = false } = {}) {
  const params = {};
  if (versionId) params.version_id = versionId;
  if (full) params.full = 1;
  const res = await api.get('/get_contract_template.php', { params });
  if (!res.data?.success) throw new Error(res.data?.message || 'Could not load the contract.');
  return res.data;
}

export async function fetchDefaultContractTemplate() {
  const res = await api.get('/get_contract_template.php', { params: { default: 1 } });
  if (!res.data?.success) throw new Error(res.data?.message || 'Could not load the default contract.');
  return res.data.template;
}

export async function fetchContractHistory() {
  const res = await api.get('/get_contract_template.php', { params: { history: 1 } });
  return res.data?.success ? res.data.versions : [];
}

export async function saveContractTemplate(template, baseVersion, note) {
  const res = await api.post('/save_contract_template.php', { template, base_version: baseVersion, note });
  return res.data;
}

// Bilingual text with fallback to the other language when one is blank.
export const pick = (text, lang) => {
  if (!text) return '';
  const primary = (text[lang] || '').trim();
  return primary || (text[lang === 'tl' ? 'en' : 'tl'] || '').trim();
};

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'];
export const roman = (n) => ROMAN[n - 1] || String(n);

// Splits one line of clause text into runs:
//   { type: 'text', text, bold } | { type: 'var', key, bold }
// **bold** toggles emphasis; {{key}} is a placeholder. No HTML is interpreted.
export function parseLine(line) {
  const runs = [];
  let bold = false;
  const re = /(\*\*|\{\{\s*([a-z][a-z0-9_]*)\s*\}\})/g;
  let last = 0;
  let m;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) runs.push({ type: 'text', text: line.slice(last, m.index), bold });
    if (m[1] === '**') bold = !bold;
    else runs.push({ type: 'var', key: m[2], bold });
    last = re.lastIndex;
  }
  if (last < line.length) runs.push({ type: 'text', text: line.slice(last), bold });
  return runs;
}

// Placeholder keys used anywhere in the terms that are neither built-in nor
// defined as custom values — shown as warnings in the editor.
export function unknownPlaceholders(template) {
  const defined = new Set([...BUILTIN_KEYS, ...(template.variables || []).map((v) => v.key)]);
  const found = new Set();
  const scan = (text) => {
    for (const lang of ['en', 'tl']) {
      const s = text?.[lang] || '';
      for (const m of s.matchAll(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g)) {
        if (!defined.has(m[1])) found.add(m[1]);
      }
    }
  };
  const t = template.terms || {};
  ['title', 'copy_label', 'subject', 'intro', 'signature_intro', 'closing_note'].forEach((k) => scan(t[k]));
  (t.sections || []).forEach((s) => {
    scan(s.title);
    s.clauses.forEach((c) => { scan(c.title); scan(c.body); });
  });
  return [...found];
}

// Accounts relevant to a payment method name used by the payment pages
// ('GCash', 'Bank Transfer', 'GCash (Manual)', ...).
export function accountsForMethod(accounts, method) {
  const m = String(method || '').toLowerCase();
  const type = m.includes('gcash') ? 'gcash' : m.includes('bank') ? 'bank' : m.includes('maya') ? 'ewallet' : null;
  if (!type) return [];
  return (accounts || []).filter((a) => a.type === type && a.account_number);
}

let idCounter = 0;
export const newId = (prefix) => `${prefix}-${Date.now().toString(36)}${(idCounter++).toString(36)}`;
