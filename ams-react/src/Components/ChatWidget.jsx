import { useState, useEffect, useRef, useMemo } from 'react';
import useDialog from '../hooks/useDialog';
import { useLocation, useNavigate } from 'react-router-dom';
import { useChat } from '../context/ChatContext';
import { getAvatarUrl } from '../utils/avatarUrl';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
    faComment, 
    faTimes, 
    faPaperPlane, 
    faArrowLeft,
    faCamera,
    faVideo,
    faReply,
} from '@fortawesome/free-solid-svg-icons';
import { faPaperclip } from '@fortawesome/free-solid-svg-icons';
import api from '../api/axiosConfig';
import { fileUrl } from '../api/fileUrl';
import { LIMITS } from '../utils/validation';
import { acceptFor, checkChatFile, FILE_RULES } from '../utils/fileLimits';
import { apiErrorMessage } from '../utils/apiError';
import FieldError from './form/FieldError';
import ChatAttachmentPreview from './form/ChatAttachmentPreview';
import useFilePreview from '../hooks/useFilePreview';
import { normalizeGuestMessages } from '../utils/normalizeGuestMessage';

const CHAT_ACCEPT = `${acceptFor(FILE_RULES.chatImage)},${acceptFor(FILE_RULES.chatVideo)}`;
const isGuestConversation = (conversation) => Boolean(conversation.is_guest || conversation.thread_type === 'guest');
const GUEST_BADGE_CLASS = 'ml-1.5 shrink-0 text-blue-600 font-semibold text-xs';

