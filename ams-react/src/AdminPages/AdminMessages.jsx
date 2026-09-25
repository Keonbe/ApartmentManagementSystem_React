import { useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faPaperPlane, faComments, faArrowLeft, faPaperclip } from '@fortawesome/free-solid-svg-icons';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { useChat } from '../context/ChatContext';
import { getAvatarUrl } from '../utils/avatarUrl';
import api from '../api/axiosConfig';

const formatTime = (date) => {
  if (!date) return '';
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const getConversationPreview = (conversation, userId) => {
  if (conversation.last_message_attachment_path) {
    const sender = Number(conversation.last_message_sender_id) === Number(userId)
      ? 'You'
      : conversation.other_user_name || 'Tenant';
    const mediaType = /\.(mp4|webm|mov)(?:\?|$)/i.test(conversation.last_message_attachment_path) ? 'video' : 'photo';
    return `${sender} sent a ${mediaType}`;
  }
  if (conversation.last_message) return conversation.last_message;
  return 'No messages yet';
};

const formatMessageDateTime = (date) => {
  if (!date) return '';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return '';

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  let dayLabel = parsed.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
  if (parsed.toDateString() === today.toDateString()) dayLabel = 'Today';
  else if (parsed.toDateString() === yesterday.toDateString()) dayLabel = 'Yesterday';

  return `${dayLabel} · ${formatTime(parsed)}`;
};

const formatExactMessageDateTime = (date) => {
  if (!date) return '';
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime())
    ? ''
    : parsed.toLocaleString([], {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: 'numeric', minute: '2-digit', second: '2-digit',
    });
};

const TenantAvatar = ({ conversation, sizeClass = 'w-11 h-11' }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const avatarUrl = getAvatarUrl(conversation.other_user_avatar);
  const initials = (conversation.other_user_name || 'T').trim().charAt(0).toUpperCase();

  if (!avatarUrl || imageFailed) {
    return <div className={`${sizeClass} rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold shrink-0`}>{initials}</div>;
  }

  return <img src={avatarUrl} alt={`${conversation.other_user_name || 'Tenant'} profile`} onError={() => setImageFailed(true)} className={`${sizeClass} rounded-full object-cover border border-slate-200 shrink-0`} />;
};

