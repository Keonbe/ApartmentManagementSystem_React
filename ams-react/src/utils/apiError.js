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
