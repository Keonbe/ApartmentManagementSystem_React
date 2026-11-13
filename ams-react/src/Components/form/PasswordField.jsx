import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import { PASSWORD_MAX_BYTES } from '../../utils/validation';
import FieldError from './FieldError';
import { invalidCls } from './formHelpers';

const DEFAULT_INPUT = 'w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner text-base sm:text-sm pr-12 box-border';

// Labelled password input with a show/hide toggle and an inline error.
// `a11y` is useFieldErrors().fieldA11y(name) (id, name, aria-*).
export default function PasswordField({
  a11y,
  label,
  value,
  onChange,
  onBlur,
  error,
  autoComplete = 'new-password',
  maxLength = PASSWORD_MAX_BYTES,
  required = true,
  placeholder = '••••••••••••',
  labelClassName = 'text-xs font-bold text-slate-700',
  inputClassName = DEFAULT_INPUT,
  children,
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex flex-col space-y-1.5">
      <label htmlFor={a11y.id} className={labelClassName}>
        {label}{required && <span className="text-red-600"> *</span>}
      </label>
      <div className="relative">
        <input
          {...a11y}
          type={shown ? 'text' : 'password'}
          autoComplete={autoComplete}
          maxLength={maxLength}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          required={required}
          className={`${inputClassName}${invalidCls(error)}`}
        />
        <button
          type="button"
          onClick={() => setShown(!shown)}
          aria-label={shown ? `Hide ${label}` : `Show ${label}`}
          className="absolute right-1 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:text-slate-700 bg-transparent border-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-indigo-500"
        >
          <FontAwesomeIcon icon={shown ? faEyeSlash : faEye} />
        </button>
      </div>
      <FieldError id={a11y.id} error={error} className="m-0" />
      {children}
    </div>
  );
}
