// The legal grounds for flagging a rent contract for eviction or terminating it
// (RA 9653 Sec. 9). Mirrors EJECTMENT_GROUNDS / TERMINATION_EXTRA_GROUNDS in
// backend/config.php, which re-checks every rule.

export const EJECTMENT_GROUNDS = [
  { value: 'arrears', label: 'Rent arrears totalling three months' },
  { value: 'sublease', label: 'Sublease or assignment without written consent' },
  { value: 'owner_use', label: 'Owner or immediate family needs the unit (term expired, 3-month notice)' },
  { value: 'condemnation', label: 'Order of condemnation requiring repairs' },
  { value: 'lease_expired', label: 'Rent term has expired' },
];

export const TERMINATION_EXTRA_GROUNDS = [
  { value: 'mutual', label: 'Mutual agreement with the tenant' },
];

export const EJECTMENT_GROUND_LABELS = Object.fromEntries(
  [...EJECTMENT_GROUNDS, ...TERMINATION_EXTRA_GROUNDS].map((g) => [g.value, g.label]),
);
