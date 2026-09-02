import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import api from '../api/axiosConfig';

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
            const response = await api.post('send_message.php', {
                receiver_id: receiver,
                message: message.trim(),
            });

            if (response.data?.success && response.data.message) {
                setMessages((prev) => prev.map((msg) => (
                    msg.id === optimisticMessage.id ? response.data.message : msg
                )));
            }

            await refreshChatState();
        } catch (error) {
            console.error('Failed to send message:', error);
            setMessages((prev) => prev.filter((msg) => msg.id !== optimisticMessage.id));
            throw error;
        }
    }, [refreshChatState, userId]);

    const handleTyping = useCallback(() => {
        // Typing indicators are currently disabled because the chat now uses HTTP polling.
    }, []);

    useEffect(() => {
        if (!userId) return undefined;

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
        };
    }, [fetchConversations, refreshChatState, userId]);

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