import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTimes, faPaperPlane, faEnvelope, faPhone, faBuilding, faCalendarAlt, faUsers,
  faCircleQuestion, faCircleCheck, faHourglassHalf, faCommentSlash, faArrowUpRightFromSquare, faPaperclip,
} from '@fortawesome/free-solid-svg-icons';
import api, { API_WRITE_EVENT } from '../../../api/axiosConfig';
import fileUrl from '../../../api/fileUrl';
import { apiErrorMessage } from '../../../utils/apiError';
import Modal from '../Modal';
import PersonAvatar from '../PersonAvatar';
import { btn } from '../ui/styles';

// One inquiry as a chat (Admin → Inquiries): the conversation with a reply box on
// the left, the inquiry's details and actions (`children`, from AdminInquiries)
// on the right; on a phone they are two tabs.
//
// inquiry_thread.php gives the messages and marks the inquiry seen (it stops
// counting as New). A reply goes through the chat's own endpoint, which marks a
// New inquiry Contacted: guest_chat.php for a guest, send_message.php with
// inquiry_id for an account holder. Walk-in / phone inquiries have no chat.
//   <InquiryChatModal inquiry={row} statusBadge={<span…/>} meta="Received …" onClose onChanged>{actions}</InquiryChatModal>
const POLL_MS = 8000;
const MAX_LEN = 4000;

