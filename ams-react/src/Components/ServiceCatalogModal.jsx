import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faBroom, faTshirt, faConciergeBell } from '@fortawesome/free-solid-svg-icons';

const CATEGORIES = [
    { value: 'cleaning', label: 'Cleaning' },
    { value: 'laundry', label: 'Laundry' },
    { value: 'other', label: 'Other' },
];

const PRICING_UNITS = [
    { value: 'session', label: 'per session' },
    { value: 'kg', label: 'per kilogram' },
    { value: 'hour', label: 'per hour' },
    { value: 'item', label: 'per item' },
];

const ICON_CHOICES = [
    { value: 'faBroom', label: 'Broom', icon: faBroom },
    { value: 'faTshirt', label: 'Garment', icon: faTshirt },
    { value: 'faConciergeBell', label: 'Concierge Bell', icon: faConciergeBell },
];

//IconsPerCategorySoANewRowGetsASensibleDefault
const DEFAULT_ICON = { cleaning: 'faBroom', laundry: 'faTshirt', other: 'faConciergeBell' };

const EMPTY = {
    category: 'cleaning',
    name: '',
    description: '',
    price: '',
    pricingUnit: 'session',
    minQuantity: 1,
    maxQuantity: '',
    leadTimeDays: 1,
    icon: 'faBroom',
    isActive: true,
    sortOrder: 0,
};

//Seeds the form from an existing catalog row, or from EMPTY when creating.
const seedFrom = (service) => service
    ? {
        category: service.category,
        name: service.name,
        description: service.description || '',
        price: service.price,
        pricingUnit: service.pricingUnit,
        minQuantity: service.minQuantity,
        maxQuantity: service.maxQuantity ?? '',
        leadTimeDays: service.leadTimeDays,
        icon: service.icon || DEFAULT_ICON[service.category] || 'faConciergeBell',
        isActive: !!service.isActive,
        sortOrder: service.sortOrder ?? 0,
    }
    : EMPTY;

