import { faFileContract, faCalendarAlt, faUsers, faImage, faUserShield, faBuilding, faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import { SettingsSection, Field, WithUnit, INPUT, INPUT_NUMBER } from './SettingsSection';

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
          <Field label="Minimum Lease Duration" icon={faCalendarAlt} hint="Tenants cannot sign leases shorter than this duration.">
            <WithUnit suffix="months">
              <input
                type="number" min="1" max="24"
                value={settings.minLeaseDuration}
                onChange={(e) => updateSetting('minLeaseDuration', Number(e.target.value))}
                className={`${INPUT_NUMBER} w-24`}
              />
            </WithUnit>
          </Field>

          <Field label="Reservation Hold Period" icon={faCalendarAlt} hint="Default number of days a reserved unit is held before the hold expires and the unit is released.">
            <WithUnit suffix="days">
              <input
                type="number" min="1" max="90"
                value={settings.reservationHoldDays}
                onChange={(e) => updateSetting('reservationHoldDays', Number(e.target.value))}
                className={`${INPUT_NUMBER} w-24`}
              />
            </WithUnit>
          </Field>

          <Field label="Maximum Occupants per Unit" icon={faUsers} hint="Lease holder plus household members. Applications and occupant requests above this are refused.">
            <WithUnit suffix="people">
              <input
                type="number" min="1" max="20"
                value={settings.maxOccupantsPerUnit}
                onChange={(e) => updateSetting('maxOccupantsPerUnit', Number(e.target.value))}
                className={`${INPUT_NUMBER} w-24`}
              />
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
          <Field label="Owner / Landlord Name" icon={faUserShield}>
            <input type="text" value={settings.landlordName} onChange={(e) => updateSetting('landlordName', e.target.value)} className={INPUT} />
          </Field>

          <Field label="Owner's Address" icon={faUserShield}>
            <input type="text" value={settings.landlordAddress} onChange={(e) => updateSetting('landlordAddress', e.target.value)} className={INPUT} />
          </Field>

          <Field label="Apartment / Property Address" icon={faBuilding} hint={'The building\'s location, shown under "Description of the Apartment".'}>
            <input type="text" value={settings.propertyAddress} onChange={(e) => updateSetting('propertyAddress', e.target.value)} className={INPUT} />
          </Field>

          <Field label="Owner Contact Number" icon={faInfoCircle} hint="Shown on the contract exactly as entered — mask it if it should not be public.">
            <input type="text" value={settings.landlordContact} onChange={(e) => updateSetting('landlordContact', e.target.value)} className={INPUT} />
          </Field>
        </div>
      </SettingsSection>
    </>
  );
}
