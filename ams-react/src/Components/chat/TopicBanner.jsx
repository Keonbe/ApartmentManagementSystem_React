import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEnvelopeOpenText, faTriangleExclamation, faCircleQuestion } from '@fortawesome/free-solid-svg-icons';

// What a conversation is about, at the top of the chat: an inquiry or a problem
// report, with its status (every chat: the widget, Messages, the Inquiries window).
//   <TopicBanner kind="inquiry" title="Inquiry · Unit I" status="Contacted" tone="sky"
//     note="The office asked if this is resolved">{actions}</TopicBanner>
// tone colours the status pill: indigo (new), sky, amber (in progress / waiting),
// violet (reserved), emerald (resolved / converted), slate (closed).
const TONES = {
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  sky: 'bg-sky-50 text-sky-800 ring-sky-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  violet: 'bg-violet-50 text-violet-800 ring-violet-200',
  emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
};

export default function TopicBanner({ kind = 'inquiry', title, status, tone = 'slate', note, children, className = '' }) {
  const report = kind === 'report';
  return (
    <div role="note" className={`flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b px-3 py-2 ${report ? 'border-rose-100 bg-rose-50/60' : 'border-indigo-100 bg-indigo-50/50'} ${className}`}>
      <FontAwesomeIcon icon={report ? faTriangleExclamation : faEnvelopeOpenText} className={`text-xs ${report ? 'text-rose-500' : 'text-indigo-500'}`} aria-hidden="true" />
      <span className="min-w-0 truncate text-xs font-semibold text-slate-800">{title}</span>
      {status && <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${TONES[tone] || TONES.slate}`}>{status}</span>}
      {note && (
        <span className="inline-flex min-w-0 items-center gap-1 text-[11px] text-slate-500">
          <FontAwesomeIcon icon={faCircleQuestion} className="text-[10px]" aria-hidden="true" />{note}
        </span>
      )}
      {children && <span className="ml-auto flex flex-wrap items-center gap-1.5">{children}</span>}
    </div>
  );
}
