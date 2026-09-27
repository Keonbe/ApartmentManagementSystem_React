// The message under an invalid field. `id` is the field's id; the paragraph
// gets `${id}-error`, which the field points at through aria-describedby.
export default function FieldError({ id, error, className = '' }) {
  if (!error) return null;
  return (
    <p id={`${id}-error`} role="alert" className={`text-red-500 text-xs mt-1 ${className}`}>
      {error}
    </p>
  );
}
