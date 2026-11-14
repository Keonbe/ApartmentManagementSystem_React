import { useState } from 'react';
import { X } from 'lucide-react';
import Modal from './admin/Modal';
import { LEGAL } from '../config/legalContent';
import { useLang } from '../config/i18n';
import { useTheme } from '../config/theme';

const DOCS = ['terms', 'privacy'];

// The Terms of Service / Privacy Notice pop-up (text: config/legalContent.js).
// Render it only while open; `initialDoc` picks the starting tab.
export function LegalContent({ doc = 'privacy', className = '' }) {
  const { lang } = useLang();
  const texts = LEGAL[lang] || LEGAL.en;
  const current = texts[doc];

  return (
    <div className={`overflow-y-auto text-[13px] leading-relaxed text-slate-700 space-y-3 ${className}`}>
      <h2 className="text-lg font-bold text-slate-900 m-0">{current.title}</h2>
      <p className="text-[11px] text-slate-500 m-0">{current.updated}</p>
      <p className="m-0">{current.intro}</p>
      {current.sections.map((s, i) => (
        <section key={i} className="space-y-2">
          {s.h && <h3 className="text-sm font-bold text-slate-900 m-0 pt-2">{s.h}</h3>}
          {s.p?.map((para, j) => <p key={j} className="m-0">{para}</p>)}
          {s.li && <ul className="m-0 pl-5 space-y-1 list-disc">{s.li.map((item, j) => <li key={j}>{item}</li>)}</ul>}
        </section>
      ))}
    </div>
  );
}

export default function LegalModal({ initialDoc = 'terms', onClose }) {
  const { lang, t } = useLang();
  const { theme } = useTheme();
  const [doc, setDoc] = useState(initialDoc);
  const texts = LEGAL[lang] || LEGAL.en;
  const current = texts[doc];

  return (
    <Modal
      title={current.title}
      onClose={onClose}
      className={`ut-root ${theme === 'dark' || theme === 'glass' ? `ut-${theme}` : 'ut-light'} bg-white rounded-dialog shadow-dialog w-full max-w-2xl mx-4 overflow-hidden flex flex-col max-h-[85vh]`}
    >
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-100 bg-white">
        <div role="tablist" className="flex gap-1">
          {DOCS.map((d) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={doc === d}
              onClick={() => setDoc(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border-0 cursor-pointer transition-colors ${doc === d ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              {texts[d].title}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} aria-label={t('legal.close')} className="p-1.5 rounded-lg bg-transparent border-0 text-slate-600 hover:bg-slate-100 cursor-pointer">
          <X size={18} />
        </button>
      </div>

      <div role="tabpanel" className="px-5 py-4 overflow-y-auto bg-white">
        <LegalContent doc={doc} />
      </div>

      <div className="px-5 py-3 border-t border-slate-100 flex justify-end">
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold border-0 cursor-pointer">
          {t('legal.close')}
        </button>
      </div>
    </Modal>
  );
}