const ChatWidget = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { 
        userId, 
        conversations = [], 
        activeChat, 
        setActiveChat, 
        messages = [], 
        isChatOpen, 
        setIsChatOpen, 
        sendMessage, 
        fetchChatHistory,
        handleTyping,
        openSupportChat,
        userRole,
    } = useChat();

    const [newMessage, setNewMessage] = useState('');
    const [attachment, setAttachment, attachmentPreviewUrl] = useFilePreview();
    const [sendError, setSendError] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [guestMessages, setGuestMessages] = useState([]);
    const [guestThreads, setGuestThreads] = useState([]);
    const [guestToken, setGuestToken] = useState(() => localStorage.getItem('ams_guest_token'));
    const [hasRegisteredUser, setHasRegisteredUser] = useState(() => Boolean(sessionStorage.getItem('loggedInUser') || localStorage.getItem('loggedInUser')));

    useEffect(() => {
        const syncStorage = () => {
            setGuestToken(localStorage.getItem('ams_guest_token'));
            setHasRegisteredUser(Boolean(sessionStorage.getItem('loggedInUser') || localStorage.getItem('loggedInUser')));
        };
        window.addEventListener('storage', syncStorage);
        window.addEventListener('auth-changed', syncStorage);
        window.addEventListener('guest-chat-invalidated', syncStorage);
        return () => {
            window.removeEventListener('storage', syncStorage);
            window.removeEventListener('auth-changed', syncStorage);
            window.removeEventListener('guest-chat-invalidated', syncStorage);
        };
    }, []);

    // All three pickers (file, camera, video) go through the same check as send_message.php.
    const pickAttachment = (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        const fileError = checkChatFile(file);
        setSendError(fileError);
        if (!fileError) setAttachment(file);
    };
    const [replyingTo, setReplyingTo] = useState(null);
    const [expandedTimestampId, setExpandedTimestampId] = useState(null);
    const [mediaPreview, setMediaPreview] = useState(null);
    const cameraInputRef = useRef(null);
    const videoInputRef = useRef(null);
    const messagesEndRef = useRef(null);
    const chatWindowRef = useRef(null);
    // The chat window is a dialog: Esc closes it (not while the full-size media
    // viewer is open, which has its own Esc), focus moves in, Tab stays inside.
    const chatDialogRef = useDialog(isChatOpen && !mediaPreview, () => setIsChatOpen(false));
    // The launcher is unmounted while the chat is open, so focus is put back on
    // the new launcher when the chat closes.
    const launcherRef = useRef(null);
    const wasChatOpenRef = useRef(false);
    useEffect(() => {
        if (wasChatOpenRef.current && !isChatOpen) launcherRef.current?.focus();
        wasChatOpenRef.current = isChatOpen;
    }, [isChatOpen]);
    const isGuestChat = !userId && Boolean(guestToken);
    // Memoised: a new array on every render re-ran the scroll and guest-media
    // effects below on each keystroke.
    const activeMessages = useMemo(
        () => (isGuestChat ? normalizeGuestMessages(guestMessages) : messages),
        [isGuestChat, guestMessages, messages],
    );
    const isAdminGuestChat = userRole === 'admin' && activeChat?.thread_type === 'guest';
    const displayedMessages = useMemo(
        () => (isAdminGuestChat ? normalizeGuestMessages(guestMessages, 'admin') : activeMessages),
        [isAdminGuestChat, guestMessages, activeMessages],
    );
    const displayedConversations = userRole === 'admin'
        ? [...conversations.map((conversation) => ({ ...conversation, thread_type: 'registered' })), ...guestThreads]
            .sort((a, b) => new Date(b.last_message_time || 0) - new Date(a.last_message_time || 0))
        : conversations;
    const totalUnreadCount = displayedConversations.reduce((sum, conv) => sum + Number(conv.unread_count || 0), 0);
    // A guest's attachments are fetched with the token in a header and shown from
    // a blob URL, so the token never appears in a URL (logs, history, referrers).
    const [guestMediaUrls, setGuestMediaUrls] = useState({});
    const guestMediaRequested = useRef(new Map());
    const guestDownloadUrl = (path) => guestMediaUrls[path] || null;
    useEffect(() => {
        if (!isGuestChat) return;
        for (const msg of activeMessages) {
            const paths = [msg.attachment_path || msg.file_path || msg.attachment_url || msg.media_url, msg.reply_attachment_path];
            for (const path of paths) {
                if (!path || guestMediaRequested.current.has(path)) continue;
                guestMediaRequested.current.set(path, null);
                api.get('download_file.php', {
                    params: { path: String(path).replace(/^(\.\.\/)+/, '') },
                    headers: { 'X-Guest-Token': guestToken },
                    responseType: 'blob',
                }).then((response) => {
                    const url = URL.createObjectURL(response.data);
                    guestMediaRequested.current.set(path, url);
                    setGuestMediaUrls((current) => ({ ...current, [path]: url }));
                }).catch(() => guestMediaRequested.current.delete(path));
            }
        }
    }, [isGuestChat, guestToken, activeMessages]);
    useEffect(() => {
        const requested = guestMediaRequested.current;
        return () => {
            for (const url of requested.values()) if (url) URL.revokeObjectURL(url);
            requested.clear();
        };
    }, [guestToken]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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

        const timeLabel = parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        return `${dayLabel} · ${timeLabel}`;
    };

    const formatExactMessageDateTime = (date) => {
        if (!date) return '';
        const parsed = new Date(date);
        return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleString([], {
            year: 'numeric', month: 'long', day: 'numeric',
            hour: 'numeric', minute: '2-digit', second: '2-digit',
        });
    };

    useEffect(() => {
        if (isChatOpen && activeChat) {
            scrollToBottom();
        }
    }, [messages, activeMessages, isChatOpen, activeChat]);

    useEffect(() => {
        if (!guestToken || userId || !isChatOpen) return undefined;
        const load = async () => {
            try {
                const response = await api.get('guest_chat.php', { headers: { 'X-Guest-Token': guestToken } });
                if (response.data?.success) setGuestMessages(normalizeGuestMessages(response.data.messages || []));
            } catch (error) {
                if ([401, 403, 404].includes(error.response?.status)) {
                    for (const key of Object.keys(localStorage)) if (key === 'ams_guest_token' || key.startsWith('ams_guest_')) localStorage.removeItem(key);
                    setGuestToken(null);
                    setGuestMessages([]);
                    setIsChatOpen(false);
                    window.dispatchEvent(new Event('guest-chat-invalidated'));
                    return;
                }
                console.error('Unable to load guest conversation', error);
            }
        };
        load();
        // Polls only while the chat is open and the tab is in view.
        const timer = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, 3000);
        return () => window.clearInterval(timer);
    }, [guestToken, userId, isChatOpen]);

    useEffect(() => {
        if (userRole !== 'admin') return undefined;
        let cancelled = false;
        const loadGuestThreads = async () => {
            try {
                const response = await api.get('guest_chat_inbox.php');
                if (!cancelled && response.data?.success) setGuestThreads(response.data.conversations || []);
            } catch (error) {
                console.error('Unable to load guest conversations', error);
            }
        };
        loadGuestThreads();
        // Kept while the chat is closed (it feeds the launcher's unread count), but not for a hidden tab.
        const timer = window.setInterval(() => { if (document.visibilityState === 'visible') loadGuestThreads(); }, 6000);
        return () => { cancelled = true; window.clearInterval(timer); };
    }, [userRole]);

    useEffect(() => {
        if (userRole !== 'admin') return;
        const requestedThreadId = new URLSearchParams(location.search).get('guest_thread_id');
        if (!requestedThreadId) return;
        const requested = guestThreads.find((thread) => String(thread.thread_id) === requestedThreadId);
        if (!requested) return;
        setActiveChat(requested);
        setIsChatOpen(true);
        navigate(location.pathname, { replace: true });
        api.get('guest_chat.php', { params: { thread_id: requested.thread_id } })
            .then((response) => setGuestMessages(normalizeGuestMessages(response.data?.messages || [], 'admin')))
            .catch((error) => console.error('Unable to load guest chat history', error));
    }, [guestThreads, location.pathname, location.search, navigate, setActiveChat, setIsChatOpen, userRole]);

    useEffect(() => {
        if (!isAdminGuestChat || !activeChat?.thread_id) return undefined;
        let cancelled = false;
        const loadGuestHistory = async () => {
            try {
                const response = await api.get('guest_chat.php', { params: { thread_id: activeChat.thread_id } });
                if (!cancelled && response.data?.success) setGuestMessages(normalizeGuestMessages(response.data.messages || [], 'admin'));
            } catch (error) {
                console.error('Unable to load guest chat history', error);
            }
        };
        loadGuestHistory();
        const timer = window.setInterval(() => { if (document.visibilityState === 'visible') loadGuestHistory(); }, 3000);
        return () => { cancelled = true; window.clearInterval(timer); };
    }, [activeChat?.thread_id, isAdminGuestChat]);

    const sendGuestMessage = async (event) => {
        event.preventDefault();
        const message = newMessage.trim();
        if ((!message && !attachment) || isSending) return;
        setIsSending(true);
        try {
            const formData = new FormData();
            formData.append('guest_token', guestToken);
            formData.append('message', message);
            if (replyingTo?.id) formData.append('reply_to_id', replyingTo.id);
            if (attachment) formData.append('attachment', attachment);
            await api.post('guest_chat.php', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            setNewMessage('');
            setAttachment(null);
            setReplyingTo(null);
            setSendError(''); // an earlier failure no longer applies
            const response = await api.get('guest_chat.php', { headers: { 'X-Guest-Token': guestToken } });
        setGuestMessages(normalizeGuestMessages(response.data.messages || []));
        } catch (error) { setSendError(apiErrorMessage(error, 'Message not sent.')); }
        finally { setIsSending(false); }
    };

    useEffect(() => {
        if (!mediaPreview) return undefined;
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') setMediaPreview(null);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [mediaPreview]);

    const handleSendMessage = (e) => {
        e.preventDefault();
        if (isSending) return;
        if ((newMessage.trim() || attachment) && activeChat) {
            setSendError('');
            setIsSending(true);
            const message = newMessage.trim();
            if (isAdminGuestChat) {
                const formData = new FormData();
                formData.append('thread_id', activeChat.thread_id);
                formData.append('message', message);
                if (replyingTo?.id) formData.append('reply_to_id', replyingTo.id);
                if (attachment) formData.append('attachment', attachment);
                api.post('guest_chat.php', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
                    .then(async () => {
                        const response = await api.get('guest_chat.php', { params: { thread_id: activeChat.thread_id } });
                        setGuestMessages(normalizeGuestMessages(response.data?.messages || [], 'admin'));
                        setNewMessage('');
                        setAttachment(null);
                        setReplyingTo(null);
                    })
                    .catch((error) => setSendError(apiErrorMessage(error, 'Message not sent. Please try again.')))
                    .finally(() => setIsSending(false));
                return;
            }
            const sendPendingMessages = async () => {
                if (message && attachment) {
                    await sendMessage(activeChat.other_user_id, message, null, replyingTo?.id);
                    await sendMessage(activeChat.other_user_id, '', attachment);
                    return;
                }
                await sendMessage(activeChat.other_user_id, message, attachment, replyingTo?.id);
            };
            sendPendingMessages()
                .then(() => {
                    setNewMessage('');
                    setAttachment(null);
                    setReplyingTo(null);
                    if (handleTyping) {
                        handleTyping(activeChat.other_user_id, false);
                    }
                })
                .catch((err) => {
                    // Keep the input text so the user can retry, and say why it failed.
                    setSendError(apiErrorMessage(err, 'Message not sent. Please try again.'));
                })
                .finally(() => setIsSending(false));
        }
    };

    const handleStartChat = async () => {
        if (openSupportChat) {
            await openSupportChat();
        }
        if (handleTyping && activeChat?.other_user_id) {
            handleTyping(activeChat.other_user_id, false);
        }
    };

    const renderEmptyState = () => {
        const isTenant = userRole !== 'admin';

        return (
            <div className="flex flex-col items-center justify-center text-center text-slate-400 mt-16 p-4">
                <FontAwesomeIcon icon={faComment} className="text-4xl mb-3 opacity-20" />
                <p className="text-sm font-medium m-0">No active conversations found</p>
                {isTenant && openSupportChat && (
                    <button
                        type="button"
                        onClick={handleStartChat}
                        className="mt-4 px-4 py-2 rounded-full bg-indigo-600 text-white text-sm font-semibold border-0 cursor-pointer hover:bg-indigo-700 transition-colors"
                    >
                        Message Admin
                    </button>
                )}
            </div>
        );
    };

    const handleInputChange = (e) => {
        const value = e.target.value;
        setNewMessage(value);
        if (activeChat && userId && handleTyping) {
            handleTyping(activeChat.other_user_id, value.length > 0);
        }
    };

    if (!userId && !hasRegisteredUser && !guestToken) return null;

    return (
        <div className="fixed bottom-2 right-2 z-50 font-sans sm:bottom-6 sm:right-6">
            {!isChatOpen ? (
                /* Floating Chat Trigger Button */
                <button
                    ref={launcherRef}
                    type="button"
                    onClick={() => setIsChatOpen(true)}
                    className="w-14 h-14 bg-indigo-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-indigo-700 transition-all transform hover:scale-110 cursor-pointer border-0"
                    aria-label={totalUnreadCount > 0 ? `Open chat, ${totalUnreadCount} unread` : 'Open chat'}
                >
                    <FontAwesomeIcon icon={faComment} className="text-2xl" />
                    {totalUnreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-6 h-6 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow-md border-2 border-white">
                            {totalUnreadCount > 9 ? '9+' : totalUnreadCount}
                        </span>
                    )}
                </button>
            ) : (
                /* Chat Container Window */
                <div
                    ref={(node) => { chatWindowRef.current = node; chatDialogRef.current = node; }}
                    role="dialog"
                    aria-label="Chat"
                    tabIndex={-1}
                    className="outline-none w-[min(24rem,calc(100vw-1rem))] h-[min(500px,calc(100dvh-1rem))] min-h-0 bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 sm:h-[500px]"
                >
                    {/* Header */}
                    <div className="bg-indigo-600 p-4 text-white flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-2 min-w-0">
                            {activeChat && (
                                <button
                                    type="button"
                                    onClick={() => { if (userId) setActiveChat(null); }}
                                    className="flex h-11 w-11 items-center justify-center text-white hover:text-indigo-200 bg-transparent border-0 cursor-pointer -ml-2 mr-1"
                                    title="Back to conversation list"
                                    aria-label="Back to conversation list"
                                >
                                    <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" />
                                </button>
                            )}
                            <span className="font-semibold truncate">
                            {activeChat ? activeChat.other_user_name : guestToken && !userId ? 'Admin User' : 'Messages'}
                            </span>
                        </div>
                        
                        <div className="flex items-center gap-3 shrink-0">
                            {userRole === 'admin' && !activeChat && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsChatOpen(false);
                                        navigate('/admin-messages');
                                    }}
                                    className="text-xs font-semibold text-indigo-100 hover:text-white bg-transparent border-0 cursor-pointer whitespace-nowrap"
                                >
                                    View all
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setIsChatOpen(false)}
                                className="flex h-11 w-11 items-center justify-center -mr-2 text-white hover:text-indigo-200 bg-transparent border-0 cursor-pointer"
                                aria-label="Close chat"
                            >
                                <FontAwesomeIcon icon={faTimes} aria-hidden="true" />
                            </button>
                        </div>
                    </div>

                    {/* Chat Body */}
                    {!userId && !guestToken ? (
                        <div className="flex-1 p-6 text-center"><p>Start a conversation with our team by submitting an inquiry.</p><button type="button" onClick={() => { setIsChatOpen(false); navigate('/inquire'); }} className="rounded-xl bg-indigo-600 px-4 py-2 text-white border-0">Go to Inquire</button></div>
                    ) : !activeChat && userId ? (
                        /* Conversation Directory List */
                        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
                            <div className="min-h-0 flex-1 overflow-y-auto">
                            {displayedConversations.length === 0 ? (
                                renderEmptyState()
                            ) : (
                                displayedConversations.map((conv) => (
                                    <div
                                        key={conv.thread_type === 'guest' ? `guest_${conv.thread_id}` : `user_${conv.other_user_id}`}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }}
                                        onClick={() => {
                                            setActiveChat(conv);
                                            setReplyingTo(null);
                                            if (conv.thread_type === 'guest') {
                                                setGuestMessages([]);
                                                api.get('guest_chat.php', { params: { thread_id: conv.thread_id } })
                                                    .then((response) => setGuestMessages(normalizeGuestMessages(response.data?.messages || [], 'admin')))
                                                    .catch((error) => console.error('Unable to load guest chat history', error));
                                            } else if (fetchChatHistory) {
                                                fetchChatHistory(conv.other_user_id);
                                            }
                                        }}
                                        className="flex items-center gap-3 p-4 hover:bg-slate-50 cursor-pointer transition-colors border-b border-slate-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-500"
                                    >
                                        <div className="relative shrink-0">
                                            <img 
                                                src={getAvatarUrl(conv.other_user_avatar) || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(conv.other_user_name || 'User')}
                                                alt={conv.other_user_name}
                                                className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0"
                                            />
                                            {Number(conv.unread_count) > 0 && (
                                                <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm border-2 border-white">
                                                    {conv.unread_count > 9 ? '9+' : conv.unread_count}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex min-w-0 justify-between items-center gap-2 mb-0.5">
                                                <h4 className={`flex min-w-0 items-center overflow-hidden text-sm m-0 ${Number(conv.unread_count) > 0 ? 'font-bold text-slate-900' : 'font-semibold text-slate-900'}`}>
                                                    <span className="truncate">{conv.other_user_name}</span>
                                                    {isGuestConversation(conv) && <span className={GUEST_BADGE_CLASS}>Guest</span>}
                                                </h4>
                                                {conv.last_message_time && (
                                                    <span className="text-[10px] text-slate-400 whitespace-nowrap shrink-0 ml-3">
                                                        {new Date(conv.last_message_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                )}
                                            </div>
                                            <p className={`text-xs truncate m-0 ${Number(conv.unread_count) > 0 ? 'font-semibold text-slate-700' : 'text-slate-500'}`}>
                                                {conv.last_message || conv.last_message_attachment_path
                                                    ? conv.last_message_attachment_path
                                                        ? `${String(conv.last_message_sender_id) === String(userId) ? 'You' : (conv.other_user_name || 'Admin')} sent a ${/\.(mp4|webm|mov)(?:\?|$)/i.test(conv.last_message_attachment_path) ? 'video' : 'photo'}`
                                                        : `${String(conv.last_message_sender_id) === String(userId) ? 'You' : (conv.other_user_name || 'Admin')}: ${conv.last_message}`
                                                    : 'No messages yet'}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            )}
                            </div>
                        </div>
                    ) : (
                        /* Active Conversation Message Stream */
                        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3 bg-slate-50">
                                            {displayedMessages.length === 0 ? (
                                <div className="text-center text-slate-400 text-xs mt-10">
                                    Send a message to start this conversation.
                                </div>
                            ) : (
                                displayedMessages.map((msg, index) => {
                                    const messageKey = msg.id || index;
                                    const isMe = String(msg.sender_id) === (isGuestChat ? 'guest' : isAdminGuestChat ? 'current-admin' : String(userId));
                                    const messageDate = new Date(msg.created_at);
                                    const previousDate = index > 0 ? new Date(displayedMessages[index - 1].created_at) : null;
                                    const minuteGap = previousDate && !Number.isNaN(previousDate.getTime())
                                        ? messageDate.getTime() - previousDate.getTime() >= 5 * 60 * 1000
                                        : false;
                                    const showDateSeparator = !previousDate || Number.isNaN(previousDate.getTime()) || previousDate.toDateString() !== messageDate.toDateString() || minuteGap;
                                    const isLatestSentMessage = isMe && !displayedMessages.slice(index + 1).some(
                                        (laterMessage) => String(laterMessage.sender_id) === (isGuestChat ? 'guest' : isAdminGuestChat ? 'current-admin' : String(userId))
                                    );
                                    const mediaPath = msg.attachment_path || msg.file_path || msg.attachment_url || msg.media_url;
                                    const mediaUrl = mediaPath ? (isGuestChat ? guestDownloadUrl(mediaPath) : fileUrl(mediaPath)) : null;
                                    const isMediaOnlyMessage = Boolean(mediaPath) && !msg.message;
                                    return (
                                        <div id={`chat-message-${msg.id}`} key={messageKey} className={`message-enter mb-3 ${expandedTimestampId === messageKey ? 'pb-4' : ''}`}>
                                            {showDateSeparator && (
                                                <div className="flex justify-center my-5">
                                                    <span className="text-slate-500 text-[11px] font-medium">
                                                        {formatMessageDateTime(msg.created_at)}
                                                    </span>
                                                </div>
                                            )}
                                            <div className={`group flex items-center gap-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                        {isMe && <button type="button" onClick={() => setReplyingTo(msg)} aria-label="Reply to this message" title="Reply" className="message-reply-button flex h-7 w-7 shrink-0 items-center justify-center border-0 bg-transparent text-slate-500 hover:text-indigo-600 cursor-pointer sm:h-6 sm:w-6"><FontAwesomeIcon icon={faReply} className="text-[10px]" /></button>}
                                                <div className={`relative flex max-w-[80%] flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                                    {msg.reply_to_id && <div className="mb-1 flex items-center gap-1 px-1 text-[11px] text-slate-500">
                                                        <FontAwesomeIcon icon={faReply} className="text-[10px]" />
                                                        <span>{isMe ? 'You' : (isGuestChat ? 'Admin User' : activeChat.other_user_name)} replied to {String(msg.reply_sender_id) === String(msg.sender_id) ? 'themselves' : (isMe ? (isGuestChat ? 'Admin User' : activeChat.other_user_name) : 'you')}</span>
                                                    </div>}
                                                    {msg.reply_to_id && msg.reply_attachment_path && (() => {
                                                        const replyIsVideo = /\.(mp4|webm|mov)(?:\?|$)/i.test(msg.reply_attachment_path);
                                                        const replyMediaUrl = isGuestChat ? guestDownloadUrl(msg.reply_attachment_path) : fileUrl(msg.reply_attachment_path);
                                                        const scrollToOriginal = () => document.getElementById(`chat-message-${msg.reply_to_id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                        return <button type="button" onClick={scrollToOriginal} aria-label="Scroll to replied message" className="mb-1 block w-36 overflow-hidden rounded-2xl border-0 bg-slate-200 p-0 text-left opacity-75 transition-opacity hover:opacity-100">
                                                            {replyIsVideo
                                                                ? <video src={replyMediaUrl} preload="metadata" muted playsInline className="block h-24 w-36 object-cover" aria-label="Replied video preview" />
                                                                : <img src={replyMediaUrl} alt="Replied image preview" className="block h-24 w-36 object-cover" />}
                                                        </button>;
                                                    })()}
                                                    <div onClick={() => setExpandedTimestampId((current) => current === messageKey ? null : messageKey)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setExpandedTimestampId((current) => current === messageKey ? null : messageKey); } }} role="button" tabIndex={0} aria-expanded={expandedTimestampId === messageKey} aria-label={`Toggle exact timestamp for message: ${formatExactMessageDateTime(msg.created_at)}`} className={`cursor-pointer transition-colors ${isMediaOnlyMessage ? '' : `px-4 py-2 rounded-2xl text-sm shadow-sm ${isMe
                                                        ? expandedTimestampId === messageKey ? 'bg-indigo-700 text-white rounded-br-none' : 'bg-indigo-600 text-white rounded-br-none'
                                                        : expandedTimestampId === messageKey ? 'bg-slate-100 border border-slate-300 text-slate-800 rounded-bl-none' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
                                                    }`}`}>
                                                        {msg.reply_to_id && !msg.reply_attachment_path && <p className="m-0 mb-1 truncate text-xs opacity-80">{msg.reply_message || 'Message'}</p>}
                                                        {msg.message && <p className="m-0 break-words">{msg.message}</p>}
                                                        {mediaPath && (() => {
                                                            const isVideo = /\.(mp4|webm|mov)(?:\?|$)/i.test(mediaPath);
                                                            const isImage = /\.(jpg|jpeg|png|gif|webp)(?:\?|$)/i.test(mediaPath);
                                                            if (!isVideo && !isImage) return <a className="mt-2 block text-sm underline" href={mediaUrl} target="_blank" rel="noreferrer">{msg.file_name || 'Download attachment'}</a>;
                                                            return isVideo
                                                                ? <div className="mt-2 relative block max-w-full overflow-hidden rounded-lg bg-black" onClick={(event) => { event.stopPropagation(); if (!event.currentTarget.querySelector('video')?.paused) setMediaPreview({ src: mediaUrl, isVideo: true }); }}>
                                                                    <video src={mediaUrl} controls playsInline preload="metadata" aria-label="Message video. Tap again while playing to view full size." className="block max-w-full max-h-52 rounded-lg" />
                                                                </div>
                                                                : <button type="button" onClick={(event) => { event.stopPropagation(); setMediaPreview({ src: mediaUrl, isVideo: false }); }} aria-label="View full image" className="mt-2 relative block max-w-full overflow-hidden rounded-lg border-0 bg-transparent p-0 cursor-zoom-in">
                                                                    <img src={mediaUrl} alt="Message attachment" className="max-w-full max-h-52 rounded-lg" />
                                                                </button>;
                                                        })()}
                                                    </div>
                                                    {expandedTimestampId === messageKey && (
                                                        <p className={`pointer-events-none absolute top-full z-10 mt-1 w-max max-w-[min(80vw,20rem)] whitespace-normal break-words text-[10px] leading-3.5 text-slate-500 animate-fade-in-up ${isMe ? 'right-0 text-right' : 'left-0 text-left'}`}>
                                                            {formatExactMessageDateTime(msg.created_at)}
                                                        </p>
                                                    )}
                                                    {isLatestSentMessage && (
                                                        <p className="m-0 mt-1 text-right text-[10px] text-slate-500 font-medium">
                                                            {Number(msg.is_read) === 1 ? 'Seen' : 'Sent'}
                                                        </p>
                                                    )}
                                                </div>
                                        {!isMe && <button type="button" onClick={() => setReplyingTo(msg)} aria-label="Reply to this message" title="Reply" className="message-reply-button flex h-7 w-7 shrink-0 items-center justify-center border-0 bg-transparent text-slate-500 hover:text-indigo-600 cursor-pointer sm:h-6 sm:w-6"><FontAwesomeIcon icon={faReply} className="text-[10px]" /></button>}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    )}

                    {/* Input Field Section */}
                    {(activeChat || (!userId && guestToken)) && (
                        <div className={`p-2 sm:p-3 bg-white shrink-0 ${replyingTo ? '' : 'border-t border-slate-200'}`}>
                            {replyingTo && <div className="mb-2 flex items-center justify-between rounded-lg border-0 bg-white px-3 py-2 text-xs text-slate-700"><div className="min-w-0"><strong>Replying to {String(replyingTo.sender_id) === (isGuestChat ? 'guest' : String(userId)) ? 'yourself' : (isGuestChat ? 'Admin User' : activeChat?.other_user_name)}</strong><p className="m-0 truncate">{replyingTo.message || 'Attachment'}</p></div><button type="button" onClick={() => setReplyingTo(null)} aria-label="Cancel reply" className="border-0 bg-transparent text-slate-500 cursor-pointer"><FontAwesomeIcon icon={faTimes} /></button></div>}
                            {attachment && <div className="flex items-center justify-start p-2">
                                <ChatAttachmentPreview file={attachment} previewUrl={attachmentPreviewUrl} onRemove={() => setAttachment(null)} />
                            </div>}
                            <form onSubmit={isGuestChat ? sendGuestMessage : handleSendMessage} className="flex items-center gap-1">
                                <div className="flex shrink-0 items-center gap-1">
                                <label className="flex h-11 w-11 items-center justify-center rounded-full cursor-pointer text-slate-500 hover:bg-slate-100 transition-colors focus-within:ring-2 focus-within:ring-indigo-500" title="Choose an image or video (images up to 10 MB; videos up to 25 MB)"><FontAwesomeIcon icon={faPaperclip} aria-hidden="true" /><span className="sr-only">Attach an image or video</span><input type="file" accept={CHAT_ACCEPT} className="sr-only" onChange={pickAttachment} /></label>
                                <button type="button" onClick={() => cameraInputRef.current?.click()} aria-label="Take a photo with your phone camera" title="Take a photo with your phone camera (max 10 MB)" className="flex h-11 w-11 items-center justify-center rounded-full cursor-pointer text-slate-500 bg-transparent border-0 hover:bg-slate-100 transition-colors"><FontAwesomeIcon icon={faCamera} aria-hidden="true" /></button>
                                </div>
                                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pickAttachment} />
                                <button type="button" onClick={() => videoInputRef.current?.click()} aria-label="Record a video with your phone camera" title="Record a video with your phone camera (max 25 MB)" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full cursor-pointer text-slate-500 bg-transparent border-0 hover:bg-slate-100 transition-colors"><FontAwesomeIcon icon={faVideo} aria-hidden="true" /></button>
                                <input ref={videoInputRef} type="file" accept="video/*" capture="environment" className="hidden" onChange={pickAttachment} />
                                <div className="flex h-10 min-w-0 flex-1 items-center rounded-2xl bg-slate-100 px-2 focus-within:ring-2 focus-within:ring-indigo-500">
                                <input
                                    type="text"
                                    id="chat-message"
                                    name="message"
                                    autoComplete="off"
                                    aria-label="Message"
                                    data-autofocus
                                    aria-invalid={sendError ? true : undefined}
                                    aria-describedby={sendError ? 'chat-message-error' : undefined}
                                    maxLength={LIMITS.message}
                                    value={newMessage}
                                    onChange={(e) => { handleInputChange(e); if (sendError) setSendError(''); }}
                                    placeholder="Type a message..."
                                    className="h-full flex-1 min-w-0 bg-transparent px-2 text-sm outline-none border-0"
                                />
                                </div>
                                <button
                                    type="submit"
                                    disabled={isSending || (!newMessage.trim() && !attachment)}
                                    className="w-11 h-11 flex items-center justify-center bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-all border-0 cursor-pointer shrink-0"
                                    aria-label="Send message"
                                >
                                    <FontAwesomeIcon icon={faPaperPlane} className="text-sm" aria-hidden="true" />
                                </button>
                            </form>
                            <FieldError id="chat-message" error={sendError} className="px-2" />
                        </div>
                    )}
                </div>
            )}
            {mediaPreview && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4" role="dialog" aria-modal="true" aria-label="Full-size message attachment" onClick={() => setMediaPreview(null)}>
                    <button type="button" onClick={() => setMediaPreview(null)} aria-label="Close full-size preview" className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border-0 bg-white/15 text-white hover:bg-white/25 cursor-pointer">
                        <FontAwesomeIcon icon={faTimes} />
                    </button>
                    {mediaPreview.isVideo
                        ? <video controls autoPlay src={mediaPreview.src} className="max-h-full max-w-full rounded-lg" onClick={(event) => event.stopPropagation()} />
                        : <img src={mediaPreview.src} alt="Full-size message attachment" className="max-h-full max-w-full object-contain" onClick={(event) => event.stopPropagation()} />}
                </div>
            )}
        </div>
    );
};

export default ChatWidget;