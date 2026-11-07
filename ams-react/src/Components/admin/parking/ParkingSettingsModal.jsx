import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faGear, faSliders, faScaleBalanced, faGift } from '@fortawesome/free-solid-svg-icons';
import api from '../../../api/axiosConfig';
import { apiErrorMessage } from '../../../utils/apiError';
import Modal from '../Modal';
import { btn } from '../ui/styles';
import { Field, WithUnit, PillOption, Switch, INPUT_NUMBER } from '../../../AdminPages/settings/SettingsSection';
import HouseRulesPanel from '../../../AdminPages/settings/HouseRulesPanel';
import { blockNonIntegerKeys, blockNonNumericKeys } from '../../form/formHelpers';

// Admin → Parking → gear: the parking settings (update_system_settings.php,
// only these keys) and the parking rules tenants agree to (house_rules.php,
// scope parking; that tab saves on its own). Was Other Settings → Parking and
// Parking Rules.
const TABS = [
  { id: 'general', label: 'General', icon: faSliders },
  { id: 'rules', label: 'Parking rules', icon: faScaleBalanced },
];

export default function ParkingSettingsModal({ initial, onClose, onSaved }) {
  const [tab, setTab] = useState('general');
  const [free, setFree] = useState(!!initial.free);
  const [fee, setFee] = useState(String(initial.monthly_fee ?? 300));
  const [billingMode, setBillingMode] = useState(initial.billing_mode || 'manual');
  const [maxMonths, setMaxMonths] = useState(String(initial.max_duration_months ?? 6));
  const [perTenant, setPerTenant] = useState(String(initial.max_per_tenant ?? 1));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');

  const save = async () => {
    if (saving) return;
    const local = {};
    const feeNum = Number(fee);
    if (!free && !(feeNum > 0 && feeNum <= 100000)) local.parkingMonthlyFee = 'Enter an amount above 0 (or turn on Free parking).';
    if (!/^\d+$/.test(maxMonths) || Number(maxMonths) < 1 || Number(maxMonths) > 12) local.parkingMaxDurationMonths = 'Enter 1 to 12 months.';
    if (!/^\d+$/.test(perTenant) || Number(perTenant) < 1 || Number(perTenant) > 5) local.parkingMaxPerTenant = 'Enter 1 to 5.';
    setErrors(local);
    if (Object.keys(local).length) return;

    setSaving(true);
    setMessage('');
    try {
      const body = {
        parking_free: free ? '1' : '0',
        parking_billing_mode: billingMode,
        parking_max_duration_months: maxMonths,
        parking_max_per_tenant: perTenant,
      };
      // The fee is kept while parking is free, so turning Free off restores it.
      if (!free) body.parking_monthly_fee = String(feeNum);
      await api.post('update_system_settings.php', body);
      onSaved('Parking settings saved.');
    } catch (err) {
      if (err.response?.data?.errors) setErrors(err.response.data.errors);
      setMessage(apiErrorMessage(err, 'Could not save the parking settings.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      labelledBy="parking-settings-title"
      onClose={onClose}
      busy={saving}
      className="bg-white rounded-dialog shadow-dialog w-full max-w-3xl mx-4 overflow-hidden flex flex-col max-h-[90vh]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <h2 id="parking-settings-title" className="m-0 flex items-center gap-2 text-title font-semibold text-slate-900">
          <FontAwesomeIcon icon={faGear} className="text-slate-500" /> Parking settings
        </h2>
        <button type="button" onClick={onClose} disabled={saving} aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-full border-0 bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer disabled:opacity-50">
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <div role="tablist" aria-label="Parking settings" className="flex gap-1 border-b border-slate-200 px-5">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`-mb-px inline-flex items-center gap-2 border-0 border-b-2 bg-transparent px-3 py-3 text-label font-semibold cursor-pointer transition-colors ${tab === t.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            <FontAwesomeIcon icon={t.icon} /> {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/60 p-5">
        {tab === 'general' ? (
          <div className="space-y-5">
            {message && <p role="alert" className="m-0 rounded-card border border-red-200 bg-red-50 px-3 py-2 text-label font-semibold text-red-700">{message}</p>}

            <div className="flex items-start justify-between gap-4 rounded-card border border-emerald-200 bg-emerald-50/60 p-4">
              <div className="min-w-0">
                <p className="m-0 flex items-center gap-2 text-body font-semibold text-slate-800"><FontAwesomeIcon icon={faGift} className="text-emerald-600" /> Free parking</p>
                <p className="m-0 mt-0.5 text-caption text-slate-600">
                  New requests cost nothing and are never billed. Permits already given keep the fee they were requested with.
                </p>
              </div>
              <Switch checked={free} onChange={setFree} label="Free parking" />
            </div>

            <div className={`grid gap-5 rounded-card border border-slate-200 bg-white p-4 md:grid-cols-2 ${free ? 'opacity-60' : ''}`}>
              <Field label="Monthly parking fee" htmlFor="parking-fee" error={errors.parkingMonthlyFee}
                hint="Charged per slot for each month of a permit.">
                <WithUnit prefix="₱" suffix="per slot / month">
                  <input id="parking-fee" type="number" inputMode="decimal" min="1" max="100000" step="0.01"
                    value={fee} disabled={free} onKeyDown={blockNonNumericKeys}
                    onChange={(e) => { setFee(e.target.value); setErrors((x) => ({ ...x, parkingMonthlyFee: undefined })); }}
                    aria-invalid={errors.parkingMonthlyFee ? true : undefined}
                    className={`${INPUT_NUMBER} w-28`} />
                </WithUnit>
              </Field>
              <Field label="Billing" hint={'Manual: "Bill this month" on each permit. Automatic: added when the slot is assigned and each month after.'}>
                <div className="flex gap-2">
                  {[['manual', 'Manual'], ['auto', 'Automatic']].map(([v, l]) => (
                    <PillOption key={v} selected={billingMode === v} onClick={() => !free && setBillingMode(v)}>{l}</PillOption>
                  ))}
                </div>
              </Field>
            </div>

            <div className="grid gap-5 rounded-card border border-slate-200 bg-white p-4 md:grid-cols-2">
              <Field label="Longest permit" htmlFor="parking-max-months" error={errors.parkingMaxDurationMonths} hint="The most months a tenant can ask for at once.">
                <WithUnit suffix="months">
                  <input id="parking-max-months" type="number" inputMode="numeric" min="1" max="12" step="1"
                    value={maxMonths} onKeyDown={blockNonIntegerKeys}
                    onChange={(e) => { setMaxMonths(e.target.value); setErrors((x) => ({ ...x, parkingMaxDurationMonths: undefined })); }}
                    aria-invalid={errors.parkingMaxDurationMonths ? true : undefined}
                    className={`${INPUT_NUMBER} w-20`} />
                </WithUnit>
              </Field>
              <Field label="Reservations per tenant" htmlFor="parking-per-tenant" error={errors.parkingMaxPerTenant} hint="Open requests and permits one tenant can hold, e.g. 2 for a car and a motorcycle.">
                <WithUnit suffix="at a time">
                  <input id="parking-per-tenant" type="number" inputMode="numeric" min="1" max="5" step="1"
                    value={perTenant} onKeyDown={blockNonIntegerKeys}
                    onChange={(e) => { setPerTenant(e.target.value); setErrors((x) => ({ ...x, parkingMaxPerTenant: undefined })); }}
                    aria-invalid={errors.parkingMaxPerTenant ? true : undefined}
                    className={`${INPUT_NUMBER} w-20`} />
                </WithUnit>
              </Field>
            </div>
          </div>
        ) : (
          <HouseRulesPanel scope="parking" />
        )}
      </div>

      {tab === 'general' && (
        <div className="flex justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3">
          <button type="button" onClick={onClose} disabled={saving} className={btn('secondary', 'md')}>Cancel</button>
          <button type="button" onClick={save} disabled={saving} className={btn('primary', 'md')}>{saving ? 'Saving…' : 'Save settings'}</button>
        </div>
      )}
    </Modal>
  );
}
