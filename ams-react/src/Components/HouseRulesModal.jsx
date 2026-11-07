import { useEffect } from 'react';
import { BookOpen, LoaderCircle, X } from 'lucide-react';
import useAllRules from '../hooks/useAllRules';
import RulesGroups from './RulesGroups';
import { useLang } from '../config/i18n';

export default function HouseRulesModal({ isOpen, onClose, rules: providedRules, loading: providedLoading, error: providedError }) {
  const { t } = useLang();
  // House rules, children and pets, and parking, fetched only while the modal is open.
  const fetched = useAllRules(isOpen && providedRules === undefined);
  const rules = providedRules ?? fetched.rules;
  const loading = providedLoading ?? fetched.loading;
  const error = providedError ?? fetched.error;

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="house-rules-title" className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <header className="ut-native flex items-center justify-between gap-4 bg-brand px-6 py-5 text-white sm:px-8">
          <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15"><BookOpen className="h-5 w-5" /></span><div><h2 id="house-rules-title" className="m-0 text-xl font-black">{t('houseRules.title')}</h2></div></div>
          <button type="button" onClick={onClose} aria-label={t('houseRules.closeAria')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-white/15 text-white hover:bg-white/25"><X className="h-5 w-5" /></button>
        </header>
        <div className="max-h-[65vh] space-y-5 overflow-y-auto p-4 sm:p-6">
          {loading && <div className="flex items-center justify-center gap-2 py-12 text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> {t('houseRules.loading')}</div>}
          {!loading && error && <p role="alert" className="m-0 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{t('houseRules.loadError')}</p>}
          {!loading && !error && <RulesGroups rules={rules} />}
          {!loading && !error && rules.length === 0 && <p className="m-0 py-10 text-center text-sm text-slate-500">{t('houseRules.empty')}</p>}
        </div>
        <footer className="flex justify-end border-t border-slate-100 px-5 py-4 sm:px-8"><button type="button" onClick={onClose} className="rounded-xl border-0 bg-brand px-6 py-3 text-sm font-bold text-white hover:bg-[#30365f]">{t('houseRules.close')}</button></footer>
      </section>
    </div>
  );
}
