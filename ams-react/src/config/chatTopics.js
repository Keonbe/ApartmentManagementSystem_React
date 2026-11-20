// What a chat is about (Components/chat/TopicBanner.jsx): status → pill tone, shared
// so every chat colours a status the same way.
export const INQUIRY_TONES = { New: 'indigo', Contacted: 'sky', Scheduled: 'amber', Reserved: 'violet', Converted: 'emerald', Resolved: 'emerald', Closed: 'slate' };
export const REPORT_TONES = { Open: 'amber', 'In Review': 'sky', Resolved: 'emerald' };

// window event (context/ChatContext.jsx): the other side changed a conversation,
// detail { otherUserId }. For views that load a chat on their own.
export const CHAT_UPDATED_EVENT = 'ams-chat-updated';
