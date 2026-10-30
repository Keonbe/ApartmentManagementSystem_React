import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faTimes,
    faCheck,
    faUndo,
    faSave,
    faSpinner,
    faArrowRight,
} from '@fortawesome/free-solid-svg-icons';
import {
    COLOR_PRESETS,
    ICON_PRESETS,
    ICON_MAP,
    DEFAULT_SERVICE_APPEARANCE,
} from '../config/serviceAppearance';

export default function ServiceAppearanceModal({
    isOpen,
    onClose,
    service,
    currentAppearance,
    onSave,
}) {
    const fallback = DEFAULT_SERVICE_APPEARANCE[service?.id] || {
        color: 'indigo',
        icon: 'faConciergeBell',
    };
    const [selectedColor, setSelectedColor] = useState(currentAppearance?.colorKey || fallback.color);
    const [selectedIcon, setSelectedIcon] = useState(currentAppearance?.iconKey || fallback.icon);
    const [iconCategory, setIconCategory] = useState('All');
    const [saving, setSaving] = useState(false);

    if (!isOpen || !service) return null;

    const colorConfig = COLOR_PRESETS[selectedColor] || COLOR_PRESETS.indigo;
    const activeFaIcon = ICON_MAP[selectedIcon] || ICON_MAP.faConciergeBell;

    // Filter icons by category
    const categories = ['All', 'Billing', 'Vehicle', 'Repairs', 'Security', 'Visitors', 'Services', 'Records', 'Memos'];
    const filteredIcons = iconCategory === 'All'
        ? ICON_PRESETS
        : ICON_PRESETS.filter((item) => item.category === iconCategory);

    const handleReset = () => {
        const fallback = DEFAULT_SERVICE_APPEARANCE[service.id] || {
            color: 'indigo',
            icon: 'faConciergeBell',
        };
        setSelectedColor(fallback.color);
        setSelectedIcon(fallback.icon);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave({
                serviceId: service.id,
                color: selectedColor,
                icon: selectedIcon,
            });
            onClose();
        } catch (err) {
            console.error('Failed to save appearance:', err);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
            <div className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
                {/* Modal Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 m-0">Customize Service Appearance</h2>
                        <p className="text-xs text-slate-500 m-0 mt-0.5">
                            Editing appearance for <strong className="text-slate-800">{service.title}</strong>
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors border-0 cursor-pointer"
                        aria-label="Close"
                    >
                        <FontAwesomeIcon icon={faTimes} className="text-sm" />
                    </button>
                </div>

                {/* Modal Body (Scrollable) */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* 1. Live Tenant Card Preview */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                                Live Tenant Preview
                            </span>
                            <span className="text-[11px] text-slate-500">How residents see this service</span>
                        </div>

                        {/* Substantial preview card */}
                        <div className={`rounded-2xl border bg-white p-6 shadow-sm flex flex-col justify-between transition-all duration-200 border-slate-200 ${colorConfig.hoverBorder}`}>
                            <div className="space-y-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border shadow-2xs transition-transform ${colorConfig.bgLight} ${colorConfig.borderLight} ${colorConfig.text}`}>
                                        <FontAwesomeIcon icon={activeFaIcon} className="text-2xl" />
                                    </div>
                                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase border ${colorConfig.badge}`}>
                                        {colorConfig.name}
                                    </span>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-800 m-0">{service.title}</h3>
                                    <p className="text-xs text-slate-500 mt-1 m-0 leading-relaxed line-clamp-2">
                                        {service.description}
                                    </p>
                                </div>
                            </div>

                            <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between">
                                <span className="text-xs font-semibold text-slate-400">Resident Portal</span>
                                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold shadow-sm ${colorConfig.btn}`}>
                                    <span>Action</span>
                                    <FontAwesomeIcon icon={faArrowRight} className="text-[10px]" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 2. Preset Colors Picker */}
                    <div className="space-y-3">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                            Select Color Preset ({Object.keys(COLOR_PRESETS).length} Themes)
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                            {Object.values(COLOR_PRESETS).map((preset) => {
                                const isSelected = selectedColor === preset.id;
                                return (
                                    <button
                                        key={preset.id}
                                        type="button"
                                        onClick={() => setSelectedColor(preset.id)}
                                        className={`flex items-center gap-2.5 p-2 rounded-xl border text-left cursor-pointer transition-all ${
                                            isSelected
                                                ? 'border-indigo-600 bg-indigo-50/70 shadow-xs ring-2 ring-indigo-500/20'
                                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                                        }`}
                                    >
                                        <span
                                            className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 shadow-2xs text-white text-[10px]"
                                            style={{ backgroundColor: preset.hex }}
                                        >
                                            {isSelected && <FontAwesomeIcon icon={faCheck} />}
                                        </span>
                                        <span className="text-xs font-semibold text-slate-800 truncate">
                                            {preset.name}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* 3. Preset Icons Picker */}
                    <div className="space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                                Select Preset Icon ({ICON_PRESETS.length} Icons)
                            </label>
                            {/* Category Filter Pills */}
                            <div className="flex flex-wrap gap-1">
                                {categories.map((cat) => (
                                    <button
                                        key={cat}
                                        type="button"
                                        onClick={() => setIconCategory(cat)}
                                        className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors border cursor-pointer ${
                                            iconCategory === cat
                                                ? 'bg-indigo-600 text-white border-indigo-600'
                                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                        }`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Icon Selection Grid */}
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2 max-h-56 overflow-y-auto p-1 border border-slate-100 rounded-xl bg-slate-50/50">
                            {filteredIcons.map((item) => {
                                const isSelected = selectedIcon === item.id;
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => setSelectedIcon(item.id)}
                                        className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center cursor-pointer transition-all group ${
                                            isSelected
                                                ? 'bg-white border-indigo-600 ring-2 ring-indigo-500/30 shadow-xs text-indigo-600'
                                                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900'
                                        }`}
                                        title={item.label}
                                    >
                                        <FontAwesomeIcon icon={item.icon} className="text-lg mb-1 group-hover:scale-110 transition-transform" />
                                        <span className="text-[10px] font-medium leading-tight line-clamp-1 w-full text-center">
                                            {item.label}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50/80">
                    <button
                        type="button"
                        onClick={handleReset}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 border border-slate-200 bg-white cursor-pointer transition-colors"
                    >
                        <FontAwesomeIcon icon={faUndo} className="text-xs" />
                        <span>Reset Default</span>
                    </button>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={saving}
                            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200 bg-white cursor-pointer transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving}
                            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm cursor-pointer border-0 transition-colors disabled:opacity-50"
                        >
                            {saving ? (
                                <>
                                    <FontAwesomeIcon icon={faSpinner} className="animate-spin text-xs" />
                                    <span>Saving...</span>
                                </>
                            ) : (
                                <>
                                    <FontAwesomeIcon icon={faSave} className="text-xs" />
                                    <span>Save Appearance</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
