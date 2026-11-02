import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axiosConfig';
import { apiErrorMessage } from '../../utils/apiError';
import { btn } from '../../Components/admin/ui/styles';
import {
  CCTV_DEFAULTS, CCTV_MAX_INCIDENT_TYPES, CCTV_MAX_LOCATIONS, CCTV_OTHER_KEY, parseCctvConfig,
} from '../../config/cctvConfig';

const INPUT = 'rounded-control border border-slate-300 px-3 py-2 text-body';
const ICON_BTN = 'cursor-pointer rounded-control border border-slate-200 bg-white px-2.5 py-1.5 text-label font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40';

const snapshot = (c) => JSON.stringify([c.locations, c.incidentTypes, String(c.lookbackDays), String(c.minReasonLength)]);

// A list of names that can be added to, renamed, reordered and removed. Rows
// are plain strings (locations) or { key, label } (incident types); `get` and
// `set` read and write the visible name.
function EditableList({ items, onChange, get, set, noun, max, locked = null }) {
  const move = (i, by) => {
    const next = [...items];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    onChange(next);
  };
  return (
    <ul className="m-0 list-none space-y-2 p-0">
      {items.map((item, i) => (
        <li key={i} className="flex flex-wrap items-center gap-2">
          <input
            value={get(item)} maxLength={noun === 'location' ? 50 : 60}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? set(x, e.target.value) : x)))}
            aria-label={`${noun} ${i + 1}`} className={`${INPUT} w-72 max-w-full`}
          />
          <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className={ICON_BTN} aria-label={`Move ${get(item) || noun} up`}>↑</button>
          <button type="button" disabled={i === items.length - 1} onClick={() => move(i, 1)} className={ICON_BTN} aria-label={`Move ${get(item) || noun} down`}>↓</button>
          <button type="button" disabled={items.length <= 1} onClick={() => onChange(items.filter((_, j) => j !== i))} className="cursor-pointer rounded-control border border-red-200 bg-white px-2.5 py-1.5 text-label font-bold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40">Remove</button>
        </li>
      ))}
      {locked}
      {items.length >= max && <li className="text-label text-slate-500">That is the most {noun}s allowed ({max}).</li>}
    </ul>
  );
}

