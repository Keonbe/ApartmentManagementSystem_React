// Convert guest-chat records to the common registered-chat message contract.
export const normalizeGuestMessage = (message, currentUserRole = 'guest') => ({
    ...message,
    sender_id: message.sender_role === 'guest' ? 'guest' : currentUserRole === 'admin' ? 'current-admin' : 'admin',
    receiver_id: message.sender_role === 'guest' ? 'admin' : 'guest',
    reply_sender_id: message.reply_sender_role === 'guest' ? 'guest' : currentUserRole === 'admin' ? 'current-admin' : 'admin',
});

export const normalizeGuestMessages = (messages = [], currentUserRole = 'guest') => messages.map((message) => normalizeGuestMessage(message, currentUserRole));