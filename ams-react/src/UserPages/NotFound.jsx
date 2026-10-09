import { Link } from 'react-router-dom';

// Catch-all route (audit L8): unknown paths used to render a blank page.
export default function NotFound() {
  const user = JSON.parse(sessionStorage.getItem('loggedInUser') || localStorage.getItem('loggedInUser') || 'null');
  const home = user?.role === 'admin' ? '/admin-dashboard' : '/home';

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="text-sm font-semibold text-indigo-600">404</p>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-2 max-w-md text-slate-500">The page you're looking for doesn't exist or has moved.</p>
      <Link to={home} className="mt-6 inline-flex rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white no-underline hover:bg-indigo-700">
        Go to {user?.role === 'admin' ? 'the dashboard' : 'the home page'}
      </Link>
    </div>
  );
}
