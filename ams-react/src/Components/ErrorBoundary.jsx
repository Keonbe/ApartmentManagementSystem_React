import { Component } from 'react';
import { t } from '../config/i18n';

// Catches a render error below it so one broken page shows a message and a way
// out instead of a blank screen (audit 4.2). Hooks cannot catch render errors,
// so this is a class; it uses the plain t() because it cannot call useLang.
//
// `resetKey` (the route path in App.jsx) clears the error when it changes, so
// moving to another page works without a reload.
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('Page error:', error);
  }

  componentDidUpdate(prev) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const home = import.meta.env.BASE_URL || '/';
    return (
      <div role="alert" className="flex min-h-[60vh] w-full flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900">{t('common.errorTitle')}</h1>
        <p className="mt-2 max-w-md text-slate-600">{t('common.errorBody')}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => this.setState({ failed: false })}
            className="inline-flex min-h-[44px] items-center rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            {t('common.retry')}
          </button>
          <a
            href={home}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 no-underline hover:bg-slate-50"
          >
            {t('common.goHome')}
          </a>
        </div>
      </div>
    );
  }
}
