import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faPaperPlane, faComments, faArrowLeft, faPaperclip, faCamera, faVideo, faReply, faTimes, faChevronUp, faChevronDown } from '@fortawesome/free-solid-svg-icons';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { useChat } from '../context/ChatContext';
import { getAvatarUrl } from '../utils/avatarUrl';
import api from '../api/axiosConfig';
import { fileUrl } from '../api/fileUrl';
import { LIMITS } from '../utils/validation';
import { acceptFor, checkChatFile, FILE_RULES } from '../utils/fileLimits';
import { apiErrorMessage } from '../utils/apiError';
import FieldError from '../Components/form/FieldError';
import ChatAttachmentPreview from '../Components/form/ChatAttachmentPreview';
import useFilePreview from '../hooks/useFilePreview';
import { normalizeGuestMessages } from '../utils/normalizeGuestMessage';
import Modal from '../Components/admin/Modal';
import LoadError from '../Components/admin/ui/LoadError';
import { SkeletonList } from '../Components/admin/ui/Skeleton';
import useLoadState from '../hooks/useLoadState';

const CHAT_ACCEPT = `${acceptFor(FILE_RULES.chatImage)},${acceptFor(FILE_RULES.chatVideo)}`;
const isGuestConversation = (conversation) => Boolean(conversation.is_guest || conversation.thread_type === 'guest');
const GUEST_BADGE_CLASS = 'ml-1.5 shrink-0 text-blue-600 font-semibold text-xs';

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

