import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import api from '../api/axiosConfig';
import { io } from 'socket.io-client';

const ChatContext = createContext();

export const ChatProvider = ({ children }) => {
    const [conversations, setConversations] = useState([]);
    const [activeChat, setActiveChat] = useState(null); // { other_user_id, other_user_name, other_user_avatar }
    const [messages, setMessages] = useState([]);
    const [isTyping, setIsTyping] = useState({});
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [userId, setUserId] = useState(null);
    const [userRole, setUserRole] = useState(null);

    const activeChatRef = useRef(null);
    const historyPollRef = useRef(null);
    const conversationsPollRef = useRef(null);
    const socketRef = useRef(null);

    const ensureSocketConnection = useCallback(() => {
        if (!userId || socketRef.current) return;

        const socket = io('http://localhost:3001', {
            transports: ['websocket'],
            autoConnect: true,
            reconnection: true,
            reconnectionAttempts: 5,
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            socket.emit('join', userId);
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
            // Keep the ref so reconnects can happen automatically.
        });
    }, [userId]);

    useEffect(() => {
        activeChatRef.current = activeChat;
    }, [activeChat]);

    useEffect(() => {
        const loggedInUserStr = sessionStorage.getItem('loggedInUser') || localStorage.getItem('loggedInUser');
        if (!loggedInUserStr) return;

        try {
            const loggedInUser = JSON.parse(loggedInUserStr);
            setUserId(loggedInUser.id || null);
            setUserRole(loggedInUser.role || null);
        } catch (error) {
            console.error('Error parsing loggedInUser', error);
        }
    }, []);

    const fetchConversations = useCallback(async () => {
        if (!userId) return;
        try {
            const response = await api.get('get_conversations.php');
            if (response.data?.success) {
                setConversations(response.data.conversations || []);
            }
        } catch (error) {
            console.error('Error fetching conversations:', error);
        }
    }, [userId]);

    const fetchChatHistory = useCallback(async (otherUserId) => {
        if (!userId || !otherUserId) return;
        try {
            const response = await api.get('get_chat_history.php', {
                params: { other_user_id: otherUserId },
            });
            if (response.data?.success) {
                setMessages(response.data.messages || []);
            }
        } catch (error) {
            console.error('Error fetching chat history:', error);
        }
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

    const mergeIncomingMessage = useCallback((incomingMessage) => {
        if (!incomingMessage) return;

        setMessages((prev) => {
            const exists = prev.some((msg) => msg.id && incomingMessage.id && String(msg.id) === String(incomingMessage.id));
            if (exists) {
                return prev.map((msg) => (String(msg.id) === String(incomingMessage.id) ? incomingMessage : msg));
            }
            return [...prev, incomingMessage];
        });

        setConversations((prev) => {
            const otherUserId = Number(incomingMessage.sender_id) === Number(userId)
                ? Number(incomingMessage.receiver_id)
                : Number(incomingMessage.sender_id);

            if (!otherUserId) return prev;

            const currentChat = activeChatRef.current;
            const isActiveChat = currentChat?.other_user_id && Number(currentChat.other_user_id) === otherUserId;
            const unreadDelta = Number(incomingMessage.sender_id) === Number(userId) || isActiveChat ? 0 : 1;

            let matched = false;
            const updated = prev.map((conv) => {
                if (Number(conv.other_user_id) !== otherUserId) return conv;
                matched = true;
                return {
                    ...conv,
                    last_message: incomingMessage.message,
                    last_message_sender_id: Number(incomingMessage.sender_id),
                    last_message_time: incomingMessage.created_at,
                    unread_count: Number(incomingMessage.sender_id) === Number(userId)
                        ? Number(conv.unread_count || 0)
                        : (isActiveChat ? 0 : Number(conv.unread_count || 0) + 1),
                };
            });

            if (!matched) {
                return prev;
            }

            return updated;
        });

        const currentChat = activeChatRef.current;
        if (currentChat?.other_user_id && Number(currentChat.other_user_id) === Number(incomingMessage.sender_id)) {
            setMessages((prev) => {
                if (prev.some((msg) => msg.id && incomingMessage.id && String(msg.id) === String(incomingMessage.id))) {
                    return prev;
                }
                return [...prev, incomingMessage];
            });
        }
    }, [userId]);

    const openSupportChat = useCallback(async () => {
        if (!userId) return;

        const admin = await fetchAdminUser();
        if (!admin) return;

        const conversation = {
            other_user_id: admin.id,
            other_user_name: `${admin.first_name || 'Admin'} ${admin.last_name || 'User'}`.trim(),
            other_user_avatar: admin.avatar_url || null,
        };

        setActiveChat(conversation);
        setIsChatOpen(true);
        await fetchChatHistory(admin.id);
    }, [fetchAdminUser, fetchChatHistory, userId]);

    const sendMessage = useCallback(async (receiverId, message) => {
        if (!message.trim() || !userId) return;

        const receiver = parseInt(receiverId, 10);
        if (!receiver) return;

        const optimisticMessage = {
            id: Date.now(),
            sender_id: userId,
            receiver_id: receiver,
            message: message.trim(),
            created_at: new Date().toISOString(),
            is_read: 0,
        };

        setMessages((prev) => [...prev, optimisticMessage]);

        try {
            const socket = socketRef.current;
            if (socket && socket.connected) {
                socket.emit('send_message', {
                    sender_id: userId,
                    receiver_id: receiver,
                    message: message.trim(),
                });
            } else {
                const response = await api.post('send_message.php', {
                    receiver_id: receiver,
                    message: message.trim(),
                });

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
    }, [refreshChatState, userId]);

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
        if (!userId) return undefined;

        ensureSocketConnection();
        refreshChatState();

        conversationsPollRef.current = window.setInterval(() => {
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
        };
    }, [ensureSocketConnection, fetchConversations, refreshChatState, userId]);

    useEffect(() => {
        if (!activeChat?.other_user_id || !userId) {
            setMessages([]);
            if (historyPollRef.current) {
                window.clearInterval(historyPollRef.current);
                historyPollRef.current = null;
            }
            return undefined;
        }

        fetchChatHistory(activeChat.other_user_id);

        historyPollRef.current = window.setInterval(() => {
            const currentChat = activeChatRef.current;
            if (currentChat?.other_user_id) {
                fetchChatHistory(currentChat.other_user_id);
            }
        }, 2500);

        return () => {
            if (historyPollRef.current) {
                window.clearInterval(historyPollRef.current);
                historyPollRef.current = null;
            }
        };
    }, [activeChat, fetchChatHistory, userId]);

    useEffect(() => {
        if (userRole === 'admin' || !userId) return;

        if (isChatOpen && conversations.length === 0 && !activeChat) {
            openSupportChat();
        }
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
                fetchChatHistory,
                handleTyping,
                openSupportChat,
            }}
        >
            {children}
        </ChatContext.Provider>
    );
};

export const useChat = () => useContext(ChatContext);