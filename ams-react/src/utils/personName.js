// A person's display name: first name, last name and suffix ("Juan Dela Cruz
// Jr."), blanks skipped. `p` is a user, application or API row; `prefix` reads
// prefixed keys (e.g. 'tenant_' for tenant_first_name). Same rule as
// person_name() in backend/config.php.
export function personName(p, prefix = '') {
  if (!p) return '';
  return [p[`${prefix}first_name`], p[`${prefix}last_name`], p[`${prefix}suffix`]]
    .map((v) => String(v ?? '').trim())
    .filter(Boolean)
    .join(' ');
}