const renderMessageSearchText = (text, query, active) => {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = String(text).split(new RegExp(`(${escaped})`, 'ig'));
  return parts.map((part, index) => part.toLowerCase() === query.toLowerCase()
    ? <mark key={`${index}-${part}`} className={`rounded-control px-0.5 ${active ? 'bg-amber-300 text-amber-950' : 'bg-amber-100 text-inherit'}`}>{part}</mark>
    : part);
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
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    conversations = [], activeChat, setActiveChat, messages = [], sendMessage,
    fetchChatHistory, userId, fetchConversations, conversationsStatus = 'ready',
  } = useChat();
  // Guest threads: loading | error | ready (polled; a failed poll keeps the list).
  const { state: guestStatus, ready: guestReady, fail: guestFail } = useLoadState();
  const [search, setSearch] = useState('');
  const [conversationFilter, setConversationFilter] = useState('all');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);
  const [pendingMatch, setPendingMatch] = useState(null);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment, attachmentPreviewUrl] = useFilePreview();
  const [replyingTo, setReplyingTo] = useState(null);
  const [expandedTimestampId, setExpandedTimestampId] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [guestThreads, setGuestThreads] = useState([]);
  const [guestMessages, setGuestMessages] = useState([]);
  const cameraInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const selectedConversationIdRef = useRef(null);
  const highlightTimerRef = useRef(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 275);
    return () => window.clearTimeout(timer);
  }, [search]);

  // Clearing the search empties the results. Done while rendering, when the
  // debounced query changes to '', rather than in the fetch effect below.
  const [resultsQuery, setResultsQuery] = useState(debouncedSearch);
  if (resultsQuery !== debouncedSearch) {
    setResultsQuery(debouncedSearch);
    if (!debouncedSearch) setSearchResults([]);
  }

  useEffect(() => {
    // An empty query fetches nothing; the previous run's cleanup has already
    // cancelled any search still in flight.
    if (!debouncedSearch) return undefined;
    let cancelled = false;
    Promise.resolve(fetchConversations?.(debouncedSearch)).then((results) => {
      if (!cancelled) setSearchResults(results || []);
    });
    return () => { cancelled = true; };
  }, [debouncedSearch, fetchConversations]);

  useEffect(() => {
    fetchConversations?.();
  }, [fetchConversations]);

  const loadGuests = useCallback(async () => {
    try {
      const response = await api.get('get_guest_conversations.php');
      if (response.data?.success) { setGuestThreads(response.data.conversations || []); guestReady(); }
      else guestFail();
    } catch (error) {
      console.error('Unable to load guest inquiries', error);
      guestFail();
    }
  }, [guestReady, guestFail]);

  useEffect(() => {
    const load = async () => { await loadGuests(); };
    load();
    const timer = window.setInterval(loadGuests, 6000);
    return () => window.clearInterval(timer);
  }, [loadGuests]);

  const retryConversations = () => { fetchConversations?.(); loadGuests(); };

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query) return searchResults;
    const registered = conversations.map((thread) => ({ ...thread, thread_type: 'registered' }));
    const combined = [...registered, ...guestThreads];
    return combined
      .sort((a, b) => new Date(b.last_message_time || 0) - new Date(a.last_message_time || 0));
  }, [conversations, guestThreads, search, searchResults]);

  const conversationCounts = useMemo(() => {
    const all = [
      ...conversations.map((thread) => ({ ...thread, thread_type: 'registered' })),
      ...guestThreads,
    ];
    return {
      all: all.length,
      registered: all.filter((conversation) => !isGuestConversation(conversation)).length,
      guest: all.filter(isGuestConversation).length,
    };
  }, [conversations, guestThreads]);

  const listReady = conversationsStatus === 'ready' && guestStatus === 'ready';
  const listFailed = conversationsStatus === 'error' || guestStatus === 'error';
  const visibleConversations = filteredConversations.filter((conversation) => (
    conversationFilter === 'all'
    || (conversationFilter === 'guest' && isGuestConversation(conversation))
    || (conversationFilter === 'registered' && !isGuestConversation(conversation))
  ));

  const activeMessageMatches = useMemo(() => {
    const query = debouncedSearch.toLowerCase();
    if (!query || !activeChat) return [];
    return messages
      .filter((message) => String(message.message || '').toLowerCase().includes(query))
      .map((message) => message.id)
      .filter((id) => id != null);
  }, [activeChat?.other_user_id, debouncedSearch, messages]);

  // A new query or another conversation starts again at the first match
  // (adjusted while rendering; was an effect on the same two values).
  const activeChatUserId = activeChat?.other_user_id;
  const [matchScope, setMatchScope] = useState({ query: debouncedSearch, chatId: activeChatUserId });
  if (!Object.is(matchScope.query, debouncedSearch) || !Object.is(matchScope.chatId, activeChatUserId)) {
    setMatchScope({ query: debouncedSearch, chatId: activeChatUserId });
    setActiveMatchIndex(0);
  }

  const navigateMatch = (nextIndex) => {
    if (!activeMessageMatches.length) return;
    const wrappedIndex = (nextIndex + activeMessageMatches.length) % activeMessageMatches.length;
    setActiveMatchIndex(wrappedIndex);
    const messageId = activeMessageMatches[wrappedIndex];
    document.getElementById(`chat-message-${messageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  useEffect(() => {
    if (!debouncedSearch || !activeChat || !activeMessageMatches.length) return undefined;
    const handleSearchKeyDown = (event) => {
      if (event.key !== 'Enter' || event.isComposing || event.target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      navigateMatch(activeMatchIndex + (event.shiftKey ? -1 : 1));
    };
    window.addEventListener('keydown', handleSearchKeyDown);
    return () => window.removeEventListener('keydown', handleSearchKeyDown);
  }, [activeChat?.other_user_id, activeMatchIndex, activeMessageMatches, debouncedSearch]);

  useEffect(() => () => window.clearTimeout(highlightTimerRef.current), []);

  useEffect(() => {
    if (!pendingMatch || String(activeChat?.other_user_id) !== String(pendingMatch.conversationId)) return undefined;
    const frame = requestAnimationFrame(() => {
      const element = document.getElementById(`chat-message-${pendingMatch.messageId}`);
      if (!element) return;
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMessageId(String(pendingMatch.messageId));
      window.clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = window.setTimeout(() => setHighlightedMessageId(null), 2500);
      setPendingMatch(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [activeChat?.other_user_id, messages, pendingMatch]);

  const selectConversation = async (conversation) => {
    if (conversation.thread_type === 'guest') {
      selectedConversationIdRef.current = `guest:${conversation.thread_id}`;
      setReplyingTo(null);
      setActiveChat(conversation);
      try {
        const response = await api.get('guest_chat.php', { params: { thread_id: conversation.thread_id } });
        setGuestMessages(normalizeGuestMessages(response.data.messages || [], 'admin'));
        setGuestThreads((rows) => rows.map((row) => row.thread_id === conversation.thread_id ? { ...row, guest_messages: response.data.messages || [] } : row));
      } catch (error) { console.error('Unable to load guest messages', error); }
      return;
    }
    selectedConversationIdRef.current = String(conversation.other_user_id);
    setPendingMatch(conversation.matched_message_id
      ? { conversationId: conversation.other_user_id, messageId: conversation.matched_message_id }
      : null);
    setActiveChat(conversation);
    await fetchChatHistory?.(conversation.other_user_id);

    if (selectedConversationIdRef.current !== String(conversation.other_user_id)) return;
    if (!conversation.matched_message_id) {
      requestAnimationFrame(() => {
        const container = messagesContainerRef.current;
        if (selectedConversationIdRef.current === String(conversation.other_user_id) && container) {
          container.scrollTop = container.scrollHeight;
        }
      });
    }
  };

  useEffect(() => {
    const requestedThreadId = searchParams.get('guest_thread_id');
    if (!requestedThreadId) return;
    const conversation = guestThreads.find((thread) => String(thread.thread_id) === requestedThreadId);
    if (!conversation) return;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('guest_thread_id');
      return next;
    }, { replace: true });
    window.setTimeout(() => selectConversation(conversation), 0);
  }, [guestThreads, searchParams, setSearchParams]);

  const [sendError, setSendError] = useState('');

  // All three pickers (file, camera, video) go through the same check as send_message.php.
  const pickAttachment = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const fileError = checkChatFile(file);
    setSendError(fileError);
    if (!fileError) setAttachment(file);
  };

  const handleSend = async (event) => {
    event.preventDefault();
    const message = draft.trim();
    if ((!message && !attachment) || !activeChat || sending) return;
    setSendError('');
    setSending(true);
    try {
      if (activeChat.thread_type === 'guest') {
        const form = new FormData();
        form.append('thread_id', activeChat.thread_id);
        form.append('message', message);
        if (replyingTo?.id) form.append('reply_to_id', replyingTo.id);
        if (attachment) form.append('attachment', attachment);
        await api.post('guest_chat.php', form, { headers: { 'Content-Type': 'multipart/form-data' } });
        const response = await api.get('guest_chat.php', { params: { thread_id: activeChat.thread_id } });
        setGuestMessages(normalizeGuestMessages(response.data.messages || [], 'admin'));
        setDraft('');
        setAttachment(null);
        setReplyingTo(null);
        return;
      }
      if (message && attachment) {
        await sendMessage(activeChat.other_user_id, message, null, replyingTo?.id);
        await sendMessage(activeChat.other_user_id, '', attachment);
      } else {
        await sendMessage(activeChat.other_user_id, message, attachment, replyingTo?.id);
      }
      setDraft('');
      setAttachment(null);
      setReplyingTo(null);
    } catch (error) {
      // Failures used to go to the console only; the draft is kept for a retry.
      console.error('Failed to send admin message:', error);
      setSendError(apiErrorMessage(error, 'Message not sent. Please try again.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="admin-shell flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden text-left">
        <Header title="Message Manager" />
        <div className="flex-1 min-h-0 p-4 md:p-6">
          <section className="max-w-7xl mx-auto h-full bg-white border border-slate-200 rounded-card shadow-card overflow-hidden flex animate-fade-in-up">
            <aside className={`${activeChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 lg:w-96 flex-col border-r border-slate-200 shrink-0`}>
              <div className="p-5 border-b border-slate-100">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-title font-bold text-slate-900 m-0">Tenant conversations</h2>
                    {(listReady || visibleConversations.length > 0) && <p className="text-label text-slate-500 mt-1 mb-0">{visibleConversations.length} conversation{visibleConversations.length === 1 ? '' : 's'}</p>}
                  </div>
                  <FontAwesomeIcon icon={faComments} className="text-indigo-500 text-xl" />
                </div>
                <label className="mt-4 flex items-center gap-2 px-3 py-2.5 rounded-card border border-slate-200 bg-slate-50 focus-within:border-indigo-400">
                  <FontAwesomeIcon icon={faSearch} className="text-slate-500 text-xs" />
                  <input maxLength={LIMITS.search} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tenants or messages" className="w-full bg-transparent outline-none border-0 text-body text-slate-800" />
                </label>
                <div className="flex items-center gap-1.5 mt-3" role="group" aria-label="Filter conversations">
                  {[
                    ['all', `All (${conversationCounts.all})`],
                    ['registered', `Registered (${conversationCounts.registered})`],
                    ['guest', `Guest (${conversationCounts.guest})`],
                  ].map(([filter, label]) => (
                    <button key={filter} type="button" onClick={() => setConversationFilter(filter)} aria-pressed={conversationFilter === filter}
                      className={`text-label font-medium px-3 py-1.5 rounded-full transition ${conversationFilter === filter ? 'bg-indigo-600 text-white shadow-card' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {!search && visibleConversations.length > 0 && listFailed && (
                <p role="alert" className="m-0 flex items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-label text-amber-800">
                  Some conversations did not load.
                  <button type="button" onClick={retryConversations} className="bg-transparent border-0 p-0 font-semibold text-amber-900 underline cursor-pointer">Try again</button>
                </p>
              )}
              <div className="flex-1 overflow-y-auto">
                {!search && visibleConversations.length === 0 && (conversationsStatus === 'loading' || guestStatus === 'loading') ? (
                  <SkeletonList rows={6} label="Loading conversations…" />
                ) : !search && visibleConversations.length === 0 && listFailed ? (
                  <LoadError title="Couldn't load conversations" onRetry={retryConversations} />
                ) : visibleConversations.length === 0 ? (
                  <div className="p-8 text-center text-body text-slate-500">{search ? 'No matching conversations.' : 'No tenant conversations yet.'}</div>
                ) : visibleConversations.map((conversation) => {
                  const convKey = conversation.thread_type === 'guest' ? `guest_${conversation.thread_id}` : `user_${conversation.other_user_id}`;
                  const selectedKey = activeChat?.thread_type === 'guest' ? `guest_${activeChat.thread_id}` : activeChat ? `user_${activeChat.other_user_id}` : null;
                  const selected = selectedKey === convKey;
                  const unread = Number(conversation.unread_count || 0);
                  return (
                    <button key={convKey} type="button" onClick={() => selectConversation(conversation)} className={`w-full text-left p-4 border-0 border-b border-slate-100 flex gap-3 items-start cursor-pointer transition-colors ${selected ? 'bg-indigo-50' : 'bg-white hover:bg-slate-50'}`}>
                      <TenantAvatar conversation={conversation} />
                      <div className="flex-1 min-w-0">
                        <div className="flex min-w-0 justify-between gap-2 items-center">
                          <span className="flex min-w-0 items-center overflow-hidden font-semibold text-body text-slate-900">
                            <span className="truncate">{conversation.other_user_name || 'Tenant'}</span>
                            {isGuestConversation(conversation) && <span className={GUEST_BADGE_CLASS}>Guest</span>}
                          </span>
                          <span className="text-caption text-slate-500 shrink-0">{formatTime(conversation.last_message_time)}</span>
                        </div>
                        <div className="mt-1 flex justify-between gap-2 items-center">
                    <span className="text-label text-slate-500 truncate">{conversation.matched_message || getConversationPreview(conversation, userId)}</span>
                          {unread > 0 && <span className="min-w-5 h-5 px-1 rounded-full bg-indigo-600 text-white text-caption font-bold flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>}
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
                    <div className="min-w-0"><h3 className="m-0 text-body font-bold text-slate-900 truncate">{activeChat.other_user_name || 'Tenant'}</h3></div>
                    {debouncedSearch && <div className="ml-auto flex shrink-0 items-center gap-2 rounded-control border border-slate-200 bg-white px-2 py-1.5 text-label text-slate-600" aria-live="polite">
                      {activeMessageMatches.length ? <>
                        <span>Match {activeMatchIndex + 1} of {activeMessageMatches.length}</span>
                        <button type="button" onClick={() => navigateMatch(activeMatchIndex - 1)} aria-label="Previous message match" title="Previous match (Shift+Enter)" className="flex h-7 w-7 items-center justify-center rounded-control border-0 bg-slate-50 text-slate-600 hover:bg-amber-100"><FontAwesomeIcon icon={faChevronUp} /></button>
                        <button type="button" onClick={() => navigateMatch(activeMatchIndex + 1)} aria-label="Next message match" title="Next match (Enter)" className="flex h-7 w-7 items-center justify-center rounded-control border-0 bg-slate-50 text-slate-600 hover:bg-amber-100"><FontAwesomeIcon icon={faChevronDown} /></button>
                      </> : <span>No matches in this chat</span>}
                    </div>}
                  </header>
                  <div ref={messagesContainerRef} className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6 space-y-3 bg-slate-50">
                    {(activeChat.thread_type === 'guest' ? guestMessages : messages).length === 0 ? <p className="text-center text-body text-slate-500 mt-10">No messages in this conversation yet.</p> : (activeChat.thread_type === 'guest' ? normalizeGuestMessages(guestMessages) : messages).map((message, index) => {
                      const messageKey = message.id || index;
                      const isAdmin = activeChat.thread_type === 'guest' ? String(message.sender_id) === 'admin' : String(message.sender_id) === String(userId);
                      const hasText = Boolean(message.message?.trim());
                      const messageDate = new Date(message.created_at);
                      const renderedMessages = activeChat.thread_type === 'guest' ? normalizeGuestMessages(guestMessages) : messages;
                      const previousDate = index > 0 ? new Date(renderedMessages[index - 1].created_at) : null;
                      const minuteGap = previousDate && !Number.isNaN(previousDate.getTime())
                        ? messageDate.getTime() - previousDate.getTime() >= 5 * 60 * 1000
                        : false;
                      const showDateSeparator = !previousDate || Number.isNaN(previousDate.getTime()) || previousDate.toDateString() !== messageDate.toDateString() || minuteGap;
                      const isLatestSentMessage = isAdmin && !renderedMessages.slice(index + 1).some(
                        (laterMessage) => activeChat.thread_type === 'guest' ? String(laterMessage.sender_id) === 'admin' : String(laterMessage.sender_id) === String(userId)
                      );
                      const matchIndex = activeMessageMatches.findIndex((id) => String(id) === String(message.id));
                      const isSearchMatch = matchIndex >= 0;
                      const isFocusedMatch = isSearchMatch && matchIndex === activeMatchIndex;
                      return (
                        <div id={`chat-message-${message.id}`} key={messageKey} className={`message-enter rounded-card transition-colors duration-500 ${isFocusedMatch ? 'bg-amber-100 ring-2 ring-amber-400' : isSearchMatch ? 'bg-amber-50 ring-1 ring-amber-100' : String(highlightedMessageId) === String(message.id) ? 'bg-amber-100 ring-2 ring-amber-300 animate-pulse' : ''} ${expandedTimestampId === messageKey ? 'pb-4' : ''}`}>
                          {showDateSeparator && (
                                <div className="flex justify-center my-5">
                              <span className="text-slate-500 text-caption font-medium">
                                {formatMessageDateTime(message.created_at)}
                              </span>
                            </div>
                          )}
                          <div className={`group flex items-center gap-1 sm:gap-2 ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                            <div className={`relative flex w-fit min-w-0 max-w-[75%] flex-col ${isAdmin ? 'items-end' : 'items-start'}`}>
                              {message.reply_to_id && <div className="mb-1 flex items-center gap-1 px-1 text-caption text-slate-500">
                                <FontAwesomeIcon icon={faReply} className="text-[10px]" />
                                <span>{isAdmin ? 'You' : (activeChat.other_user_name || 'Tenant')} replied to {String(message.reply_sender_id) === String(message.sender_id) ? 'themselves' : (isAdmin ? (activeChat.other_user_name || 'Tenant') : 'you')}</span>
                              </div>}
                              {message.reply_to_id && message.reply_attachment_path && (() => {
                                const replyIsVideo = /\.(mp4|webm|mov)(?:\?|$)/i.test(message.reply_attachment_path);
                                const replyMediaUrl = fileUrl(message.reply_attachment_path);
                                const scrollToOriginal = () => document.getElementById(`chat-message-${message.reply_to_id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                return <button type="button" onClick={scrollToOriginal} aria-label="Scroll to replied message" className="mb-1 block w-36 overflow-hidden rounded-card border-0 bg-slate-200 p-0 text-left opacity-75 transition-opacity hover:opacity-100">
                                  {replyIsVideo
                                    ? <video src={replyMediaUrl} preload="metadata" muted playsInline className="block h-24 w-36 object-cover" aria-label="Replied video preview" />
                                    : <img src={replyMediaUrl} alt="Replied image preview" className="block h-24 w-36 object-cover" />}
                                </button>;
                              })()}
                              <div onClick={() => setExpandedTimestampId((current) => current === messageKey ? null : messageKey)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setExpandedTimestampId((current) => current === messageKey ? null : messageKey); } }} role="button" tabIndex={0} aria-expanded={expandedTimestampId === messageKey} aria-label={`Toggle exact timestamp for message: ${formatExactMessageDateTime(message.created_at)}`} className={`transition-colors ${hasText
                                ? `rounded-card px-4 py-2.5 shadow-card ${isAdmin ? (expandedTimestampId === messageKey ? 'bg-indigo-700 text-white rounded-br-control' : 'bg-indigo-600 text-white rounded-br-control') : (expandedTimestampId === messageKey ? 'bg-slate-100 text-slate-800 border border-slate-300 rounded-bl-control' : 'bg-white text-slate-800 border border-slate-200 rounded-bl-control')}`
                                : ''} cursor-pointer`}>
                              {message.reply_to_id && <p className="m-0 mb-1 truncate text-label opacity-80">{message.reply_message || (message.reply_attachment_path ? 'Attachment' : 'Message')}</p>}
                                {message.message && <p className="m-0 text-body whitespace-pre-wrap break-words">{renderMessageSearchText(message.message, debouncedSearch, isFocusedMatch)}</p>}
                                {(message.attachment_path || message.file_path || message.attachment_url || message.media_url) && (() => {
                                  const mediaPath = message.attachment_path || message.file_path || message.attachment_url || message.media_url;
                                  const mediaUrl = fileUrl(mediaPath);
                                  const isVideo = /\.(mp4|webm|mov)(?:\?|$)/i.test(mediaPath);
                                  const isImage = /\.(jpg|jpeg|png|gif|webp)(?:\?|$)/i.test(mediaPath);
                                  if (!isVideo && !isImage) return <a className="mt-2 block text-body underline" href={mediaUrl} target="_blank" rel="noreferrer">{message.file_name || 'Download attachment'}</a>;
                                  return isVideo
                                    ? <div className={`${hasText ? 'mt-2 ' : ''}relative block max-w-full overflow-hidden rounded-control bg-black`} onClick={(event) => { event.stopPropagation(); if (!event.currentTarget.querySelector('video')?.paused) setMediaPreview({ src: mediaUrl, isVideo: true }); }}>
                                      <video src={mediaUrl} controls playsInline preload="metadata" aria-label="Message video. Tap again while playing to view full size." className="block max-w-full max-h-64 rounded-control" />
                                    </div>
                                    : <button type="button" onClick={(event) => { event.stopPropagation(); setMediaPreview({ src: mediaUrl, isVideo: false }); }} aria-label="View full image" className={`${hasText ? 'mt-2 ' : ''}relative block max-w-full overflow-hidden rounded-control border-0 bg-transparent p-0 cursor-zoom-in`}>
                                      <img src={mediaUrl} alt="Message attachment" className="max-w-full max-h-64 rounded-control" />
                                    </button>;
                                })()}
                              </div>
                              {expandedTimestampId === messageKey && (
                                <p className={`pointer-events-none absolute top-full z-10 mt-1 w-max max-w-[min(80vw,20rem)] whitespace-normal break-words text-caption leading-3.5 text-slate-500 animate-fade-in-up ${isAdmin ? 'right-0 text-right' : 'left-0 text-left'}`}>
                                  {formatExactMessageDateTime(message.created_at)}
                                </p>
                              )}
                              {isLatestSentMessage && (
                                <p className="m-0 mt-1 text-right text-caption text-slate-500 font-medium">
                                  {Number(message.is_read) === 1 ? 'Seen' : 'Sent'}
                                </p>
                              )}
                              {isAdmin && <button type="button" onClick={() => setReplyingTo(message)} aria-label="Reply to this message" title="Reply" className="message-reply-button absolute top-1/2 -left-8 -translate-y-1/2 flex h-7 w-7 items-center justify-center border-0 bg-transparent text-slate-500 hover:text-indigo-600 cursor-pointer sm:h-6 sm:w-6"><FontAwesomeIcon icon={faReply} className="text-[10px]" /></button>}
                              {!isAdmin && <button type="button" onClick={() => setReplyingTo(message)} aria-label="Reply to this message" title="Reply" className="message-reply-button absolute top-1/2 -right-8 -translate-y-1/2 flex h-7 w-7 items-center justify-center border-0 bg-transparent text-slate-500 hover:text-indigo-600 cursor-pointer sm:h-6 sm:w-6"><FontAwesomeIcon icon={faReply} className="text-[10px]" /></button>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {replyingTo && <div className="mx-3 mt-3 flex shrink-0 items-center justify-between rounded-control border-0 bg-white px-3 py-2 text-label text-slate-700"><div className="min-w-0"><strong>Replying to {activeChat.thread_type === 'guest' ? (String(replyingTo.sender_id) === 'guest' ? (activeChat.guest_name || 'Guest') : 'Admin User') : (String(replyingTo.sender_id) === String(userId) ? 'yourself' : activeChat.other_user_name)}</strong><p className="m-0 truncate">{replyingTo.message || (replyingTo.attachment_path ? 'Attachment' : 'Message')}</p></div><button type="button" onClick={() => setReplyingTo(null)} aria-label="Cancel reply" className="border-0 bg-transparent text-slate-500 cursor-pointer"><FontAwesomeIcon icon={faTimes} /></button></div>}
                  {attachment && <div className="flex items-center justify-start p-2">
                    <ChatAttachmentPreview file={attachment} previewUrl={attachmentPreviewUrl} onRemove={() => setAttachment(null)} />
                  </div>}
                    <form onSubmit={handleSend} className={`relative z-10 p-3 md:p-4 flex shrink-0 items-center gap-1 bg-white ${replyingTo || attachment ? '' : 'border-t border-slate-100'}`}>
                    <div className="flex shrink-0 items-center gap-1">
                    <label className="flex h-10 w-9 items-center justify-center rounded-full cursor-pointer text-slate-500 hover:bg-slate-100 transition-colors" title="Choose an image or video (images up to 10 MB; videos up to 25 MB)"><FontAwesomeIcon icon={faPaperclip} /><input type="file" accept={CHAT_ACCEPT} className="hidden" onChange={pickAttachment} /></label>
                    <button type="button" onClick={() => cameraInputRef.current?.click()} aria-label="Take a photo with your phone camera" title="Take a photo with your phone camera (max 10 MB)" className="flex h-10 w-9 items-center justify-center rounded-full cursor-pointer text-slate-500 bg-transparent border-0 hover:bg-slate-100 transition-colors"><FontAwesomeIcon icon={faCamera} /></button>
                    </div>
                    <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pickAttachment} />
                    <button type="button" onClick={() => videoInputRef.current?.click()} aria-label="Record a video with your phone camera" title="Record a video with your phone camera (max 25 MB)" className="flex h-10 w-9 shrink-0 items-center justify-center rounded-full cursor-pointer text-slate-500 bg-transparent border-0 hover:bg-slate-100 transition-colors"><FontAwesomeIcon icon={faVideo} /></button>
                    <input ref={videoInputRef} type="file" accept="video/*" capture="environment" className="hidden" onChange={pickAttachment} />
                    <div className="flex h-10 min-w-0 flex-1 items-center rounded-card bg-slate-100 px-2 focus-within:ring-2 focus-within:ring-indigo-500">
                      <input id="admin-reply" name="message" autoComplete="off" aria-label="Reply"
                        aria-invalid={sendError ? true : undefined} aria-describedby={sendError ? 'admin-reply-error' : undefined}
                        maxLength={LIMITS.message} value={draft}
                        onChange={(event) => { setDraft(event.target.value); if (sendError) setSendError(''); }}
                        placeholder="Write a reply..." className="h-full w-full min-w-0 px-2 bg-transparent border-0 focus:outline-none text-body" />
                    </div>
                    <button disabled={(!draft.trim() && !attachment) || sending} type="submit" aria-label="Send reply" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white border-0 cursor-pointer"><FontAwesomeIcon icon={faPaperPlane} /></button>
                  </form>
                  <div className="px-3 md:px-4 pb-2">
                    <FieldError id="admin-reply" error={sendError} />
                  </div>
                </>
              ) : <div className="flex-1 flex flex-col items-center justify-center text-center p-8"><div className="w-16 h-16 rounded-card bg-indigo-50 text-indigo-500 flex items-center justify-center text-page mb-4"><FontAwesomeIcon icon={faComments} /></div><h3 className="text-title font-bold text-slate-800 m-0">Select a conversation</h3><p className="text-body text-slate-500 mt-2">Choose a tenant from the list to view and reply to messages.</p></div>}
            </section>
          </section>
        </div>
      </main>
      {mediaPreview && (
        <Modal title="Full-size message attachment" onClose={() => setMediaPreview(null)} overlayClassName="flex items-center justify-center bg-black/90 p-4" className="relative flex items-center justify-center max-h-full max-w-full">
          <button type="button" onClick={() => setMediaPreview(null)} aria-label="Close full-size preview" className="absolute right-2 top-2 z-10 flex h-10 w-10 items-center justify-center rounded-full border-0 bg-white/15 text-white hover:bg-white/25 cursor-pointer">
            <span aria-hidden="true" className="text-page leading-none">×</span>
          </button>
          {mediaPreview.isVideo
            ? <video controls autoPlay src={mediaPreview.src} className="max-h-[90vh] max-w-full rounded-control" />
            : <img src={mediaPreview.src} alt="Full-size message attachment" className="max-h-[90vh] max-w-full object-contain" />}
        </Modal>
      )}
    </div>
  );
};

export default AdminMessages;