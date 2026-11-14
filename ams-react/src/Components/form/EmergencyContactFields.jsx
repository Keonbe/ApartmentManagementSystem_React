import PhoneInput from '../PhoneInput';
import FieldError from './FieldError';
import { invalidCls } from './formHelpers';
import { EMERGENCY_NAME_MAX, EMERGENCY_RELATIONSHIPS } from '../../config/emergencyContact';
import { useLang } from '../../config/i18n';

// The three emergency-contact fields (name, relationship, mobile), shared by
// the rent application and Profile Settings. The page owns the values and the
// useFieldErrors hook; the field ids are `${idPrefix}emergencyName` etc., the
// same names the validators and the server use.
export default function EmergencyContactFields({
    idPrefix = '', form, name, relationship, phone, onChange, disabled = false,
    inputCls, labelCls, required = true,
}) {
    const { t } = useLang();
    const a11y = (field) => form.fieldA11y(field);
    const star = (field) => form.errors[field] && <span className="text-rose-500 ml-0.5">*</span>;
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="flex flex-col space-y-1.5">
                <label htmlFor={`${idPrefix}emergencyName`} className={labelCls}>{t('emergency.name')} {star('emergencyName')}</label>
                <input
                    type="text"
                    {...a11y('emergencyName')}
                    autoComplete="off"
                    value={name}
                    disabled={disabled}
                    maxLength={EMERGENCY_NAME_MAX}
                    required={required}
                    onChange={(e) => onChange('emergencyName', e.target.value)}
                    onBlur={() => onChange('emergencyName', name.trim(), true)}
                    className={inputCls + invalidCls(form.errors.emergencyName)}
                />
                <FieldError id={`${idPrefix}emergencyName`} error={form.errors.emergencyName} className="m-0" />
            </div>
            <div className="flex flex-col space-y-1.5">
                <label htmlFor={`${idPrefix}emergencyRelationship`} className={labelCls}>{t('emergency.relationship')} {star('emergencyRelationship')}</label>
                <select
                    {...a11y('emergencyRelationship')}
                    value={relationship}
                    disabled={disabled}
                    required={required}
                    onChange={(e) => onChange('emergencyRelationship', e.target.value, true)}
                    className={inputCls + invalidCls(form.errors.emergencyRelationship)}
                >
                    <option value="">{t('emergency.selectRelationship')}</option>
                    {EMERGENCY_RELATIONSHIPS.map((r) => <option key={r.value} value={r.value}>{t(`emergency.rel.${r.key}`)}</option>)}
                </select>
                <FieldError id={`${idPrefix}emergencyRelationship`} error={form.errors.emergencyRelationship} className="m-0" />
            </div>
            <div className="flex flex-col space-y-1.5">
                <label htmlFor={`${idPrefix}emergencyPhone`} className={labelCls}>{t('emergency.phone')} {star('emergencyPhone')}</label>
                <PhoneInput
                    id={`${idPrefix}emergencyPhone`}
                    name="emergencyPhone"
                    value={phone}
                    disabled={disabled}
                    onChange={(digits) => onChange('emergencyPhone', digits)}
                    onBlur={() => onChange('emergencyPhone', phone, true)}
                    error={form.errors.emergencyPhone}
                    required={required}
                />
            </div>
        </div>
    );
}
