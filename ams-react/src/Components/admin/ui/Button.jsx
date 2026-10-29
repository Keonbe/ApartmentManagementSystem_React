import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';
import { btn } from './styles';

// <Button variant="primary|secondary|danger|danger-outline|success|ghost|link" size="sm|md"
//         icon={faPlus} loading={saving}>Save</Button>
// While loading it is disabled and shows a spinner in place of the icon.
export default function Button({
  variant = 'primary', size = 'md', icon, loading = false, type = 'button',
  className = '', disabled, children, ...rest
}) {
  return (
    <button type={type} disabled={disabled || loading} className={btn(variant, size, className)} {...rest}>
      {loading
        ? <FontAwesomeIcon icon={faSpinner} spin aria-hidden="true" />
        : icon && <FontAwesomeIcon icon={icon} aria-hidden="true" />}
      {children}
    </button>
  );
}
