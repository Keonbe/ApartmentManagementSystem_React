// Upload rules, mirrored from each backend endpoint so a wrong file is refused
// before a 10 MB round trip. The backend re-checks everything (size, extension
// and the real MIME type via finfo). Note config.php caps post_max_size at 12M.

const MB = 1024 * 1024;

const IMAGE = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
const VIDEO = ['mp4', 'm4v', 'webm', 'mov'];

export const FILE_RULES = {
  // rent_application.php, parking_reservation.php, upload_lease_document.php
  document:    { maxMB: 10, ext: ['jpg', 'jpeg', 'png', 'pdf'], label: 'JPG, PNG or PDF' },
  // upload_payment_proof.php
  paymentProof: { maxMB: 10, ext: ['jpg', 'jpeg', 'png', 'webp', 'pdf'], label: 'JPG, PNG, WEBP or PDF' },
  // PaymentUpload receipt photo (the page promises JPG/PNG up to 5 MB)
  receiptImage: { maxMB: 5, ext: ['jpg', 'jpeg', 'png'], label: 'JPG or PNG' },
  // store_room_image(), profile.php avatar
  image:       { maxMB: 10, ext: IMAGE, label: 'JPG, PNG, GIF or WEBP' },
  // store_maintenance_attachment()
  maintenance: { maxMB: 10, ext: [...IMAGE, ...VIDEO], label: 'an image or a short video' },
  // service_request.php
  service:     { maxMB: 10, ext: [...IMAGE, 'pdf'], label: 'an image or PDF' },
  // check_in_visitor.php
  visitorId:   { maxMB: 5, ext: ['jpg', 'jpeg', 'png', 'webp'], label: 'JPG, PNG or WEBP' },
  // lease upload on TrackApplication
  pdf:         { maxMB: 5, ext: ['pdf'], label: 'PDF' },
};

// Returns an error message, or '' when the file is acceptable (or absent).
export const checkFile = (file, rule) => {
  if (!file) return '';
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!rule.ext.includes(ext)) {
    return `"${file.name}" is not an allowed file type. Use ${rule.label}.`;
  }
  if (file.size > rule.maxMB * MB) {
    return `"${file.name}" is ${(file.size / MB).toFixed(1)} MB. The limit is ${rule.maxMB} MB.`;
  }
  return '';
};

// config.php sets post_max_size to 12M: a request whose files add up to more
// than that arrives with no files at all, so multi-file uploads check the sum.
export const POST_MAX_MB = 12;

export const checkFiles = (files, rule, { maxCount = Infinity } = {}) => {
  const list = Array.from(files || []);
  if (list.length > maxCount) return `You can upload at most ${maxCount} file(s) here.`;
  for (const file of list) {
    const error = checkFile(file, rule);
    if (error) return error;
  }
  const total = list.reduce((sum, f) => sum + f.size, 0);
  if (total > POST_MAX_MB * MB) {
    return `These files add up to ${(total / MB).toFixed(1)} MB. Upload at most ${POST_MAX_MB} MB at a time.`;
  }
  return '';
};

// accept= value for an <input type="file"> from a rule.
export const acceptFor = (rule) => rule.ext.map((e) => `.${e}`).join(',');
