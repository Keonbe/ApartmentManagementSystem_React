// The message to show for a failed API call. Works for both shapes the backend
// uses: HTTP 200 with {success:false, message} (pass the response), and a 4xx/5xx
// that axios throws (pass the error), so pages keep working when endpoints move
// validation failures to 422.
export const apiErrorMessage = (errOrRes, fallback = 'Something went wrong. Please try again.') => {
  const data = errOrRes?.response?.data ?? errOrRes?.data;
  if (data && typeof data === 'object' && typeof data.message === 'string' && data.message.trim()) {
    return data.message;
  }
  if (errOrRes?.isAxiosError && !errOrRes.response) {
    return 'Cannot reach the server. Check your connection and try again.';
  }
  return fallback;
};

// Every problem a failed call reported, as one string: each field error once
// (a validation_fail() response lists them all), else the message. For pages
// that show errors in a toast rather than under each field.
export const apiErrorSummary = (errOrRes, fallback) => {
  const messages = [...new Set(Object.values(apiFieldErrors(errOrRes)))];
  return messages.length > 1 ? messages.join(' ') : apiErrorMessage(errOrRes, fallback);
};

// Field-level errors from a failed call, as { field: message }. Reads both
// shapes: an `errors` map (values may be strings or arrays of strings) and the
// single `{message, field}` the backend plan's validation_fail() will send.
// Returns {} when the response names no field, so the caller shows the banner.
export const apiFieldErrors = (errOrRes) => {
  const data = errOrRes?.response?.data ?? errOrRes?.data;
  if (!data || typeof data !== 'object') return {};
  const out = {};
  // `fieldErrors` is the same map under the name create_announcement.php uses.
  const map = data.errors ?? data.fieldErrors;
  if (map && typeof map === 'object' && !Array.isArray(map)) {
    for (const [field, msg] of Object.entries(map)) {
      const text = Array.isArray(msg) ? msg.find((m) => typeof m === 'string' && m.trim()) : msg;
      if (typeof text === 'string' && text.trim()) out[field] = text;
    }
  }
  if (typeof data.field === 'string' && data.field && typeof data.message === 'string' && !out[data.field]) {
    out[data.field] = data.message;
  }
  return out;
};
