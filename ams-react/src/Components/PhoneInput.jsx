import { toPhLocal10 } from '../utils/validation';
import FieldError from './form/FieldError';

// Philippine mobile input with a fixed +63 prefix. The value is the 10-digit
// local part (9XXXXXXXXX); callers submit toPhE164(value) and pre-fill with
// toPhLocal10(stored). Every endpoint stores the normalized +639XXXXXXXXX.

// Typed digits are kept as-is (so a partial "0" or "63" is not swallowed); only
// a pasted full number (more than 10 digits) has its prefix stripped.
const toLocalDigits = (raw) => {
    const digits = String(raw ?? '').replace(/\D/g, '');
    return digits.length > 10 ? toPhLocal10(digits) : digits;
};
export default function PhoneInput({
    value,
    onChange,
    onBlur,
    error,
    required = false,
    disabled = false,
    id,
    name,
    placeholder = '917 123 4567',
    inputClassName = '',
    prefixClassName = '',
}) {
    return (
        <div>
            <div className="w-full flex relative">
                <div className={prefixClassName || "flex items-center space-x-1 px-3 bg-slate-100 border border-slate-200 rounded-l-xl text-slate-800 text-sm font-bold select-none border-r-0 pointer-events-none opacity-80 box-border"}>
                    <span>🇵🇭</span>
                    <span className="text-xs font-semibold">+63</span>
                </div>
                <input
                    id={id}
                    name={name}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => onChange(toLocalDigits(e.target.value))}
                    onBlur={onBlur}
                    required={required}
                    disabled={disabled}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error && id ? `${id}-error` : undefined}
                    className={inputClassName || `focus-glow w-full flex-grow px-4 py-2.5 rounded-r-xl bg-slate-50 border text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-sm box-border disabled:opacity-60 ${error ? 'border-red-400' : 'border-slate-200'}`}
                />
            </div>
            <FieldError id={id} error={error} />
        </div>
    );
}
