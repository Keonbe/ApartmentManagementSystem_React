import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faBroom, faTshirt, faConciergeBell } from '@fortawesome/free-solid-svg-icons';
import { LIMITS, MAX_AMOUNT, TITLE_MIN, checkAmount, checkIntRange, checkText } from '../utils/validation';
import useFieldErrors from '../hooks/useFieldErrors';
import FieldError from './form/FieldError';
import CharCount from './form/CharCount';
import { blockNonIntegerKeys, blockNonNumericKeys, invalidCls } from './form/formHelpers';
import Modal from './admin/Modal';
import { btn } from './admin/ui/styles';

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

// Quantities and ordering get sane caps even though the schema has none.
const MAX_QUANTITY = 10000;
const MAX_LEAD_DAYS = 365;
const MAX_SORT_ORDER = 9999;

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

const VALIDATORS = {
    category: (v) => (CATEGORIES.some(c => c.value === v) ? '' : 'Choose a category.'),
    icon: (v) => (ICON_CHOICES.some(i => i.value === v) ? '' : 'Choose an icon.'),
    name: (v) => checkText(v, { label: 'Service name', min: TITLE_MIN, max: LIMITS.serviceName }),
    description: (v) => checkText(v, { label: 'Description', max: LIMITS.notes, required: false }),
    price: (v) => checkAmount(v, { label: 'Price' }),
    pricingUnit: (v) => (PRICING_UNITS.some(u => u.value === v) ? '' : 'Choose how it is charged.'),
    minQuantity: (v) => checkAmount(v, { label: 'Minimum quantity', min: 0.01, max: MAX_QUANTITY, allowZero: false }),
    maxQuantity: (v, all) => {
        if (v === '' || v == null) return '';
        const base = checkAmount(v, { label: 'Maximum quantity', min: 0.01, max: MAX_QUANTITY, allowZero: false });
        if (base) return base;
        return Number(v) < Number(all.minQuantity) ? 'Maximum quantity cannot be less than the minimum.' : '';
    },
    leadTimeDays: (v) => checkIntRange(v === '' ? NaN : v, 0, MAX_LEAD_DAYS, 'Lead time'),
    sortOrder: (v) => checkIntRange(v === '' ? NaN : v, 0, MAX_SORT_ORDER, 'Sort order'),
};

