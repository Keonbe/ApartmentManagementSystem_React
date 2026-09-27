import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCar, faCheck } from '@fortawesome/free-solid-svg-icons';
import { SettingsSection, Field, WithUnit, PillOption, INPUT_NUMBER } from './SettingsSection';
import { MAX_AMOUNT } from '../../utils/validation';
import { blockNonIntegerKeys, blockNonNumericKeys, numberValue } from '../../Components/form/formHelpers';

const BILLING_MODES = [
  { value: 'manual', label: 'Manual' },
  { value: 'auto', label: 'Automatic' },
];

const VEHICLE_TYPES = [
  { value: 'motorcycle', label: 'Motorcycle' },
  { value: 'sedan', label: 'Sedan' },
  { value: 'suv', label: 'SUV' },
  { value: 'pickup', label: 'Pickup Truck' },
  { value: 'van', label: 'Van' },
  { value: 'ebike', label: 'E-Bike' },
];

export default function ParkingPanel({ settings, updateSetting }) {
  const allowed = settings.parkingAllowedVehicleTypes;

  return (
    <SettingsSection
      icon={faCar}
      tone="indigo"
      title="Parking Policy"
      description="How many slots exist, what they cost, and which vehicles may reserve one."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field
          label="Max Parking Slots"
          htmlFor="setting-maxParkingSlots"
          hint="Numbered slots #1 to #N. Only assigned slots count; new requests are refused once every slot is assigned. Can't go below the highest slot still assigned."
        >
          <WithUnit suffix="slots">
            <input
              id="setting-maxParkingSlots" name="maxParkingSlots"
              type="number" inputMode="numeric" min="1" max="500" step="1" required
              value={settings.maxParkingSlots}
              onKeyDown={blockNonIntegerKeys}
              onChange={(e) => updateSetting('maxParkingSlots', numberValue(e))}
              className={`${INPUT_NUMBER} w-24`}
            />
          </WithUnit>
        </Field>

        <Field label="Monthly Parking Fee" htmlFor="setting-parkingMonthlyFee" hint="Added to the tenant's invoice for each month of the permit term.">
          <WithUnit prefix="₱" suffix="per slot / month">
            <input
              id="setting-parkingMonthlyFee" name="parkingMonthlyFee"
              type="number" inputMode="decimal" min="1" max={MAX_AMOUNT} step="0.01" required
              value={settings.parkingMonthlyFee}
              onKeyDown={blockNonNumericKeys}
              onChange={(e) => updateSetting('parkingMonthlyFee', numberValue(e))}
              className={`${INPUT_NUMBER} w-28`}
            />
          </WithUnit>
        </Field>

        <Field
          label="Parking Fee Billing"
          hint={'Manual: bill each month with "Bill this month" on the Parking page. Automatic: the fee is added when a slot is assigned and on each following month by the daily sweep. A month is never billed twice either way.'}
        >
          <div className="flex gap-2">
            {BILLING_MODES.map((opt) => (
              <PillOption
                key={opt.value}
                selected={settings.parkingBillingMode === opt.value}
                onClick={() => updateSetting('parkingBillingMode', opt.value)}
              >
                {opt.label}
              </PillOption>
            ))}
          </div>
        </Field>

        <Field label="Allowed Vehicle Types" hint="Only selected vehicle types can be submitted in a parking reservation request.">
          <div className="flex flex-wrap gap-2">
            {VEHICLE_TYPES.map((vt) => {
              const isChecked = allowed.includes(vt.value);
              return (
                <PillOption
                  key={vt.value}
                  selected={isChecked}
                  onClick={() => updateSetting(
                    'parkingAllowedVehicleTypes',
                    isChecked ? allowed.filter((t) => t !== vt.value) : [...allowed, vt.value]
                  )}
                >
                  {isChecked && <FontAwesomeIcon icon={faCheck} className="mr-1.5 text-[10px]" />}
                  {vt.label}
                </PillOption>
              );
            })}
          </div>
        </Field>
      </div>
    </SettingsSection>
  );
}
