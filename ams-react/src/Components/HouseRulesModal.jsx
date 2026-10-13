import { useEffect, useState } from 'react';
import { BookOpen, LoaderCircle, X } from 'lucide-react';
import api from '../api/axiosConfig';
import { useLang } from '../config/i18n';

export default function HouseRulesModal({ isOpen, onClose }) {
  const { lang, t } = useLang();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    const request = Promise.resolve().then(() => {
      if (cancelled) return null;
      setLoading(true);
      setError('');
      // House rules plus the children and pets policy.
      return Promise.all([
        api.get('house_rules.php'),
        api.get('house_rules.php', { params: { scope: 'minors' } }).catch(() => ({ data: {} })),
      ]);
    });
    request
      .then((response) => {
        if (!response) return;
        const list = (r) => (r.data?.success && Array.isArray(r.data.rules) ? r.data.rules : []);
        if (!cancelled) setRules([...list(response[0]), ...list(response[1])]);
      })
      .catch(() => { if (!cancelled) setError(t('houseRules.loadError')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, t]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="house-rules-title" className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <header className="flex items-center justify-between gap-4 bg-[#3b4276] px-6 py-5 text-white sm:px-8">
          <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15"><BookOpen className="h-5 w-5" /></span><div><h2 id="house-rules-title" className="m-0 text-xl font-black">{t('houseRules.title')}</h2></div></div>
          <button type="button" onClick={onClose} aria-label={t('houseRules.closeAria')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-white/15 text-white hover:bg-white/25"><X className="h-5 w-5" /></button>
        </header>
        <div className="max-h-[65vh] space-y-3 overflow-y-auto p-4 sm:p-6">
          {loading && <div className="flex items-center justify-center gap-2 py-12 text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> {t('houseRules.loading')}</div>}
          {!loading && error && <p role="alert" className="m-0 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
          {!loading && !error && rules.map((rule) => (
            <article key={rule.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <h3 className="m-0 text-sm font-semibold text-slate-800">{lang === 'fil' && rule.title_fil?.trim() ? rule.title_fil : rule.title}</h3>
              <p className="mb-0 mt-1 whitespace-pre-line text-xs leading-relaxed text-slate-600">{lang === 'fil' && rule.description_fil?.trim() ? rule.description_fil : rule.description}</p>
            </article>
          ))}
          {!loading && !error && rules.length === 0 && <p className="m-0 py-10 text-center text-sm text-slate-500">{t('houseRules.empty')}</p>}
        </div>
        <footer className="flex justify-end border-t border-slate-100 px-5 py-4 sm:px-8"><button type="button" onClick={onClose} className="rounded-xl border-0 bg-[#3b4276] px-6 py-3 text-sm font-bold text-white hover:bg-[#30365f]">{t('houseRules.close')}</button></footer>
      </section>
    </div>
  );
}