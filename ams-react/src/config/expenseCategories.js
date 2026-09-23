// Categories accepted by backend/api/manage_expenses.php (EXPENSE_CATEGORIES).
export const EXPENSE_CATEGORY_LABELS = {
  utilities: 'Building utilities',
  supplies: 'Supplies',
  salaries: 'Salaries & wages',
  repairs_common: 'Common-area upkeep',
  taxes_fees: 'Taxes & fees',
  insurance: 'Insurance',
  other: 'Other',
};

export const expenseCategoryLabel = (key) => EXPENSE_CATEGORY_LABELS[key] || key;
