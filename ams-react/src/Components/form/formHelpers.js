// Red border for an invalid field; append to the input's own classes.
export const invalidCls = (error) => (error ? ' !border-red-400 ring-1 ring-red-400' : '');

// onKeyDown for number inputs: blocks e/E/+/- (and '.' for whole numbers),
// which type="number" otherwise accepts.
export const blockNonNumericKeys = (e, { decimal = true } = {}) => {
  const blocked = decimal ? ['e', 'E', '+', '-'] : ['e', 'E', '+', '-', '.', ','];
  if (blocked.includes(e.key)) e.preventDefault();
};

export const blockNonIntegerKeys = (e) => blockNonNumericKeys(e, { decimal: false });

// A number input's value for state. An empty field stays '' (a `required`
// input or a validator then reports it) instead of Number('') becoming 0.
export const numberValue = (e) => (e.target.value === '' ? '' : Number(e.target.value));

// Clears a file input so choosing the same (rejected) file again fires onChange.
export const resetFileInput = (input) => {
  if (input) input.value = '';
};

export const formatFileSize = (bytes) => {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