// The parent passes a `key` that changes per edit target, so the component
// remounts with a fresh seed instead of syncing props into state via an effect.
export default function ServiceCatalogModal({ isOpen, service, onClose, onSave, saving }) {
    const [form, setForm] = useState(() => seedFrom(service));
    const [error, setError] = useState(null);

    if (!isOpen) return null;

    const set = (field) => (e) => {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setForm(prev => {
            const next = { ...prev, [field]: value };
            //ChangingCategorySwapsTheIconUnlessTheAdminPickedOneDeliberately
            if (field === 'category' && prev.icon === DEFAULT_ICON[prev.category]) {
                next.icon = DEFAULT_ICON[value] || 'faConciergeBell';
            }
            //SessionPricedServicesAreAlwaysASingleVisit
            if (field === 'pricingUnit' && value === 'session') {
                next.minQuantity = 1;
                next.maxQuantity = 1;
            }
            //LeavingSessionPricingMustNotKeepTheForcedMaximumOfOne
            if (field === 'pricingUnit' && prev.pricingUnit === 'session' && value !== 'session') {
                next.maxQuantity = '';
            }
            return next;
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setError(null);

        if (!form.name.trim()) return setError('Service name is required.');
        if (form.price === '' || Number(form.price) < 0) return setError('Price must be zero or greater.');
        if (Number(form.minQuantity) <= 0) return setError('Minimum quantity must be greater than zero.');
        if (form.maxQuantity !== '' && Number(form.maxQuantity) < Number(form.minQuantity)) {
            return setError('Maximum quantity cannot be less than the minimum.');
        }

        onSave({
            ...form,
            price: Number(form.price),
            minQuantity: Number(form.minQuantity),
            maxQuantity: form.maxQuantity === '' ? null : Number(form.maxQuantity),
            leadTimeDays: Number(form.leadTimeDays),
            sortOrder: Number(form.sortOrder),
        });
    };

    const inputClass = "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500";
    const labelClass = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";
    const isSession = form.pricingUnit === 'session';

    return (
        <div
            onClick={onClose}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md"
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
            >
                {/*ModalHeader*/}
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                    <div>
                        <h3 className="m-0 text-lg font-semibold text-slate-800">
                            {service ? 'Edit Service' : 'Add Service'}
                        </h3>
                        <p className="m-0 mt-1 text-xs text-slate-500">
                            Priced add-on services tenants can book from their portal.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="cursor-pointer border-0 bg-transparent p-2 text-slate-400 hover:text-slate-700"
                    >
                        <FontAwesomeIcon icon={faTimes} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2">

                    <div>
                        <label className={labelClass}>Category</label>
                        <select value={form.category} onChange={set('category')} className={inputClass}>
                            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className={labelClass}>Icon</label>
                        <select value={form.icon} onChange={set('icon')} className={inputClass}>
                            {ICON_CHOICES.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                        </select>
                    </div>

                    <div className="sm:col-span-2">
                        <label className={labelClass}>Service Name</label>
                        <input
                            type="text"
                            value={form.name}
                            onChange={set('name')}
                            placeholder="e.g. Standard Unit Cleaning"
                            className={inputClass}
                            required
                        />
                    </div>

                    <div className="sm:col-span-2">
                        <label className={labelClass}>Description</label>
                        <textarea
                            rows={3}
                            value={form.description}
                            onChange={set('description')}
                            placeholder="What the tenant gets for this fee."
                            className={`${inputClass} resize-none`}
                        />
                    </div>

                    <div>
                        <label className={labelClass}>Price (₱)</label>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={form.price}
                            onChange={set('price')}
                            className={inputClass}
                            required
                        />
                    </div>

                    <div>
                        <label className={labelClass}>Charged</label>
                        <select value={form.pricingUnit} onChange={set('pricingUnit')} className={inputClass}>
                            {PRICING_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className={labelClass}>Minimum Quantity</label>
                        <input
                            type="number"
                            step="any"
                            min="0.01"
                            value={form.minQuantity}
                            onChange={set('minQuantity')}
                            disabled={isSession}
                            className={`${inputClass} disabled:bg-slate-100 disabled:text-slate-400`}
                        />
                    </div>

                    <div>
                        <label className={labelClass}>Maximum Quantity</label>
                        <input
                            type="number"
                            step="any"
                            min="0.01"
                            value={form.maxQuantity}
                            onChange={set('maxQuantity')}
                            disabled={isSession}
                            placeholder="No limit"
                            className={`${inputClass} disabled:bg-slate-100 disabled:text-slate-400`}
                        />
                    </div>

                    <div>
                        <label className={labelClass}>Lead Time (days)</label>
                        <input
                            type="number"
                            min="0"
                            value={form.leadTimeDays}
                            onChange={set('leadTimeDays')}
                            className={inputClass}
                        />
                        <p className="m-0 mt-1 text-[11px] text-slate-400">Earliest date a tenant may book.</p>
                    </div>

                    <div>
                        <label className={labelClass}>Sort Order</label>
                        <input
                            type="number"
                            value={form.sortOrder}
                            onChange={set('sortOrder')}
                            className={inputClass}
                        />
                        <p className="m-0 mt-1 text-[11px] text-slate-400">Lower numbers appear first.</p>
                    </div>

                    <div className="flex items-center gap-3 sm:col-span-2">
                        <input
                            type="checkbox"
                            id="catalog-active-checkbox"
                            checked={form.isActive}
                            onChange={set('isActive')}
                            className="h-4 w-4 cursor-pointer accent-indigo-600"
                        />
                        <label htmlFor="catalog-active-checkbox" className="cursor-pointer text-sm font-medium text-slate-600">
                            Bookable by tenants
                        </label>
                    </div>

                    {error && (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 sm:col-span-2">
                            <p className="m-0 text-sm font-medium text-red-700">{error}</p>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 border-t border-slate-100 pt-4 sm:col-span-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="cursor-pointer rounded-lg border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="cursor-pointer rounded-lg border-0 bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {saving ? 'Saving...' : service ? 'Save Changes' : 'Create Service'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
