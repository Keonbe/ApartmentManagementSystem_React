import { PASSWORD_RULES } from '../../utils/validation';

// Live list of the new-password rules, each ticked once met.
export default function PasswordChecklist({ password, className = '' }) {
  const pw = String(password ?? '');
  return (
    <ul className={`mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-xs ${className}`} aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(pw);
        return (
          <li key={rule.key} className={met ? 'text-emerald-700' : 'text-slate-500'}>
            <span aria-hidden="true">{met ? '✓' : '○'}</span> {rule.label}
            <span className="sr-only">{met ? ' (met)' : ' (not met)'}</span>
          </li>
        );
      })}
    </ul>
  );
}
