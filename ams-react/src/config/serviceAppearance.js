import {
    faFileInvoiceDollar,
    faCreditCard,
    faReceipt,
    faMoneyBillWave,
    faParking,
    faCar,
    faMotorcycle,
    faWrench,
    faTools,
    faBolt,
    faFaucet,
    faLightbulb,
    faVideo,
    faCamera,
    faShieldAlt,
    faLock,
    faKey,
    faIdBadge,
    faUserCheck,
    faUsers,
    faConciergeBell,
    faBroom,
    faTshirt,
    faListAlt,
    faClipboardList,
    faBullhorn,
    faBell,
    faHistory,
} from '@fortawesome/free-solid-svg-icons';

// 1. Curated List of 10 Modern Preset Colors
export const COLOR_PRESETS = {
    emerald: {
        id: 'emerald',
        name: 'Emerald Green',
        hex: '#059669',
        bgLight: 'bg-emerald-50',
        borderLight: 'border-emerald-200',
        text: 'text-emerald-600',
        badge: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
        btn: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20',
        hoverBorder: 'hover:border-emerald-300',
        ring: 'focus-visible:ring-emerald-500',
    },
    indigo: {
        id: 'indigo',
        name: 'Classic Indigo',
        hex: '#4f46e5',
        bgLight: 'bg-indigo-50',
        borderLight: 'border-indigo-200',
        text: 'text-indigo-600',
        badge: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
        btn: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/20',
        hoverBorder: 'hover:border-indigo-300',
        ring: 'focus-visible:ring-indigo-500',
    },
    sky: {
        id: 'sky',
        name: 'Sky Blue',
        hex: '#0284c7',
        bgLight: 'bg-sky-50',
        borderLight: 'border-sky-200',
        text: 'text-sky-600',
        badge: 'bg-sky-50 text-sky-700 border-sky-200/80',
        btn: 'bg-sky-600 hover:bg-sky-700 text-white shadow-sky-600/20',
        hoverBorder: 'hover:border-sky-300',
        ring: 'focus-visible:ring-sky-500',
    },
    amber: {
        id: 'amber',
        name: 'Amber Orange',
        hex: '#d97706',
        bgLight: 'bg-amber-50',
        borderLight: 'border-amber-200',
        text: 'text-amber-600',
        badge: 'bg-amber-50 text-amber-800 border-amber-200/80',
        btn: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/20',
        hoverBorder: 'hover:border-amber-300',
        ring: 'focus-visible:ring-amber-500',
    },
    rose: {
        id: 'rose',
        name: 'Rose Red',
        hex: '#e11d48',
        bgLight: 'bg-rose-50',
        borderLight: 'border-rose-200',
        text: 'text-rose-600',
        badge: 'bg-rose-50 text-rose-700 border-rose-200/80',
        btn: 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20',
        hoverBorder: 'hover:border-rose-300',
        ring: 'focus-visible:ring-rose-500',
    },
    purple: {
        id: 'purple',
        name: 'Violet Purple',
        hex: '#7c3aed',
        bgLight: 'bg-purple-50',
        borderLight: 'border-purple-200',
        text: 'text-purple-600',
        badge: 'bg-purple-50 text-purple-700 border-purple-200/80',
        btn: 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-600/20',
        hoverBorder: 'hover:border-purple-300',
        ring: 'focus-visible:ring-purple-500',
    },
    teal: {
        id: 'teal',
        name: 'Ocean Teal',
        hex: '#0d9488',
        bgLight: 'bg-teal-50',
        borderLight: 'border-teal-200',
        text: 'text-teal-600',
        badge: 'bg-teal-50 text-teal-700 border-teal-200/80',
        btn: 'bg-teal-600 hover:bg-teal-700 text-white shadow-teal-600/20',
        hoverBorder: 'hover:border-teal-300',
        ring: 'focus-visible:ring-teal-500',
    },
    cyan: {
        id: 'cyan',
        name: 'Cyan Blue',
        hex: '#0891b2',
        bgLight: 'bg-cyan-50',
        borderLight: 'border-cyan-200',
        text: 'text-cyan-600',
        badge: 'bg-cyan-50 text-cyan-700 border-cyan-200/80',
        btn: 'bg-cyan-600 hover:bg-cyan-700 text-white shadow-cyan-600/20',
        hoverBorder: 'hover:border-cyan-300',
        ring: 'focus-visible:ring-cyan-500',
    },
    pink: {
        id: 'pink',
        name: 'Vibrant Pink',
        hex: '#db2777',
        bgLight: 'bg-pink-50',
        borderLight: 'border-pink-200',
        text: 'text-pink-600',
        badge: 'bg-pink-50 text-pink-700 border-pink-200/80',
        btn: 'bg-pink-600 hover:bg-pink-700 text-white shadow-pink-600/20',
        hoverBorder: 'hover:border-pink-300',
        ring: 'focus-visible:ring-pink-500',
    },
    slate: {
        id: 'slate',
        name: 'Neutral Slate',
        hex: '#475569',
        bgLight: 'bg-slate-100',
        borderLight: 'border-slate-300',
        text: 'text-slate-700',
        badge: 'bg-slate-100 text-slate-700 border-slate-300',
        btn: 'bg-slate-700 hover:bg-slate-800 text-white shadow-slate-700/20',
        hoverBorder: 'hover:border-slate-400',
        ring: 'focus-visible:ring-slate-500',
    },
};

