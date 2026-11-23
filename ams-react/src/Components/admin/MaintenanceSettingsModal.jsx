import { useCallback, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGear, faSpinner, faTimes } from '@fortawesome/free-solid-svg-icons';
import api from '../../api/axiosConfig';
import { getSystemSettings } from '../../config/systemSettings';
import { encodeSchemaSettings } from '../../config/settingsSchema';
import { apiErrorMessage } from '../../utils/apiError';
import Modal from './Modal';
import MaintenancePanel from '../../AdminPages/settings/MaintenancePanel';
import { btn } from './ui/styles';

const KEYS = ['maintenanceMonthlyBudget', 'tenantResponsibilityClause'];

export default function MaintenanceSettingsModal({ onClose, onSaved }) {
  const [settings, setSettings] = useState(null);
  const [saved, setSaved] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const data = await getSystemSettings({ strict: true });
      const initial = Object.fromEntries(KEYS.map((key) => [key, data[key]]));
      setSettings(initial);
      setSaved(JSON.stringify(initial));
    } catch (err) {
      setLoadError(apiErrorMessage(err, 'Could not load maintenance settings.'));
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load, loadAttempt]);

  const updateSetting = (key, value) => setSettings((current) => ({ ...current, [key]: value }));
  const dirty = settings !== null && JSON.stringify(settings) !== saved;

  const save = async (event) => {
    event.preventDefault();
    if (saving || !settings) return;
    setSaving(true);
    setSaveError('');
    try {
      const encoded = encodeSchemaSettings(settings);
      await api.post('update_system_settings.php', {
        maintenance_monthly_budget: encoded.maintenance_monthly_budget,
        tenant_responsibility_clause: encoded.tenant_responsibility_clause,
      });
      setSaved(JSON.stringify(settings));
      onSaved(settings);
    } catch (err) {
      setSaveError(apiErrorMessage(err, 'Could not save maintenance settings.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      labelledBy="maintenance-settings-title"
      onClose={onClose}
      busy={saving}
      dirty={dirty}
      as="form"
      onSubmit={save}
      className="bg-white rounded-dialog shadow-dialog w-full max-w-3xl mx-4 overflow-hidden flex flex-col max-h-[90vh]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <h2 id="maintenance-settings-title" className="m-0 flex items-center gap-2 text-title font-semibold text-slate-900">
          <FontAwesomeIcon icon={faGear} className="text-slate-500" /> Maintenance settings
        </h2>
        <button type="button" onClick={onClose} disabled={saving} aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-full border-0 bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer disabled:opacity-50">
          <FontAwesomeIcon icon={faTimes} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/60 p-5">
        {loadError ? (
          <div role="alert" className="rounded-card border border-red-200 bg-red-50 p-4 text-body text-red-700">
            <p className="m-0">{loadError}</p>
            <button type="button" onClick={() => setLoadAttempt((n) => n + 1)} className={btn('secondary', 'sm', 'mt-3')}>Try again</button>
          </div>
        ) : settings ? (
          <>
            {saveError && <p role="alert" className="m-0 mb-4 rounded-card border border-red-200 bg-red-50 px-3 py-2 text-label font-semibold text-red-700">{saveError}</p>}
            <div className="space-y-5">
              <MaintenancePanel settings={settings} updateSetting={updateSetting} />
            </div>
          </>
        ) : (
          <p className="m-0 text-body text-slate-500"><FontAwesomeIcon icon={faSpinner} spin className="mr-2" />Loading maintenance settings…</p>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
        <button type="button" onClick={onClose} disabled={saving} className={btn('secondary', 'md')}>Cancel</button>
        <button type="submit" disabled={!dirty || saving || !settings} className={btn('primary', 'md')}>
          <FontAwesomeIcon icon={saving ? faSpinner : faGear} spin={saving} /> {saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </Modal>
  );
}
