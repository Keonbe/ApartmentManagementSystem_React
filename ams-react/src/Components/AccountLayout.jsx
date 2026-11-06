import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserCog, faHistory, faMoneyBillTransfer } from '@fortawesome/free-solid-svg-icons';
import { useLang } from '../config/i18n';
import { fileUrl } from '../api/fileUrl';
import { PROFILE_UPDATED_EVENT } from '../config/appEvents';
import '../assets/styles/account.css';

const readUser = () => {
    try {
        return JSON.parse(sessionStorage.getItem('loggedInUser') || localStorage.getItem('loggedInUser') || '{}') || {};
    } catch {
        return {};
    }
};

// The account area: Profile Settings, Payment History and My Refunds share this
// shell (App.jsx), with a side menu on large screens and a tab strip on phones.
// Same width as the Preview page (max-w-7xl).
export default function AccountLayout({ hasRentedRoom, children }) {
    const { t } = useLang();
    const [user, setUser] = useState(readUser);
    const [imgFailed, setImgFailed] = useState(false);

    useEffect(() => {
        const sync = () => { setUser(readUser()); setImgFailed(false); };
        window.addEventListener(PROFILE_UPDATED_EVENT, sync);
        return () => window.removeEventListener(PROFILE_UPDATED_EVENT, sync);
    }, []);

    // Payment History is a tenant page (TenantProtectedRoute); admins may browse it too.
    const showHistory = hasRentedRoom || user.role === 'admin';
    const items = [
        { to: '/profile-settings', label: t('topbar.profileSettings'), icon: faUserCog },
        showHistory && { to: '/payment-history', label: t('topbar.paymentHistory'), icon: faHistory },
        { to: '/my-refunds', label: t('topbar.myRefunds'), icon: faMoneyBillTransfer },
    ].filter(Boolean);

    const name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    const initials = `${(user.first_name || '').charAt(0)}${(user.last_name || '').charAt(0)}`.toUpperCase() || '?';

    return (
        <div className="account-root w-full min-h-[calc(100vh-76px)] bg-slate-50 px-4 py-6 sm:py-10 md:px-8 box-border">
            <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start text-left">
                <aside className="lg:col-span-3 lg:sticky lg:top-24 min-w-0">
                    {/* Who is signed in (large screens) */}
                    <div className="hidden lg:flex items-center gap-3 mb-4 p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
                        {user.avatar_url && !imgFailed ? (
                            <img
                                src={fileUrl(user.avatar_url)}
                                alt=""
                                onError={() => setImgFailed(true)}
                                className="w-11 h-11 rounded-full object-cover border border-slate-200 shrink-0"
                            />
                        ) : (
                            <span className="w-11 h-11 rounded-full bg-brand text-white flex items-center justify-center text-sm font-black tracking-wider shrink-0">{initials}</span>
                        )}
                        <div className="min-w-0">
                            <p className="m-0 text-sm font-bold text-slate-900 truncate">{name || t('account.title')}</p>
                            <p className="m-0 text-xs text-slate-500 truncate">{user.email_address}</p>
                        </div>
                    </div>

                    {/* Side menu on large screens, a scrollable tab strip on phones/tablets */}
                    <nav aria-label={t('account.title')} className="account-nav rounded-2xl bg-white border border-slate-200/80 shadow-sm p-1.5 lg:p-2">
                        <p className="hidden lg:block m-0 px-3 pt-2 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">{t('account.title')}</p>
                        <ul className="m-0 p-0 list-none flex lg:flex-col gap-1 overflow-x-auto">
                            {items.map((item) => (
                                <li key={item.to} className="shrink-0 lg:shrink">
                                    <NavLink
                                        to={item.to}
                                        className={({ isActive }) => `flex items-center gap-2.5 min-h-[44px] px-3.5 rounded-xl text-sm font-semibold no-underline whitespace-nowrap transition-colors ${
                                            isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
                                    >
                                        {({ isActive }) => (
                                            <>
                                                <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs shrink-0 ${isActive ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                                    <FontAwesomeIcon icon={item.icon} aria-hidden="true" />
                                                </span>
                                                {item.label}
                                            </>
                                        )}
                                    </NavLink>
                                </li>
                            ))}
                        </ul>
                    </nav>
                </aside>

                <div className="lg:col-span-9 min-w-0">{children}</div>
            </div>
        </div>
    );
}