// Settings -> CCTV. Saves on its own (like Floor Rent): the tenant form and
// cctv_request.php both read these, so a removed choice can no longer be filed.
export default function CctvPanel() {
  const [saved, setSaved] = useState(null);
  const [locations, setLocations] = useState([]);
  const [types, setTypes] = useState([]);          // everything but "Other"
  const [otherLabel, setOtherLabel] = useState('');
  const [lookbackDays, setLookbackDays] = useState('');
  const [minReason, setMinReason] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newType, setNewType] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  const apply = useCallback((c) => {
    setLocations(c.locations);
    setTypes(c.incidentTypes.filter((t) => t.key !== CCTV_OTHER_KEY));
    setOtherLabel(c.incidentTypes.find((t) => t.key === CCTV_OTHER_KEY)?.label ?? '');
    setLookbackDays(String(c.lookbackDays));
    setMinReason(String(c.minReasonLength));
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await api.get('get_system_settings.php');
      const config = parseCctvConfig(res.data?.settings);
      setSaved(snapshot(config));
      apply(config);
    } catch (err) {
      setNotice({ ok: false, text: apiErrorMessage(err, 'Could not load the CCTV settings.') });
    }
  }, [apply]);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const incidentTypes = [...types, { key: CCTV_OTHER_KEY, label: otherLabel }];
  const current = { locations, incidentTypes, lookbackDays, minReasonLength: minReason };
  const dirty = saved !== null && snapshot(current) !== saved;

  const addLocation = () => {
    const name = newLocation.trim().replace(/\s+/g, ' ');
    if (!name) return;
    if (locations.some((l) => l.toLowerCase() === name.toLowerCase())) { setNotice({ ok: false, text: `"${name}" is already a location.` }); return; }
    setLocations([...locations, name]);
    setNewLocation('');
    setNotice(null);
  };

  const addType = () => {
    const name = newType.trim().replace(/\s+/g, ' ');
    if (!name) return;
    if ([...types, { label: otherLabel }].some((t) => t.label.toLowerCase() === name.toLowerCase())) { setNotice({ ok: false, text: `"${name}" is already an incident type.` }); return; }
    setTypes([...types, { label: name }]);
    setNewType('');
    setNotice(null);
  };

  const save = async () => {
    const names = locations.map((l) => l.trim());
    const labels = [...types.map((t) => t.label.trim()), otherLabel.trim()];
    if (names.some((n) => !n) || labels.some((n) => !n)) { setNotice({ ok: false, text: 'Every location and incident type needs a name.' }); return; }
    if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) { setNotice({ ok: false, text: 'A camera location is listed twice.' }); return; }
    if (new Set(labels.map((n) => n.toLowerCase())).size !== labels.length) { setNotice({ ok: false, text: 'An incident type is listed twice.' }); return; }
    setSaving(true);
    setNotice(null);
    try {
      const res = await api.post('update_system_settings.php', {
        cctv_locations: names,
        cctv_incident_types: [...types.map((t) => ({ ...t, label: t.label.trim() })), { key: CCTV_OTHER_KEY, label: otherLabel.trim() }],
        cctv_lookback_days: String(lookbackDays).trim(),
        cctv_min_reason_length: String(minReason).trim(),
      });
      if (!res.data.success) throw res;
      setNotice({ ok: true, text: 'CCTV settings saved. The request form uses them straight away; requests already filed are unchanged.' });
      await load();
    } catch (err) {
      setNotice({ ok: false, text: apiErrorMessage(err, 'Could not save the CCTV settings.') });
    } finally {
      setSaving(false);
    }
  };

  if (saved === null) {
    return notice
      ? <p role="alert" className="m-0 rounded-card bg-red-50 p-3 text-body text-red-700">{notice.text}</p>
      : <p className="m-0 text-body text-slate-500">Loading CCTV settings…</p>;
  }

  return (
    <section className="space-y-5">
      <div className="rounded-card border border-slate-200 bg-white p-5">
        <h3 className="m-0 text-title font-bold text-slate-800">CCTV Footage Requests</h3>
        <p className="m-0 mt-1 text-body text-slate-500">What a tenant can choose on the CCTV request form. Footage is released for incidents only, so every request names a location and the kind of incident. Turning the whole service on or off is on the Service page.</p>
      </div>
      {notice && <p role={notice.ok ? 'status' : 'alert'} className={`m-0 rounded-card p-3 text-body ${notice.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{notice.text}</p>}

      <div className="space-y-3 rounded-card border border-slate-200 bg-white p-5">
        <div>
          <h4 className="m-0 text-body font-bold text-slate-800">Camera locations</h4>
          <p className="m-0 mt-1 text-label text-slate-500">Where the incident happened. Up to {CCTV_MAX_LOCATIONS}.</p>
        </div>
        <EditableList items={locations} onChange={setLocations} get={(l) => l} set={(_, v) => v} noun="location" max={CCTV_MAX_LOCATIONS} />
        <div className="flex flex-wrap items-center gap-2">
          <input value={newLocation} maxLength={50} onChange={(e) => setNewLocation(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLocation(); } }} placeholder="Add a location, e.g. Parking Area" className={`${INPUT} w-72 max-w-full`} />
          <button type="button" disabled={locations.length >= CCTV_MAX_LOCATIONS} onClick={addLocation} className={btn('secondary', 'md')}>Add location</button>
        </div>
      </div>

      <div className="space-y-3 rounded-card border border-slate-200 bg-white p-5">
        <div>
          <h4 className="m-0 text-body font-bold text-slate-800">Incident types</h4>
          <p className="m-0 mt-1 text-label text-slate-500">What happened. &quot;Other&quot; always stays last and needs a written description of at least 20 characters. Up to {CCTV_MAX_INCIDENT_TYPES} in all.</p>
        </div>
        <EditableList
          items={types} onChange={setTypes} get={(t) => t.label} set={(t, v) => ({ ...t, label: v })} noun="incident type" max={CCTV_MAX_INCIDENT_TYPES - 1}
          locked={(
            <li className="flex flex-wrap items-center gap-2">
              <input value={otherLabel} maxLength={60} onChange={(e) => setOtherLabel(e.target.value)} aria-label="Other incident type" className={`${INPUT} w-72 max-w-full`} />
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-caption font-semibold text-slate-600">Always last</span>
            </li>
          )}
        />
        <div className="flex flex-wrap items-center gap-2">
          <input value={newType} maxLength={60} onChange={(e) => setNewType(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addType(); } }} placeholder="Add a type, e.g. Noise complaint" className={`${INPUT} w-72 max-w-full`} />
          <button type="button" disabled={types.length >= CCTV_MAX_INCIDENT_TYPES - 1} onClick={addType} className={btn('secondary', 'md')}>Add incident type</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 rounded-card border border-slate-200 bg-white p-5 md:grid-cols-2">
        <label className="block text-body font-semibold text-slate-700">Footage kept for
          <span className="mt-1 flex items-center gap-2 font-normal">
            <input type="number" inputMode="numeric" min="1" max="365" step="1" value={lookbackDays} onChange={(e) => setLookbackDays(e.target.value)} className={`${INPUT} w-24`} />
            <span className="text-slate-500">days</span>
          </span>
          <span className="mt-1 block text-label font-normal text-slate-500">An incident older than this cannot be requested. 1 to 365.</span>
        </label>
        <label className="block text-body font-semibold text-slate-700">Shortest reason
          <span className="mt-1 flex items-center gap-2 font-normal">
            <input type="number" inputMode="numeric" min="5" max="200" step="1" value={minReason} onChange={(e) => setMinReason(e.target.value)} className={`${INPUT} w-24`} />
            <span className="text-slate-500">characters</span>
          </span>
          <span className="mt-1 block text-label font-normal text-slate-500">Requests with a shorter reason are refused. 5 to 200.</span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={saving} onClick={() => { apply(CCTV_DEFAULTS); setNotice(null); }} className={btn('secondary', 'md')}>Reset to defaults</button>
        <button type="button" disabled={!dirty || saving} onClick={save} className={btn('primary', 'md', 'ml-auto')}>{saving ? 'Saving…' : 'Save CCTV settings'}</button>
      </div>
    </section>
  );
}
