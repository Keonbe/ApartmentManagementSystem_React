import { Fragment, useEffect } from 'react';
import { parseLine, pick, roman } from './contractTemplate';
import { fileUrl } from '../../api/fileUrl';
import '../../assets/styles/responsive/user/view-contract.responsive.css';

// Renders the official lease contract document for an apartment tenant.
// Supports dynamic per-tenant placeholders, bi-lingual terms (EN / TL),
// clean legal formatting, and uploaded E-signatures.

const BLANK = '____________________';

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
    uploadSignature: 'I-upload ang pirma',
    replaceSignature: 'Palitan',
    removeSignature: 'Alisin',
    signatureHint: 'Larawang PNG o JPG',
    noAccounts: 'Makipag-ugnayan sa May-ari para sa detalye ng pagbabayad.',
  },
};

const FILLED_KEYS = new Set([
  'tenant_name', 'tenant_phone', 'tenant_email', 'room', 'monthly_rent', 'advance_rent', 'security_deposit',
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
  const sections = terms.sections || [];

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

  const title = pick(terms.title, lang) || 'APARTMENT LEASE AGREEMENT';
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
        <label className="cursor-pointer rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100">
          {uploaded ? L.replaceSignature : L.uploadSignature}
          <input
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
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
    <div className="text-center mb-5 print:mb-4">
      <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-wider uppercase m-0 print:text-[13.5pt]">
        {title}
      </h2>
      {cleanCopyLabel && (
        <p className="text-rose-600 font-semibold italic text-xs sm:text-sm m-0 mt-0.5 print:text-[10pt]">
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
      <span className="text-slate-600 font-bold text-xs sm:text-sm print:text-[9.5pt]">
        {L.page} {pageNum} {L.of} {totalPages}
      </span>
      <div className="flex flex-col items-center">
        <div className="w-64 sm:w-72 border-b-2 border-slate-700 mb-1"></div>
        <span className="font-semibold text-slate-800 text-[11px] sm:text-xs print:text-[9pt]">
          {L.tenantSign}
        </span>
      </div>
    </div>
  );

  const renderClause = (clause, ci) => {
    const clauseTitle = pick(clause.title, lang);
    return (
      <div key={clause.id || ci} className="contract-clause space-y-1 print:space-y-0.5">
        <p className="m-0 text-[14.5px] sm:text-[15px] leading-relaxed text-slate-900 print:text-[10pt] print:leading-snug">
          <strong>{ci + 1}. {clauseTitle ? `${clauseTitle}:` : ''}</strong>
        </p>
        <div className="text-slate-800 text-[14.5px] sm:text-[15px] leading-relaxed print:text-[10pt] print:leading-snug">
          {renderBody(pick(clause.body, lang))}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full space-y-8 print:space-y-0">
      <style>
        {`
          @media print {
            @page {
              size: auto;
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
              font-size: 10.5pt !important;
              line-height: 1.5 !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .contract-page {
              box-shadow: none !important;
              border: none !important;
              border-radius: 0 !important;
              padding: 10mm 16mm 8mm 16mm !important;
              margin: 0 !important;
              width: 100% !important;
              max-width: 100% !important;
              box-sizing: border-box !important;
              min-height: 250mm !important;
              display: flex !important;
              flex-direction: column !important;
              justify-content: space-between !important;
              page-break-after: always !important;
              break-after: page !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              font-size: 10pt !important;
              line-height: 1.45 !important;
            }
            .contract-page:last-child {
              page-break-after: auto !important;
              break-after: auto !important;
            }
            hr {
              border: none !important;
              border-top: 1px solid #475569 !important;
              margin: 8pt 0 !important;
            }
          }
        `}
      </style>

      {/* ================= PAGE 1 ================= */}
      <div className="contract-page bg-white border border-slate-200 shadow-xl rounded-2xl p-8 md:p-12 box-border text-left text-slate-900 leading-relaxed font-sans text-[14.5px] sm:text-[15px] print:shadow-none print:border-none print:p-0 flex flex-col justify-between min-h-[960px]">
        <div>
          {renderPageHeader()}

          <div className="space-y-3">
            <p className="m-0 font-bold text-slate-900 uppercase text-xs sm:text-sm tracking-wider print:text-[10pt]">{L.between}:</p>
            <div className="space-y-1 text-[14.5px] sm:text-[15px] pl-3 print:text-[10.5pt]">
              <p className="m-0"><strong>{L.ownerName}:</strong> {details.landlord_name || BLANK}</p>
              <p className="m-0"><strong>{L.ownerAddress}:</strong> {details.landlord_address || details.property_address || BLANK}</p>
              <p className="m-0"><strong>{L.ownerPhone}:</strong> {details.landlord_contact || BLANK}</p>
              <p className="m-0 font-bold py-1 text-xs sm:text-sm tracking-wider uppercase print:text-[10pt]">{L.and}</p>
              <p className="m-0"><strong>{L.tenantName}:</strong> <span className="underline font-semibold text-slate-950">{data.tenantName || BLANK}</span></p>
              <p className="m-0"><strong>{L.tenantAddress}:</strong> <span className="underline font-semibold text-slate-950">{data.tenantAddress || details.property_address || BLANK}</span></p>
              <p className="m-0"><strong>{L.tenantPhone}:</strong> <span className="underline font-semibold text-slate-950">{data.tenantPhone || BLANK}</span></p>
              <p className="m-0"><strong>{L.room}:</strong> <span className="underline font-semibold text-slate-950">Room {data.roomName || BLANK}</span></p>
            </div>

            <hr className="my-3 border-t border-slate-300" />

            {(subject || intro) && (
              <div className="space-y-1">
                {subject && <h3 className="font-bold text-slate-900 uppercase text-sm sm:text-base m-0 print:text-[11.5pt]">{subject}</h3>}
                {intro && renderBody(intro)}
              </div>
            )}

            {sec1 && (
              <div className="space-y-2 pt-1">
                <h3 className="font-bold text-slate-900 m-0 text-sm sm:text-base uppercase tracking-wide print:text-[11.5pt]">
                  I. {pick(sec1.title, lang)}
                </h3>
                <div className="pl-4 space-y-2">
                  {sec1.clauses.map((c, ci) => renderClause(c, ci))}
                </div>
              </div>
            )}

            {sec2 && sec2.clauses && sec2.clauses.length > 0 && (
              <>
                <hr className="my-3 border-t border-slate-300" />
                <div className="space-y-2 pt-1">
                  <h3 className="font-bold text-slate-900 m-0 text-sm sm:text-base uppercase tracking-wide print:text-[11.5pt]">
                    II. {pick(sec2.title, lang)}
                  </h3>
                  <div className="pl-4 space-y-2">
                    {renderClause(sec2.clauses[0], 0)}
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

          <div className="space-y-2.5 sm:space-y-3 print:space-y-1.5">
            {sec2 && sec2.clauses && sec2.clauses.length > 1 && (
              <div className="pl-4 space-y-2.5 sm:space-y-3 print:space-y-1.5">
                {sec2.clauses.slice(1).map((c, ci) => renderClause(c, ci + 1))}
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

          <div className="space-y-3.5">
            {sec3 && (
              <div className="space-y-2.5">
                <h3 className="font-bold text-slate-900 m-0 text-sm sm:text-base uppercase tracking-wide print:text-[12pt]">
                  III. {pick(sec3.title, lang)}
                </h3>
                <div className="pl-4 space-y-2.5">
                  {sec3.clauses.map((c, ci) => renderClause(c, ci))}
                </div>
              </div>
            )}

            {sec4 && (
              <>
                <hr className="my-3.5 border-t border-slate-300" />
                <div className="space-y-2.5">
                  <h3 className="font-bold text-slate-900 m-0 text-sm sm:text-base uppercase tracking-wide print:text-[12pt]">
                    IV. {pick(sec4.title, lang)}
                  </h3>
                  <div className="pl-4 space-y-2.5">
                    {sec4.clauses.map((c, ci) => renderClause(c, ci))}
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

          <div className="space-y-3.5">
            {sec5 && (
              <div className="space-y-2.5">
                <h3 className="font-bold text-slate-900 m-0 text-sm sm:text-base uppercase tracking-wide print:text-[12pt]">
                  V. {pick(sec5.title, lang)}
                </h3>
                <div className="pl-4 space-y-2.5">
                  {sec5.clauses.map((c, ci) => renderClause(c, ci))}
                </div>
              </div>
            )}

            {sec6 && (
              <>
                <hr className="my-3.5 border-t border-slate-300" />
                <div className="space-y-2.5">
                  <h3 className="font-bold text-slate-900 m-0 text-sm sm:text-base uppercase tracking-wide print:text-[12pt]">
                    VI. {pick(sec6.title, lang)}
                  </h3>
                  <div className="pl-4 space-y-2.5">
                    {sec6.clauses.map((c, ci) => renderClause(c, ci))}
                  </div>
                </div>
              </>
            )}

            {extraSections.map((sec, ri) => (
              <div key={sec.id || ri} className="space-y-2.5">
                <hr className="my-3.5 border-t border-slate-300" />
                <h3 className="font-bold text-slate-900 m-0 text-sm sm:text-base uppercase tracking-wide print:text-[12pt]">
                  {roman(7 + ri)}. {pick(sec.title, lang)}
                </h3>
                <div className="pl-4 space-y-2.5">
                  {sec.clauses.map((c, ci) => renderClause(c, ci))}
                </div>
              </div>
            ))}

            <hr className="my-3.5 border-t border-slate-300" />

            {/* Section VII & Signatures matching Apartment-Contract.pdf */}
            <div className="space-y-3.5 pt-1">
              <div>
                <h3 className="font-bold text-slate-900 m-0 text-sm sm:text-base uppercase tracking-wide print:text-[12pt]">
                  {roman(sections.length + 1)}. {L.signatures}
                </h3>
                <p className="m-0 mt-1 text-[14.5px] sm:text-[15px] leading-relaxed text-slate-800 print:text-[11pt]">
                  {signatureIntro || (lang === 'tl'
                    ? 'Pinagtibay at pinirmahan ng dalawang partido ang kontratang ito bilang patunay ng kanilang kasunduan.'
                    : 'This contract has been affirmed and signed by both parties as proof of their agreement.')}
                </p>
              </div>

              <p className="m-0 font-semibold text-slate-900 text-[14.5px] sm:text-[15px] print:text-[11pt]">{L.signedBy}</p>

              <div className="grid grid-cols-2 gap-8 text-[14px] sm:text-[15px] font-sans pt-1 print:text-[11pt]">
                <div className="space-y-4">
                  <p className="m-0 font-bold text-slate-900 text-sm sm:text-base print:text-[11.5pt]">{L.owner}:</p>

                  {/* Signature field with generous physical signing space */}
                  <div className="space-y-1">
                    <span className="font-bold text-slate-800 text-xs sm:text-sm print:text-[10pt]">{L.signature}:</span>
                    <div className="h-16 sm:h-20 w-full flex items-end justify-start pb-1">
                      {ownerSig && (
                        <img
                          src={fileUrl(ownerSig) || ownerSig}
                          alt="Owner Signature"
                          className="max-h-14 sm:max-h-16 max-w-[200px] object-contain"
                        />
                      )}
                    </div>
                    <div className="border-b-2 border-slate-700 w-full"></div>
                    {signatureControls('ownerSignature', !!data.ownerSignature)}
                  </div>

                  {/* Name field with dedicated line */}
                  <div className="space-y-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-bold text-slate-800 text-xs sm:text-sm whitespace-nowrap print:text-[10pt]">{L.name}:</span>
                      <div className="flex-1 border-b-2 border-slate-700 pb-0.5 min-h-[26px]">
                        <span className="font-semibold text-slate-900 text-sm sm:text-[15px] print:text-[11pt]">
                          {details.landlord_name || ''}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Date field with dedicated line */}
                  <div className="space-y-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-bold text-slate-800 text-xs sm:text-sm whitespace-nowrap print:text-[10pt]">{L.date}:</span>
                      <div className="flex-1 border-b border-slate-500 pb-0.5 min-h-[24px]">
                        <span className="text-slate-800 text-xs sm:text-sm print:text-[10.5pt]">
                          {data.entryDate || data.leaseStart || ''}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="m-0 font-bold text-slate-900 text-sm sm:text-base print:text-[11.5pt]">{L.tenant}:</p>

                  {/* Signature field with generous physical signing space */}
                  <div className="space-y-1">
                    <span className="font-bold text-slate-800 text-xs sm:text-sm print:text-[10pt]">{L.signature}:</span>
                    <div className="h-16 sm:h-20 w-full flex items-end justify-start pb-1">
                      {tenantSig && (
                        <img
                          src={fileUrl(tenantSig) || tenantSig}
                          alt="Tenant Signature"
                          className="max-h-14 sm:max-h-16 max-w-[200px] object-contain"
                        />
                      )}
                    </div>
                    <div className="border-b-2 border-slate-700 w-full"></div>
                    {signatureControls('tenantSignature', !!tenantSig)}
                  </div>

                  {/* Name field with dedicated line */}
                  <div className="space-y-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-bold text-slate-800 text-xs sm:text-sm whitespace-nowrap print:text-[10pt]">{L.name}:</span>
                      <div className="flex-1 border-b-2 border-slate-700 pb-0.5 min-h-[26px]">
                        <span className="font-semibold text-slate-900 text-sm sm:text-[15px] print:text-[11pt]">
                          {data.tenantName || ''}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Date field with dedicated line */}
                  <div className="space-y-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-bold text-slate-800 text-xs sm:text-sm whitespace-nowrap print:text-[10pt]">{L.date}:</span>
                      <div className="flex-1 border-b border-slate-500 pb-0.5 min-h-[24px]">
                        <span className="text-slate-800 text-xs sm:text-sm print:text-[10.5pt]">
                          {data.entryDate || data.leaseStart || ''}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {closingNote && (
                <div className="pt-3 border-t border-slate-200 text-xs sm:text-[13px] text-slate-600 leading-relaxed print:text-[9.5pt]">
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
  );
}