const AdminMessages = () => {
  const {
    conversations = [], activeChat, setActiveChat, messages = [], sendMessage,
    fetchChatHistory, userId, fetchConversations,
  } = useChat();
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState(null);
  const [expandedTimestampId, setExpandedTimestampId] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const messagesContainerRef = useRef(null);
  const selectedConversationIdRef = useRef(null);

  useEffect(() => {
    fetchConversations?.();
  }, [fetchConversations]);

  useEffect(() => {
    if (!mediaPreview) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setMediaPreview(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mediaPreview]);

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...conversations]
      .sort((a, b) => new Date(b.last_message_time || 0) - new Date(a.last_message_time || 0))
      .filter((conversation) => !query || `${conversation.other_user_name || ''} ${conversation.last_message || ''}`.toLowerCase().includes(query));
  }, [conversations, search]);

  const selectConversation = async (conversation) => {
    selectedConversationIdRef.current = String(conversation.other_user_id);
    setActiveChat(conversation);
    await fetchChatHistory?.(conversation.other_user_id);

    if (selectedConversationIdRef.current !== String(conversation.other_user_id)) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const container = messagesContainerRef.current;
        if (selectedConversationIdRef.current === String(conversation.other_user_id) && container) {
          container.scrollTop = container.scrollHeight;
        }
      });
    });
  };

  const handleSend = async (event) => {
    event.preventDefault();
    const message = draft.trim();
    if ((!message && !attachment) || !activeChat || sending) return;
    setSending(true);
    try {
      await sendMessage(activeChat.other_user_id, message, attachment);
      setDraft('');
      setAttachment(null);
    } catch (error) {
      console.error('Failed to send admin message:', error);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden text-left">
        <Header title="Message Manager" />
        <div className="flex-1 min-h-0 p-4 md:p-6">
          <section className="max-w-7xl mx-auto h-full bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex animate-fade-in-up">
            <aside className={`${activeChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 lg:w-96 flex-col border-r border-slate-200 shrink-0`}>
              <div className="p-5 border-b border-slate-100">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 m-0">Tenant conversations</h2>
                    <p className="text-xs text-slate-500 mt-1 mb-0">{conversations.length} conversation{conversations.length === 1 ? '' : 's'}</p>
                  </div>
                  <FontAwesomeIcon icon={faComments} className="text-indigo-500 text-xl" />
                </div>
                <label className="mt-4 flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus-within:border-indigo-400">
                  <FontAwesomeIcon icon={faSearch} className="text-slate-400 text-xs" />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tenants or messages" className="w-full bg-transparent outline-none border-0 text-sm text-slate-800" />
                </label>
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredConversations.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-400">{search ? 'No matching conversations.' : 'No tenant conversations yet.'}</div>
                ) : filteredConversations.map((conversation) => {
                  const selected = String(activeChat?.other_user_id) === String(conversation.other_user_id);
                  const unread = Number(conversation.unread_count || 0);
                  return (
                    <button key={conversation.other_user_id} type="button" onClick={() => selectConversation(conversation)} className={`w-full text-left p-4 border-0 border-b border-slate-100 flex gap-3 items-start cursor-pointer transition-colors ${selected ? 'bg-indigo-50' : 'bg-white hover:bg-slate-50'}`}>
                      <TenantAvatar conversation={conversation} />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between gap-2 items-center">
                          <span className="font-semibold text-sm text-slate-900 truncate">{conversation.other_user_name || 'Tenant'}</span>
                          <span className="text-[10px] text-slate-400 shrink-0">{formatTime(conversation.last_message_time)}</span>
                        </div>
                        <div className="mt-1 flex justify-between gap-2 items-center">
                          <span className="text-xs text-slate-500 truncate">{getConversationPreview(conversation, userId)}</span>
                          {unread > 0 && <span className="min-w-5 h-5 px-1 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>

            <section className={`${activeChat ? 'flex' : 'hidden md:flex'} flex-1 min-w-0 flex-col`}>
              {activeChat ? (
                <>
                  <header className="h-[72px] px-4 md:px-6 border-b border-slate-100 flex items-center gap-3 shrink-0">
                    <button type="button" onClick={() => setActiveChat(null)} className="md:hidden p-2 bg-transparent border-0 text-slate-500 cursor-pointer" aria-label="Back to conversations"><FontAwesomeIcon icon={faArrowLeft} /></button>
                    <TenantAvatar conversation={activeChat} sizeClass="w-10 h-10" />
                    <div className="min-w-0"><h3 className="m-0 text-sm font-bold text-slate-900 truncate">{activeChat.other_user_name || 'Tenant'}</h3></div>
                  </header>
                  <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3 bg-slate-50">
                    {messages.length === 0 ? <p className="text-center text-sm text-slate-400 mt-10">No messages in this conversation yet.</p> : messages.map((message, index) => {
                      const messageKey = message.id || index;
                      const isAdmin = String(message.sender_id) === String(userId);
                      const hasText = Boolean(message.message?.trim());
                      const messageDate = new Date(message.created_at);
                      const previousDate = index > 0 ? new Date(messages[index - 1].created_at) : null;
                      const minuteGap = previousDate && !Number.isNaN(previousDate.getTime())
                        ? messageDate.getTime() - previousDate.getTime() >= 5 * 60 * 1000
                        : false;
                      const showDateSeparator = !previousDate || Number.isNaN(previousDate.getTime()) || previousDate.toDateString() !== messageDate.toDateString() || minuteGap;
                      const isLatestSentMessage = isAdmin && !messages.slice(index + 1).some(
                        (laterMessage) => String(laterMessage.sender_id) === String(userId)
                      );
                      return (
                        <div key={messageKey} className={expandedTimestampId === messageKey ? 'pb-4' : ''}>
                          {showDateSeparator && (
                            <div className="flex justify-center my-5">
                              <span className="text-slate-500 text-[11px] font-medium">
                                {formatMessageDateTime(message.created_at)}
                              </span>
                            </div>
                          )}
                          <div className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                            <div className="relative max-w-[85%] sm:max-w-[70%]">
                              <div onClick={() => setExpandedTimestampId((current) => current === messageKey ? null : messageKey)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setExpandedTimestampId((current) => current === messageKey ? null : messageKey); } }} role="button" tabIndex={0} aria-expanded={expandedTimestampId === messageKey} aria-label={`Toggle exact timestamp for message: ${formatExactMessageDateTime(message.created_at)}`} className={`transition-colors ${hasText
                                ? `rounded-2xl px-4 py-2.5 shadow-sm ${isAdmin ? (expandedTimestampId === messageKey ? 'bg-indigo-700 text-white rounded-br-md' : 'bg-indigo-600 text-white rounded-br-md') : (expandedTimestampId === messageKey ? 'bg-slate-100 text-slate-800 border border-slate-300 rounded-bl-md' : 'bg-white text-slate-800 border border-slate-200 rounded-bl-md')}`
                                : ''} cursor-pointer`}>
                                {message.message && <p className="m-0 text-sm whitespace-pre-wrap break-words">{message.message}</p>}
                                {message.attachment_path && (() => {
                                  const mediaUrl = message.attachment_path.startsWith('blob:') ? message.attachment_path : new URL(`../${message.attachment_path}`, api.defaults.baseURL).href;
                                  const isVideo = /\.(mp4|webm|mov)(?:\?|$)/i.test(message.attachment_path);
                                  return <button type="button" onClick={(event) => { event.stopPropagation(); setMediaPreview({ src: mediaUrl, isVideo }); }} aria-label={`View full ${isVideo ? 'video' : 'image'}`} className={`${hasText ? 'mt-2 ' : ''}block max-w-full border-0 bg-transparent p-0 cursor-zoom-in`}>
                                    {isVideo ? <video src={mediaUrl} preload="metadata" className="max-w-full max-h-64 rounded-lg" /> : <img src={mediaUrl} alt="Message attachment" className="max-w-full max-h-64 rounded-lg" />}
                                  </button>;
                                })()}
                              </div>
                              {expandedTimestampId === messageKey && (
                                <p className={`pointer-events-none absolute top-full z-10 mt-1 w-max max-w-[min(80vw,20rem)] whitespace-normal break-words text-[10px] leading-3.5 text-slate-500 animate-fade-in-up ${isAdmin ? 'right-0 text-right' : 'left-0 text-left'}`}>
                                  {formatExactMessageDateTime(message.created_at)}
                                </p>
                              )}
                              {isLatestSentMessage && (
                                <p className="m-0 mt-1 text-right text-[10px] text-slate-500 font-medium">
                                  {Number(message.is_read) === 1 ? 'Seen' : 'Sent'}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <form onSubmit={handleSend} className="p-3 md:p-4 border-t border-slate-100 flex gap-2 shrink-0">
                    <label className="px-3 flex items-center cursor-pointer text-slate-500" title="Attach image or video (max 8 MB)"><FontAwesomeIcon icon={faPaperclip} /><input type="file" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file?.size > 8 * 1024 * 1024) { window.alert('File must be 8 MB or smaller.'); event.target.value = ''; return; } setAttachment(file || null); }} /></label>
                    <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={attachment?.name || 'Write a reply...'} className="flex-1 min-w-0 px-4 py-3 rounded-xl bg-slate-100 border border-transparent focus:border-indigo-300 focus:outline-none text-sm" />
                    <button disabled={(!draft.trim() && !attachment) || sending} type="submit" className="px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white border-0 cursor-pointer"><FontAwesomeIcon icon={faPaperPlane} /></button>
                  </form>
                </>
              ) : <div className="flex-1 flex flex-col items-center justify-center text-center p-8"><div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center text-2xl mb-4"><FontAwesomeIcon icon={faComments} /></div><h3 className="text-lg font-bold text-slate-800 m-0">Select a conversation</h3><p className="text-sm text-slate-500 mt-2">Choose a tenant from the list to view and reply to messages.</p></div>}
            </section>
          </section>
        </div>
      </main>
      {mediaPreview && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4" role="dialog" aria-modal="true" aria-label="Full-size message attachment" onClick={() => setMediaPreview(null)}>
          <button type="button" onClick={() => setMediaPreview(null)} aria-label="Close full-size preview" className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border-0 bg-white/15 text-white hover:bg-white/25 cursor-pointer">
            <span aria-hidden="true" className="text-2xl leading-none">×</span>
          </button>
          {mediaPreview.isVideo
            ? <video controls autoPlay src={mediaPreview.src} className="max-h-full max-w-full rounded-lg" onClick={(event) => event.stopPropagation()} />
            : <img src={mediaPreview.src} alt="Full-size message attachment" className="max-h-full max-w-full object-contain" onClick={(event) => event.stopPropagation()} />}
        </div>
      )}
    </div>
  );
};

export default AdminMessages;