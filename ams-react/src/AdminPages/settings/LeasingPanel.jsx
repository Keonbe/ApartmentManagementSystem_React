import { Link } from 'react-router-dom';
import { faFileContract, faCalendarAlt, faUsers, faImage, faFileSignature } from '@fortawesome/free-solid-svg-icons';
import { SettingsSection, Field, WithUnit, Callout, INPUT, INPUT_NUMBER } from './SettingsSection';
import { blockNonIntegerKeys, numberValue } from '../../Components/form/formHelpers';

// Whole-number setting: empty stays empty (required stops the save).
const intInput = (settings, updateSetting, key, min, max) => ({
  id: `setting-${key}`,
  name: key,
  type: 'number',
  inputMode: 'numeric',
  min,
  max,
  step: 1,
  required: true,
  value: settings[key],
  onKeyDown: blockNonIntegerKeys,
  onChange: (e) => updateSetting(key, numberValue(e)),
});

export default function LeasingPanel({ settings, updateSetting }) {
  return (
    <>
      <SettingsSection
        icon={faFileContract}
        tone="indigo"
        title="Rent Policy"
        description="Rent length, reservation holds, occupancy and the public room preview."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Minimum Rent Duration" htmlFor="setting-minLeaseDuration" icon={faCalendarAlt} hint="Applies to new rent applications, admin unit assignment and rent extensions (extensions cap at 12 months; when fewer months fit under Maximum Months Ahead, the extension minimum shrinks to what fits).">
            <WithUnit suffix="months">
              <input {...intInput(settings, updateSetting, 'minLeaseDuration', 1, 24)} className={`${INPUT_NUMBER} w-24`} />
            </WithUnit>
          </Field>

          <Field label="Maximum Months Ahead" htmlFor="setting-maxRentAheadMonths" icon={faCalendarAlt} hint="How far from today a rent end may reach after an extension (tenant request or Units → Extend Rent). At most 12.">
            <WithUnit suffix="months">
              <input {...intInput(settings, updateSetting, 'maxRentAheadMonths', 1, 12)} className={`${INPUT_NUMBER} w-24`} />
            </WithUnit>
          </Field>

          <Field label="Reservation Hold Period" htmlFor="setting-reservationHoldDays" icon={faCalendarAlt} hint="Default number of days a reserved unit is held before the hold expires and the unit is released.">
            <WithUnit suffix="days">
              <input {...intInput(settings, updateSetting, 'reservationHoldDays', 1, 90)} className={`${INPUT_NUMBER} w-24`} />
            </WithUnit>
          </Field>

          <Field label="Minimum Move-Out Notice" htmlFor="setting-moveOutMinNoticeDays" icon={faCalendarAlt} hint="A tenant's requested move-out date must be at least this many days from today.">
            <WithUnit suffix="days">
              <input {...intInput(settings, updateSetting, 'moveOutMinNoticeDays', 1, 60)} className={`${INPUT_NUMBER} w-24`} />
            </WithUnit>
          </Field>

          <Field label="Maximum Move-Out Notice" htmlFor="setting-moveOutMaxNoticeDays" icon={faCalendarAlt} hint="...and no more than this many days from today. Cannot be shorter than the minimum.">
            <WithUnit suffix="days">
              <input {...intInput(settings, updateSetting, 'moveOutMaxNoticeDays', settings.moveOutMinNoticeDays || 1, 90)} className={`${INPUT_NUMBER} w-24`} />
            </WithUnit>
          </Field>

          {/* Preferred move-in date on rent applications and resubmitted dates
              (config.php move_in_window_days(); the server enforces it). */}
          <Field label="Earliest Move-In Date" htmlFor="setting-moveInMinDays" icon={faCalendarAlt} hint="An applicant's preferred move-in date must be at least this many days from today. 0 allows today.">
            <WithUnit suffix="days">
              <input {...intInput(settings, updateSetting, 'moveInMinDays', 0, 60)} className={`${INPUT_NUMBER} w-24`} />
            </WithUnit>
          </Field>

          <Field label="Latest Move-In Date" htmlFor="setting-moveInMaxDays" icon={faCalendarAlt} hint="...and no more than this many days from today (at most 365, about a year). Cannot be earlier than the earliest.">
            <WithUnit suffix="days">
              <input {...intInput(settings, updateSetting, 'moveInMaxDays', Math.max(1, settings.moveInMinDays || 0), 365)} className={`${INPUT_NUMBER} w-24`} />
            </WithUnit>
          </Field>

          <Field label="Maximum Occupants per Unit" htmlFor="setting-maxOccupantsPerUnit" icon={faUsers} hint="Main tenant plus household members. Applications and occupant requests above this are refused.">
            <WithUnit suffix="people">
              <input {...intInput(settings, updateSetting, 'maxOccupantsPerUnit', 1, 20)} className={`${INPUT_NUMBER} w-24`} />
            </WithUnit>
          </Field>

          <Field label="Public Room Preview" icon={faImage} hint="What visitors see when they preview a unit on the public page.">
            <select
              value={settings.roomPreviewMode}
              onChange={(e) => updateSetting('roomPreviewMode', e.target.value)}
              className={`${INPUT} font-semibold`}
            >
              <option value="images">Room images</option>
              <option value="floor_plan">2D floor plan</option>
            </select>
          </Field>
        </div>
      </SettingsSection>

      <Callout tone="violet" icon={faFileSignature} title="Rent contract details moved">
        The owner's name, address and contact number, the payment accounts and every clause of the contract
        are now edited in <Link to="/admin-contract-editor" className="font-bold text-violet-700 underline">Edit Contract</Link>.
      </Callout>
    </>
  );
}
