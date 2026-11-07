import { faMotorcycle, faCar, faBicycle, faVanShuttle, faTruckPickup } from '@fortawesome/free-solid-svg-icons';

// Vehicle types a parking slot can take, and the icons a slot can show
// (PARKING_VEHICLE_TYPES / PARKING_SLOT_ICONS in backend/config.php).
// An e-bike has no plate number and no transmission.
export const VEHICLE_TYPES = [
  { value: 'motorcycle', label: 'Motorcycle', icon: faMotorcycle },
  { value: 'ebike', label: 'E-bike', icon: faBicycle },
  { value: 'sedan', label: 'Sedan', icon: faCar },
  { value: 'suv', label: 'SUV', icon: faCar },
  { value: 'pickup', label: 'Pickup', icon: faTruckPickup },
  { value: 'van', label: 'Van', icon: faVanShuttle },
];

export const SLOT_ICONS = [
  { value: 'motorcycle', label: 'Motorcycle', icon: faMotorcycle },
  { value: 'car', label: 'Car', icon: faCar },
  { value: 'ebike', label: 'E-bike', icon: faBicycle },
  { value: 'van', label: 'Van', icon: faVanShuttle },
];

export const NO_PLATE_TYPES = ['ebike'];

const ICON_BY_VALUE = Object.fromEntries(SLOT_ICONS.map((i) => [i.value, i.icon]));
const TYPE_BY_VALUE = Object.fromEntries(VEHICLE_TYPES.map((t) => [t.value, t]));

export const slotIcon = (value) => ICON_BY_VALUE[value] || faMotorcycle;
export const vehicleLabel = (value) => TYPE_BY_VALUE[String(value || '').toLowerCase()]?.label || value || 'Vehicle';
export const vehicleIcon = (value) => TYPE_BY_VALUE[String(value || '').toLowerCase()]?.icon || faCar;

// "Motorcycle, E-bike" for a slot's list of types.
export const typesText = (types = []) => types.map(vehicleLabel).join(', ');

export const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
