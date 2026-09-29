import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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

const CHAT_ACCEPT = `${acceptFor(FILE_RULES.chatImage)},${acceptFor(FILE_RULES.chatVideo)}`;

const ChatWidget = () => {
    const navigate = useNavigate();
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
    const totalUnreadCount = conversations.reduce((sum, conv) => sum + Number(conv.unread_count || 0), 0);

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
    }, [messages, isChatOpen, activeChat]);

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

    if (!userId) return null;

    return (
        <div className="fixed bottom-2 right-2 z-50 font-sans sm:bottom-6 sm:right-6">
            {!isChatOpen ? (
                /* Floating Chat Trigger Button */
                <button
                    type="button"
                    onClick={() => setIsChatOpen(true)}
                    className="w-14 h-14 bg-indigo-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-indigo-700 transition-all transform hover:scale-110 cursor-pointer border-0"
                    aria-label="Open Chat"
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
                    ref={chatWindowRef}
                    className="w-[min(24rem,calc(100vw-1rem))] h-[min(500px,calc(100dvh-1rem))] min-h-0 bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 sm:h-[500px]"
                >
                    {/* Header */}
                    <div className="bg-indigo-600 p-4 text-white flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-2 min-w-0">
                            {activeChat && (
                                <button 
                                    type="button"
                                    onClick={() => setActiveChat(null)} 
                                    className="text-white hover:text-indigo-200 p-1 bg-transparent border-0 cursor-pointer mr-1"
                                    title="Back to conversation list"
                                >
                                    <FontAwesomeIcon icon={faArrowLeft} />
                                </button>
                            )}
                            <span className="font-semibold truncate">
                                {activeChat ? activeChat.other_user_name : 'Messages'}
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
                                className="text-white hover:text-indigo-200 p-1 bg-transparent border-0 cursor-pointer"
                                aria-label="Close Chat"
                            >
                                <FontAwesomeIcon icon={faTimes} />
                            </button>
                        </div>
                    </div>

                    {/* Chat Body */}
                    {!activeChat ? (
                        /* Conversation Directory List */
                        <div className="flex-1 overflow-y-auto bg-white">
                            {conversations.length === 0 ? (
                                renderEmptyState()
                            ) : (
                                conversations.map((conv) => (
                                    <div 
                                        key={conv.other_user_id}
                                        onClick={() => {
                                            setActiveChat(conv);
                                            if (fetchChatHistory) {
                                                fetchChatHistory(conv.other_user_id);
                                            }
                                        }}
                                        className="flex items-center gap-3 p-4 hover:bg-slate-50 cursor-pointer transition-colors border-b border-slate-100"
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
                                            <div className="flex justify-between items-center mb-0.5">
                                                <h4 className={`text-sm truncate m-0 ${Number(conv.unread_count) > 0 ? 'font-bold text-slate-900' : 'font-semibold text-slate-900'}`}>
                                                    {conv.other_user_name}
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
                    ) : (
                        /* Active Conversation Message Stream */
                        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3 bg-slate-50">
                            {messages.length === 0 ? (
                                <div className="text-center text-slate-400 text-xs mt-10">
                                    Send a message to start this conversation.
                                </div>
                            ) : (
                                messages.map((msg, index) => {
                                    const messageKey = msg.id || index;
                                    const isMe = String(msg.sender_id) === String(userId);
                                    const messageDate = new Date(msg.created_at);
                                    const previousDate = index > 0 ? new Date(messages[index - 1].created_at) : null;
                                    const minuteGap = previousDate && !Number.isNaN(previousDate.getTime())
                                        ? messageDate.getTime() - previousDate.getTime() >= 5 * 60 * 1000
                                        : false;
                                    const showDateSeparator = !previousDate || Number.isNaN(previousDate.getTime()) || previousDate.toDateString() !== messageDate.toDateString() || minuteGap;
                                    const isLatestSentMessage = isMe && !messages.slice(index + 1).some(
                                        (laterMessage) => String(laterMessage.sender_id) === String(userId)
                                    );
                                    const isMediaOnlyMessage = Boolean(msg.attachment_path) && !msg.message;
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
                                                        <span>{isMe ? 'You' : activeChat.other_user_name} replied to {String(msg.reply_sender_id) === String(msg.sender_id) ? 'themselves' : (isMe ? activeChat.other_user_name : 'you')}</span>
                                                    </div>}
                                                    {msg.reply_to_id && msg.reply_attachment_path && (() => {
                                                        const replyIsVideo = /\.(mp4|webm|mov)(?:\?|$)/i.test(msg.reply_attachment_path);
                                                        const replyMediaUrl = fileUrl(msg.reply_attachment_path);
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
                                                        {msg.attachment_path && (() => {
                                                            const mediaUrl = msg.attachment_path.startsWith('blob:') ? msg.attachment_path : new URL(`../${msg.attachment_path}`, api.defaults.baseURL).href;
                                                            const isVideo = /\.(mp4|webm|mov)(?:\?|$)/i.test(msg.attachment_path);
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
                    {activeChat && (
                        <div className={`p-2 sm:p-3 bg-white shrink-0 ${replyingTo ? '' : 'border-t border-slate-200'}`}>
                            {replyingTo && <div className="mb-2 flex items-center justify-between rounded-lg border-0 bg-white px-3 py-2 text-xs text-slate-700"><div className="min-w-0"><strong>Replying to {String(replyingTo.sender_id) === String(userId) ? 'yourself' : activeChat.other_user_name}</strong><p className="m-0 truncate">{replyingTo.message || (replyingTo.attachment_path ? 'Attachment' : 'Message')}</p></div><button type="button" onClick={() => setReplyingTo(null)} aria-label="Cancel reply" className="border-0 bg-transparent text-slate-500 cursor-pointer"><FontAwesomeIcon icon={faTimes} /></button></div>}
                            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                                <label className="flex h-10 w-8 shrink-0 items-center justify-center cursor-pointer text-slate-500" title="Choose an image or video (images up to 10 MB; videos up to 25 MB)"><FontAwesomeIcon icon={faPaperclip} /><input type="file" accept={CHAT_ACCEPT} className="hidden" onChange={pickAttachment} /></label>
                                <button type="button" onClick={() => cameraInputRef.current?.click()} aria-label="Take a photo with your phone camera" title="Take a photo with your phone camera (max 10 MB)" className="flex h-10 w-8 shrink-0 items-center justify-center cursor-pointer text-slate-500 bg-transparent border-0"><FontAwesomeIcon icon={faCamera} /></button>
                                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pickAttachment} />
                                <button type="button" onClick={() => videoInputRef.current?.click()} aria-label="Record a video with your phone camera" title="Record a video with your phone camera (max 25 MB)" className="flex h-10 w-8 shrink-0 items-center justify-center cursor-pointer text-slate-500 bg-transparent border-0"><FontAwesomeIcon icon={faVideo} /></button>
                                <input ref={videoInputRef} type="file" accept="video/*" capture="environment" className="hidden" onChange={pickAttachment} />
                                <div className="flex min-w-0 flex-1 flex-col rounded-2xl bg-slate-100 px-2 py-1.5 focus-within:ring-2 focus-within:ring-indigo-500">
                                    <ChatAttachmentPreview file={attachment} previewUrl={attachmentPreviewUrl} onRemove={() => setAttachment(null)} />
                                    <div className="flex min-w-0 items-center gap-2">
                                <input
                                    type="text"
                                    id="chat-message"
                                    name="message"
                                    autoComplete="off"
                                    aria-label="Message"
                                    aria-invalid={sendError ? true : undefined}
                                    aria-describedby={sendError ? 'chat-message-error' : undefined}
                                    maxLength={LIMITS.message}
                                    value={newMessage}
                                    onChange={(e) => { handleInputChange(e); if (sendError) setSendError(''); }}
                                    placeholder="Type a message..."
                                    className="flex-1 min-w-0 bg-transparent px-2 py-2 text-sm outline-none border-0"
                                />
                                    </div>
                                </div>
                                <button
                                    type="submit"
                                    disabled={isSending || (!newMessage.trim() && !attachment)}
                                    className="w-9 h-9 flex items-center justify-center bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-all border-0 cursor-pointer shrink-0"
                                    aria-label="Send message"
                                >
                                    <FontAwesomeIcon icon={faPaperPlane} className="text-xs" />
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