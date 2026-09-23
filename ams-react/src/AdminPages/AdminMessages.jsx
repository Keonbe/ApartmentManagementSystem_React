import { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faPaperPlane, faComments, faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import Sidebar from '../Components/AdminSidebar';
import Header from '../Components/AdminDashboardHeader';
import { useChat } from '../context/ChatContext';

const formatTime = (date) => {
  if (!date) return '';
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
};

const AdminMessages = () => {
  const {
    conversations = [], activeChat, setActiveChat, messages = [], sendMessage,
    fetchChatHistory, userId, fetchConversations,
  } = useChat();
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchConversations?.();
  }, [fetchConversations]);

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...conversations]
      .sort((a, b) => new Date(b.last_message_time || 0) - new Date(a.last_message_time || 0))
      .filter((conversation) => !query || `${conversation.other_user_name || ''} ${conversation.last_message || ''}`.toLowerCase().includes(query));
  }, [conversations, search]);

  const selectConversation = (conversation) => {
    setActiveChat(conversation);
    fetchChatHistory?.(conversation.other_user_id);
  };

  const handleSend = async (event) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || !activeChat || sending) return;
    setSending(true);
    try {
      await sendMessage(activeChat.other_user_id, message);
      setDraft('');
    } catch (error) {
      console.error('Failed to send admin message:', error);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden text-left">
        <Header title="Message Manager" />
        <div className="flex-1 min-h-0 p-4 md:p-6">
          <section className="max-w-7xl mx-auto h-full bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex">
            <aside className={`${activeChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 lg:w-96 flex-col border-r border-slate-200 shrink-0`}>
              <div className="p-5 border-b border-slate-100">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 m-0">Tenant conversations</h2>
                    <p className="text-xs text-slate-500 mt-1 mb-0">{conversations.length} conversation{conversations.length === 1 ? '' : 's'}</p>
                  </div>
                  <FontAwesomeIcon icon={faComments} className="text-indigo-500 text-xl" />
                </div>
                <label className="mt-4 flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus-within:border-indigo-400">
                  <FontAwesomeIcon icon={faSearch} className="text-slate-400 text-xs" />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tenants or messages" className="w-full bg-transparent outline-none border-0 text-sm text-slate-800" />
                </label>
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredConversations.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-400">{search ? 'No matching conversations.' : 'No tenant conversations yet.'}</div>
                ) : filteredConversations.map((conversation) => {
                  const selected = String(activeChat?.other_user_id) === String(conversation.other_user_id);
                  const unread = Number(conversation.unread_count || 0);
                  return (
                    <button key={conversation.other_user_id} type="button" onClick={() => selectConversation(conversation)} className={`w-full text-left p-4 border-0 border-b border-slate-100 flex gap-3 items-start cursor-pointer transition-colors ${selected ? 'bg-indigo-50' : 'bg-white hover:bg-slate-50'}`}>
                      <div className="w-11 h-11 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold shrink-0">{(conversation.other_user_name || 'T').trim().charAt(0).toUpperCase()}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between gap-2 items-center">
                          <span className="font-semibold text-sm text-slate-900 truncate">{conversation.other_user_name || 'Tenant'}</span>
                          <span className="text-[10px] text-slate-400 shrink-0">{formatTime(conversation.last_message_time)}</span>
                        </div>
                        <div className="mt-1 flex justify-between gap-2 items-center">
                          <span className="text-xs text-slate-500 truncate">{conversation.last_message || 'No messages yet'}</span>
                          {unread > 0 && <span className="min-w-5 h-5 px-1 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>}
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
                    <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">{(activeChat.other_user_name || 'T').trim().charAt(0).toUpperCase()}</div>
                    <div className="min-w-0"><h3 className="m-0 text-sm font-bold text-slate-900 truncate">{activeChat.other_user_name || 'Tenant'}</h3><p className="m-0 mt-1 text-xs text-slate-500">Tenant conversation</p></div>
                  </header>
                  <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3 bg-slate-50">
                    {messages.length === 0 ? <p className="text-center text-sm text-slate-400 mt-10">No messages in this conversation yet.</p> : messages.map((message, index) => {
                      const isAdmin = String(message.sender_id) === String(userId);
                      return <div key={message.id || index} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 shadow-sm ${isAdmin ? 'bg-indigo-600 text-white rounded-br-md' : 'bg-white text-slate-800 border border-slate-200 rounded-bl-md'}`}><p className="m-0 text-sm whitespace-pre-wrap break-words">{message.message}</p><p className={`m-0 mt-1 text-[10px] text-right ${isAdmin ? 'text-indigo-200' : 'text-slate-400'}`}>{isAdmin ? 'You' : (activeChat.other_user_name || 'Tenant')} · {formatTime(message.created_at)}</p></div></div>;
                    })}
                  </div>
                  <form onSubmit={handleSend} className="p-3 md:p-4 border-t border-slate-100 flex gap-2 shrink-0">
                    <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a reply..." className="flex-1 min-w-0 px-4 py-3 rounded-xl bg-slate-100 border border-transparent focus:border-indigo-300 focus:outline-none text-sm" />
                    <button disabled={!draft.trim() || sending} type="submit" className="px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white border-0 cursor-pointer"><FontAwesomeIcon icon={faPaperPlane} /></button>
                  </form>
                </>
              ) : <div className="flex-1 flex flex-col items-center justify-center text-center p-8"><div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center text-2xl mb-4"><FontAwesomeIcon icon={faComments} /></div><h3 className="text-lg font-bold text-slate-800 m-0">Select a conversation</h3><p className="text-sm text-slate-500 mt-2">Choose a tenant from the list to view and reply to messages.</p></div>}
            </section>
          </section>
        </div>
      </main>
    </div>
  );
};

export default AdminMessages;