import { Link } from 'react-router-dom';
import { useLang } from '../config/i18n';

// Catch-all route (audit L8): unknown paths used to render a blank page.
export default function NotFound() {
  const { t } = useLang();
  const user = JSON.parse(sessionStorage.getItem('loggedInUser') || localStorage.getItem('loggedInUser') || 'null');
  const home = user?.role === 'admin' ? '/admin-dashboard' : '/home';

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="text-sm font-semibold text-indigo-600">404</p>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">{t('notFound.title')}</h1>
      <p className="mt-2 max-w-md text-slate-500">{t('notFound.body')}</p>
      <Link to={home} className="mt-6 inline-flex min-h-[44px] items-center rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white no-underline hover:bg-indigo-700">
        {user?.role === 'admin' ? t('notFound.goDashboard') : t('notFound.goHome')}
      </Link>
    </div>
  );
}
