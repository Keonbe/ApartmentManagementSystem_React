import { Component } from 'react';
import { t } from '../config/i18n';
import { readStoredUser } from '../utils/readStoredUser';

// Catches a render error below it so one broken page shows a message and a way
// out instead of a blank screen (audit 4.2). Hooks cannot catch render errors,
// so this is a class; it uses the plain t() because it cannot call useLang.
//
// `resetKey` (the route path in App.jsx) clears the error when it changes, so
// moving to another page works without a reload.
//
// An admin's way out is the Dashboard (not the tenant Home page), and an admin
// also sees the error's message, so a crash can be reported precisely.
export default class ErrorBoundary extends Component {
  state = { failed: false, message: '' };

  static getDerivedStateFromError(error) {
    return { failed: true, message: String(error?.message || error || '') };
  }

  componentDidCatch(error) {
    console.error('Page error:', error);
  }

  componentDidUpdate(prev) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) {
      this.setState({ failed: false, message: '' });
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const base = import.meta.env.BASE_URL || '/';
    const isAdmin = readStoredUser()?.role === 'admin';
    const home = isAdmin ? `${base.replace(/\/$/, '')}/admin-dashboard` : base;
    return (
      <div role="alert" className="flex min-h-[60vh] w-full flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900">{t('common.errorTitle')}</h1>
        <p className="mt-2 max-w-md text-slate-600">{t('common.errorBody')}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => this.setState({ failed: false, message: '' })}
            className="inline-flex min-h-[44px] items-center rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            {t('common.retry')}
          </button>
          <a
            href={home}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 no-underline hover:bg-slate-50"
          >
            {isAdmin ? 'Go to the dashboard' : t('common.goHome')}
          </a>
        </div>
        {isAdmin && this.state.message && (
          <details className="mt-6 max-w-lg text-left text-sm text-slate-500">
            <summary className="cursor-pointer font-semibold text-slate-600">Technical details</summary>
            <p className="mt-2 break-words rounded-lg bg-slate-100 p-3 font-mono text-xs text-slate-700">{this.state.message}</p>
            <p className="mt-2 text-xs">Page: {typeof window !== 'undefined' ? window.location.pathname + window.location.search : ''}</p>
          </details>
        )}
      </div>
    );
  }
}
