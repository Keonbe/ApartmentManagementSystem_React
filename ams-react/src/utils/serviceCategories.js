// A service category's name in the tenant's language (Filipino when the admin wrote one).
export const categoryName = (categories, key, lang) => {
  const category = categories.find((c) => c.key === key);
  if (!category) return key;
  return lang === 'fil' && category.labelFil ? category.labelFil : category.label;
};

// The keys in display order: the admin's category order, then any key only a service uses.
export const categoryOrder = (categories, usedKeys) => [
  ...categories.map((c) => c.key),
  ...[...new Set(usedKeys)].filter((key) => !categories.some((c) => c.key === key)),
];
