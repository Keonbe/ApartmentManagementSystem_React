import React, { useState, useEffect, useRef } from 'react';
import { useChat } from '../context/ChatContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
    faComment, 
    faTimes, 
    faPaperPlane, 
    faCircle, 
    faArrowLeft 
} from '@fortawesome/free-solid-svg-icons';

const ChatWidget = () => {
    const { 
        userId, 
        conversations = [], 
        activeChat, 
        setActiveChat, 
        messages = [], 
        isTyping = {}, 
        isChatOpen, 
        setIsChatOpen, 
        sendMessage, 
        fetchChatHistory,
        handleTyping,
        openSupportChat,
        userRole,
    } = useChat();

    const [newMessage, setNewMessage] = useState('');
    const messagesEndRef = useRef(null);
    const chatWindowRef = useRef(null);
    const totalUnreadCount = conversations.reduce((sum, conv) => sum + Number(conv.unread_count || 0), 0);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const getFullAvatarUrl = (url) => {
        if (!url) return null;
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        const cleanPath = url.replace(/^\//, '');
        return `http://localhost/ApartmentManagementSystem_React/backend/${cleanPath}`;
    };

    const getSenderLabel = (senderId, otherUserName) => {
        if (!senderId) return '';
        return String(senderId) === String(userId) ? 'You' : (otherUserName || 'Admin');
    };

    useEffect(() => {
        if (isChatOpen && activeChat) {
            scrollToBottom();
        }
    }, [messages, isChatOpen, activeChat]);

    const handleSendMessage = (e) => {
        e.preventDefault();
        if (newMessage.trim() && activeChat) {
            sendMessage(activeChat.other_user_id, newMessage.trim())
                .then(() => {
                    setNewMessage('');
                    if (handleTyping) {
                        handleTyping(activeChat.other_user_id, false);
                    }
                })
                .catch(() => {
                    // Keep the input text so the user can retry.
                });
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
        <div className="fixed bottom-6 right-6 z-50 font-sans">
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
                    className="w-80 sm:w-96 h-[500px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200"
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
                        
                        <div className="flex items-center gap-3">
                            {activeChat && isTyping[activeChat.other_user_id] && (
                                <span className="flex items-center gap-1 text-[11px] text-indigo-200 animate-pulse">
                                    <FontAwesomeIcon icon={faCircle} className="text-emerald-400 text-[8px]" />
                                    Typing...
                                </span>
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
                                                src={getFullAvatarUrl(conv.other_user_avatar) || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(conv.other_user_name || 'User')} 
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
                                                {conv.last_message ? `${String(conv.last_message_sender_id) === String(userId) ? 'You' : (conv.other_user_name || 'Admin')}: ${conv.last_message}` : 'No messages yet'}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    ) : (
                        /* Active Conversation Message Stream */
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
                            {messages.length === 0 ? (
                                <div className="text-center text-slate-400 text-xs mt-10">
                                    Send a message to start this conversation.
                                </div>
                            ) : (
                                messages.map((msg, index) => {
                                    const isMe = String(msg.sender_id) === String(userId);
                                    return (
                                        <div 
                                            key={msg.id || index} 
                                            className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                                        >
                                            <div 
                                                className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm shadow-sm ${
                                                    isMe 
                                                        ? 'bg-indigo-600 text-white rounded-br-none' 
                                                        : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
                                                }`}
                                            >
                                                <p className="m-0 break-words">
                                                    <span className="font-semibold mr-1">
                                                        {getSenderLabel(msg.sender_id, activeChat?.other_user_name)}:
                                                    </span>
                                                    {msg.message}
                                                </p>
                                                <div className={`mt-1 flex justify-end ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                                                    <span className="text-[10px] leading-none whitespace-nowrap">
                                                        {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                                    </span>
                                                </div>
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
                        <div className="p-3 bg-white border-t border-slate-200 shrink-0">
                            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={newMessage}
                                    onChange={handleInputChange}
                                    placeholder="Type a message..."
                                    className="flex-1 min-w-0 bg-slate-100 rounded-full px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all outline-none border-0"
                                />
                                <button 
                                    type="submit"
                                    disabled={!newMessage.trim()}
                                    className="w-9 h-9 flex items-center justify-center bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-all border-0 cursor-pointer shrink-0"
                                    aria-label="Send message"
                                >
                                    <FontAwesomeIcon icon={faPaperPlane} className="text-xs" />
                                </button>
                            </form>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ChatWidget;