// 2. Curated List of Preset FontAwesome Icons
export const ICON_PRESETS = [
    // Billing & Finance
    { id: 'faFileInvoiceDollar', icon: faFileInvoiceDollar, label: 'Invoice / Dollar', category: 'Billing' },
    { id: 'faCreditCard', icon: faCreditCard, label: 'Credit Card', category: 'Billing' },
    { id: 'faReceipt', icon: faReceipt, label: 'Receipt', category: 'Billing' },
    { id: 'faMoneyBillWave', icon: faMoneyBillWave, label: 'Cash Flow', category: 'Billing' },

    // Parking & Transportation
    { id: 'faCar', icon: faCar, label: 'Car', category: 'Vehicle' },
    { id: 'faParking', icon: faParking, label: 'Parking Sign', category: 'Vehicle' },
    { id: 'faMotorcycle', icon: faMotorcycle, label: 'Motorcycle', category: 'Vehicle' },

    // Maintenance & Utilities
    { id: 'faWrench', icon: faWrench, label: 'Wrench', category: 'Repairs' },
    { id: 'faTools', icon: faTools, label: 'Tools', category: 'Repairs' },
    { id: 'faBolt', icon: faBolt, label: 'Electrical / Bolt', category: 'Repairs' },
    { id: 'faFaucet', icon: faFaucet, label: 'Plumbing / Water', category: 'Repairs' },
    { id: 'faLightbulb', icon: faLightbulb, label: 'Lightbulb', category: 'Repairs' },

    // Security & Safety
    { id: 'faVideo', icon: faVideo, label: 'CCTV Camera', category: 'Security' },
    { id: 'faCamera', icon: faCamera, label: 'Snapshot Camera', category: 'Security' },
    { id: 'faShieldAlt', icon: faShieldAlt, label: 'Security Shield', category: 'Security' },
    { id: 'faLock', icon: faLock, label: 'Padlock', category: 'Security' },
    { id: 'faKey', icon: faKey, label: 'Key', category: 'Security' },

    // Visitors & Access
    { id: 'faIdBadge', icon: faIdBadge, label: 'ID Badge', category: 'Visitors' },
    { id: 'faUserCheck', icon: faUserCheck, label: 'Approved Guest', category: 'Visitors' },
    { id: 'faUsers', icon: faUsers, label: 'Group / Guests', category: 'Visitors' },

    // Services & Cleaning
    { id: 'faConciergeBell', icon: faConciergeBell, label: 'Concierge Bell', category: 'Services' },
    { id: 'faBroom', icon: faBroom, label: 'Cleaning Broom', category: 'Services' },
    { id: 'faTshirt', icon: faTshirt, label: 'Laundry / Clothes', category: 'Services' },

    // Records & Tasks
    { id: 'faListAlt', icon: faListAlt, label: 'Request List', category: 'Records' },
    { id: 'faClipboardList', icon: faClipboardList, label: 'Clipboard', category: 'Records' },

    // Announcements & Memos
    { id: 'faBullhorn', icon: faBullhorn, label: 'Megaphone', category: 'Memos' },
    { id: 'faBell', icon: faBell, label: 'Notification Bell', category: 'Memos' },

    // History
    { id: 'faHistory', icon: faHistory, label: 'History Clock', category: 'Records' },
];

export const ICON_MAP = ICON_PRESETS.reduce((acc, item) => {
    acc[item.id] = item.icon;
    return acc;
}, {});

// 3. Default Visual Appearance by Service ID
export const DEFAULT_SERVICE_APPEARANCE = {
    'pay-bills': { color: 'emerald', icon: 'faFileInvoiceDollar' },
    parking: { color: 'sky', icon: 'faCar' },
    maintenance: { color: 'amber', icon: 'faWrench' },
    cctv: { color: 'purple', icon: 'faVideo' },
    'visitor-management': { color: 'rose', icon: 'faIdBadge' },
    cleaning: { color: 'sky', icon: 'faBroom' },
    laundry: { color: 'cyan', icon: 'faTshirt' },
    'other-services': { color: 'purple', icon: 'faConciergeBell' },
    addons: { color: 'indigo', icon: 'faConciergeBell' },
    'my-requests': { color: 'sky', icon: 'faListAlt' },
    announcements: { color: 'teal', icon: 'faBullhorn' },
    'payment-history': { color: 'slate', icon: 'faHistory' },
};

// 4. Helper to resolve effective appearance from system settings
export function parseServiceAppearance(rawSetting) {
    if (!rawSetting) return {};
    if (typeof rawSetting === 'object') return rawSetting;
    try {
        const parsed = JSON.parse(rawSetting);
        return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
        return {};
    }
}

export function getServiceAppearance(serviceId, settings) {
    const rawSetting = settings?.service_appearance;
    const customMap = parseServiceAppearance(rawSetting);
    const custom = customMap[serviceId] || {};
    const fallback = DEFAULT_SERVICE_APPEARANCE[serviceId] || { color: 'indigo', icon: 'faConciergeBell' };

    const colorKey = custom.color && COLOR_PRESETS[custom.color] ? custom.color : fallback.color;
    const iconKey = custom.icon && ICON_MAP[custom.icon] ? custom.icon : fallback.icon;

    return {
        colorKey,
        iconKey,
        colorConfig: COLOR_PRESETS[colorKey] || COLOR_PRESETS.indigo,
        icon: ICON_MAP[iconKey] || faConciergeBell,
    };
}

