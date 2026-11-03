// CCTV footage request choices (Admin → Settings → CCTV): the camera locations
// and incident types a tenant picks from, how many days back an incident may
// be, and the shortest reason. Stored as system settings; the defaults below
// match backend/config.php (cctv_settings), so a building that never edits
// them sees what the form always showed.

import api from '../api/axiosConfig';

export const CCTV_DEFAULTS = {
  locations: ['1st Floor', '2nd Floor', '3rd Floor', 'All Floors'],
  incidentTypes: [
    { key: 'theft', label: 'Theft or missing item' },
    { key: 'vandalism', label: 'Vandalism' },
    { key: 'accident_injury', label: 'Accident or injury' },
    { key: 'property_damage', label: 'Property damage' },
    { key: 'security_concern', label: 'Security concern (trespassing, harassment)' },
    { key: 'other', label: 'Other incident (describe below)' },
  ],
  lookbackDays: 60,
  minReasonLength: 10,
  footageDays: 14,
};

// "Other" is the one fixed type: always present, always last, needs a written
// description (cctv_request.php enforces the same 20).
export const CCTV_OTHER_KEY = 'other';
export const CCTV_OTHER_REASON_MIN = 20;
export const CCTV_MAX_LOCATIONS = 12;
export const CCTV_MAX_INCIDENT_TYPES = 10;

const DEFAULT_LOCATION_I18N = {
  '1st Floor': 'cctv.floor1',
  '2nd Floor': 'cctv.floor2',
  '3rd Floor': 'cctv.floor3',
  'All Floors': 'cctv.allFloors',
};

const wholeNumber = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
};

// Reads the cctv_* keys of get_system_settings.php. A missing or garbled value
// falls back to the default, so the form never opens with an empty dropdown.
export const parseCctvConfig = (raw = {}) => {
  const locations = Array.isArray(raw.cctv_locations)
    ? raw.cctv_locations.filter((l) => typeof l === 'string' && l.trim() !== '')
    : [];
  const types = Array.isArray(raw.cctv_incident_types)
    ? raw.cctv_incident_types.filter((t) => t && typeof t.key === 'string' && typeof t.label === 'string')
    : [];
  return {
    locations: locations.length ? locations : CCTV_DEFAULTS.locations,
    incidentTypes: types.some((t) => t.key === CCTV_OTHER_KEY) ? types : CCTV_DEFAULTS.incidentTypes,
    lookbackDays: wholeNumber(raw.cctv_lookback_days, 1, 365, CCTV_DEFAULTS.lookbackDays),
    minReasonLength: wholeNumber(raw.cctv_min_reason_length, 5, 200, CCTV_DEFAULTS.minReasonLength),
    footageDays: wholeNumber(raw.cctv_footage_days, 1, 90, CCTV_DEFAULTS.footageDays),
  };
};

// The form works with the defaults if the settings cannot be loaded; the
// backend checks the submitted values against the real ones either way.
export const loadCctvConfig = async () => {
  try {
    const res = await api.get('get_system_settings.php');
    return res.data?.success ? parseCctvConfig(res.data.settings) : CCTV_DEFAULTS;
  } catch {
    return CCTV_DEFAULTS;
  }
};

// Labels the app ships with are translated; a name the admin typed is shown as typed.
export const locationLabel = (location, t) => {
  const key = DEFAULT_LOCATION_I18N[location];
  return t && key ? t(key) : location;
};

export const incidentTypeLabel = (types, key, t) => {
  if (!key) return t ? t('cctv.typeNone') : 'Not specified';
  const type = (types || []).find((x) => x.key === key);
  const builtIn = CCTV_DEFAULTS.incidentTypes.find((x) => x.key === key);
  if (type) return t && builtIn && builtIn.label === type.label ? t(`cctv.type.${key}`) : type.label;
  // A type the admin has since removed: requests filed under it keep reading sensibly.
  if (builtIn) return builtIn.label;
  return key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
};
