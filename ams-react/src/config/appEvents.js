// Window events that keep separate parts of the app in step without a reload.

// Profile Settings saved the user's details or photo: TopBar re-reads the
// logged-in user and avatar (Profile Settings used to reload the whole page).
export const PROFILE_UPDATED_EVENT = 'profile-updated';

// A guest chat key was just stored (emailed link redeemed on the inquiry page):
// the chat widget picks it up and opens the conversation.
export const GUEST_CHAT_OPENED_EVENT = 'guest-chat-opened';
