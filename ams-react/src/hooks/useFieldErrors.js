import { useState } from 'react';
import { apiFieldErrors } from '../utils/apiError';

// Per-field error state for a form. `validators` maps a field name to
// (value, values) => message ('' when fine). Pages validate a field on blur,
// clear it on change, and run validateAll on submit.
//
//   const { errors, validateField, validateAll, clearError, fieldA11y } = useFieldErrors({
//     email: (v) => checkEmail(v),
//   });
//   <input {...fieldA11y('email')} onBlur={() => validateField('email', form)} ... />
//   <FieldError id="email" error={errors.email} />
//
// Ids are prefixed with `idPrefix` so two forms on one page don't collide.
export default function useFieldErrors(validators = {}, { idPrefix = '' } = {}) {
  const [errors, setErrors] = useState({});

  const idFor = (name) => `${idPrefix}${name}`;

  const focusField = (name) => {
    const el = document.getElementById(idFor(name));
    if (el && typeof el.focus === 'function') el.focus();
  };

  const setFieldError = (name, message) => {
    setErrors((prev) => {
      if ((prev[name] || '') === (message || '')) return prev;
      const next = { ...prev };
      if (message) next[name] = message; else delete next[name];
      return next;
    });
  };

  const validateField = (name, values) => {
    const fn = validators[name];
    const message = fn ? fn(values?.[name], values || {}) || '' : '';
    setFieldError(name, message);
    return message;
  };

  const clearError = (name) => setFieldError(name, '');

  // Runs every validator (or only `names`, for a page whose forms share one
  // hook); focuses the first invalid field. True when valid.
  const validateAll = (values, names = Object.keys(validators)) => {
    const next = {};
    for (const name of names) {
      const fn = validators[name];
      const message = fn ? fn(values?.[name], values || {}) : '';
      if (message) next[name] = message;
    }
    setErrors(next);
    const first = Object.keys(next)[0];
    if (first) focusField(first);
    return !first;
  };

  // Puts server field errors onto the form. True if the response named a field.
  const applyServerErrors = (errOrRes) => {
    const fieldErrors = apiFieldErrors(errOrRes);
    const names = Object.keys(fieldErrors);
    if (!names.length) return false;
    setErrors((prev) => ({ ...prev, ...fieldErrors }));
    focusField(names[0]);
    return true;
  };

  const fieldA11y = (name) => ({
    id: idFor(name),
    name,
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `${idFor(name)}-error` : undefined,
  });

  return { errors, setErrors, setFieldError, validateField, validateAll, clearError, applyServerErrors, fieldA11y, idFor };
}
