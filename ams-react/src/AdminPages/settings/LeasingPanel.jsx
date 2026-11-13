import { Link } from 'react-router-dom';
import { faFileContract, faCalendarAlt, faUsers, faImage, faFileSignature, faScaleBalanced } from '@fortawesome/free-solid-svg-icons';
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

// Today in Manila as YYYY-MM-DD, to tell whether the rent-control resolution has lapsed.
const manilaToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

export default function LeasingPanel({ settings, updateSetting }) {
  const capLapsed = !!settings.rentCapValidUntil && settings.rentCapValidUntil < manilaToday();
  return (
    <>
      <SettingsSection
        icon={faScaleBalanced}
        tone="amber"
        title="Rent Control (RA 9653)"
        description="For a unit renting at or below the coverage limit, the same tenant's rent may rise by at most this much in a calendar year. Renewals above it are refused. A vacant unit can be given a new rate for the next tenant."
      >
        {capLapsed && (
          <Callout tone="rose" icon={faScaleBalanced} title="Check for a new resolution">
            The resolution these numbers come from ended on {settings.rentCapValidUntil}. The cap still applies until you update it. Look for the new NHSB rent-control resolution and enter its numbers and end date.
          </Callout>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Field label="Yearly Increase Cap" htmlFor="setting-rentCapPercent" icon={faScaleBalanced} hint="NHSB Resolution 2024-01: 2.3% for 2025, 1% for 2026.">
            <WithUnit suffix="%">
              <input id="setting-rentCapPercent" name="rentCapPercent" type="number" inputMode="decimal" min={0} max={100} step="0.1" required value={settings.rentCapPercent} onChange={(e) => updateSetting('rentCapPercent', numberValue(e))} className={`${INPUT_NUMBER} w-24`} />
            </WithUnit>
          </Field>
          <Field label="Covered Up To" htmlFor="setting-rentCapMaxCoveredRent" icon={faScaleBalanced} hint="Units renting at or below this monthly rent are covered.">
            <WithUnit prefix="₱" suffix="/ month">
              <input id="setting-rentCapMaxCoveredRent" name="rentCapMaxCoveredRent" type="number" inputMode="decimal" min={0} max={1000000} step="0.01" required value={settings.rentCapMaxCoveredRent} onChange={(e) => updateSetting('rentCapMaxCoveredRent', numberValue(e))} className={`${INPUT_NUMBER} w-32`} />
            </WithUnit>
          </Field>
          <Field label="Resolution Valid Until" htmlFor="setting-rentCapValidUntil" icon={faCalendarAlt} hint="A reminder shows here after this date.">
            <input id="setting-rentCapValidUntil" name="rentCapValidUntil" type="date" required value={settings.rentCapValidUntil || ''} onChange={(e) => updateSetting('rentCapValidUntil', e.target.value)} className={`${INPUT} w-44`} />
          </Field>
        </div>
        <Callout tone="slate" icon={faScaleBalanced} title="What this does">
          RA 9653 and the NHSB rent-control resolution limit how much a covered tenant's rent may rise in a year. These numbers are the ones in force, so the System can follow them.
          It never raises or changes a rent by itself. It only refuses a new rent above the cap when you renew a tenant in Units → Extend Rent (the form shows the most you can enter), and an occupied unit's rent can only change there.
          A vacant unit can be given any rate for the next tenant. When NHSB issues a new resolution, update the percentage, the limit and the end date here; after the end date the cap keeps applying until you do.
        </Callout>
      </SettingsSection>

      <SettingsSection
        icon={faFileSignature}
        tone="emerald"
        title="Security Deposit and Cancellation"
        description="When a refund of the deposit is due, and what a cancellation costs."
      >
        <Callout tone="slate" icon={faFileSignature} title="The unused deposit is always returned">
          Under RA 9653 the deposit covers only unpaid rent, utility bills and damage, each listed with a reason. A tenant who leaves without the move-out notice can be charged rent for the notice days. What is left, plus any bank interest the deposit earned, goes back to the tenant.
        </Callout>
        <Field label="Cancellation Fee" htmlFor="setting-cancellationFee" icon={faCalendarAlt} hint="Kept from what an applicant already paid when they ask to cancel an approved application (they send the request from Track Application, or you cancel at their request by ticking the box when you revoke an approval): the refund request is opened for the amount paid minus this fee, and you can still approve up to the full amount. 0 = full refund. A rejection by Management is always refunded in full.">
          <WithUnit suffix="PHP">
            <input id="setting-cancellationFee" name="cancellationFee" type="number" inputMode="decimal" min={0} max={100000} step="0.01" value={settings.cancellationFee} onChange={(e) => updateSetting('cancellationFee', e.target.value === '' ? '' : Number(e.target.value))} className={`${INPUT_NUMBER} w-32`} />
          </WithUnit>
        </Field>
        <Field label="Refund Due Within" htmlFor="setting-depositRefundDays" icon={faCalendarAlt} hint="A returned deposit is shown to the tenant with this due date, counted from the move-out clearance. Overdue refunds are flagged on the Refunds page.">
          <WithUnit suffix="days">
            <input {...intInput(settings, updateSetting, 'depositRefundDays', 1, 90)} className={`${INPUT_NUMBER} w-24`} />
          </WithUnit>
        </Field>
      </SettingsSection>

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

          {/* Inquiries are questions, not applications, so they get a wider window
              (submit_inquiry.php, config.php inquiry_move_in_latest()). */}
          <Field label="Inquiry Move-In Date" htmlFor="setting-inquiryMoveInMaxMonths" icon={faCalendarAlt} hint="On the Send an Inquiry form, the preferred move-in date can be from today up to this many months ahead.">
            <WithUnit suffix="months">
              <input {...intInput(settings, updateSetting, 'inquiryMoveInMaxMonths', 1, 24)} className={`${INPUT_NUMBER} w-24`} />
            </WithUnit>
          </Field>

          {/* Occupancy: the room rate covers `included` people; each one above
              adds the charge, up to the maximum (config.php occupant_surcharge()). */}
          <Field label="Occupants Included in the Rent" htmlFor="setting-includedOccupants" icon={faUsers} hint="How many people the room's monthly rate covers. Each person above this pays the extra charge below.">
            <WithUnit suffix="people">
              <input {...intInput(settings, updateSetting, 'includedOccupants', 1, 20)} className={`${INPUT_NUMBER} w-24`} />
            </WithUnit>
          </Field>

          <Field label="Charge per Extra Person" htmlFor="setting-occupantSurchargePerPerson" icon={faUsers} hint="Added to the monthly rent for each occupant above the included number. 0 means no charge.">
            <WithUnit prefix="₱" suffix="/ month">
              <input
                id="setting-occupantSurchargePerPerson"
                name="occupantSurchargePerPerson"
                type="number"
                inputMode="decimal"
                min={0}
                max={100000}
                step="0.01"
                required
                value={settings.occupantSurchargePerPerson}
                onChange={(e) => updateSetting('occupantSurchargePerPerson', numberValue(e))}
                className={`${INPUT_NUMBER} w-32`}
              />
            </WithUnit>
          </Field>

          <Field label="Maximum Occupants per Unit" htmlFor="setting-maxOccupantsPerUnit" icon={faUsers} hint="Main tenant plus household members. Applications, inquiries and occupant requests above this are refused.">
            <WithUnit suffix="people">
              <input {...intInput(settings, updateSetting, 'maxOccupantsPerUnit', 1, 20)} className={`${INPUT_NUMBER} w-24`} />
            </WithUnit>
          </Field>

          <Callout tone="slate" icon={faUsers} title="Occupancy for tenants">
            {(() => {
              const max = Number(settings.maxOccupantsPerUnit) || 0;
              const included = Math.min(Number(settings.includedOccupants) || 0, max);
              const paid = Math.max(0, max - included);
              const fee = Number(settings.occupantSurchargePerPerson) || 0;
              return paid > 0 && fee > 0
                ? `${included} included in the rent + ${paid} more at ₱${fee.toLocaleString()} a month each, ${max} at most. Tenants see this on the application, inquiry and My Room pages.`
                : `Up to ${max} people, all included in the rent.`;
            })()}
          </Callout>

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
        are now edited in <Link to="/admin-contracts?tab=editor" className="font-bold text-violet-700 underline">Contracts → Contract Template Editor</Link>.
      </Callout>
    </>
  );
}
