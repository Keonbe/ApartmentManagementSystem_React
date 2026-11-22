import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { parseLine, pick, roman } from './contractTemplate';
import { fileUrl } from '../../api/fileUrl';
import useScopedRules from '../../hooks/useScopedRules';
import '../../assets/styles/responsive/user/view-contract.responsive.css';

// Renders the official lease contract document for an apartment tenant.
// Supports dynamic per-tenant placeholders, bi-lingual terms (EN / TL),
// clean legal formatting, and uploaded E-signatures.

const BLANK = '____________________';

// The printed copy is a Letter sheet (8.5 x 11 in) with @page margin 0, so the
// browser prints no URL/date header and the sheet's padding is the margin.
// SHEET_MM stays under 279.4 mm so rounding never pushes out a blank sheet.
const SHEET_MM = 278;
const SHEET_PAD_MM = 12 + 10; // top + bottom padding of .cp-sheet
const SAFETY_MM = 3;
const MM_PX = 96 / 25.4;

const PRINT_CSS = `
  .contract-print-sheets { display: none; }
  .contract-print-measure { position: fixed; left: -10000px; top: 0; visibility: hidden; pointer-events: none; }
  .contract-print { font-family: Arial, "Helvetica Neue", Helvetica, sans-serif; color: #000; font-size: 10pt; line-height: 1.4; text-align: left; }
  .contract-print p, .contract-print li, .contract-print span, .contract-print strong, .contract-print u { font-size: inherit !important; line-height: inherit !important; }
  .contract-print p { margin: 0 !important; }
  .contract-print .cp-body p + p { margin-top: 3pt !important; }
  .contract-print ul { margin: 2pt 0 !important; padding-left: 16pt !important; list-style: disc !important; }
  .contract-print li { margin: 0 !important; }
  .contract-print .cp-sheet { width: 215.9mm; min-height: ${SHEET_MM}mm; padding: 12mm 16mm 10mm; box-sizing: border-box; display: flex; flex-direction: column; background: #fff; }
  .contract-print .cp-content { flex: 1 0 auto; }
  .contract-print .cp-block { display: flow-root; padding-top: 5pt; }
  .contract-print .cp-header { text-align: center; padding-bottom: 3pt; }
  .contract-print .cp-title { margin: 0; font-family: inherit; font-size: 13pt; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
  .contract-print .cp-copy { color: #be123c; font-style: italic; font-weight: 600; font-size: 9pt !important; margin-top: 1pt !important; }
  .contract-print .cp-h3 { margin: 0; font-family: inherit; font-size: 10.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; }
  .contract-print .cp-rule { border-top: 1px solid #94a3b8; padding-top: 5pt; }
  .contract-print .cp-content > .cp-block:first-child > .cp-rule { border-top: 0; padding-top: 0; }
  .contract-print .cp-caps { text-transform: uppercase; letter-spacing: .05em; }
  .contract-print .cp-indent { padding-left: 10pt; }
  .contract-print .cp-and { padding: 2pt 0; }
  .contract-print .cp-clause { padding-left: 12pt; }
  .contract-print .cp-signed-by { margin-top: 4pt !important; }
  .contract-print .cp-signers { display: grid; grid-template-columns: 1fr 1fr; gap: 14mm; margin-top: 4pt; }
  .contract-print .cp-signer-role { margin-bottom: 2pt !important; }
  .contract-print .cp-field-label { font-size: 9pt !important; font-weight: 700; }
  .contract-print .cp-sig-box { height: 16mm; border-bottom: 1.5px solid #334155; display: flex; align-items: flex-end; }
  .contract-print .cp-sig-box img { max-height: 14mm; max-width: 60mm; object-fit: contain; }
  .contract-print .cp-line-row { display: flex; align-items: baseline; gap: 4pt; margin-top: 6pt; font-size: 9pt; }
  .contract-print .cp-line-row > span { font-weight: 700; white-space: nowrap; }
  .contract-print .cp-line { flex: 1; border-bottom: 1px solid #475569; min-height: 13pt; font-weight: 600; }
  .contract-print .cp-closing { border-top: 1px solid #cbd5e1; padding-top: 4pt; font-size: 8.5pt; color: #475569; }
  .contract-print .cp-footer { display: flex; justify-content: space-between; align-items: flex-end; padding-top: 6pt; font-size: 8.5pt; }
  .contract-print .cp-footer-page { font-weight: 700; color: #475569; }
  .contract-print .cp-footer-sign { display: flex; flex-direction: column; align-items: center; font-weight: 600; }
  .contract-print .cp-footer-sign > div { width: 60mm; height: 7mm; border-bottom: 1px solid #334155; margin-bottom: 2pt; }
  @media print {
    @page { size: letter portrait; margin: 0; }
    .contract-screen, .contract-print-measure { display: none !important; }
    .contract-print-sheets { display: block !important; }
    .contract-print .cp-sheet { break-after: page; page-break-after: always; }
    .contract-print .cp-sheet:last-child { break-after: auto; page-break-after: auto; }
  }
`;

// Packs the measured blocks into sheets. Reads only the DOM (block keys, the
// keep-with-next flag and heights), so it can run from an observer callback.
function paginate(root) {
  const blocks = Array.from(root.querySelectorAll('[data-cp-key]'));
  const heights = blocks.map((el) => el.getBoundingClientRect().height);
  if (!heights.length || heights.every((h) => h === 0)) return null; // hidden: keep the last layout
  const h = (sel) => root.querySelector(sel)?.getBoundingClientRect().height || 0;
  const avail = (SHEET_MM - SHEET_PAD_MM - SAFETY_MM) * MM_PX - h('[data-cp-header]') - h('[data-cp-footer]');
  const contH = h('[data-cp-cont]');
  const pages = [];
  let cur = [];
  let used = 0;
  blocks.forEach((el, i) => {
    const keep = el.dataset.cpKeep === '1' && i + 1 < blocks.length;
    const need = heights[i] + (keep ? heights[i + 1] : 0);
    if (cur.length && used + need > avail) {
      pages.push(cur);
      cur = [];
      used = 0;
    }
    if (!cur.length && el.dataset.cpCont) used += contH;
    cur.push(el.dataset.cpKey);
    used += heights[i];
  });
  if (cur.length) pages.push(cur);
  return pages;
}

