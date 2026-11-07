import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faCheck, faScrewdriverWrench, faIdCard } from '@fortawesome/free-solid-svg-icons';
import api from '../../../api/axiosConfig';
import { apiErrorMessage } from '../../../utils/apiError';
import Modal from '../Modal';
import { btn, INPUT } from '../ui/styles';
import { Switch } from '../../../AdminPages/settings/SettingsSection';
import { SLOT_ICONS, VEHICLE_TYPES } from '../../../utils/parkingVehicles';

// Add one or several parking slots, or edit one (parking_slots.php).
// slot = null → add; otherwise the slot being edited. occupied = a vehicle is
// parked there (it cannot go under maintenance or stop taking that vehicle).
const ICON_DEFAULT_TYPES = { motorcycle: ['motorcycle'], car: ['sedan', 'suv', 'pickup'], ebike: ['ebike'], van: ['van'] };

export default function ParkingSlotModal({ slot, occupied = false, onClose, onSaved }) {
  const editing = !!slot;
  const [label, setLabel] = useState(slot?.label ?? '');
  const [quantity, setQuantity] = useState(1);
  const [icon, setIcon] = useState(slot?.icon ?? 'motorcycle');
  const [types, setTypes] = useState(slot?.vehicle_types ?? ['motorcycle']);
  const [requiresRegistration, setRequiresRegistration] = useState(slot?.requires_registration ?? true);
  const [maintenance, setMaintenance] = useState(slot?.status === 'maintenance');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');

  const several = !editing && quantity > 1;

  // Choosing an icon on a new slot also picks its usual vehicle types.
  const chooseIcon = (value) => {
    setIcon(value);
    if (!editing) setTypes(ICON_DEFAULT_TYPES[value]);
    setErrors((e) => ({ ...e, icon: undefined, vehicle_types: undefined }));
  };
  const toggleType = (value) => {
    setTypes((t) => (t.includes(value) ? t.filter((x) => x !== value) : [...t, value]));
    setErrors((e) => ({ ...e, vehicle_types: undefined }));
  };

  const save = async (e) => {
    e.preventDefault();
    if (saving) return;
    const clean = label.trim();
    const local = {};
    if (!several && !clean) local.label = 'Give the slot a name, e.g. M1 or 12.';
    if (types.length === 0) local.vehicle_types = 'Choose at least one vehicle type.';
    if (Object.keys(local).length) { setErrors(local); return; }

    setSaving(true);
    setMessage('');
    try {
      const body = {
        label: clean, icon, vehicle_types: types, requires_registration: requiresRegistration,
        status: maintenance ? 'maintenance' : 'active',
      };
      const res = await api.post('parking_slots.php', editing
        ? { action: 'update', id: slot.id, ...body }
        : { action: 'create', quantity, ...body });
      onSaved(res.data.message);
    } catch (err) {
      const fieldErrors = err.response?.data?.errors;
      if (fieldErrors) setErrors(fieldErrors);
      setMessage(apiErrorMessage(err, 'Could not save the slot.'));
    } finally {
      setSaving(false);
    }
  };

  const preview = several ? `${clean(label)}1, ${clean(label)}2${quantity > 2 ? ` … ${clean(label)}${quantity}` : ''}` : null;

  return (
    <Modal
      as="form"
      onSubmit={save}
      noValidate
      labelledBy="parking-slot-title"
      onClose={onClose}
      busy={saving}
      className="bg-white rounded-dialog shadow-dialog w-full max-w-lg mx-4 overflow-hidden flex flex-col max-h-[90vh]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <h2 id="parking-slot-title" className="m-0 text-title font-semibold text-slate-900">
          {editing ? `Edit slot ${slot.label}` : 'Add parking slots'}
        </h2>
        <button type="button" onClick={onClose} disabled={saving} aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-full border-0 bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer disabled:opacity-50">
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-5">
        {message && <p role="alert" className="m-0 rounded-card border border-red-200 bg-red-50 px-3 py-2 text-label font-semibold text-red-700">{message}</p>}

        <div className={`grid gap-4 ${editing ? '' : 'sm:grid-cols-[1fr_auto]'}`}>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="slot-label" className="text-label font-semibold text-slate-700">{several ? 'Name prefix' : 'Slot name'}</label>
            <input id="slot-label" value={label} maxLength={several ? 15 : 20} autoComplete="off"
              onChange={(e) => { setLabel(e.target.value); setErrors((x) => ({ ...x, label: undefined })); }}
              placeholder={several ? 'e.g. M (blank for numbers only)' : 'e.g. M1, A-3 or 12'}
              aria-invalid={errors.label ? true : undefined} aria-describedby={errors.label ? 'slot-label-error' : undefined}
              className={`${INPUT} ${errors.label ? 'border-red-400' : ''}`} />
            {errors.label && <p id="slot-label-error" className="m-0 text-label text-red-600">{errors.label}</p>}
            {several && <p className="m-0 text-caption text-slate-500">Numbered after the highest slot with this prefix: {preview}.</p>}
          </div>
          {!editing && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="slot-quantity" className="text-label font-semibold text-slate-700">How many</label>
              <select id="slot-quantity" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} className={`${INPUT} w-24 cursor-pointer`}>
                {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          )}
        </div>

        <fieldset className="mx-0 mt-0 p-0 border-0 min-w-0">
          <legend className="mb-2 p-0 text-label font-semibold text-slate-700">Icon</legend>
          <div className="grid grid-cols-4 gap-2">
            {SLOT_ICONS.map((opt) => (
              <button key={opt.value} type="button" onClick={() => chooseIcon(opt.value)} aria-pressed={icon === opt.value}
                className={`flex flex-col items-center gap-1.5 rounded-card border-2 py-3 text-caption font-semibold cursor-pointer transition-colors ${icon === opt.value ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
                <FontAwesomeIcon icon={opt.icon} className="text-xl" aria-hidden="true" />
                {opt.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mx-0 mt-0 p-0 border-0 min-w-0" aria-describedby={errors.vehicle_types ? 'slot-types-error' : undefined}>
          <legend className="mb-2 p-0 text-label font-semibold text-slate-700">Vehicles this slot takes</legend>
          <div className="flex flex-wrap gap-2">
            {VEHICLE_TYPES.map((t) => {
              const on = types.includes(t.value);
              return (
                <button key={t.value} type="button" onClick={() => toggleType(t.value)} aria-pressed={on}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-label font-semibold cursor-pointer transition-colors ${on ? 'border-indigo-500 bg-indigo-500 text-white' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'}`}>
                  <FontAwesomeIcon icon={on ? faCheck : t.icon} className="text-[11px]" aria-hidden="true" />
                  {t.label}
                </button>
              );
            })}
          </div>
          {errors.vehicle_types && <p id="slot-types-error" className="m-0 mt-1.5 text-label text-red-600">{errors.vehicle_types}</p>}
          {types.includes('ebike') && <p className="m-0 mt-1.5 text-caption text-slate-500">An e-bike needs no plate number.</p>}
        </fieldset>

        <div className="space-y-3 rounded-card border border-slate-200 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="m-0 flex items-center gap-2 text-body font-semibold text-slate-800"><FontAwesomeIcon icon={faIdCard} className="text-slate-400" /> Vehicle registration (OR/CR)</p>
              <p className="m-0 mt-0.5 text-caption text-slate-500">Tenants upload the OR/CR when they ask for this slot.</p>
            </div>
            <Switch checked={requiresRegistration} onChange={setRequiresRegistration} label="Require the vehicle registration (OR/CR)" />
          </div>
          <div className="flex items-start justify-between gap-4 border-t border-slate-100 pt-3">
            <div className="min-w-0">
              <p className="m-0 flex items-center gap-2 text-body font-semibold text-slate-800"><FontAwesomeIcon icon={faScrewdriverWrench} className="text-slate-400" /> Under maintenance</p>
              <p className="m-0 mt-0.5 text-caption text-slate-500">
                {occupied ? 'A vehicle is parked here. Release it first to close the slot.' : 'Shown to tenants, but nobody can ask for it.'}
              </p>
            </div>
            <Switch checked={maintenance} onChange={(v) => !occupied && setMaintenance(v)} label="Slot under maintenance" tone="rose" />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
        <button type="button" onClick={onClose} disabled={saving} className={btn('secondary', 'md')}>Cancel</button>
        <button type="submit" disabled={saving} className={btn('primary', 'md')}>
          {saving ? 'Saving…' : editing ? 'Save slot' : several ? `Add ${quantity} slots` : 'Add slot'}
        </button>
      </div>
    </Modal>
  );
}

function clean(v) {
  return String(v || '').trim();
}