const parseDb = (v) => (v ? new Date(String(v).replace(' ', 'T')) : null);
const timeLabel = (v) => {
  const d = parseDb(v);
  if (!d || Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const fmtDay = (v) => {
  const d = parseDb(v);
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
};
const isImage = (path) => /\.(jpe?g|png|gif|webp)$/i.test(path || '');

function Attachment({ path, mine }) {
  if (!path) return null;
  const url = fileUrl(path);
  return isImage(path) ? (
    <a href={url} target="_blank" rel="noreferrer" className="mt-1.5 block overflow-hidden rounded-xl">
      <img src={url} alt="Attachment" className="max-h-56 w-auto max-w-full object-contain" />
    </a>
  ) : (
    <a href={url} target="_blank" rel="noreferrer" className={`mt-1.5 inline-flex items-center gap-1.5 text-label font-semibold underline ${mine ? 'text-white' : 'text-indigo-700'}`}>
      <FontAwesomeIcon icon={faPaperclip} aria-hidden="true" /> Open attachment
    </a>
  );
}

export default function InquiryChatModal({ inquiry, statusBadge, meta, onClose, onChanged, children }) {
  const [thread, setThread] = useState(null); // inquiry_thread.php body
  const [loadError, setLoadError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [tab, setTab] = useState('chat'); // phones: chat | details
  const listRef = useRef(null);
  const lastCount = useRef(0);
  const seenReported = useRef(false);
  const onChangedRef = useRef(onChanged);
  useEffect(() => { onChangedRef.current = onChanged; }, [onChanged]);

  const load = useCallback(async () => {
    try {
      const res = await api.get('inquiry_thread.php', { params: { id: inquiry.id } });
      if (!res.data?.success) { setLoadError(res.data?.message || 'Could not load the conversation.'); return; }
      setThread(res.data);
      setLoadError('');
      // The first open marks it seen: refresh the list once so its New mark goes.
      if (!seenReported.current) {
        seenReported.current = true;
        if (!inquiry.adminSeenAt) {
          onChangedRef.current?.();
          // Seen is set by a GET: tell the sidebar counts to refresh, as a save would.
          window.dispatchEvent(new CustomEvent(API_WRITE_EVENT));
        }
      }
    } catch (err) {
      setLoadError(apiErrorMessage(err, 'Could not load the conversation.'));
    }
  }, [inquiry.id, inquiry.adminSeenAt]);

  useEffect(() => {
    // Loaded once on open, then polled while the tab is visible.
    const first = setTimeout(load, 0);
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, POLL_MS);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [load]);

  // Keep the newest message in view when one arrives.
  const count = thread?.messages?.length || 0;
  useEffect(() => {
    if (count !== lastCount.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
    lastCount.current = count;
  }, [count, tab]);

  const send = async (e) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || sending || !thread?.canReply) return;
    setSending(true);
    setSendError('');
    try {
      const res = thread.channel === 'guest'
        ? await api.post('guest_chat.php', { thread_id: inquiry.id, message: text })
        : await api.post('send_message.php', { receiver_id: thread.inquiry.userId, message: text, inquiry_id: inquiry.id });
      if (res.data?.success === false) throw new Error(res.data.message || 'The reply was not sent.');
      setDraft('');
      await load();
      onChangedRef.current?.();
    } catch (err) {
      setSendError(apiErrorMessage(err, err?.message || 'The reply was not sent. Please try again.'));
    } finally {
      setSending(false);
    }
  };

  const messages = thread?.messages || [];
  const isNew = (thread?.inquiry?.status || inquiry.status) === 'New';
  const replyHint = isNew ? 'Sending a reply marks this inquiry as contacted.' : 'Enter sends, Shift + Enter adds a line.';

  return (
    <Modal
      title={inquiry.fullName}
      onClose={onClose}
      overlayClassName="flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4"
      className="bg-white rounded-card shadow-dialog border border-slate-200 w-full max-w-5xl h-[92vh] sm:h-[86vh] overflow-hidden flex flex-col"
    >
      {/* Header: who, status, how to reach them */}
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-6 sm:py-4 shrink-0">
        <div className="flex min-w-0 items-center gap-3">
          <PersonAvatar name={inquiry.fullName} size="md" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="m-0 truncate text-title font-bold text-slate-800">{inquiry.fullName}</h3>
              {statusBadge}
            </div>
            <p className="m-0 mt-0.5 text-label text-slate-500">{meta}</p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-label">
              {inquiry.email && (
                <a href={`mailto:${inquiry.email}`} className="inline-flex min-w-0 items-center gap-1.5 text-slate-600 no-underline hover:text-indigo-700">
                  <FontAwesomeIcon icon={faEnvelope} className="text-[11px] text-slate-400" aria-hidden="true" /><span className="truncate">{inquiry.email}</span>
                </a>
              )}
              {inquiry.contactNo && (
                <a href={`tel:${String(inquiry.contactNo).replace(/\s+/g, '')}`} className="inline-flex items-center gap-1.5 text-slate-600 no-underline hover:text-indigo-700">
                  <FontAwesomeIcon icon={faPhone} className="text-[11px] text-slate-400" aria-hidden="true" />{inquiry.contactNo}
                </a>
              )}
            </div>
          </div>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} className="btn-interactive shrink-0 rounded-control border-0 bg-transparent p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 cursor-pointer">
          <FontAwesomeIcon icon={faTimes} className="text-base" />
        </button>
      </div>

      {/* Phones: one panel at a time */}
      <div role="tablist" aria-label="Inquiry" className="grid grid-cols-2 gap-1 border-b border-slate-200 bg-white p-2 shrink-0 lg:hidden">
        {[['chat', 'Conversation'], ['details', 'Details & actions']].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-control border-0 px-3 py-2 text-label cursor-pointer ${tab === key ? 'bg-indigo-50 font-bold text-indigo-700' : 'bg-transparent font-medium text-slate-600'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Conversation */}
        <section aria-label="Conversation" className={`${tab === 'chat' ? 'flex' : 'hidden'} lg:flex min-w-0 flex-1 flex-col bg-slate-50`}>
          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6" aria-live="polite">
            {!thread && !loadError && <p className="py-10 text-center text-label text-slate-500">Loading the conversation…</p>}
            {loadError && (
              <div className="rounded-card border border-red-200 bg-red-50 p-3 text-label text-red-700">
                {loadError} <button type="button" onClick={load} className={btn('link')}>Try again</button>
              </div>
            )}
            {messages.map((m) => {
              const mine = m.from === 'admin';
              if (m.kind === 'inquiry') {
                return (
                  <div key={m.id} className="max-w-[92%] rounded-card border border-indigo-200 bg-white p-3.5 shadow-card">
                    <p className="m-0 text-caption font-semibold text-indigo-700">Inquiry · {timeLabel(m.createdAt)}</p>
                    <p className="m-0 mt-1 whitespace-pre-wrap break-words text-body text-slate-800">{m.text || <span className="italic text-slate-500">No message.</span>}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-caption">
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                        <FontAwesomeIcon icon={faBuilding} className="text-[10px] text-slate-400" aria-hidden="true" />{inquiry.unit ? `Unit ${inquiry.unit}` : 'Any unit'}
                      </span>
                      {inquiry.preferredMoveIn && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                          <FontAwesomeIcon icon={faCalendarAlt} className="text-[10px] text-slate-400" aria-hidden="true" />Move in {fmtDay(inquiry.preferredMoveIn)}
                        </span>
                      )}
                      {inquiry.occupants ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                          <FontAwesomeIcon icon={faUsers} className="text-[10px] text-slate-400" aria-hidden="true" />{inquiry.occupants} occupant{Number(inquiry.occupants) === 1 ? '' : 's'}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              }
              if (m.kind === 'resolution_check') {
                const answer = m.resolutionAnswer;
                return (
                  <div key={m.id} className="ml-auto max-w-[80%] rounded-card border border-indigo-200 bg-white px-3.5 py-2.5 text-label text-slate-700">
                    <p className="m-0 font-semibold"><FontAwesomeIcon icon={faCircleQuestion} className="mr-1.5 text-indigo-500" aria-hidden="true" />Asked: did this answer their question?</p>
                    <p className={`m-0 mt-1 text-caption font-semibold ${answer === 'resolved' ? 'text-emerald-700' : answer === 'not_yet' ? 'text-amber-700' : 'text-slate-500'}`}>
                      <FontAwesomeIcon icon={answer === 'resolved' ? faCircleCheck : faHourglassHalf} className="mr-1" aria-hidden="true" />
                      {answer === 'resolved' ? 'They said it is resolved' : answer === 'not_yet' ? 'They said not yet' : 'Waiting for their answer'}
                    </p>
                  </div>
                );
              }
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[80%]">
                    <div className={`rounded-2xl px-3.5 py-2 text-body shadow-card ${mine ? 'rounded-br-md bg-indigo-600 text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'}`}>
                      {m.text && <p className="m-0 whitespace-pre-wrap break-words">{m.text}</p>}
                      <Attachment path={m.attachment} mine={mine} />
                    </div>
                    <p className={`m-0 mt-1 text-caption text-slate-500 ${mine ? 'text-right' : ''}`}>{mine ? 'You' : inquiry.fullName.split(' ')[0]} · {timeLabel(m.createdAt)}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Reply box, or why there is none */}
          <div className="border-t border-slate-200 bg-white px-4 py-3 sm:px-6 shrink-0">
            {thread && !thread.canReply ? (
              <p role="note" className="m-0 flex items-start gap-2 text-label text-slate-600">
                <FontAwesomeIcon icon={faCommentSlash} className="mt-0.5 text-slate-400" aria-hidden="true" />
                <span>{thread.noReplyReason}</span>
              </p>
            ) : (
              <form onSubmit={send} className="space-y-1.5">
                <div className="flex items-end gap-2">
                  <label htmlFor="inquiry-reply" className="sr-only">Reply to {inquiry.fullName}</label>
                  <textarea
                    id="inquiry-reply"
                    rows={2}
                    maxLength={MAX_LEN}
                    value={draft}
                    disabled={!thread || sending}
                    onChange={(e) => { setDraft(e.target.value); if (sendError) setSendError(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
                    placeholder={`Reply to ${inquiry.fullName.split(' ')[0]}…`}
                    className="min-h-[2.75rem] max-h-40 flex-1 resize-y rounded-control border border-slate-300 bg-white px-3 py-2 text-body text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100"
                  />
                  <button type="submit" disabled={!draft.trim() || sending || !thread} className={btn('primary', 'md', 'h-11 shrink-0')} aria-label="Send reply">
                    <FontAwesomeIcon icon={faPaperPlane} /> <span className="hidden sm:inline">{sending ? 'Sending…' : 'Send'}</span>
                  </button>
                </div>
                {sendError
                  ? <p role="alert" className="m-0 text-caption font-semibold text-red-600">{sendError}</p>
                  : <p className="m-0 text-caption text-slate-500">{replyHint}</p>}
              </form>
            )}
            {thread?.channel === 'guest' && (
              <Link to={`/admin-messages?guest_thread_id=${inquiry.id}`} className="mt-2 inline-flex items-center gap-1.5 text-caption font-semibold text-indigo-700 no-underline hover:underline">
                Open in Messages (attachments, ask if resolved) <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-[10px]" aria-hidden="true" />
              </Link>
            )}
          </div>
        </section>

        {/* Details and actions */}
        <aside aria-label="Details and actions" className={`${tab === 'details' ? 'block' : 'hidden'} lg:block w-full lg:w-[22rem] shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-4 sm:p-5`}>
          {children}
        </aside>
      </div>
    </Modal>
  );
}
