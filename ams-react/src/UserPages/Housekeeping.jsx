import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axiosConfig';
import { useLang } from '../config/i18n';
import { SkeletonList } from '../Components/tenant/Skeleton';
import InlineAlert from '../Components/InlineAlert';

const DAY_ORDER = ['Every day', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// The garbage and housekeeping schedule the admin posts in Settings -> House Rules.
export default function Housekeeping() {
  const { t } = useLang();
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    api.get('get_system_settings.php')
      .then(({ data }) => {
        if (!alive) return;
        let list;
        try { list = JSON.parse(data?.settings?.garbage_schedule || data?.garbage_schedule || '[]'); } catch { list = []; }
        setRows(Array.isArray(list) ? [...list].sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day)) : []);
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="w-full min-h-[calc(100vh-76px)] bg-slate-50 py-6 sm:py-10 px-4 md:px-12 box-border flex flex-col items-center text-left">
      <div className="w-full max-w-3xl">
        <Link to="/my-room" className="inline-flex min-h-[44px] items-center py-1 text-sm font-medium text-slate-600 no-underline hover:text-slate-900">{t('common.backToMyRoom')}</Link>
        <h1 className="m-0 mt-1 text-2xl font-extrabold text-slate-900">{t('housekeeping.title')}</h1>
        <p className="m-0 mt-2 mb-6 text-sm text-slate-600">{t('housekeeping.subtext')}</p>
        {failed && <InlineAlert>{t('common.loadFailed')}</InlineAlert>}
        {!failed && rows === null && <SkeletonList rows={4} label={t('common.loading')} />}
        {rows !== null && rows.length === 0 && (
          <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700">{t('housekeeping.none')}</p>
        )}
        {rows !== null && rows.length > 0 && (
          <ul className="m-0 list-none space-y-2 p-0">
            {rows.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-4">
                <span className="text-base font-bold text-slate-900">{r.day}</span>
                <span className="text-sm text-slate-800">{r.what}</span>
                <span className="text-sm text-slate-600">{r.time || ''}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