// The deposit paragraphs follow RA 9653 Sec. 7 (the deposit is kept in a bank in
// the Owner's name, its interest goes to the Tenant, and it may be kept only to
// the extent of unpaid rent, utilities and damage), so they are generated here
// for every contract rather than taken from the template version: the
// template's own opening paragraph of the Security Deposit clause stays, what
// follows it is generated. Older contracts once offered a "not refunded" mode;
// it was removed (2026-11-13), and they render with these terms too.
const DEPOSIT_TERMS = {
  en: (days) => `**Keeping and Return of the Security Deposit:**
The security deposit is kept in a bank account in the Owner's name for the whole rent term, and any interest it earns is returned to the Tenant when the rent ends (RA 9653 Sec. 7). At move-out it is applied only to unpaid rent, unpaid electricity, water and other utility bills, and damage to the unit and its fixtures beyond normal wear, each listed with a reason. If the Tenant moves out without the required move-out notice, rent for the notice days may also be deducted. What remains, with the interest, is returned to the Tenant within ${days} days after the move-out clearance, through a payout method agreed with Management. If the unpaid amounts are more than the deposit, the deposit is used up and the difference stays payable by the Tenant.`,
  tl: (days) => `**Pag-iingat at Pagbabalik ng Security Deposit:**
Ang security deposit ay itatago sa isang bank account sa pangalan ng May-ari sa buong panahon ng pag-upa, at ang anumang interes nito ay ibabalik sa Nangungupahan sa pagtatapos ng upa (RA 9653 Sek. 7). Sa paglipat, ito ay ikakaltas lamang sa hindi nabayarang upa, hindi nabayarang singil sa kuryente, tubig at iba pang serbisyo, at pinsala sa unit at mga kagamitan nito na lampas sa karaniwang pagkasira, na may nakalistang dahilan. Kung lilipat ang Nangungupahan nang walang kinakailangang abiso, maaari ring ikaltas ang upa para sa mga araw ng abiso. Ang matitira, kasama ang interes, ay ibabalik sa Nangungupahan sa loob ng ${days} araw matapos ang move-out clearance, sa paraan ng payout na napagkasunduan sa Pamunuan. Kung mas malaki ang hindi nabayaran kaysa sa deposit, mauubos ang deposit at ang kulang ay babayaran pa rin ng Nangungupahan.`,
};
function withDepositTerms(body, lang, days) {
  const text = body || '';
  const cut = text.indexOf('\n\n**');
  const intro = cut === -1 ? text : text.slice(0, cut);
  const terms = DEPOSIT_TERMS[lang === 'tl' ? 'tl' : 'en'](days);
  return `${intro}\n\n${terms}`;
}

const SIGNATURE_PARTIES = ['tenantSignature', 'ownerSignature'];

const LABELS = {
  en: {
    between: 'BETWEEN',
    and: 'AND',
    ownerName: 'Name of Apartment Owner',
    ownerAddress: "Owner's Address",
    ownerPhone: "Owner's Phone Number",
    tenantName: 'Name of Tenant',
    tenantAddress: "Tenant's Address",
    tenantPhone: "Tenant's Phone Number",
    room: 'Assigned Room Letter',
    signatures: 'SIGNATURES',
    signedBy: 'Signed by:',
    owner: 'Apartment Owner',
    tenant: 'Tenant',
    signature: 'Signature',
    name: 'Name',
    date: 'Date',
    reminder: 'Reminder:',
    tentative: '(Tentative - Not Final)',
    bank: 'Bank Transfer / Deposit',
    page: 'Page',
    of: 'of',
    tenantSign: 'Name and Signature of Tenant',
    continued: 'Continued',
    uploadSignature: 'Upload signature',
    replaceSignature: 'Replace',
    removeSignature: 'Remove',
    signatureHint: 'PNG or JPG image',
    noAccounts: 'Ask the Owner for payment details.',
  },
  tl: {
    between: 'SA PAGITAN NG',
    and: 'AT',
    ownerName: 'Pangalan ng May-ari ng Apartment',
    ownerAddress: 'Tirahan ng May-ari',
    ownerPhone: 'Telepono ng May-ari',
    tenantName: 'Pangalan ng Nangungupahan',
    tenantAddress: 'Tirahan ng Nangungupahan',
    tenantPhone: 'Telepono ng Nangungupahan',
    room: 'Letra ng Napiling Kwarto',
    signatures: 'MGA PIRMA',
    signedBy: 'Nilagdaan ni:',
    owner: 'May-ari ng Apartment',
    tenant: 'Nangungupahan',
    signature: 'Pirma',
    name: 'Pangalan',
    date: 'Petsa',
    reminder: 'Paalala:',
    tentative: '(Panimula - Hindi pa Pinal)',
    bank: 'Banko',
    page: 'Pahina',
    of: 'ng',
    tenantSign: 'Pangalan at Pirma ng Nangungupahan',
    continued: 'Pagpapatuloy',
    uploadSignature: 'I-upload ang pirma',
    replaceSignature: 'Palitan',
    removeSignature: 'Alisin',
    signatureHint: 'Larawang PNG o JPG',
    noAccounts: 'Makipag-ugnayan sa May-ari para sa detalye ng pagbabayad.',
  },
};

