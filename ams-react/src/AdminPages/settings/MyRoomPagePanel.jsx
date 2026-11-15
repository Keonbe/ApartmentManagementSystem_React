import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faLayerGroup, faTrashCan, faArrowUp, faArrowDown, faPlus, faTrash, faLock, faEye, faRotateLeft,
} from '@fortawesome/free-solid-svg-icons';
import { SettingsSection, Field, Switch, PillOption, INPUT } from './SettingsSection';
import GarbageScheduleCard from '../../Components/tenant/GarbageScheduleCard';
import {
  MY_ROOM_SECTIONS, MY_ROOM_LAYOUT_DEFAULTS, GARBAGE_DAYS, GARBAGE_PERIODS, GARBAGE_MAX_ROWS,
  GARBAGE_WHAT_MAX, GARBAGE_TIME_MAX, parseGarbageSchedule,
} from '../../config/myRoomPage';

const ICON_BTN = 'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800 cursor-pointer disabled:opacity-40 disabled:cursor-default';
const PERIOD_LABELS = { '': 'Any time', morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };
const SECTION = new Map(MY_ROOM_SECTIONS.map((s) => [s.id, s]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Other Settings → My Room: which sections the tenant's My Room page shows and
// in what order, and the garbage collection schedule its Garbage card shows.
// Saved with the rest of the settings form (my_room_layout, garbage_schedule).
export default function MyRoomPagePanel({ settings, updateSetting }) {
  const layout = settings.myRoomLayout || MY_ROOM_LAYOUT_DEFAULTS;
  const rows = settings.garbageSchedule || [];

  const setSections = (sections) => updateSetting('myRoomLayout', { ...layout, sections });
  const moveSection = (i, by) => {
    const next = [...layout.sections];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    setSections(next);
  };
  const showSection = (id, show) => setSections(layout.sections.map((s) => (s.id === id ? { ...s, show } : s)));

  const setRows = (next) => updateSetting('garbageSchedule', next);
  const setRow = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const full = rows.length >= GARBAGE_MAX_ROWS;
  // The preview shows what tenants will see: complete rows only.
  const previewRows = parseGarbageSchedule(rows);

  return (
    <>
      <SettingsSection
        icon={faLayerGroup}
        tone="indigo"
        title="Sections"
        description="The order of the sections on a tenant's My Room page, top to bottom, and which of them show. The welcome heading always comes first."
        action={!same(layout, MY_ROOM_LAYOUT_DEFAULTS) && (
          <button
            type="button"
            onClick={() => updateSetting('myRoomLayout', MY_ROOM_LAYOUT_DEFAULTS)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control text-label font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 cursor-pointer"
          >
            <FontAwesomeIcon icon={faRotateLeft} /> Default layout
          </button>
        )}
      >
        <ol className="m-0 p-0 list-none space-y-2">
          {layout.sections.map((s, i) => {
            const info = SECTION.get(s.id);
            if (!info) return null;
            const n = i + 1;
            return (
              <li key={s.id} className={`rounded-card border p-3 sm:p-4 flex flex-wrap items-center gap-3 transition-colors ${s.show ? 'border-slate-200 bg-white' : 'border-dashed border-slate-300 bg-slate-50'}`}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{n}</span>
                <div className={`flex-1 min-w-[12rem] ${s.show ? '' : 'opacity-60'}`}>
                  <p className="m-0 text-body font-bold text-slate-800">{info.label}</p>
                  <p className="m-0 text-caption text-slate-500">{info.hint}</p>
                </div>
                <span className="flex items-center gap-2 text-label font-semibold text-slate-600">
                  {info.locked ? (
                    <><FontAwesomeIcon icon={faLock} className="text-slate-400" aria-hidden="true" /> Always shown</>
                  ) : (
                    <>
                      {s.show ? 'Shown' : 'Hidden'}
                      <Switch checked={s.show} onChange={(show) => showSection(s.id, show)} label={`Show ${info.label}`} />
                    </>
                  )}
                </span>
                <div className="flex gap-1.5">
                  <button type="button" className={ICON_BTN} onClick={() => moveSection(i, -1)} disabled={i === 0} aria-label={`Move ${info.label} up`} title="Move up">
                    <FontAwesomeIcon icon={faArrowUp} />
                  </button>
                  <button type="button" className={ICON_BTN} onClick={() => moveSection(i, 1)} disabled={i === layout.sections.length - 1} aria-label={`Move ${info.label} down`} title="Move down">
                    <FontAwesomeIcon icon={faArrowDown} />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      </SettingsSection>

      <SettingsSection
        icon={faTrashCan}
        tone="emerald"
        title="Garbage collection"
        description={`The days garbage is collected. My Room shows this week with these days highlighted. Up to ${GARBAGE_MAX_ROWS} rows.`}
        action={(
          <button
            type="button"
            onClick={() => setRows([...rows, { day: 'Monday', what: '', time: '', period: 'morning' }])}
            disabled={full}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control text-label font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 cursor-pointer disabled:opacity-50 disabled:cursor-default"
          >
            <FontAwesomeIcon icon={faPlus} /> Add a day
          </button>
        )}
      >
        {rows.length === 0 && (
          <p className="m-0 text-sm text-slate-500">No schedule yet. The Garbage collection card stays hidden on My Room until you add a day.</p>
        )}
        <ol className="m-0 p-0 list-none space-y-3">
          {rows.map((row, i) => {
            const n = i + 1;
            const id = `garbage-${i}`;
            const missing = String(row.what ?? '').trim() === '';
            return (
              <li key={i} className="rounded-card border border-slate-200 p-3 sm:p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{n}</span>
                  <div className="grid flex-1 min-w-[14rem] gap-3 sm:grid-cols-[10rem_minmax(0,1fr)_9rem]">
                    <Field label="Day" htmlFor={`${id}-day`}>
                      <select id={`${id}-day`} value={row.day} onChange={(e) => setRow(i, { day: e.target.value })} className={INPUT}>
                        {GARBAGE_DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </Field>
                    <Field label="What is collected" htmlFor={`${id}-what`} error={missing ? 'Say what is collected, or remove this row.' : null}>
                      <input
                        id={`${id}-what`}
                        type="text"
                        value={row.what}
                        maxLength={GARBAGE_WHAT_MAX}
                        required
                        aria-invalid={missing || undefined}
                        aria-describedby={missing ? `${id}-what-error` : undefined}
                        placeholder="e.g. Biodegradable waste"
                        onChange={(e) => setRow(i, { what: e.target.value })}
                        className={INPUT}
                      />
                    </Field>
                    <Field label="Time (optional)" htmlFor={`${id}-time`}>
                      <input
                        id={`${id}-time`}
                        type="text"
                        value={row.time}
                        maxLength={GARBAGE_TIME_MAX}
                        placeholder="e.g. 6:00 AM"
                        onChange={(e) => setRow(i, { time: e.target.value })}
                        className={INPUT}
                      />
                    </Field>
                    <div className="sm:col-span-3 flex flex-wrap items-center gap-2" role="group" aria-label={`Time of day for row ${n}`}>
                      <span className="text-label font-semibold text-slate-600 mr-1">Time of day</span>
                      {['', ...GARBAGE_PERIODS].map((p) => (
                        <PillOption key={p || 'any'} selected={(row.period ?? '') === p} onClick={() => setRow(i, { period: p })}>
                          {PERIOD_LABELS[p]}
                        </PillOption>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`${ICON_BTN} sm:mt-7 hover:!text-red-600 hover:!border-red-200`}
                    onClick={() => setRows(rows.filter((_, j) => j !== i))}
                    aria-label={`Remove row ${n}`}
                    title="Remove"
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      </SettingsSection>

      <SettingsSection icon={faEye} tone="violet" title="Preview" description="The Garbage collection card as tenants see it this week (complete rows only).">
        {previewRows.length > 0 ? (
          <div className="rounded-card bg-slate-50 p-3 sm:p-4 border border-slate-200">
            <GarbageScheduleCard rows={previewRows} />
          </div>
        ) : (
          <p className="m-0 text-sm text-slate-500">Add a day above to see the card.</p>
        )}
      </SettingsSection>
    </>
  );
}
