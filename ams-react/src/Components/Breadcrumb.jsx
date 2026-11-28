import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

/**
 * Accessible, lightweight breadcrumb navigation component.
 *
 * @param {Array<{ label: string, to?: string, icon?: string }>} items
 * @param {string} className
 */
export default function Breadcrumb({ items = [], className = '' }) {
  if (!items || items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={`flex items-center text-xs font-medium text-slate-500 ${className}`}>
      <ol className="flex items-center flex-wrap gap-1.5 p-0 m-0 list-none">
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          const isFirst = idx === 0;

          return (
            <li key={idx} className="flex items-center gap-1.5">
              {idx > 0 && (
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
              )}
              {isLast ? (
                <span
                  className="font-bold text-slate-800 select-none"
                  aria-current="page"
                >
                  {item.label}
                </span>
              ) : item.to ? (
                <Link
                  to={item.to}
                  className="text-slate-500 hover:text-indigo-600 transition-colors flex items-center gap-1"
                >
                  {isFirst && item.icon === 'home' && <Home className="w-3.5 h-3.5" aria-hidden="true" />}
                  {item.label}
                </Link>
              ) : (
                <span className="text-slate-500">{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
