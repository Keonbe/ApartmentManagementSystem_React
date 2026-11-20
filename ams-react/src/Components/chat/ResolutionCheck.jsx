import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleQuestion, faCircleCheck, faClock } from '@fortawesome/free-solid-svg-icons';

// The office's "Is it resolved?" in a chat: a guest inquiry chat (guest_messages,
// guest_chat.php) or an account chat about an inquiry or a problem report
// (messages.kind = 'resolution_check', chat_followup.php). The person asked gets
// the two answers as buttons until one is picked; afterwards both sides see it.
//   viewer   'guest' = the person asked (guest, tenant, prospect) or 'admin'
//   onAnswer (answer) => void, for the person asked: 'resolved' | 'not_yet'
//   account  an account chat (the admin sees "They answered...", not "Guest answered...")
// A message with complaint_id is about a problem report: "Is the problem fixed?".
export default function ResolutionCheck({ message, viewer, onAnswer, busy = false, t, account = false }) {
  const answer = message.resolution_answer;
  const isGuest = viewer === 'guest';
  const report = Boolean(message.complaint_id);
  const them = account ? 'they' : 'guest';
  const status = answer === 'resolved'
    ? { icon: faCircleCheck, cls: 'text-emerald-700', text: t(isGuest ? 'chat.resolution.youResolved' : `chat.resolution.${them}Resolved`) }
    : answer === 'not_yet'
      ? { icon: faClock, cls: 'text-amber-700', text: t(isGuest ? 'chat.resolution.youNotYet' : `chat.resolution.${them}NotYet`) }
      : isGuest ? null : { icon: faClock, cls: 'text-slate-500', text: t(account ? 'chat.resolution.waitingThem' : 'chat.resolution.waiting') };

  return (
    <div className={`flex ${isGuest ? 'justify-start' : 'justify-end'}`}>
      <div className="w-full max-w-[85%] rounded-2xl border border-indigo-200 bg-white p-3 shadow-sm animate-fade-in-up">
        <p className="m-0 flex items-center gap-2 text-sm font-bold text-slate-900">
          <FontAwesomeIcon icon={faCircleQuestion} className="text-indigo-600" aria-hidden="true" />
          {t(report ? 'chat.resolution.reportQuestion' : 'chat.resolution.question')}
        </p>
        {isGuest && !answer ? (
          <div role="group" aria-label={t('chat.resolution.question')} className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onAnswer?.('resolved')}
              className="min-h-[40px] rounded-xl border-0 bg-emerald-600 px-3 text-sm font-bold text-white cursor-pointer transition-[background-color,transform] hover:bg-emerald-700 active:scale-[0.97] disabled:opacity-50"
            >
              {t(report ? 'chat.resolution.fixed' : 'chat.resolution.resolved')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onAnswer?.('not_yet')}
              className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 cursor-pointer transition-[background-color,transform] hover:bg-slate-50 active:scale-[0.97] disabled:opacity-50"
            >
              {t('chat.resolution.notYet')}
            </button>
          </div>
        ) : status && (
          <p className={`m-0 mt-2 flex items-start gap-1.5 text-xs font-semibold ${status.cls}`}>
            <FontAwesomeIcon icon={status.icon} className="mt-0.5" aria-hidden="true" />
            {status.text}
          </p>
        )}
      </div>
    </div>
  );
}
