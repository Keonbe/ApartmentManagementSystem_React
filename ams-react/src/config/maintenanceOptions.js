// Mirrors MAINTENANCE_CATEGORIES / MAINTENANCE_URGENCIES / MAINTENANCE_TRANSITIONS in backend/config.php.
export const MAINTENANCE_CATEGORIES = [
  { value: 'Plumbing', i18nKey: 'maintenance.plumbing' },
  { value: 'Electrical', i18nKey: 'maintenance.electrical' },
  { value: 'Structural/Physical', i18nKey: 'maintenance.structural' },
  { value: 'Water Supply', i18nKey: 'maintenance.waterSupply' },
  { value: 'General Maintenance', i18nKey: 'maintenance.generalMaintenance' },
  { value: 'Others', i18nKey: 'maintenance.others' },
];

export const MAINTENANCE_URGENCIES = [
  { value: 'Low', i18nKey: 'maintenance.low', weight: 1, color: 'bg-slate-100 text-slate-700 border-slate-200' },
  { value: 'Medium', i18nKey: 'maintenance.medium', weight: 2, color: 'bg-blue-100 text-blue-800 border-blue-200' },
  { value: 'High', i18nKey: 'maintenance.high', weight: 3, color: 'bg-amber-100 text-amber-800 border-amber-200' },
  { value: 'Urgent', i18nKey: 'maintenance.urgent', weight: 4, color: 'bg-red-100 text-red-800 border-red-200' },
];

// Priority is assigned by the admin, not the tenant. Every tenant-submitted
// ticket starts here; it is intentionally outside MAINTENANCE_URGENCIES so it
// can never be picked from a priority dropdown, only replaced by triage.
// Ranked above Urgent (not below Low) so untriaged tickets surface at the top
// of the queue instead of sinking to the bottom.
export const MAINTENANCE_DEFAULT_URGENCY = 'Needs Triage';
const NEEDS_TRIAGE_WEIGHT = 5;
const NEEDS_TRIAGE_COLOR = 'bg-violet-50 text-violet-700 border-violet-200 border-dashed';

export const MAINTENANCE_TRANSITIONS = {
  'Pending': ['In Progress', 'Rejected'],
  'In Progress': ['Completed', 'Pending', 'Cancelled'],
  'Completed': ['In Progress'],
  'Rejected': [],
  'Cancelled': [],
};

export const MAINTENANCE_STATUS_STYLES = {
  'Pending': 'bg-amber-100 text-amber-800 border-amber-200',
  'In Progress': 'bg-indigo-100 text-indigo-800 border-indigo-200',
  'Completed': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Rejected': 'bg-red-100 text-red-800 border-red-200',
  'Cancelled': 'bg-slate-100 text-slate-600 border-slate-200',
};

export const urgencyWeight = (value) => {
  if (value === MAINTENANCE_DEFAULT_URGENCY) return NEEDS_TRIAGE_WEIGHT;
  return MAINTENANCE_URGENCIES.find(u => u.value === value)?.weight ?? 0;
};

export const urgencyColor = (value) => {
  if (value === MAINTENANCE_DEFAULT_URGENCY) return NEEDS_TRIAGE_COLOR;
  return MAINTENANCE_URGENCIES.find(u => u.value === value)?.color ?? 'bg-slate-100 text-slate-700 border-slate-200';
};
