import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import api from '../api/axiosConfig';
import { io } from 'socket.io-client';
import useLoadState from '../hooks/useLoadState';
import { CHAT_SOCKET_URL } from '../api/env';
import { personName } from '../utils/personName';

const ChatContext = createContext();

export const ChatProvider = ({ children }) => {
    const [conversations, setConversations] = useState([]);
    // loading | error | ready for the unfiltered list, so a page can tell a failed
    // load from "no conversations" (fetchConversations returns [] for both).
    const { state: conversationsStatus, ready: conversationsReady, fail: conversationsFail, retry: conversationsRetry } = useLoadState();
    const lastUserIdRef = useRef(null);
    const [activeChat, setActiveChat] = useState(null); // { other_user_id, other_user_name, other_user_avatar }
    const [messages, setMessages] = useState([]);
    const [isTyping, setIsTyping] = useState({});
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [userId, setUserId] = useState(null);
    const [userRole, setUserRole] = useState(null);
    const [socketStatus, setSocketStatus] = useState('offline');

    const activeChatRef = useRef(null);
    const historyPollRef = useRef(null);
    const conversationsPollRef = useRef(null);
    const socketRef = useRef(null);

    const ensureSocketConnection = useCallback(() => {
        if (!userId || socketRef.current) return;

        setSocketStatus('connecting');

        const socket = io(CHAT_SOCKET_URL, {
            transports: ['websocket'],
            autoConnect: true,
            reconnection: true,
            reconnectionAttempts: 5,
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            setSocketStatus('live');
            socket.emit('join', userId);
        });

        socket.on('connect_error', () => {
            setSocketStatus('offline');
        });

        socket.on('reconnect_attempt', () => {
            setSocketStatus('connecting');
        });

        socket.on('reconnect', () => {
            setSocketStatus('live');
        });

        socket.on('receive_message', (incomingMessage) => {
            if (!incomingMessage) return;
            const normalizedMessage = {
                ...incomingMessage,
                sender_id: Number(incomingMessage.sender_id),
                receiver_id: Number(incomingMessage.receiver_id),
            };

            const currentChat = activeChatRef.current;
            const isRelevantChat = currentChat?.other_user_id && (
                Number(currentChat.other_user_id) === Number(normalizedMessage.sender_id) ||
                Number(currentChat.other_user_id) === Number(normalizedMessage.receiver_id)
            );

            if (isRelevantChat) {
                setMessages((prev) => {
                    const exists = prev.some((msg) => msg.id && normalizedMessage.id && String(msg.id) === String(normalizedMessage.id));
                    if (exists) {
                        return prev.map((msg) => (String(msg.id) === String(normalizedMessage.id) ? normalizedMessage : msg));
                    }
                    return [...prev, normalizedMessage];
                });
            }

            setConversations((prev) => {
                const otherUserId = Number(normalizedMessage.sender_id) === Number(userId)
                    ? Number(normalizedMessage.receiver_id)
                    : Number(normalizedMessage.sender_id);

                if (!otherUserId) return prev;

                let matched = false;
                const updated = prev.map((conv) => {
                    if (Number(conv.other_user_id) !== otherUserId) return conv;
                    matched = true;
                    const incrementUnread = Number(normalizedMessage.sender_id) !== Number(userId)
                        && (!currentChat?.other_user_id || Number(currentChat.other_user_id) !== otherUserId);

                    return {
                        ...conv,
                        last_message: normalizedMessage.message,
                        last_message_attachment_path: normalizedMessage.attachment_path || null,
                        last_message_sender_id: Number(normalizedMessage.sender_id),
                        last_message_time: normalizedMessage.created_at,
                        unread_count: incrementUnread ? Number(conv.unread_count || 0) + 1 : Number(conv.unread_count || 0),
                    };
                });

                return matched ? updated : prev;
            });
        });

        socket.on('user_typing', ({ sender_id }) => {
            setIsTyping((prev) => ({ ...prev, [sender_id]: true }));
        });

        socket.on('user_stop_typing', ({ sender_id }) => {
            setIsTyping((prev) => {
                if (!prev[sender_id]) return prev;
                const next = { ...prev };
                delete next[sender_id];
                return next;
            });
        });

        socket.on('disconnect', () => {
            setSocketStatus('offline');
            // Keep the ref so reconnects can happen automatically.
        });
    }, [userId]);

    useEffect(() => {
        activeChatRef.current = activeChat;
    }, [activeChat]);

    useEffect(() => {
        const syncLoggedInUser = () => {
            const loggedInUserStr = sessionStorage.getItem('loggedInUser') || localStorage.getItem('loggedInUser');
            if (!loggedInUserStr) {
                setUserId(null);
                setUserRole(null);
                setIsChatOpen(false);
                setConversations([]);
                conversationsRetry();
                lastUserIdRef.current = null;
                setActiveChat(null);
                setMessages([]);
                return;
            }

            try {
                const loggedInUser = JSON.parse(loggedInUserStr);
                // A different account must not inherit the previous one's "ready".
                if (lastUserIdRef.current !== (loggedInUser.id || null)) conversationsRetry();
                lastUserIdRef.current = loggedInUser.id || null;
                setUserId(loggedInUser.id || null);
                setUserRole(loggedInUser.role || null);
                setSocketStatus('offline');
            } catch (error) {
                console.error('Error parsing loggedInUser', error);
            }
        };

        syncLoggedInUser();
        window.addEventListener('auth-changed', syncLoggedInUser);
        window.addEventListener('storage', syncLoggedInUser);

        return () => {
            window.removeEventListener('auth-changed', syncLoggedInUser);
            window.removeEventListener('storage', syncLoggedInUser);
        };
    }, [conversationsRetry]);

    const fetchConversations = useCallback(async (search = '') => {
        if (!userId) return;
        try {
            const response = await api.get('get_conversations.php', {
                params: search.trim() ? { search: search.trim() } : {},
            });
            if (response.data?.success) {
                const fetched = response.data.conversations || [];
                if (!search.trim()) { setConversations(fetched); conversationsReady(); }
                return fetched;
            }
            if (!search.trim()) conversationsFail();
        } catch (error) {
            console.error('Error fetching conversations:', error);
            if (!search.trim()) conversationsFail();
        }
        return [];
    }, [userId, conversationsReady, conversationsFail]);

    const fetchChatHistory = useCallback(async (otherUserId, markAsRead = false) => {
        if (!userId || !otherUserId) return;
        try {
            const response = await api.get('get_chat_history.php', {
                params: { other_user_id: otherUserId, mark_as_read: markAsRead ? 1 : 0 },
            });
            if (response.data?.success) {
                const refreshedMessages = response.data.messages || [];
                setMessages((currentMessages) => {
                    const hasSameMessages = currentMessages.length === refreshedMessages.length
                        && currentMessages.every((message, index) => {
                            const refreshedMessage = refreshedMessages[index];
                            return String(message.id) === String(refreshedMessage.id)
                                && String(message.sender_id) === String(refreshedMessage.sender_id)
                                && String(message.receiver_id) === String(refreshedMessage.receiver_id)
                                && message.message === refreshedMessage.message
                                && message.created_at === refreshedMessage.created_at
                                && Number(message.is_read) === Number(refreshedMessage.is_read);
                        });

                    return hasSameMessages ? currentMessages : refreshedMessages;
                });
                return refreshedMessages;
            }
        } catch (error) {
            console.error('Error fetching chat history:', error);
        }
        return [];
    }, [userId]);

    const fetchAdminUser = useCallback(async () => {
        try {
            const response = await api.get('get_admin_user.php');
            if (response.data?.success && response.data.user?.id) {
                return response.data.user;
            }
        } catch (error) {
            console.error('Error fetching admin user:', error);
        }
        return null;
    }, []);

    const refreshChatState = useCallback(async () => {
        await fetchConversations();

        const currentChat = activeChatRef.current;
        if (currentChat?.other_user_id) {
            await fetchChatHistory(currentChat.other_user_id);
        }
    }, [fetchChatHistory, fetchConversations]);

    const openSupportChat = useCallback(async () => {
        if (!userId) return;

        if (userRole === 'admin') {
            setActiveChat(null);
            return;
        }

        const admin = await fetchAdminUser();
        if (!admin) return;

        const adminName = personName(admin);
        const conversation = {
            other_user_id: admin.id,
            other_user_name: adminName || 'Admin',
            other_user_avatar: admin.avatar_url || null,
        };

        setActiveChat(conversation);
        setIsChatOpen(true);
        await fetchChatHistory(admin.id);
    }, [fetchAdminUser, fetchChatHistory, setActiveChat, userId, userRole]);

    const sendMessage = useCallback(async (receiverId, message, attachment = null, replyToId = null) => {
        if ((!message.trim() && !attachment) || !userId) return;

        const receiver = parseInt(receiverId, 10);
        if (!receiver) return;

        const optimisticMessage = {
            id: Date.now(),
            sender_id: userId,
            receiver_id: receiver,
            message: message.trim(),
            attachment_path: attachment ? URL.createObjectURL(attachment) : null,
            reply_to_id: replyToId,
            ...(() => {
                const replyTarget = replyToId
                    ? messages.find((item) => String(item.id) === String(replyToId))
                    : null;
                return replyTarget ? {
                    reply_message: replyTarget.message || null,
                    reply_attachment_path: replyTarget.attachment_path || null,
                    reply_sender_id: replyTarget.sender_id,
                } : {};
            })(),
            created_at: new Date().toISOString(),
            is_read: 0,
        };

        setMessages((prev) => [...prev, optimisticMessage]);

        try {
            const socket = socketRef.current;
            if (socket && socket.connected && !attachment) {
                socket.emit('send_message', {
                    sender_id: userId,
                    receiver_id: receiver,
                    message: message.trim(),
                    reply_to_id: replyToId,
                });
            } else {
                let response;
                if (attachment) {
                    const formData = new FormData();
                    formData.append('receiver_id', receiver);
                    formData.append('message', message.trim());
                    if (replyToId) formData.append('reply_to_id', replyToId);
                    formData.append('attachment', attachment);
                    response = await api.post('send_message.php', formData, {
                        headers: { 'Content-Type': 'multipart/form-data' },
                    });
                } else {
                    response = await api.post('send_message.php', { receiver_id: receiver, message: message.trim(), reply_to_id: replyToId });
                }

                if (response.data?.success && response.data.message) {
                    setMessages((prev) => prev.map((msg) => (
                        msg.id === optimisticMessage.id ? response.data.message : msg
                    )));
                }
            }

            await refreshChatState();
        } catch (error) {
            console.error('Failed to send message:', error);
            setMessages((prev) => prev.filter((msg) => msg.id !== optimisticMessage.id));
            throw error;
        }
    }, [messages, refreshChatState, userId]);

    const handleTyping = useCallback((receiverId, isTypingNow) => {
        const socket = socketRef.current;
        if (socket && socket.connected && userId && receiverId) {
            socket.emit('typing', {
                sender_id: userId,
                receiver_id: receiverId,
                is_typing: Boolean(isTypingNow),
            });
        }
    }, [userId]);

    useEffect(() => {
        if (!userId) {
            // Reset the connection status when authentication disappears.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSocketStatus('offline');
            return undefined;
        }

        ensureSocketConnection();
        refreshChatState();

        // Polling is only the fallback for the socket: skip hidden tabs (they
        // refresh when shown again) and, while the socket is live, poll 1 in 5.
        // Many open admin tabs polling every few seconds used to saturate the server.
        let conversationTick = 0;
        conversationsPollRef.current = window.setInterval(() => {
            if (document.hidden) return;
            conversationTick += 1;
            if (socketRef.current?.connected && conversationTick % 5 !== 0) return;
            fetchConversations();
        }, 6000);

        const handleWindowFocus = () => {
            refreshChatState();
        };

        const handleVisibilityChange = () => {
            if (!document.hidden) {
                refreshChatState();
            }
        };

        const handlePageShow = () => {
            refreshChatState();
        };

        window.addEventListener('focus', handleWindowFocus);
        window.addEventListener('pageshow', handlePageShow);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            if (conversationsPollRef.current) {
                window.clearInterval(conversationsPollRef.current);
                conversationsPollRef.current = null;
            }
            window.removeEventListener('focus', handleWindowFocus);
            window.removeEventListener('pageshow', handlePageShow);
            document.removeEventListener('visibilitychange', handleVisibilityChange);

            if (socketRef.current) {
                socketRef.current.removeAllListeners();
                socketRef.current.disconnect();
                socketRef.current = null;
            }
            setSocketStatus('offline');
        };
    }, [ensureSocketConnection, fetchConversations, refreshChatState, userId]);

    useEffect(() => {
        if (!activeChat?.other_user_id || !userId) {
            // Clear messages when the selected chat is cleared or the user signs out.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setMessages([]);
            if (historyPollRef.current) {
                window.clearInterval(historyPollRef.current);
                historyPollRef.current = null;
            }
            return undefined;
        }

        const shouldMarkAsRead = () => document.visibilityState === 'visible'
            && (userRole === 'admin' || isChatOpen)
            && Number(activeChatRef.current?.other_user_id) === Number(activeChat.other_user_id);

        fetchChatHistory(activeChat.other_user_id, shouldMarkAsRead());

        let historyTick = 0;
        historyPollRef.current = window.setInterval(() => {
            if (document.hidden) return;
            historyTick += 1;
            if (socketRef.current?.connected && historyTick % 6 !== 0) return;
            const currentChat = activeChatRef.current;
            if (currentChat?.other_user_id) {
                const shouldMarkAsRead = document.visibilityState === 'visible'
                    && (userRole === 'admin' || isChatOpen)
                    && Number(currentChat.other_user_id) === Number(activeChat.other_user_id);
                fetchChatHistory(currentChat.other_user_id, shouldMarkAsRead);
            }
        }, 2500);

        return () => {
            if (historyPollRef.current) {
                window.clearInterval(historyPollRef.current);
                historyPollRef.current = null;
            }
        };
    }, [activeChat, fetchChatHistory, isChatOpen, userId, userRole]);

    // Opening the support conversation is an async response to chat state
    // becoming ready, so defer it out of the effect's synchronous phase.
    useEffect(() => {
        if (userRole === 'admin' || !userId) return;

        if (isChatOpen && conversations.length === 0 && !activeChat) {
            const timeoutId = window.setTimeout(() => {
                openSupportChat();
            }, 0);
            return () => window.clearTimeout(timeoutId);
        }
        return undefined;
    }, [activeChat, conversations.length, isChatOpen, openSupportChat, userId, userRole]);

    return (
        <ChatContext.Provider
            value={{
                userId,
                userRole,
                conversations,
                activeChat,
                setActiveChat,
                messages,
                isTyping,
                isChatOpen,
                setIsChatOpen,
                sendMessage,
                fetchConversations,
                conversationsStatus,
                fetchChatHistory,
                handleTyping,
                openSupportChat,
                socketStatus,
            }}
        >
            {children}
        </ChatContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useChat = () => useContext(ChatContext);