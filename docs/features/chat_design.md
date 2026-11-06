# Two-Way Chat Feature — Implementation Design

> **Stack context:** React 19 + Vite → PHP 8 (XAMPP) → MySQL/MariaDB, plus a Node.js Socket.IO sidecar.
> **Read "As built" first.** Sections 0–11 are the original design (HTTP polling, a `conversations` table). What shipped (PR #8) is different; §12 (complaints) is still design only.

---

## As built (2026-09-24)

| Part | What the code does |
|---|---|
| Transport | **Socket.IO sidecar** `websocket-server/server.js` (Express 5 + socket.io 4 + mysql2, port 3001, started with `node server.js`; DB settings in `websocket-server/.env`, gitignored; copy `.env.example`, optional because the defaults match it). The frontend connects via `VITE_CHAT_SOCKET_URL` (`ams-react/src/api/env.js`). If the socket is down, `ChatContext` falls back to HTTP polling: history every 2.5 s, conversations every 6 s, sends through `send_message.php`. No SSE. |
| Storage | One flat table `messages(id, sender_id, receiver_id, message, created_at, is_read, attachment_path, reply_to_id)` — defined in `SetupDB.sql`; `2026_10_chat_and_signature_columns.sql` brings an older database up to it. The endpoints no longer create or alter the table at request time (2026-10-11). **No `conversations` table**; a "conversation" is the set of messages between two users. Not yet in `SetupDB.sql`. |
| PHP endpoints | `get_chat_history.php?other_user_id=` (the caller's thread, marks as read) · `send_message.php` (`receiver_id`, `message`; `save_message.php` is an alias) · `get_conversations.php` (threads with last message + unread count) · `get_admin_user.php` (the admin a tenant chats with). Identity comes from the session (`config.php` rewrites `X-User-Id`); queries are prepared. |
| Frontend | `context/ChatContext.jsx` (socket + polling state) · `Components/ChatWidget.jsx` (floating widget with unread total; tenant "support chat" opens the admin thread) · `AdminPages/AdminMessages.jsx` at `/admin-messages` (inbox: search, most recent first, unread badges). |
| Not built | Admin starting a thread with a tenant who hasn't written (the inbox lists existing threads only) · a `notifications` row per message (§3.2 / §12) · a tenant↔admin membership rule (any signed-in user can message any user) · rate limiting · complaints (7.7, §12 — needs rebasing onto `messages`, since `conversations` does not exist). `send_message.php` calls `log_activity()` on every message with category `'chat'`, which is not in `LOG_CATEGORIES`. |
| Guest chat | A visitor who submits `/inquire` while signed out gets a `guest_token` (kept in `localStorage` as `ams_guest_token`) and a thread in `inquiries` (`thread_type='guest'`) with messages in `guest_messages`. Endpoints: `guest_chat.php` (guest by `X-Guest-Token` header, admin by session + `thread_id`; polling, no sockets), `get_guest_conversations.php` (admin inbox, with `unread_count`). The token is never accepted in a URL; the widget fetches guest attachments through `download_file.php` with the header and shows them from blob URLs. A guest message queues one `inquiry` admin-bell row per thread (`metadata_value = inquiry:chat-<id>`), cleared when an admin opens or answers the thread. When the guest signs in, `login.php` sends the token and `adopt_guest_chat()` moves the thread into `messages` (guest messages become the user's, the thread becomes `registered`, `guest_messages` rows are deleted); matching is by token only because inquiry emails are unverified. Tests: `tests/api/guest_chat.test.js`. **Emailed links (2026-10-31):** `guest_chat_resume.php` sends a one-time link (`/inquire?resume=<code>`, sha256 in `guest_chat_links`, 7 days, single use) when asked from the inquiry page, and an admin reply emails the guest once per unseen batch (`inquiries.guest_reply_emailed_at`, cleared when the guest opens the chat). Redeeming a link returns the token and sets `guest_verified_at` (Messages shows *Email not verified* until then). A repeat inquiry whose email or phone matches a guest thread no longer receives that thread's token: it is a separate inquiry with `matched_thread_id` and the link goes to the thread's stored address. The widget offers *End chat on this device* (under the messages, not in the header) only once the guest has answered **Problem resolved** (2026-11-07). Ending closes the chat on the server (`action=end_chat`, `inquiries.guest_chat_ended_at`): it stays readable on that device, but typing, files and sending are gone for both sides, with a "Send a new inquiry" link. Messages has an **Archived** tab: guest inquiries that were ended, resolved (with no guest message since) or quiet for 6 months, and registered chats with someone not renting now that were quiet for 6 months; active tenants never go there. Asking: the admin sends "Did this answer your question?" from the thread (*Ask if resolved*, in Messages and the widget; `guest_chat.php` `action=resolution_check`, allowed after the admin's first reply, one unanswered at a time), the guest answers *Problem resolved* / *Not yet* (`action=resolution_answer`, stored on the `guest_messages` row; *Not yet* queues an admin alert). The chat window keeps short conversations at the bottom, by the input, like Messenger. Emails obey the building email switch. Tests: `tests/api/guest_chat_links.test.js`. |
| Security | **The socket server is unauthenticated**: any client can `join` any user's room and send with any `sender_id`; CORS is `*`; message bodies are logged to the console. See [security_audit.md](../audits/security_audit.md) §6e. |

---

## 0. Conceptual Architecture

Before jumping into code, understand the fundamental separation:

> **MySQL stores the messages. PHP provides the API. React displays them. Something still needs to notify React that a new message exists.**

That "something" is the key design decision — it's what separates polling from WebSockets from SSE. But the rest of the architecture stays the same regardless:

```
                 React
              Admin / Tenant
                   │
          HTTP requests / polling
                   │
                   ▼
              PHP API
             /        \
            /          \
           ▼            ▼
       MySQL DB      Authentication
           │          (X-User-Id header)
           ▼
     conversations
        messages
```

A message flows like this:

```
Admin types message
      │
      ▼
React: POST /send_message.php
      │
      ▼
PHP: validate user → INSERT INTO messages
      │
      ▼
MySQL: message stored
      │
      ▼
Tenant's React: polling picks up new message → renders in chat window
```

The same flow works in reverse (tenant → admin). Chat isn't fundamentally a "React feature" — it's a **database + API + communication architecture problem**. React is the interface sitting on top.

---

## 1. Approach Selection

XAMPP does not run a persistent process (Node.js, Go, etc.), so WebSockets are impractical without a separate server. There are three main approaches:

| | **Option A — HTTP Polling** | **Option B — Server-Sent Events (SSE)** | **Option C — WebSockets** |
|---|---|---|---|
| Transport | Repeated `GET` every N seconds | Persistent HTTP stream (server→client) | Persistent bidirectional TCP |
| Server complexity | Trivial — plain PHP endpoint | Moderate — PHP keeps connection alive | High — separate WS server needed |
| Client complexity | Simple `setInterval` | `EventSource` API | `WebSocket` API |
| Real-time feel | 3–5 s lag (tunable) | Near-instant receive | True real-time (sub-100 ms) |
| XAMPP compatible | ✅ Yes | ✅ Yes (with `flush()`) | ❌ Not natively (needs Node.js sidecar) |
| Send messages | Normal POST | Normal POST | Through WS connection |
| **Recommendation** | ✅ **Start here** | Upgrade path when polling feels laggy | Only if real-time is a hard requirement |

### Why not WebSockets?

Plain PHP running through Apache isn't a persistent WebSocket server. To get WebSockets, you'd need to run a separate process alongside XAMPP:

```
React
   │
   ├──────── HTTP ────────► PHP/Apache    (existing API)
   │
   └──── WebSocket ───────► Node.js WS server  (new process)
                                │
                                ▼
                              MySQL
```

That's considerably more infrastructure. For a capstone apartment management system with 15–100 tenants, a 3-second polling delay is perfectly acceptable. You're not building WhatsApp.

**Decision:** Implement polling first (`ponytail: polling ceiling — upgrade to SSE when users complain about lag`). The schema and React components are identical for all approaches; switching later only touches the polling loop. See Section 8 for SSE upgrade path and Section 11 for WebSocket sidecar details.

---

## 2. Database Schema

Separate **conversations** from **messages**. A conversation represents the chat between two users; messages belong to a conversation. Don't create a new conversation for every message.

```
Conversation (admin ↔ tenant)
     │
     ├── Message
     ├── Message
     ├── Message
     └── Message
```

### Migration: `backend/api/migrations/add_chat_tables.sql`

```sql
-- Represents a chat thread between two users
CREATE TABLE IF NOT EXISTS conversations (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    admin_id    INT         NOT NULL,
    tenant_id   INT         NOT NULL,
    created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id)  REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_pair (admin_id, tenant_id)
);

-- Individual messages within a conversation
CREATE TABLE IF NOT EXISTS messages (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id  INT         NOT NULL,
    sender_id        INT         NOT NULL,
    message          TEXT        NOT NULL,
    is_read          TINYINT(1)  NOT NULL DEFAULT 0,
    created_at       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id)       REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_conv_messages (conversation_id, id),
    INDEX idx_unread (conversation_id, is_read)
);
```

### Why two tables instead of one?

| | Single `chat_messages` table | Two tables (`conversations` + `messages`) |
|---|---|---|
| Finding a conversation | `WHERE (sender=A AND receiver=B) OR (sender=B AND receiver=A)` — messy OR clause | `WHERE conversation_id = ?` — single indexed lookup |
| Permission check | Must infer from sender/receiver columns | `SELECT * FROM conversations WHERE id=? AND (admin_id=? OR tenant_id=?)` — explicit |
| Conversation metadata | Nowhere to put it (last activity, subject, archived flag) | Add columns to `conversations` as needed |
| Query complexity | `get_chat_contacts.php` needs a gnarly subquery to derive conversations | Direct `JOIN conversations c ON c.id = m.conversation_id` |

> [!NOTE]
> The `UNIQUE KEY (admin_id, tenant_id)` ensures only one conversation exists per admin-tenant pair. If a tenant messages admin, PHP finds or creates the conversation row first, then inserts the message.

---

## 3. Backend Endpoints

All files live in `backend/api/`. Follow the existing PHP template from `config.php`.

### 3.1 `get_messages.php` — fetch conversation history

```php
<?php
// GET ?conversation_id=<id>&since=<last_message_id>
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Headers: Content-Type, X-User-Id, X-Admin-Id");
require_once "../config.php";

$me      = intval($_SERVER['HTTP_X_USER_ID'] ?? 0);
$conv_id = intval($_GET['conversation_id'] ?? 0);
$since   = intval($_GET['since'] ?? 0);   // ponytail: cursor-based, not offset pagination

if (!$me || !$conv_id) { http_response_code(400); echo json_encode(["success"=>false]); exit; }

// CRITICAL: Verify user belongs to this conversation
$check = $conn->prepare("SELECT id FROM conversations WHERE id = ? AND (admin_id = ? OR tenant_id = ?)");
$check->bind_param("iii", $conv_id, $me, $me);
$check->execute();
if (!$check->get_result()->num_rows) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Not your conversation"]);
    exit;
}

$stmt = $conn->prepare("
    SELECT id, sender_id, message, is_read, created_at
    FROM messages
    WHERE conversation_id = ? AND id > ?
    ORDER BY id ASC
    LIMIT 50
");
$stmt->bind_param("ii", $conv_id, $since);
$stmt->execute();
$rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);

// Mark fetched messages as read (receiver side only)
if (!empty($rows)) {
    $ids = implode(',', array_column($rows, 'id'));
    $conn->query("UPDATE messages SET is_read=1
                  WHERE conversation_id=$conv_id AND sender_id != $me AND id IN ($ids)");
}

echo json_encode(["success" => true, "messages" => $rows]);
$conn->close();
?>
```

### 3.2 `send_message.php` — post a new message

```php
<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-User-Id, X-Admin-Id");
require_once "../config.php";
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

$me   = intval($_SERVER['HTTP_X_USER_ID'] ?? 0);
$body = json_decode(file_get_contents("php://input"), true);
$conv_id = intval($body['conversation_id'] ?? 0);
$msg  = trim($body['message'] ?? '');

if (!$me || !$conv_id || $msg === '') {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Missing fields"]);
    exit;
}

// Verify user belongs to this conversation
$check = $conn->prepare("SELECT admin_id, tenant_id FROM conversations WHERE id = ? AND (admin_id = ? OR tenant_id = ?)");
$check->bind_param("iii", $conv_id, $me, $me);
$check->execute();
$conv = $check->get_result()->fetch_assoc();
if (!$conv) {
    http_response_code(403);
    echo json_encode(["success" => false, "message" => "Not your conversation"]);
    exit;
}

// Determine the other user
$other_id = ($conv['admin_id'] == $me) ? $conv['tenant_id'] : $conv['admin_id'];

$stmt = $conn->prepare("INSERT INTO messages (conversation_id, sender_id, message) VALUES (?,?,?)");
$stmt->bind_param("iis", $conv_id, $me, $msg);
$stmt->execute();
$new_id = $conn->insert_id;

// Reuse existing notification system
$preview = mb_strimwidth($msg, 0, 60, '…');
$notif = $conn->prepare("INSERT INTO notifications (user_id, message, is_read) VALUES (?, ?, 0)");
$notif_msg = "New message: $preview";
$notif->bind_param("is", $other_id, $notif_msg);
$notif->execute();

// Log contact, not every message — keep activity log high-signal
// ponytail: only log first message in a conversation, or throttle to 1 log per hour per conversation
log_activity($conn, $me, 'chat', 'send_message', "Messaged user $other_id");

echo json_encode(["success" => true, "id" => $new_id]);
$conn->close();
?>
```

### 3.3 `start_conversation.php` — find or create a conversation

```php
<?php
// POST { "with": <other_user_id> }
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-User-Id, X-Admin-Id");
require_once "../config.php";
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

$me   = intval($_SERVER['HTTP_X_USER_ID'] ?? 0);
$body = json_decode(file_get_contents("php://input"), true);
$other = intval($body['with'] ?? 0);

if (!$me || !$other) { http_response_code(400); echo json_encode(["success"=>false]); exit; }

// Determine who is admin and who is tenant
$role_check = $conn->prepare("SELECT id, role FROM users WHERE id IN (?, ?)");
$role_check->bind_param("ii", $me, $other);
$role_check->execute();
$users = $role_check->get_result()->fetch_all(MYSQLI_ASSOC);
$roles = array_column($users, 'role', 'id');

$admin_id  = ($roles[$me] === 'admin') ? $me : $other;
$tenant_id = ($roles[$me] === 'admin') ? $other : $me;

// Find existing or create new
$find = $conn->prepare("SELECT id FROM conversations WHERE admin_id = ? AND tenant_id = ?");
$find->bind_param("ii", $admin_id, $tenant_id);
$find->execute();
$existing = $find->get_result()->fetch_assoc();

if ($existing) {
    $conv_id = $existing['id'];
} else {
    $ins = $conn->prepare("INSERT INTO conversations (admin_id, tenant_id) VALUES (?, ?)");
    $ins->bind_param("ii", $admin_id, $tenant_id);
    $ins->execute();
    $conv_id = $conn->insert_id;
}

echo json_encode(["success" => true, "conversation_id" => $conv_id]);
$conn->close();
?>
```

### 3.4 `get_conversations.php` — list conversations for inbox sidebar

With the two-table schema, this query is much cleaner than deriving conversations from a flat messages table:

```php
<?php
// Returns conversations with last message + unread count
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Headers: Content-Type, X-User-Id, X-Admin-Id");
require_once "../config.php";

$me = intval($_SERVER['HTTP_X_USER_ID'] ?? 0);
if (!$me) { http_response_code(401); exit; }

$sql = "
    SELECT
        c.id AS conversation_id,
        u.id AS partner_id, u.first_name, u.last_name, u.role,
        last_msg.message AS last_message,
        last_msg.created_at AS last_at,
        (
            SELECT COUNT(*) FROM messages
            WHERE conversation_id = c.id AND sender_id != $me AND is_read = 0
        ) AS unread_count
    FROM conversations c
    JOIN users u ON u.id = IF(c.admin_id = $me, c.tenant_id, c.admin_id)
    LEFT JOIN messages last_msg ON last_msg.id = (
        SELECT MAX(id) FROM messages WHERE conversation_id = c.id
    )
    WHERE c.admin_id = $me OR c.tenant_id = $me
    ORDER BY last_at DESC
";

$result = $conn->query($sql);
echo json_encode(["success" => true, "conversations" => $result->fetch_all(MYSQLI_ASSOC)]);
$conn->close();
?>
```

---

## 4. React Implementation

### 4.1 File layout (new files only)

```
ams-react/src/
├── AdminPages/
│   └── AdminChat.jsx         # Admin inbox — lists all tenant conversations
├── TenantPages/
│   └── TenantChat.jsx        # Tenant view — can only message admin
└── Components/
    └── ChatWindow.jsx        # Shared conversation thread + input box
```

### 4.2 `ChatWindow.jsx` — shared component

```jsx
// ponytail: full — shared by both Admin and Tenant
import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api/axiosConfig';

const POLL_MS = 4000; // ponytail: polling ceiling — switch to SSE if lag complaints arise

export default function ChatWindow({ conversationId, otherName }) {
    const [messages, setMessages]   = useState([]);
    const [input, setInput]         = useState('');
    const [sending, setSending]     = useState(false);
    const lastIdRef  = useRef(0);
    const bottomRef  = useRef(null);
    const intervalRef = useRef(null);

    const fetchNew = useCallback(async () => {
        try {
            const { data } = await api.get('get_messages.php', {
                params: { conversation_id: conversationId, since: lastIdRef.current }
            });
            if (data.messages?.length) {
                setMessages(prev => [...prev, ...data.messages]);
                lastIdRef.current = data.messages.at(-1).id;
            }
        } catch { /* silent — user sees stale but not broken */ }
    }, [conversationId]);

    // Initial load + start polling
    useEffect(() => {
        lastIdRef.current = 0;
        setMessages([]);
        fetchNew();
        intervalRef.current = setInterval(fetchNew, POLL_MS);
        return () => clearInterval(intervalRef.current);
    }, [conversationId, fetchNew]);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const send = async () => {
        const text = input.trim();
        if (!text || sending) return;
        setSending(true);
        setInput('');

        // Optimistic update
        const optimistic = {
            id: `opt-${Date.now()}`, sender_id: 'me',
            message: text, created_at: new Date().toISOString()
        };
        setMessages(prev => [...prev, optimistic]);

        try {
            const { data } = await api.post('send_message.php', { conversation_id: conversationId, message: text });
            if (data.success) {
                // Replace optimistic with real id on next poll — no extra fetch needed
            }
        } catch {
            // Revert optimistic
            setMessages(prev => prev.filter(m => m.id !== optimistic.id));
            alert('Message failed to send. Please try again.');
        } finally {
            setSending(false);
        }
    };

    const myId = JSON.parse(sessionStorage.getItem('loggedInUser') || '{}').id;

    return (
        <div className="chat-window">
            <div className="chat-header">{otherName}</div>
            <div className="chat-messages">
                {messages.map(m => (
                    <div key={m.id}
                         className={`chat-bubble ${String(m.sender_id) === String(myId) ? 'mine' : 'theirs'}`}>
                        <span>{m.message}</span>
                        <small>{new Date(m.created_at).toLocaleTimeString()}</small>
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>
            <div className="chat-input-row">
                <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                    placeholder="Type a message…"
                    disabled={sending}
                />
                <button onClick={send} disabled={sending || !input.trim()}>
                    {sending ? '…' : 'Send'}
                </button>
            </div>
        </div>
    );
}
```

### 4.3 `AdminChat.jsx` — admin inbox

```jsx
import { useState, useEffect } from 'react';
import api from '../api/axiosConfig';
import ChatWindow from '../Components/ChatWindow';

export default function AdminChat() {
    const [conversations, setConversations] = useState([]);
    const [active, setActive] = useState(null);

    useEffect(() => {
        api.get('get_conversations.php')
           .then(r => setConversations(r.data.conversations ?? []));
    }, [active]); // re-fetch sidebar when switching chats so unread counts update

    return (
        <div className="chat-layout">
            <aside className="chat-sidebar">
                <h3>Conversations</h3>
                {conversations.map(c => (
                    <button key={c.conversation_id}
                            className={`contact-row ${active?.conversation_id === c.conversation_id ? 'active' : ''}`}
                            onClick={() => setActive(c)}>
                        <strong>{c.first_name} {c.last_name}</strong>
                        <small>{c.last_message}</small>
                        {c.unread_count > 0 && <span className="badge">{c.unread_count}</span>}
                    </button>
                ))}
            </aside>
            <main className="chat-main">
                {active
                    ? <ChatWindow conversationId={active.conversation_id}
                                  otherName={`${active.first_name} ${active.last_name}`} />
                    : <p className="chat-empty">Select a conversation</p>
                }
            </main>
        </div>
    );
}
```

### 4.4 `TenantChat.jsx` — tenant view

```jsx
// Tenants can only message the admin — no contact picker needed
import { useEffect, useState } from 'react';
import api from '../api/axiosConfig';
import ChatWindow from '../Components/ChatWindow';

export default function TenantChat() {
    const [conversationId, setConversationId] = useState(null);

    useEffect(() => {
        // Find or create conversation with admin
        api.get('get_users.php', { params: { role: 'admin' } })
           .then(r => {
               const adminId = r.data.users?.[0]?.id;
               if (adminId) {
                   return api.post('start_conversation.php', { with: adminId });
               }
           })
           .then(r => setConversationId(r?.data?.conversation_id ?? null));
    }, []);

    if (!conversationId) return <p>Loading…</p>;
    return <ChatWindow conversationId={conversationId} otherName="Property Manager" />;
}
```

---

## 5. Routing

In [`App.jsx`](../../ams-react/src/App.jsx), add two protected routes:

```jsx
// Admin-guarded route
<Route path="/admin/chat" element={<AdminChat />} />

// Tenant-guarded route
<Route path="/tenant/chat" element={<TenantChat />} />
```

Add a **"Messages"** nav link in both the admin sidebar and the tenant nav that includes an unread badge — reuse the existing `notifications` badge pattern already in the app.

---

## 6. Unread Badge in Nav

The existing notification polling in your app can be extended to also surface unread chat counts. Add a lightweight endpoint or piggyback on `get_chat_contacts.php`:

```js
// Anywhere you fetch notification counts, add:
const totalUnread = conversations.reduce((n, c) => n + Number(c.unread_count), 0);
```

Display alongside the existing bell icon or as a separate chat icon badge.

---

## 7. CSS Skeleton

Add to `index.css` (integrate with existing design tokens):

```css
.chat-layout   { display: flex; height: calc(100vh - 64px); }
.chat-sidebar  { width: 280px; border-right: 1px solid var(--border); overflow-y: auto; padding: 1rem; }
.chat-main     { flex: 1; display: flex; flex-direction: column; }

.chat-window   { display: flex; flex-direction: column; height: 100%; }
.chat-header   { padding: 1rem; font-weight: 600; border-bottom: 1px solid var(--border); }
.chat-messages { flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: .5rem; }

.chat-bubble        { max-width: 70%; padding: .5rem .75rem; border-radius: 12px; display: flex; flex-direction: column; gap: 2px; }
.chat-bubble.mine   { align-self: flex-end; background: var(--primary); color: #fff; }
.chat-bubble.theirs { align-self: flex-start; background: var(--surface-2); }
.chat-bubble small  { font-size: .7rem; opacity: .6; }

.chat-input-row     { display: flex; gap: .5rem; padding: .75rem; border-top: 1px solid var(--border); }
.chat-input-row input  { flex: 1; }

.contact-row    { display: flex; flex-direction: column; width: 100%; text-align: left; padding: .6rem; border-radius: 8px; background: none; border: none; cursor: pointer; }
.contact-row.active { background: var(--surface-2); }
.badge { background: var(--primary); color: #fff; border-radius: 99px; padding: 0 6px; font-size: .7rem; width: fit-content; }
.chat-empty     { text-align: center; margin-top: 4rem; color: var(--text-muted); }
```

---

## 8. Upgrade Path to Server-Sent Events (SSE)

When polling feels too laggy, swap only `ChatWindow.jsx`'s fetch loop — schema and all endpoints stay the same:

```js
// Replace setInterval block in ChatWindow with:
const evtSource = new EventSource(
    `http://localhost:8080/ApartmentManagementSystem_React/backend/api/chat_stream.php?with=${otherUserId}`,
    { withCredentials: false }
);
evtSource.onmessage = e => {
    const msg = JSON.parse(e.data);
    setMessages(prev => [...prev, msg]);
    lastIdRef.current = msg.id;
};
return () => evtSource.close();
```

`chat_stream.php` would loop with `sleep(2)` + `flush()` after querying new rows, keeping the connection alive. This is safe under XAMPP's default 30 s max execution time if you set `set_time_limit(0)` and validate the `since` cursor.

---

## 9. Implementation Checklist

Build in this order — each step is testable before moving to the next:

**Phase 1 — Database + API (backend-first)**

- [ ] Run `add_chat_tables.sql` migration on `ams_db` (creates `conversations` + `messages`)
- [ ] Create `backend/api/start_conversation.php` (find-or-create)
- [ ] Create `backend/api/get_messages.php` (fetch + mark read)
- [ ] Create `backend/api/send_message.php` (insert + notify)
- [ ] Create `backend/api/get_conversations.php` (inbox sidebar)
- [ ] Verify `get_users.php` accepts `?role=admin` filter (add if missing)

**Phase 2 — React UI**

- [ ] Create `ams-react/src/Components/ChatWindow.jsx`
- [ ] Create `ams-react/src/AdminPages/AdminChat.jsx`
- [ ] Create `ams-react/src/TenantPages/TenantChat.jsx`
- [ ] Add routes in `App.jsx`

**Phase 3 — Polish**

- [ ] Add polling so the other user's messages appear automatically
- [ ] Add nav link + unread badge in admin sidebar and tenant nav
- [ ] Add CSS to `index.css`
- [ ] Only then consider SSE if polling lag is noticeable

> [!TIP]
> This order mirrors a learning path: you understand the data model first, prove the API works (test with Postman or curl), then build the UI on top. Chat isn't a "React feature" — it's a database + API + communication architecture problem.

---

## 10. Security & Auth Notes

### Conversation-level permissions

This is one of the most important parts. You **cannot** simply trust React saying `sender_id = 1`. A malicious user could manipulate the request.

```
Request arrives
     ↓
Authenticate user (X-User-Id header — set by axiosConfig.js)
     ↓
Check conversation permissions
  → "Is this user actually a participant of conversation #X?"
     ↓
Perform operation
     ↓
Return data
```

Every endpoint (`get_messages.php`, `send_message.php`) must verify:

```php
// Does this user belong to this conversation?
$check = $conn->prepare("SELECT id FROM conversations WHERE id = ? AND (admin_id = ? OR tenant_id = ?)");
```

Without this, Tenant A could change a conversation ID in the request and read Tenant B's messages with admin.

### Other concerns

| Concern | Mitigation |
|---|---|
| IDOR — tenant reading another tenant's messages | Every endpoint checks `conversations` membership via `X-User-Id`, never a client-supplied `me` param |
| Admin impersonation | `verify_admin()` available in `config.php` — not required for chat since both parties are authenticated users |
| XSS | PHP stores raw text; React renders via JSX (auto-escaped) — safe |
| Message spam | Add `LIMIT 10 per minute` rate-limit in `send_message.php` if needed; out of scope for v1 |

### Activity log integration

Connect chat to the existing `activity_logs` table, but keep it **high-signal**:

```
Admin sends message
        │
        ├────────► messages table      (the actual conversation)
        │
        └────────► activity_logs       ("Admin contacted Miguel Santos")
```

Don't log every individual message as a system activity — that would flood the audit trail. Instead, log the first contact or throttle to one log entry per conversation per hour. The actual conversation history stays in `messages`.

---

## 11. Alternative Approaches

The current design recommends **HTTP Polling** (Section 1, Option A) with an **SSE upgrade path** (Section 8). Below are additional alternatives not covered above, with an honest assessment of technical cost, performance impact, and fit for AMS's XAMPP + PHP + MySQL stack.

---

### Alt A — WebSocket via Sidecar Process (Node.js / Bun alongside XAMPP)

Run a small Node.js or Bun WebSocket server on a separate port (e.g. `ws://localhost:3001`) while XAMPP continues to serve the PHP API. The React app opens a WebSocket for real-time message push and still POSTs to PHP for sending.

```
Browser ──ws://localhost:3001──▶ Node.js WS server ◀──reads──▶ MySQL
Browser ──POST /send_message.php──▶ Apache/PHP ──writes──▶ MySQL
```

| Dimension | Cost |
|---|---|
| **Technical complexity** | **High.** Requires installing Node.js/Bun, writing a small WS server, managing a second process lifecycle. Developers must keep two runtimes in sync. Deployment becomes "start XAMPP **and** `node ws-server.js`". |
| **Performance** | **Excellent.** True bidirectional real-time — sub-100 ms delivery. WebSocket holds one TCP connection per client instead of repeated HTTP round-trips. |
| **DB impact** | The WS server needs to detect new rows. Two sub-approaches: (1) poll MySQL every 1–2 s from Node — same DB load as PHP polling but centralized; (2) use MySQL `binlog` via a library — complex, overkill. |
| **Memory** | Node WS server: ~30–50 MB base + ~5 KB per connection. For 30 tenants = trivial. |
| **Security** | Must duplicate auth — the WS server needs to verify `X-User-Id` on connection handshake. No CORS on WebSocket, but origin checking is needed manually. |
| **Dependency** | Adds Node.js or Bun as a runtime dependency. Not part of XAMPP. |

**Verdict:** Overkill for AMS. The apartment has 15–100 tenants, most of whom are not chatting simultaneously. The operational cost of running two servers on a XAMPP setup outweighs the sub-second latency gain. **Revisit if AMS moves to a hosted VPS** where a process manager (PM2, systemd) can supervise both.

---

### Alt B — Long Polling (Hanging GET)

The client sends a GET request that the server **holds open** until new messages arrive (or a timeout, e.g. 30 s). When a response comes, the client immediately re-issues the request.

```
Client: GET /get_messages.php?with=5&since=42  (hangs for up to 30s)
Server: ...waits... new row appears → responds immediately
Client: processes message, immediately sends next GET
```

```php
// long_poll_messages.php — simplified
set_time_limit(35);
$timeout = 30;
$start = time();
while (time() - $start < $timeout) {
    $rows = fetch_new_messages($conn, $me, $other, $since);
    if (!empty($rows)) {
        echo json_encode(["success" => true, "messages" => $rows]);
        exit;
    }
    usleep(500000); // 0.5s sleep between DB checks
}
echo json_encode(["success" => true, "messages" => []]); // timeout, no new messages
```

| Dimension | Cost |
|---|---|
| **Technical complexity** | **Moderate.** The PHP script must loop with `sleep()`, and `set_time_limit()` must be raised. XAMPP's Apache uses **prefork MPM** by default — each long-poll request occupies one Apache worker process for up to 30 s. |
| **Performance** | **Good.** Near-instant delivery (≤0.5 s after message hits DB). Feels real-time to the user. |
| **Apache worker exhaustion** | **This is the killer cost.** XAMPP's default `MaxRequestWorkers` is ~150. If 30 tenants have the chat page open, that's 30 Apache workers permanently occupied doing nothing but `sleep()`. With the admin chatting too, plus regular API requests, you can easily starve Apache. |
| **DB impact** | Each hanging connection polls MySQL every 0.5 s — 30 connections × 2 queries/sec = **60 queries/sec** sustained. Heavier than regular polling (30 connections × 0.25 queries/sec = 7.5 queries/sec with 4 s intervals). |
| **Memory** | Each Apache worker: ~10–15 MB. 30 stuck workers = ~300–450 MB held hostage. |
| **PHP-FPM alternative** | If XAMPP were configured with PHP-FPM + nginx instead of mod_php + Apache, the worker exhaustion issue would be the same (FPM pool limit). Only an async runtime (Node, Go, Swoole) handles long-poll well. |

**Verdict:** Dangerous on XAMPP's default Apache. The worker exhaustion risk makes this **worse** than plain polling for AMS's stack, despite better latency. Only viable if you switch to nginx + PHP-FPM with a dedicated pool for long-poll endpoints (not worth the effort vs. just using SSE or short polling).

---

### Alt C — Firebase Realtime Database / Firestore (BaaS)

Offload the entire chat transport to Firebase. Messages are written to and read from Firebase's real-time database directly from the React client. PHP is only involved for auth token minting.

```
React ──firebase SDK──▶ Firebase Realtime DB (Google Cloud)
PHP ──firebase-admin──▶ Mint custom auth tokens (one-time per login)
```

| Dimension | Cost |
|---|---|
| **Technical complexity** | **Moderate-High.** Add `firebase` npm package to React (~80 KB gzipped). PHP needs `kreait/firebase-php` or manual JWT minting for custom auth tokens. Firebase project setup (console, rules, auth). |
| **Performance** | **Excellent.** Firebase pushes changes to all listeners instantly via its own WebSocket infrastructure. Zero polling, zero server-side loop. |
| **Monetary cost** | **Free tier is generous:** Spark plan = 1 GB stored, 10 GB/month transfer, 100 simultaneous connections. AMS would never exceed this. |
| **Data residency** | Messages live in Google's cloud, **not** in your MySQL `ams_db`. This breaks the single-source-of-truth principle. Querying chat history alongside tenant data requires cross-system joins (impossible in SQL). |
| **Dependency** | Heavy. Firebase SDK (~80 KB), Google Cloud project, network dependency for every message. If internet goes down, chat dies (XAMPP is a local server — tenants on LAN lose chat). |
| **Auth complexity** | Firebase needs its own auth layer. You'd need to mint Firebase Custom Tokens from PHP on login, adding a round-trip and a new failure mode. |
| **Vendor lock-in** | Tight coupling to Google. Migrating away means re-exporting all messages. |
| **Offline / LAN use** | **Broken.** If AMS runs on a local XAMPP without internet (common for small apartment offices), Firebase is unreachable. |

**Verdict:** Architecturally mismatched. AMS is a self-contained XAMPP app — introducing a cloud dependency for one feature creates a fragile seam. The free tier is tempting, but the data-split and LAN-failure issues make it a poor fit. **Only consider if AMS moves to a cloud-hosted deployment** where internet is guaranteed.

---

### Alt D — Third-Party Embeddable Chat Widget (Tawk.to, Crisp, Chatwoot)

Instead of building chat from scratch, embed a third-party chat widget. These are typically JS snippets that add a floating chat bubble to the page.

| Provider | Cost | Self-hosted? | Key Feature |
|---|---|---|---|
| **Tawk.to** | Free forever | No (SaaS) | Live chat + ticketing, unlimited agents |
| **Crisp** | Free (2 agents) | No (SaaS) | Chat + shared inbox, email integration |
| **Chatwoot** | Free (open source) | Yes (Docker) | Full-featured, self-hostable |
| **Tidio** | Free (50 chats/mo) | No (SaaS) | AI chatbot + live chat |

| Dimension | Cost |
|---|---|
| **Technical complexity** | **Very low.** Paste a `<script>` tag into `index.html`. Most widgets auto-handle user identification via JS API. |
| **Performance** | **Good.** These services run their own optimized WebSocket infrastructure. |
| **Integration with AMS** | **Poor.** Chat data lives in the third-party system. No link between chat messages and tenant records, rooms, or maintenance requests. Admin must use a **separate dashboard** (Tawk.to dashboard, Crisp dashboard) — not the AMS admin panel. |
| **UX consistency** | **Low.** The chat widget has its own styling, fonts, and behavior. It looks like a bolted-on customer support tool, not an integrated apartment messaging system. |
| **Multi-tenant routing** | These widgets are designed for "company ↔ visitor" support, not "admin ↔ specific tenant" private messaging. Conversations are anonymous unless you pass user identity via JS. No concept of room assignments or tenant profiles. |
| **Privacy** | Tenant messages pass through a third-party server. Potentially problematic under Data Privacy Act (RA 10173) if tenants are identifiable. |
| **LAN / offline** | SaaS options require internet. Chatwoot can be self-hosted but needs Docker (not part of XAMPP). |

**Verdict:** Fastest to "ship something" (30-minute integration), but it's a customer-support tool, not a tenant-management messaging system. Chat history won't appear in AMS reports, admin can't see messages alongside tenant records, and the UX feels disconnected. **Only suitable as a temporary stopgap** if you need chat tomorrow and plan to replace it.

---

### Alt E — No Chat — Enhanced Notification Thread (Reuse Existing `notifications` Table)

Instead of building a full bidirectional chat, extend the existing notification system to support **tenant replies**. Admin sends targeted notifications; tenant can reply with a short message that becomes a new notification for admin.

```
Admin: creates targeted notification → tenant sees in bell
Tenant: clicks "Reply" → sends a notification back to admin
Admin: sees tenant replies in a "Tenant Messages" admin page
```

| Dimension | Cost |
|---|---|
| **Technical complexity** | **Very low.** Add a `reply_to` column to `notifications` and a "Reply" button in `UserNotifications.jsx`. One new endpoint (`reply_notification.php`). |
| **Performance** | **Same as existing notification polling.** No new polling loops, no new connections. |
| **DB changes** | `ALTER TABLE notifications ADD COLUMN reply_to INT NULL` — threads via self-referential FK. |
| **UX** | **Worse than chat.** No real-time conversation feel. Messages are buried in the notification bell. No typing indicators, no message thread view, no conversation history sidebar. |
| **Maintenance** | **Minimal.** Reuses 100% of existing infrastructure. |
| **When it breaks down** | As soon as anyone wants to send more than 2–3 messages in a row, it feels clunky. Not a conversation — it's email-within-the-app. |

**Verdict:** The laziest possible solution. Works if "chat" really means "admin sends a notice, tenant acknowledges or asks one follow-up question." Does **not** work if anyone expects an actual back-and-forth conversation. Good for YAGNI validation — ship this first, and if users keep replying in chains of 5+, build proper chat.

---

### Alternative Approaches — Summary Matrix

| Approach | Latency | Technical Cost | Infra Cost | AMS Fit | When to Use |
|---|---|---|---|---|---|
| **HTTP Polling** (current) | 3–5 s | Very Low | ₱0 | ⭐⭐⭐⭐⭐ | Default — start here |
| **SSE** (current upgrade) | < 1 s | Low | ₱0 | ⭐⭐⭐⭐ | When polling lag annoys users |
| **Alt A: WS Sidecar** | < 100 ms | High | ₱0 | ⭐⭐ | Hosted VPS with process manager |
| **Alt B: Long Polling** | < 0.5 s | Moderate | ₱0 | ⭐ | Never on XAMPP (worker exhaustion) |
| **Alt C: Firebase** | < 100 ms | Moderate | ₱0 (free tier) | ⭐⭐ | Cloud-hosted AMS with internet guarantee |
| **Alt D: Chat Widget** | < 1 s | Very Low | ₱0 (free tiers) | ⭐⭐ | Temporary stopgap, not integrated |
| **Alt E: Notification Thread** | Same as notif | Minimal | ₱0 | ⭐⭐⭐ | YAGNI — validate if chat is even needed |

> [!TIP]
> **Recommendation unchanged:** HTTP Polling → SSE is the right progression for AMS on XAMPP. If you're unsure whether tenants even want chat, ship **Alt E** (notification reply) first to validate demand with zero new infrastructure, then build real chat when users ask for it.

---

## 12. Complaints Management (7.7)

Checklist item 7.7 asks for a way to file and track a tenant complaint as distinct from ordinary chit-chat. This doc (§1–§11) never covered it — this section closes that gap. It's additive to the schema and endpoints already designed above; there's no separate complaints system.

### Design: a tag on the conversation, not a new table

A complaint is a **conversation flagged as a complaint**, plus a resolution state an admin can track. Reuse `conversations` and `messages` as-is; don't fork into a parallel `complaints` table, which would duplicate history/read-state/notification logic already solved in §2–§3.

```sql
-- Additive to add_chat_tables.sql (or its own small migration, same conventions)
ALTER TABLE conversations
    ADD COLUMN is_complaint  TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN complaint_category ENUM('Maintenance','Billing','Neighbor','Noise','Staff','Other') NULL,
    ADD COLUMN complaint_status   ENUM('Open','In Review','Resolved') NULL,
    ADD COLUMN resolved_at        DATETIME NULL;
```

- `is_complaint` flips on when the tenant starts the thread via a "File a Complaint" entry point in `TenantChat.jsx` instead of the plain "Message Admin" one — `start_conversation.php` accepts an optional `{ is_complaint, complaint_category }` and sets them at creation. A conversation's complaint flag doesn't change after creation (a complaint that becomes a casual thread just gets a new `complaint_status` of `Resolved`; it can't be un-flagged).
- `complaint_status` starts `Open`, admin moves it to `In Review`/`Resolved` from the conversation view (small `update_conversation_status.php` endpoint, mirroring the pattern of `update_maintenance_status.php`: session-authenticated admin, validates the transition, `log_activity()`, and fires `create_notification()` to the tenant on change — same pipeline §3's `send_message.php` already uses).
- `AdminChat.jsx`'s inbox sidebar gets a filter/badge for `is_complaint = 1 AND complaint_status != 'Resolved'`, so open complaints don't get lost in the general message list.

### Why not a separate system

- **Permissions**: the IDOR guard in §10 already scopes every read/write to `admin_id`/`tenant_id` on the conversation row; a parallel complaints table would need the same guard rewritten and re-verified.
- **History**: a complaint is a conversation — the tenant explaining the issue, the admin asking follow-ups, is exactly the `messages` thread this doc already designs.
- **Notifications**: `send_message.php` already creates a notification row per message (§3.2, §7.6) — a complaint status change just needs the same `create_notification()` call, not a new dispatch path.

### Scope

Build this after §9 Phase 1–2 (conversations/messages + UI) are working — it's a small additive migration plus one status endpoint and one UI filter, not a phase of its own.

## Guest chat tables (2026-11)
A signed-out `/inquire` creates a guest thread: `inquiries.thread_type='guest'` with `guest_token`, messages in `guest_messages` (not `messages`), and one-time resume links in `guest_chat_links` (7 days, single use, e-mailed to the thread's address). On sign-in, `adopt_guest_chat()` copies the thread into `messages` and clears the token. The launcher is shown for guests while `ams_guest_token` exists; its "End chat on this device" action appears once the guest answers the admin's "Did this answer your question?" with Problem resolved (`guest_messages.kind`, `resolution_answer`), and ending keeps the chat readable but closed (`inquiries.guest_chat_ended_at`). See [database_schema.md](../documentation/database_schema.md) and [tenant_pages.md](tenant_pages.md) §2.
