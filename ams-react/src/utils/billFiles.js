// upload_utility_bill.php names a file after the slot it was attached in
// (bill_electric_..., bill_water_...). Any other file's kind is unknown.
export const billKind = (path) => /\/bill_(electric|water)_/.exec(String(path ?? ''))?.[1] ?? null;