// The parent passes a `key` that changes per edit target, so the component
// remounts with a fresh seed instead of syncing props into state via an effect.
export default function ServiceCatalogModal({ isOpen, service, onClose, onSave, saving }) {
    const [form, setForm] = useState(() => seedFrom(service));
    const fields = useFieldErrors(VALIDATORS, { idPrefix: 'catalog-' });

    if (!isOpen) return null;

    const set = (field) => (e) => {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        fields.clearError(field);
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

    const blur = (field) => () => {
        let v = form[field];
        if (field === 'name' || field === 'description') {
            v = String(v).trim();
            if (v !== form[field]) setForm(prev => ({ ...prev, [field]: v }));
        }
        fields.validateField(field, { ...form, [field]: v });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (saving) return;
        const clean = { ...form, name: form.name.trim(), description: form.description.trim() };
        setForm(clean);
        if (!fields.validateAll(clean)) return;

        onSave({
            ...clean,
            price: Number(clean.price),
            minQuantity: Number(clean.minQuantity),
            maxQuantity: clean.maxQuantity === '' ? null : Number(clean.maxQuantity),
            leadTimeDays: Number(clean.leadTimeDays),
            sortOrder: Number(clean.sortOrder),
        });
    };

    const inputClass = "focus-glow w-full rounded-control border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500";
    const labelClass = "mb-1 block text-label font-medium text-slate-600";
    const isSession = form.pricingUnit === 'session';
    const cls = (field, extra = '') => `${inputClass}${extra}${invalidCls(fields.errors[field])}`;
    const bind = (field) => ({ ...fields.fieldA11y(field), value: form[field], onChange: set(field), onBlur: blur(field) });
    const error = (field) => <FieldError id={`catalog-${field}`} error={fields.errors[field]} />;

    return (
        <Modal busy={saving} title={`${service ? 'Edit Service' : 'Add Service'}`} onClose={onClose} overlayClassName="flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-card bg-white shadow-dialog">
                {/*ModalHeader*/}
                <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                    <div>
                        <h3 className="m-0 text-title font-semibold text-slate-800">
                            {service ? 'Edit Service' : 'Add Service'}
                        </h3>
                        <p className="m-0 mt-1 text-label text-slate-500">
                            Priced add-on services tenants can book from their portal.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="btn-interactive cursor-pointer border-0 bg-transparent p-2 text-slate-400 hover:text-slate-700"
                    >
                        <FontAwesomeIcon icon={faTimes} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2" noValidate>

                    <div>
                        <label htmlFor="catalog-category" className={labelClass}>Category</label>
                        <select {...bind('category')} className={cls('category')}>
                            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                        {error('category')}
                    </div>

                    <div>
                        <label htmlFor="catalog-icon" className={labelClass}>Icon</label>
                        <select {...bind('icon')} className={cls('icon')}>
                            {ICON_CHOICES.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                        </select>
                        {error('icon')}
                    </div>

                    <div className="sm:col-span-2">
                        <label htmlFor="catalog-name" className={labelClass}>Service Name</label>
                        <input
                            type="text"
                            {...bind('name')}
                            autoComplete="off"
                            maxLength={LIMITS.serviceName}
                            placeholder="e.g. Standard Unit Cleaning"
                            className={cls('name')}
                            required
                        />
                        {error('name')}
                    </div>

                    <div className="sm:col-span-2">
                        <label htmlFor="catalog-description" className={labelClass}>Description</label>
                        <textarea
                            rows={3}
                            {...bind('description')}
                            maxLength={LIMITS.notes}
                            placeholder="What the tenant gets for this fee."
                            className={cls('description', ' resize-none')}
                        />
                        {error('description')}
                        <CharCount value={form.description} max={LIMITS.notes} />
                    </div>

                    <div>
                        <label htmlFor="catalog-price" className={labelClass}>Price (₱)</label>
                        <input
                            type="number"
                            {...bind('price')}
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            max={MAX_AMOUNT}
                            onKeyDown={blockNonNumericKeys}
                            className={cls('price')}
                            required
                        />
                        {error('price')}
                    </div>

                    <div>
                        <label htmlFor="catalog-pricingUnit" className={labelClass}>Charged</label>
                        <select {...bind('pricingUnit')} className={cls('pricingUnit')}>
                            {PRICING_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                        </select>
                        {error('pricingUnit')}
                    </div>

                    <div>
                        <label htmlFor="catalog-minQuantity" className={labelClass}>Minimum Quantity</label>
                        <input
                            type="number"
                            {...bind('minQuantity')}
                            inputMode="decimal"
                            step="0.01"
                            min="0.01"
                            max={MAX_QUANTITY}
                            onKeyDown={blockNonNumericKeys}
                            disabled={isSession}
                            className={cls('minQuantity', ' disabled:bg-slate-100 disabled:text-slate-400')}
                        />
                        {error('minQuantity')}
                    </div>

                    <div>
                        <label htmlFor="catalog-maxQuantity" className={labelClass}>Maximum Quantity</label>
                        <input
                            type="number"
                            {...bind('maxQuantity')}
                            inputMode="decimal"
                            step="0.01"
                            min={form.minQuantity || '0.01'}
                            max={MAX_QUANTITY}
                            onKeyDown={blockNonNumericKeys}
                            disabled={isSession}
                            placeholder="No limit"
                            className={cls('maxQuantity', ' disabled:bg-slate-100 disabled:text-slate-400')}
                        />
                        {error('maxQuantity')}
                    </div>

                    <div>
                        <label htmlFor="catalog-leadTimeDays" className={labelClass}>Lead Time (days)</label>
                        <input
                            type="number"
                            {...bind('leadTimeDays')}
                            inputMode="numeric"
                            min="0"
                            max={MAX_LEAD_DAYS}
                            step="1"
                            onKeyDown={blockNonIntegerKeys}
                            className={cls('leadTimeDays')}
                        />
                        {error('leadTimeDays')}
                        <p className="m-0 mt-1 text-caption text-slate-400">Earliest date a tenant may book.</p>
                    </div>

                    <div>
                        <label htmlFor="catalog-sortOrder" className={labelClass}>Sort Order</label>
                        <input
                            type="number"
                            {...bind('sortOrder')}
                            inputMode="numeric"
                            min="0"
                            max={MAX_SORT_ORDER}
                            step="1"
                            onKeyDown={blockNonIntegerKeys}
                            className={cls('sortOrder')}
                        />
                        {error('sortOrder')}
                        <p className="m-0 mt-1 text-caption text-slate-400">Lower numbers appear first.</p>
                    </div>

                    <div className="flex items-center gap-3 sm:col-span-2">
                        <input
                            type="checkbox"
                            id="catalog-active-checkbox"
                            checked={form.isActive}
                            onChange={set('isActive')}
                            className="h-4 w-4 cursor-pointer accent-indigo-600"
                        />
                        <label htmlFor="catalog-active-checkbox" className="cursor-pointer text-body font-medium text-slate-600">
                            Bookable by tenants
                        </label>
                    </div>

                    <div className="flex justify-end gap-3 border-t border-slate-100 pt-4 sm:col-span-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className={btn('secondary', 'md', 'btn-interactive')}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className={btn('primary', 'md', 'btn-interactive')}
                        >
                            {saving ? 'Saving...' : service ? 'Save Changes' : 'Create Service'}
                        </button>
                    </div>
                </form>
            </Modal>
    );
}
