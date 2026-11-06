// Who the room rate covers and what more people cost (Settings → Rental):
// `included` people are in the rent, each one above that adds `fee` a month,
// and `max` caps the total. With 4 included and a maximum of 6, two are paid.
// The server works the rent out the same way (config.php occupant_surcharge()).
export const DEFAULT_OCCUPANCY = { included: 4, max: 8, fee: 1000 };

// From getSystemSettings() / usePublicSettings(); defaults until they arrive.
export function occupancyFrom(settings) {
  const max = settings?.maxOccupantsPerUnit || DEFAULT_OCCUPANCY.max;
  const included = Math.min(settings?.includedOccupants || DEFAULT_OCCUPANCY.included, max);
  const fee = Number.isFinite(settings?.occupantSurchargePerPerson) ? settings.occupantSurchargePerPerson : DEFAULT_OCCUPANCY.fee;
  return { included, max, fee, paid: Math.max(0, max - included) };
}

// The monthly extra for `n` people.
export const occupancyExtra = (o, n) => Math.max(0, (Number(n) || 0) - o.included) * o.fee;

const peso = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

// "4 included in the rent + 2 more at ₱1,000/month each (max 6)".
export function occupancyRuleText(t, o) {
  if (o.paid === 0 || o.fee === 0) return t('occupancy.ruleFree', { max: o.max });
  return t('occupancy.rule', { included: o.included, paid: o.paid, fee: peso(o.fee), max: o.max });
}

// "With 6: +₱2,000 a month", or '' when nothing is added.
export function occupancyExtraText(t, o, n) {
  const extra = occupancyExtra(o, n);
  return extra > 0 ? t('occupancy.extraNow', { n, amount: peso(extra) }) : '';
}
