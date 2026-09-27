import { faFileContract, faCalendarAlt, faUsers, faImage, faUserShield, faBuilding, faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import { SettingsSection, Field, WithUnit, INPUT, INPUT_NUMBER } from './SettingsSection';
import { LIMITS } from '../../utils/validation';
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

const textInput = (settings, updateSetting, key, maxLength = LIMITS.landlordText) => ({
  id: `setting-${key}`,
  name: key,
  type: 'text',
  autoComplete: 'off',
  maxLength,
  value: settings[key],
  onChange: (e) => updateSetting(key, e.target.value),
  onBlur: (e) => { if (e.target.value !== e.target.value.trim()) updateSetting(key, e.target.value.trim()); },
});

export default function LeasingPanel({ settings, updateSetting }) {
  return (
    <>
      <SettingsSection
        icon={faFileContract}
        tone="indigo"
        title="Lease Policy"
        description="Lease length, reservation holds, occupancy and the public room preview."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Minimum Lease Duration" htmlFor="setting-minLeaseDuration" icon={faCalendarAlt} hint="Tenants cannot sign leases shorter than this duration.">
            <WithUnit suffix="months">
              <input {...intInput(settings, updateSetting, 'minLeaseDuration', 1, 24)} className={`${INPUT_NUMBER} w-24`} />
            </WithUnit>
          </Field>

          <Field label="Reservation Hold Period" htmlFor="setting-reservationHoldDays" icon={faCalendarAlt} hint="Default number of days a reserved unit is held before the hold expires and the unit is released.">
            <WithUnit suffix="days">
              <input {...intInput(settings, updateSetting, 'reservationHoldDays', 1, 90)} className={`${INPUT_NUMBER} w-24`} />
            </WithUnit>
          </Field>

          <Field label="Maximum Occupants per Unit" htmlFor="setting-maxOccupantsPerUnit" icon={faUsers} hint="Lease holder plus household members. Applications and occupant requests above this are refused.">
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

      <SettingsSection
        icon={faBuilding}
        tone="violet"
        title="Lease Contract Details"
        description="Shown as the Owner / Lessor on every generated lease contract."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Owner / Landlord Name" htmlFor="setting-landlordName" icon={faUserShield}>
            <input {...textInput(settings, updateSetting, 'landlordName')} className={INPUT} />
          </Field>

          <Field label="Owner's Address" htmlFor="setting-landlordAddress" icon={faUserShield}>
            <input {...textInput(settings, updateSetting, 'landlordAddress')} className={INPUT} />
          </Field>

          <Field label="Apartment / Property Address" htmlFor="setting-propertyAddress" icon={faBuilding} hint={'The building\'s location, shown under "Description of the Apartment".'}>
            <input {...textInput(settings, updateSetting, 'propertyAddress')} className={INPUT} />
          </Field>

          <Field label="Owner Contact Number" htmlFor="setting-landlordContact" icon={faInfoCircle} hint="Shown on the contract exactly as entered — mask it if it should not be public.">
            {/* Free text on purpose (it may be masked, e.g. 0917-XXX-XXXX); capped like other contact numbers. */}
            <input {...textInput(settings, updateSetting, 'landlordContact', 30)} className={INPUT} />
          </Field>
        </div>
      </SettingsSection>
    </>
  );
}