const FILLED_KEYS = new Set([
  'tenant_name', 'tenant_phone', 'tenant_email', 'tenant_previous_address', 'room', 'monthly_rent', 'advance_rent', 'security_deposit',
  'move_in_date', 'lease_start', 'lease_end', 'due_day',
]);

function PaymentMethods({ accounts, lang, L }) {
  if (!accounts?.length) return <p className="m-0 italic text-slate-500 text-[14.5px] sm:text-[15px] print:text-[10pt]">{L.noAccounts}</p>;

  return (
    <ul className="list-disc pl-6 m-0 my-1.5 space-y-1 text-[14.5px] sm:text-[15px] text-slate-800 print:text-[10pt] print:my-1 print:space-y-0.5">
      {accounts.map((a, i) => {
        const note = pick(a.note, lang);
        const parts = [];
        if (a.account_number) parts.push(a.account_number);
        if (a.account_name) parts.push(`(${a.account_name})`);
        if (note) parts.push(a.account_number || a.account_name ? `— ${note}` : note);
        return (
          <li key={a.id || i}>
            <strong>{a.label}:</strong> {parts.length ? parts.join(' ') : '—'}
          </li>
        );
      })}
    </ul>
  );
}

export default function ContractDocument({
  template = {},
  lang = 'en',
  data = {},
  allowUploadSignature = false,
  signatureParties = SIGNATURE_PARTIES,
  onUploadSignature,
  onRemoveSignature,
}) {
  const L = LABELS[lang] || LABELS.en;
  const details = template.details || {};
  const terms = template.terms || {};
  // Children, minors and pets: always the current Settings rules and age categories,
  // appended as the last section so an older saved contract text still carries them.
  const { rules: minorRules, ageCategories } = useScopedRules('minors', true);
  const tl = lang === 'tl';
  const minorsSection = (minorRules.length || ageCategories.length) ? {
    id: 'sec-minors-live',
    title: { en: 'CHILDREN, MINORS AND PETS', tl: 'MGA BATA, MENOR DE EDAD AT ALAGANG HAYOP' },
    clauses: [
      ...(ageCategories.length ? [{
        id: 'cl-age-categories',
        title: { en: 'Age Categories', tl: 'Mga Kategorya ng Edad' },
        body: {
          en: ageCategories.map((c) => `**${c.label}** (age ${c.min_age} to ${c.max_age}): ${c.rule}`).join('\n'),
          tl: ageCategories.map((c) => `**${c.label}** (edad ${c.min_age} hanggang ${c.max_age}): ${tl && c.rule_fil?.trim() ? c.rule_fil : c.rule}`).join('\n'),
        },
      }] : []),
      ...minorRules.map((r) => ({
        id: `cl-minor-rule-${r.id}`,
        title: { en: r.title, tl: r.title_fil?.trim() || r.title },
        body: { en: r.description, tl: r.description_fil?.trim() || r.description },
      })),
    ],
  } : null;
  const sections = [...(terms.sections || []), ...(minorsSection ? [minorsSection] : [])];

  // Per-tenant dynamic data mapping
  const values = {
    landlord_name: details.landlord_name,
    landlord_address: details.landlord_address,
    landlord_contact: details.landlord_contact,
    property_address: details.property_address,
    tenant_name: data.tenantName,
    tenant_phone: data.tenantPhone,
    tenant_email: data.tenantEmail,
    tenant_address: data.tenantAddress,
    tenant_previous_address: data.tenantPreviousAddress,
    room: data.roomName,
    monthly_rent: data.monthlyRent,
    advance_rent: data.advanceRent,
    security_deposit: data.depositAmount,
    move_in_date: data.entryDate,
    lease_start: data.entryDate || data.leaseStart,
    lease_end: data.leaseEndDate || data.leaseEnd,
    due_day: data.dueDateDay,
  };
  (template.variables || []).forEach((v) => { values[v.key] = v.value; });

  const renderVar = (key, bold, i) => {
    if (key === 'payment_methods') {
      const inline = (template.payment_accounts || []).map((a) => a.label).join(', ');
      return <Fragment key={i}>{inline || '—'}</Fragment>;
    }
    if (!(key in values)) return <Fragment key={i}>{`{{${key}}}`}</Fragment>;
    const raw = values[key];
    const has = raw !== undefined && raw !== null && String(raw).trim() !== '';
    const filled = FILLED_KEYS.has(key);
    const cls = `${filled || bold ? 'font-semibold' : ''} ${filled ? 'underline text-slate-900' : ''}`.trim();
    return (
      <Fragment key={i}>
        <span className={cls || undefined}>{has ? String(raw) : BLANK}</span>
        {key === 'move_in_date' && data.isTentative && (
          <span className="text-rose-600 font-semibold text-xs"> {L.tentative}</span>
        )}
      </Fragment>
    );
  };

  const renderLine = (line) => parseLine(line).map((run, i) => {
    if (run.type === 'var') return renderVar(run.key, run.bold, i);
    return run.bold ? <strong key={i}>{run.text}</strong> : <Fragment key={i}>{run.text}</Fragment>;
  });

  const renderBody = (text) => {
    if (!text) return null;
    const blocks = [];
    let para = [];
    const flush = () => {
      if (para.length) blocks.push({ type: 'p', lines: para });
      para = [];
    };
    text.split('\n').forEach((line) => {
      if (/^\s*\{\{\s*payment_methods\s*\}\}\s*$/.test(line)) {
        flush();
        blocks.push({ type: 'payments' });
      } else if (line.trim() === '') {
        flush();
      } else {
        para.push(line);
      }
    });
    flush();
    return blocks.map((b, i) => b.type === 'payments'
      ? <PaymentMethods key={i} accounts={template.payment_accounts} lang={lang} L={L} />
      : (
        <p key={i} className={`m-0 leading-relaxed text-slate-800 text-[14.5px] sm:text-[15px] print:text-[11pt] ${i > 0 ? 'mt-2' : ''}`}>
          {b.lines.map((ln, j) => <Fragment key={j}>{j > 0 && <br />}{renderLine(ln)}</Fragment>)}
        </p>
      ));
  };

  useEffect(() => {
    let savedTitle = '';
    const handleBeforePrint = () => {
      savedTitle = document.title;
      document.title = '';
      window.scrollTo(0, 0);
      document.querySelectorAll('*').forEach((el) => {
        if (el.scrollTop) el.scrollTop = 0;
      });
    };
    const handleAfterPrint = () => {
      if (savedTitle) {
        document.title = savedTitle;
      }
    };
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, []);

  const title = pick(terms.title, lang) || 'APARTMENT RENT AGREEMENT';
  const copyLabel = pick(terms.copy_label, lang);
  const cleanCopyLabel = copyLabel ? copyLabel.replace(/^\((.*)\)$/, '$1') : '';
  const subject = pick(terms.subject, lang);
  const intro = pick(terms.intro, lang);
  const signatureIntro = pick(terms.signature_intro, lang);
  const closingNote = pick(terms.closing_note, lang);

  const ownerSig = data.ownerSignature || details.owner_signature;
  const tenantSig = data.tenantSignature || data.tenantSignaturePath;

  // Upload and remove controls for one party's signature. Screen only: the
  // printed contract shows just the image on the line.
  const signatureControls = (docType, uploaded) => {
    if (!allowUploadSignature || !onUploadSignature || !signatureParties.includes(docType)) return null;
    return (
      <div className="flex flex-wrap items-center gap-2 pt-1 font-sans print:hidden">
        <label className="relative inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 focus-within:ring-2 focus-within:ring-indigo-400">
          {uploaded ? L.replaceSignature : L.uploadSignature}
          {/* sr-only, not hidden: a keyboard can still reach the file input. */}
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) onUploadSignature(docType, file);
            }}
          />
        </label>
        {uploaded && onRemoveSignature && (
          <button
            type="button"
            onClick={() => onRemoveSignature(docType)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            {L.removeSignature}
          </button>
        )}
        {!uploaded && <span className="text-[11px] text-slate-400">{L.signatureHint}</span>}
      </div>
    );
  };

  const sec1 = sections[0];
  const sec2 = sections[1];
  const sec3 = sections[2];
  const sec4 = sections[3];
  const sec5 = sections[4];
  const sec6 = sections[5];
  const extraSections = sections.slice(6);

  const renderPageHeader = () => (
    <div className="text-center mb-5 print:mb-2">
      <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-wider uppercase m-0 print:text-[11.5pt]">
        {title}
      </h2>
      {cleanCopyLabel && (
        <p className="text-rose-600 font-semibold italic text-xs sm:text-sm m-0 mt-0.5 print:text-[9pt]">
          ({cleanCopyLabel})
        </p>
      )}
    </div>
  );

  const renderPageFooter = (pageNum, totalPages = 4) => (
    <div
      className="mt-6 pt-2 flex justify-between items-end text-xs sm:text-sm font-sans print:mt-auto print:pt-1 select-none print:break-inside-avoid"
      style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
    >
      <span className="text-slate-600 font-bold text-xs sm:text-sm print:text-[8.5pt]">
        {L.page} {pageNum} {L.of} {totalPages}
      </span>
      <div className="flex flex-col items-center">
        <div className="w-64 sm:w-72 print:w-56 border-b border-slate-700 mb-1"></div>
        <span className="font-semibold text-slate-800 text-[11px] sm:text-xs print:text-[8.5pt]">
          {L.tenantSign}
        </span>
      </div>
    </div>
  );

  const renderClause = (clause, ci) => {
    const clauseTitle = pick(clause.title, lang);
    return (
      <div key={clause.id || ci} className="contract-clause space-y-1 print:space-y-0.5">
        <p className="m-0 text-[14.5px] sm:text-[15px] leading-relaxed text-slate-900 print:text-[9.5pt] print:leading-snug">
          <strong>{ci + 1}. {clauseTitle ? `${clauseTitle}:` : ''}</strong>
        </p>
        <div className="text-slate-800 text-[14.5px] sm:text-[15px] leading-relaxed print:text-[9pt] print:leading-snug">
          {renderBody(clause.id === 'cl-deposit'
            ? withDepositTerms(pick(clause.body, lang), lang, data.depositRefundDays || 30)
            : pick(clause.body, lang))}
        </div>
      </div>
    );
  };

  // ---- Printed copy ----------------------------------------------------------
  // The screen shows the fixed four-page layout below. On paper every block
  // (parties, section heading, clause, signatures) is measured at Letter width
  // and packed into as many sheets as the text needs, so a longer template or
  // the Tagalog text never spills onto a blank sheet and "Page X of N" is right.
  const defaultSignatureIntro = lang === 'tl'
    ? 'Pinagtibay at pinirmahan ng dalawang partido ang kontratang ito bilang patunay ng kanilang kasunduan.'
    : 'This contract has been affirmed and signed by both parties as proof of their agreement.';

  const printClause = (clause, ci) => {
    const clauseTitle = pick(clause.title, lang);
    return (
      <div className="cp-clause">
        <p><strong>{ci + 1}. {clauseTitle ? `${clauseTitle}:` : ''}</strong></p>
        <div className="cp-body">
          {renderBody(clause.id === 'cl-deposit'
            ? withDepositTerms(pick(clause.body, lang), lang, data.depositRefundDays || 30)
            : pick(clause.body, lang))}
        </div>
      </div>
    );
  };

  const printSigner = (role, sig, alt, name) => (
    <div>
      <p className="cp-signer-role"><strong>{role}:</strong></p>
      <p className="cp-field-label">{L.signature}:</p>
      <div className="cp-sig-box">{sig && <img src={fileUrl(sig) || sig} alt={alt} />}</div>
      <div className="cp-line-row"><span>{L.name}:</span><div className="cp-line">{name || ''}</div></div>
      <div className="cp-line-row"><span>{L.date}:</span><div className="cp-line">{data.entryDate || data.leaseStart || ''}</div></div>
    </div>
  );

  const printBlocks = [{
    key: 'parties',
    node: (
      <div>
        <p className="cp-caps"><strong>{L.between}:</strong></p>
        <div className="cp-indent">
          <p><strong>{L.ownerName}:</strong> {details.landlord_name || BLANK}</p>
          <p><strong>{L.ownerAddress}:</strong> {details.landlord_address || details.property_address || BLANK}</p>
          <p><strong>{L.ownerPhone}:</strong> {details.landlord_contact || BLANK}</p>
          <p className="cp-caps cp-and"><strong>{L.and}</strong></p>
          <p><strong>{L.tenantName}:</strong> <u>{data.tenantName || BLANK}</u></p>
          <p><strong>{L.tenantAddress}:</strong> <u>{data.tenantAddress || details.property_address || BLANK}</u></p>
          <p><strong>{L.tenantPhone}:</strong> <u>{data.tenantPhone || BLANK}</u></p>
          <p><strong>{L.room}:</strong> <u>Room {data.roomName || BLANK}</u></p>
        </div>
      </div>
    ),
  }];
  if (subject || intro) {
    printBlocks.push({
      key: 'intro',
      node: (
        <div className="cp-rule">
          {subject && <h3 className="cp-h3">{subject}</h3>}
          {intro && <div className="cp-body">{renderBody(intro)}</div>}
        </div>
      ),
    });
  }
  sections.forEach((sec, si) => {
    const heading = `${roman(si + 1)}. ${pick(sec.title, lang)}`;
    const clauses = sec.clauses || [];
    printBlocks.push({ key: `h-${si}-${sec.id || ''}`, keep: clauses.length > 0, node: <h3 className="cp-h3 cp-rule">{heading}</h3> });
    clauses.forEach((c, ci) => {
      printBlocks.push({ key: `c-${si}-${ci}-${c.id || ''}`, cont: heading, node: printClause(c, ci) });
    });
  });
  printBlocks.push({
    key: 'signatures',
    node: (
      <div className="cp-rule">
        <h3 className="cp-h3">{roman(sections.length + 1)}. {L.signatures}</h3>
        <p>{signatureIntro || defaultSignatureIntro}</p>
        <p className="cp-signed-by"><strong>{L.signedBy}</strong></p>
        <div className="cp-signers">
          {printSigner(L.owner, ownerSig, 'Owner Signature', details.landlord_name)}
          {printSigner(L.tenant, tenantSig, 'Tenant Signature', data.tenantName)}
        </div>
      </div>
    ),
  });
  if (closingNote) {
    printBlocks.push({
      key: 'closing',
      node: (
        <div className="cp-closing">
          <p><strong>{L.reminder}</strong></p>
          <div className="cp-body">{renderBody(closingNote)}</div>
        </div>
      ),
    });
  }

  const printHeader = (
    <div className="cp-header">
      <h2 className="cp-title">{title}</h2>
      {cleanCopyLabel && <p className="cp-copy">({cleanCopyLabel})</p>}
    </div>
  );
  const printFooter = (pageNum, total) => (
    <div className="cp-footer">
      <span className="cp-footer-page">{L.page} {pageNum} {L.of} {total}</span>
      <span className="cp-footer-sign"><div />{L.tenantSign}</span>
    </div>
  );

  const measureRef = useRef(null);
  const [printPages, setPrintPages] = useState(null);
  const remeasure = useCallback(() => {
    const root = measureRef.current;
    if (!root) return;
    const next = paginate(root);
    if (next) setPrintPages((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);
  // Measured right after each render too, so a print started just after the
  // agreement mounts (Contracts' row download) already has its sheets.
  // paginate() keeps the same array when nothing moved, so this settles.
  useLayoutEffect(() => { remeasure(); });
  // The measuring copy changes height whenever the template, language, data or
  // fonts change, and goes from 0 to its size when a hidden tab is shown.
  useEffect(() => {
    const root = measureRef.current;
    if (!root) return undefined;
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => remeasure());
      ro.observe(root);
    }
    let alive = true;
    document.fonts?.ready?.then(() => { if (alive) remeasure(); }).catch(() => {});
    return () => { alive = false; ro?.disconnect(); };
  }, [remeasure]);

  const blockByKey = Object.fromEntries(printBlocks.map((b) => [b.key, b]));
  const sheets = printPages && printPages.every((pg) => pg.every((k) => blockByKey[k]))
    ? printPages.map((pg) => pg.map((k) => blockByKey[k]))
    : [printBlocks];

  return (
    <div className="w-full">
      <style>{PRINT_CSS}</style>

      {/* Printed copy: hidden on screen, shown instead of the screen pages when printing */}
      <div className="contract-print contract-print-sheets" aria-hidden="true">
        {sheets.map((blocks, pi) => (
          <div key={pi} className="cp-sheet">
            {printHeader}
            <div className="cp-content">
              {blocks[0]?.cont && (
                <div className="cp-block"><h3 className="cp-h3">{blocks[0].cont} ({L.continued})</h3></div>
              )}
              {blocks.map((b) => <div key={b.key} className="cp-block">{b.node}</div>)}
            </div>
            {printFooter(pi + 1, sheets.length)}
          </div>
        ))}
      </div>

      {/* Measuring copy: off screen, one long sheet. Rendered into <body> so it
          can be measured even while the agreement sits in a hidden tab (View
          Contract's Signed copy tab): measured inside a display:none parent
          every height is 0 and the print fell back to one unsplit sheet. */}
      {typeof document !== 'undefined' && createPortal(
      <div ref={measureRef} className="contract-print contract-print-measure" aria-hidden="true">
        <div className="cp-sheet">
          <div data-cp-header="">{printHeader}</div>
          <div className="cp-content">
            <div className="cp-block" data-cp-cont=""><h3 className="cp-h3">I. ({L.continued})</h3></div>
            {printBlocks.map((b) => (
              <div key={b.key} className="cp-block" data-cp-key={b.key} data-cp-keep={b.keep ? '1' : '0'} data-cp-cont={b.cont || undefined}>
                {b.node}
              </div>
            ))}
          </div>
          <div data-cp-footer="">{printFooter(1, 1)}</div>
        </div>
      </div>,
      document.body,
      )}

    <div className="contract-screen w-full space-y-8">
      <style>
        {`
          @media print {
            @page {
              size: letter portrait;
              margin: 0 !important;
            }
            /* Hide all non-contract UI chrome, headers, tabs, buttons, etc. */
            nav, footer, aside, header, .print\\:hidden, button, .no-print,
            .admin-header, .admin-sidebar, .admin-dashboard-header,
            .editor-meta-header, .editor-tabs-nav, .preview-controls-bar,
            .save-bar, [role="status"] {
              display: none !important;
            }
            /* Reset root page containers for clean multi-page document pagination */
            html, body, #root, main, div, article {
              overflow: visible !important;
            }
            html, body, #root, main {
              height: auto !important;
              min-height: auto !important;
              max-height: none !important;
              background: #fff !important;
              color: #000 !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            body {
              background-color: #fff !important;
              color: #000 !important;
              font-family: Arial, "Helvetica Neue", sans-serif !important;
              font-size: 9pt !important;
              line-height: 1.35 !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .contract-page {
              box-shadow: none !important;
              border: none !important;
              border-radius: 0 !important;
              padding: 4mm 6mm 4mm 6mm !important;
              margin: 0 !important;
              width: 100% !important;
              max-width: 100% !important;
              box-sizing: border-box !important;
              min-height: auto !important;
              height: auto !important;
              display: flex !important;
              flex-direction: column !important;
              justify-content: space-between !important;
              page-break-after: always !important;
              break-after: page !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              font-size: 9pt !important;
              line-height: 1.35 !important;
            }
            .contract-page:last-child {
              page-break-after: auto !important;
              break-after: auto !important;
            }
            hr {
              border: none !important;
              border-top: 1px solid #475569 !important;
              margin: 4pt 0 !important;
            }
          }
        `}
      </style>

      {/* ================= PAGE 1 ================= */}
      <div className="contract-page bg-white border border-slate-200 shadow-xl rounded-2xl p-8 md:p-12 box-border text-left text-slate-900 leading-relaxed font-sans text-[14.5px] sm:text-[15px] print:shadow-none print:border-none print:p-0 flex flex-col justify-between min-h-[960px]">
        <div>
          {renderPageHeader()}

          <div className="space-y-3 print:space-y-1.5">
            <p className="m-0 font-bold text-slate-900 uppercase text-xs sm:text-sm tracking-wider print:text-[9.5pt]">{L.between}:</p>
            <div className="space-y-1 text-[14.5px] sm:text-[15px] pl-3 print:text-[9.5pt] print:space-y-0.5">
              <p className="m-0"><strong>{L.ownerName}:</strong> {details.landlord_name || BLANK}</p>
              <p className="m-0"><strong>{L.ownerAddress}:</strong> {details.landlord_address || details.property_address || BLANK}</p>
              <p className="m-0"><strong>{L.ownerPhone}:</strong> {details.landlord_contact || BLANK}</p>
              <p className="m-0 font-bold py-1 print:py-0 text-xs sm:text-sm tracking-wider uppercase print:text-[9.5pt]">{L.and}</p>
              <p className="m-0"><strong>{L.tenantName}:</strong> <span className="underline font-semibold text-slate-950">{data.tenantName || BLANK}</span></p>
              <p className="m-0"><strong>{L.tenantAddress}:</strong> <span className="underline font-semibold text-slate-950">{data.tenantAddress || details.property_address || BLANK}</span></p>
              <p className="m-0"><strong>{L.tenantPhone}:</strong> <span className="underline font-semibold text-slate-950">{data.tenantPhone || BLANK}</span></p>
              <p className="m-0"><strong>{L.room}:</strong> <span className="underline font-semibold text-slate-950">Room {data.roomName || BLANK}</span></p>
            </div>

            <hr className="my-3 border-t border-slate-300 print:my-1.5" />

            {(subject || intro) && (
              <div className="space-y-1 print:space-y-0.5">
                {subject && <h3 className="font-bold text-slate-900 uppercase text-sm sm:text-base m-0 print:text-[10.5pt]">{subject}</h3>}
                {intro && renderBody(intro)}
              </div>
            )}

            {sec1 && (
              <div className="space-y-2 pt-1 print:space-y-1 print:pt-0">
                <h3 className="font-bold text-slate-900 m-0 text-sm sm:text-base uppercase tracking-wide print:text-[10.5pt]">
                  I. {pick(sec1.title, lang)}
                </h3>
                <div className="pl-4 space-y-2 print:space-y-0.5">
                  {sec1.clauses.map((c, ci) => renderClause(c, ci))}
                </div>
              </div>
            )}

            {sec2 && sec2.clauses && sec2.clauses.length > 0 && (
              <>
                <hr className="my-3 border-t border-slate-300 print:my-1.5" />
                <div className="space-y-2 pt-1 print:space-y-1 print:pt-0">
                  <h3 className="font-bold text-slate-900 m-0 text-sm sm:text-base uppercase tracking-wide print:text-[10.5pt]">
                    II. {pick(sec2.title, lang)}
                  </h3>
                  <div className="pl-4 space-y-2 print:space-y-0.5">
                    {sec2.clauses.slice(0, 3).map((c, ci) => renderClause(c, ci))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {renderPageFooter(1, 4)}
      </div>

      {/* ================= PAGE 2 ================= */}
      <div className="contract-page bg-white border border-slate-200 shadow-xl rounded-2xl p-8 md:p-12 box-border text-left text-slate-900 leading-relaxed font-sans text-[14.5px] sm:text-[15px] print:shadow-none print:border-none print:p-0 flex flex-col justify-between min-h-[960px]">
        <div>
          {renderPageHeader()}

          <div className="space-y-2.5 sm:space-y-3 print:space-y-1">
            {sec2 && sec2.clauses && sec2.clauses.length > 3 && (
              <div className="space-y-2.5 print:space-y-1">
                <h3 className="font-bold text-slate-900 m-0 text-sm sm:text-base uppercase tracking-wide print:text-[10.5pt]">
                  II. {pick(sec2.title, lang)} {lang === 'tl' ? '(Pagpapatuloy)' : '(Continued)'}
                </h3>
                <div className="pl-4 space-y-2 print:space-y-1">
                  {sec2.clauses.slice(3).map((c, ci) => renderClause(c, ci + 3))}
                </div>
              </div>
            )}
          </div>
        </div>

        {renderPageFooter(2, 4)}
      </div>

      {/* ================= PAGE 3 ================= */}
      <div className="contract-page bg-white border border-slate-200 shadow-xl rounded-2xl p-8 md:p-12 box-border text-left text-slate-900 leading-relaxed font-sans text-[14.5px] sm:text-[15px] print:shadow-none print:border-none print:p-0 flex flex-col justify-between min-h-[960px]">
        <div>
          {renderPageHeader()}

          <div className="space-y-3.5 print:space-y-1.5">
            {sec3 && (
              <div className="space-y-2.5 print:space-y-1">
                <h3 className="font-bold text-slate-900 m-0 text-sm sm:text-base uppercase tracking-wide print:text-[10.5pt]">
                  III. {pick(sec3.title, lang)}
                </h3>
                <div className="pl-4 space-y-2 print:space-y-0.5">
                  {sec3.clauses.map((c, ci) => renderClause(c, ci))}
                </div>
              </div>
            )}

            {sec4 && (
              <>
                <hr className="my-3.5 border-t border-slate-300 print:my-1.5" />
                <div className="space-y-2.5 print:space-y-1">
                  <h3 className="font-bold text-slate-900 m-0 text-sm sm:text-base uppercase tracking-wide print:text-[10.5pt]">
                    IV. {pick(sec4.title, lang)}
                  </h3>
                  <div className="pl-4 space-y-2 print:space-y-0.5">
                    {sec4.clauses.map((c, ci) => renderClause(c, ci))}
                  </div>
                </div>
              </>
            )}

            {sec5 && (
              <>
                <hr className="my-3.5 border-t border-slate-300 print:my-1.5" />
                <div className="space-y-2.5 print:space-y-1">
                  <h3 className="font-bold text-slate-900 m-0 text-sm sm:text-base uppercase tracking-wide print:text-[10.5pt]">
                    V. {pick(sec5.title, lang)}
                  </h3>
                  <div className="pl-4 space-y-2 print:space-y-0.5">
                    {sec5.clauses.map((c, ci) => renderClause(c, ci))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {renderPageFooter(3, 4)}
      </div>

      {/* ================= PAGE 4 ================= */}
      <div className="contract-page bg-white border border-slate-200 shadow-xl rounded-2xl p-8 md:p-12 box-border text-left text-slate-900 leading-relaxed font-sans text-[14.5px] sm:text-[15px] print:shadow-none print:border-none print:p-0 flex flex-col justify-between min-h-[960px]">
        <div>
          {renderPageHeader()}

          <div className="space-y-3.5 print:space-y-1.5">
            {sec6 && (
              <div className="space-y-2.5 print:space-y-1">
                <h3 className="font-bold text-slate-900 m-0 text-sm sm:text-base uppercase tracking-wide print:text-[10.5pt]">
                  VI. {pick(sec6.title, lang)}
                </h3>
                <div className="pl-4 space-y-2 print:space-y-0.5">
                  {sec6.clauses.map((c, ci) => renderClause(c, ci))}
                </div>
              </div>
            )}

            {extraSections.map((sec, ri) => (
              <div key={sec.id || ri} className="space-y-2.5 print:space-y-1">
                <hr className="my-3.5 border-t border-slate-300 print:my-1.5" />
                <h3 className="font-bold text-slate-900 m-0 text-sm sm:text-base uppercase tracking-wide print:text-[10.5pt]">
                  {roman(7 + ri)}. {pick(sec.title, lang)}
                </h3>
                <div className="pl-4 space-y-2 print:space-y-0.5">
                  {sec.clauses.map((c, ci) => renderClause(c, ci))}
                </div>
              </div>
            ))}

            <hr className="my-3.5 border-t border-slate-300 print:my-1.5" />

            {/* Section Signatures */}
            <div className="space-y-3 pt-1 print:space-y-1 print:pt-0">
              <div>
                <h3 className="font-bold text-slate-900 m-0 text-sm sm:text-base uppercase tracking-wide print:text-[10.5pt]">
                  {roman(sections.length + 1)}. {L.signatures}
                </h3>
                <p className="m-0 mt-1 text-[14.5px] sm:text-[15px] leading-relaxed text-slate-800 print:text-[9pt] print:mt-0.5">
                  {signatureIntro || (lang === 'tl'
                    ? 'Pinagtibay at pinirmahan ng dalawang partido ang kontratang ito bilang patunay ng kanilang kasunduan.'
                    : 'This contract has been affirmed and signed by both parties as proof of their agreement.')}
                </p>
              </div>

              <p className="m-0 font-semibold text-slate-900 text-[14.5px] sm:text-[15px] print:text-[9pt]">{L.signedBy}</p>

              <div className="grid grid-cols-2 gap-8 text-[14px] sm:text-[15px] font-sans pt-1 print:gap-4 print:pt-0">
                <div className="space-y-4 print:space-y-1">
                  <p className="m-0 font-bold text-slate-900 text-sm sm:text-base print:text-[9.5pt]">{L.owner}:</p>

                  {/* Signature field */}
                  <div className="space-y-1 print:space-y-0.5">
                    <span className="font-bold text-slate-800 text-xs sm:text-sm print:text-[8.5pt]">{L.signature}:</span>
                    <div className="h-16 sm:h-20 print:h-12 w-full flex items-end justify-start pb-1">
                      {ownerSig && (
                        <img
                          src={fileUrl(ownerSig) || ownerSig}
                          alt="Owner Signature"
                          className="max-h-14 sm:max-h-16 print:max-h-10 max-w-[200px] object-contain"
                        />
                      )}
                    </div>
                    <div className="border-b-2 border-slate-700 w-full"></div>
                    {signatureControls('ownerSignature', !!data.ownerSignature)}
                  </div>

                  {/* Name field */}
                  <div className="space-y-1 print:space-y-0.5">
                    <div className="flex items-baseline gap-2">
                      <span className="font-bold text-slate-800 text-xs sm:text-sm whitespace-nowrap print:text-[8.5pt]">{L.name}:</span>
                      <div className="flex-1 border-b-2 border-slate-700 pb-0.5 min-h-[26px] print:min-h-[18px]">
                        <span className="font-semibold text-slate-900 text-sm sm:text-[15px] print:text-[9pt]">
                          {details.landlord_name || ''}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Date field */}
                  <div className="space-y-1 print:space-y-0.5">
                    <div className="flex items-baseline gap-2">
                      <span className="font-bold text-slate-800 text-xs sm:text-sm whitespace-nowrap print:text-[8.5pt]">{L.date}:</span>
                      <div className="flex-1 border-b border-slate-500 pb-0.5 min-h-[24px] print:min-h-[16px]">
                        <span className="text-slate-800 text-xs sm:text-sm print:text-[9pt]">
                          {data.entryDate || data.leaseStart || ''}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 print:space-y-1">
                  <p className="m-0 font-bold text-slate-900 text-sm sm:text-base print:text-[9.5pt]">{L.tenant}:</p>

                  {/* Signature field */}
                  <div className="space-y-1 print:space-y-0.5">
                    <span className="font-bold text-slate-800 text-xs sm:text-sm print:text-[8.5pt]">{L.signature}:</span>
                    <div className="h-16 sm:h-20 print:h-12 w-full flex items-end justify-start pb-1">
                      {tenantSig && (
                        <img
                          src={fileUrl(tenantSig) || tenantSig}
                          alt="Tenant Signature"
                          className="max-h-14 sm:max-h-16 print:max-h-10 max-w-[200px] object-contain"
                        />
                      )}
                    </div>
                    <div className="border-b-2 border-slate-700 w-full"></div>
                    {signatureControls('tenantSignature', !!tenantSig)}
                  </div>

                  {/* Name field */}
                  <div className="space-y-1 print:space-y-0.5">
                    <div className="flex items-baseline gap-2">
                      <span className="font-bold text-slate-800 text-xs sm:text-sm whitespace-nowrap print:text-[8.5pt]">{L.name}:</span>
                      <div className="flex-1 border-b-2 border-slate-700 pb-0.5 min-h-[26px] print:min-h-[18px]">
                        <span className="font-semibold text-slate-900 text-sm sm:text-[15px] print:text-[9pt]">
                          {data.tenantName || ''}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Date field */}
                  <div className="space-y-1 print:space-y-0.5">
                    <div className="flex items-baseline gap-2">
                      <span className="font-bold text-slate-800 text-xs sm:text-sm whitespace-nowrap print:text-[8.5pt]">{L.date}:</span>
                      <div className="flex-1 border-b border-slate-500 pb-0.5 min-h-[24px] print:min-h-[16px]">
                        <span className="text-slate-800 text-xs sm:text-sm print:text-[9pt]">
                          {data.entryDate || data.leaseStart || ''}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {closingNote && (
                <div className="pt-2 border-t border-slate-200 text-xs sm:text-[13px] text-slate-600 leading-relaxed print:text-[8pt] print:pt-1">
                  <p className="m-0"><strong>{L.reminder}</strong></p>
                  {renderBody(closingNote)}
                </div>
              )}
            </div>
          </div>
        </div>

        {renderPageFooter(4, 4)}
      </div>
    </div>
    </div>
  );
}
