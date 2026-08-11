# Two-Way Chat Feature — Implementation Design

> **Stack context:** React 18 + Vite → PHP 8 (XAMPP) → MySQL/MariaDB  
> **No WebSocket server available** on XAMPP — see approach selection below.

---

## 1. Approach Selection

XAMPP does not run a persistent process (Node.js, Go, etc.), so WebSockets are impractical without a separate server. The two viable options for this stack are:

| | **Option A — HTTP Polling** | **Option B — Server-Sent Events (SSE)** |
|---|---|---|
| Transport | Repeated `GET` every N seconds | Persistent HTTP stream (one-direction server→client) |
| Server complexity | Trivial — plain PHP endpoint | Moderate — PHP keeps connection alive |
| Client complexity | Simple `setInterval` | `EventSource` API |
| Real-time feel | 3–5 s lag (tunable) | Near-instant receive |
| XAMPP compatible | ✅ Yes | ✅ Yes (with `flush()`) |
| Send messages | Normal POST | Normal POST |
| **Recommendation** | ✅ **Start here** | Upgrade path when polling feels laggy |

**Decision:** Implement polling first (`ponytail: polling ceiling — upgrade to SSE when users complain about lag`). The schema and React components are identical for both; switching later only touches the polling loop.

---

## 2. Database Schema

### Migration: `backend/api/migrations/add_chat_messages.sql`

```sql
CREATE TABLE IF NOT EXISTS chat_messages (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    sender_id   INT         NOT NULL,
    receiver_id INT         NOT NULL,   -- NULL = broadcast; keep NOT NULL for 1-to-1
    message     TEXT        NOT NULL,
    is_read     TINYINT(1)  NOT NULL DEFAULT 0,
    created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id)   REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_conversation (sender_id, receiver_id),
    INDEX idx_receiver_unread (receiver_id, is_read)
);
```

> [!NOTE]
> One table covers both admin→tenant and tenant→admin flows. A "conversation" is the pair `(min(a,b), max(a,b))` so queries are order-independent.

---

## 3. Backend Endpoints

All files live in `backend/api/`. Follow the existing PHP template from `config.php`.

### 3.1 `get_messages.php` — fetch conversation history

```php
<?php
// GET ?with=<other_user_id>&since=<last_message_id>
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Headers: Content-Type, X-User-Id, X-Admin-Id");
require_once "../config.php";

$me    = intval($_SERVER['HTTP_X_USER_ID'] ?? 0);
$other = intval($_GET['with']  ?? 0);
$since = intval($_GET['since'] ?? 0);   // ponytail: cursor-based, not offset pagination

if (!$me || !$other) { http_response_code(400); echo json_encode(["success"=>false]); exit; }

$stmt = $conn->prepare("
    SELECT id, sender_id, receiver_id, message, is_read, created_at
    FROM chat_messages
    WHERE id > ?
      AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
    ORDER BY id ASC
    LIMIT 50
");
$stmt->bind_param("iiiii", $since, $me, $other, $other, $me);
$stmt->execute();
$rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);

// Mark fetched messages as read (receiver side only)
if (!empty($rows)) {
    $ids = implode(',', array_column($rows, 'id'));
    $conn->query("UPDATE chat_messages SET is_read=1
                  WHERE receiver_id=$me AND id IN ($ids)");
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
$to   = intval($body['to']      ?? 0);
$msg  = trim($body['message']   ?? '');

if (!$me || !$to || $msg === '') {
    http_response_code(400);
    echo json_encode(["success" => false, "message" => "Missing fields"]);
    exit;
}

$stmt = $conn->prepare("INSERT INTO chat_messages (sender_id, receiver_id, message) VALUES (?,?,?)");
$stmt->bind_param("iis", $me, $to, $msg);
$stmt->execute();
$new_id = $conn->insert_id;

// Reuse existing notification system
$preview = mb_strimwidth($msg, 0, 60, '…');
$notif = $conn->prepare("INSERT INTO notifications (user_id, message, is_read) VALUES (?, ?, 0)");
$notif_msg = "New message: $preview";
$notif->bind_param("is", $to, $notif_msg);
$notif->execute();

log_activity($conn, $me, 'chat', 'send_message', "To user $to: $preview");

echo json_encode(["success" => true, "id" => $new_id]);
$conn->close();
?>
```

### 3.3 `get_chat_contacts.php` — list of users the current user has chatted with (for inbox sidebar)

```php
<?php
// Returns distinct conversation partners + last message + unread count
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Headers: Content-Type, X-User-Id, X-Admin-Id");
require_once "../config.php";

$me = intval($_SERVER['HTTP_X_USER_ID'] ?? 0);
if (!$me) { http_response_code(401); exit; }

// ponytail: subquery acceptable here — message volume is low in an apartment context
$sql = "
    SELECT
        u.id, u.first_name, u.last_name, u.role,
        m.message AS last_message,
        m.created_at AS last_at,
        SUM(m2.is_read = 0 AND m2.receiver_id = $me) AS unread_count
    FROM (
        SELECT IF(sender_id = $me, receiver_id, sender_id) AS partner_id,
               MAX(id) AS last_id
        FROM chat_messages
        WHERE sender_id = $me OR receiver_id = $me
        GROUP BY partner_id
    ) AS conv
    JOIN chat_messages m ON m.id = conv.last_id
    JOIN users u ON u.id = conv.partner_id
    LEFT JOIN chat_messages m2 ON
        (m2.sender_id = conv.partner_id AND m2.receiver_id = $me)
    GROUP BY u.id, m.message, m.created_at
    ORDER BY last_at DESC
";

$result = $conn->query($sql);
echo json_encode(["success" => true, "contacts" => $result->fetch_all(MYSQLI_ASSOC)]);
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

export default function ChatWindow({ otherUserId, otherName }) {
    const [messages, setMessages]   = useState([]);
    const [input, setInput]         = useState('');
    const [sending, setSending]     = useState(false);
    const lastIdRef  = useRef(0);
    const bottomRef  = useRef(null);
    const intervalRef = useRef(null);

    const fetchNew = useCallback(async () => {
        try {
            const { data } = await api.get('get_messages.php', {
                params: { with: otherUserId, since: lastIdRef.current }
            });
            if (data.messages?.length) {
                setMessages(prev => [...prev, ...data.messages]);
                lastIdRef.current = data.messages.at(-1).id;
            }
        } catch { /* silent — user sees stale but not broken */ }
    }, [otherUserId]);

    // Initial load + start polling
    useEffect(() => {
        lastIdRef.current = 0;
        setMessages([]);
        fetchNew();
        intervalRef.current = setInterval(fetchNew, POLL_MS);
        return () => clearInterval(intervalRef.current);
    }, [otherUserId, fetchNew]);

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
            const { data } = await api.post('send_message.php', { to: otherUserId, message: text });
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
    const [contacts, setContacts] = useState([]);
    const [active, setActive]     = useState(null);

    useEffect(() => {
        api.get('get_chat_contacts.php')
           .then(r => setContacts(r.data.contacts ?? []));
    }, [active]); // re-fetch sidebar when switching chats so unread counts update

    return (
        <div className="chat-layout">
            <aside className="chat-sidebar">
                <h3>Conversations</h3>
                {contacts.map(c => (
                    <button key={c.id} className={`contact-row ${active?.id === c.id ? 'active' : ''}`}
                            onClick={() => setActive(c)}>
                        <strong>{c.first_name} {c.last_name}</strong>
                        <small>{c.last_message}</small>
                        {c.unread_count > 0 && <span className="badge">{c.unread_count}</span>}
                    </button>
                ))}
            </aside>
            <main className="chat-main">
                {active
                    ? <ChatWindow otherUserId={active.id} otherName={`${active.first_name} ${active.last_name}`} />
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
    const [adminId, setAdminId] = useState(null);

    useEffect(() => {
        // Fetch the first admin user to use as the fixed chat partner
        api.get('get_users.php', { params: { role: 'admin' } })
           .then(r => setAdminId(r.data.users?.[0]?.id ?? null));
    }, []);

    if (!adminId) return <p>Loading…</p>;
    return <ChatWindow otherUserId={adminId} otherName="Property Manager" />;
}
```

---

## 5. Routing

In [`App.jsx`](file:///c:/xampp/htdocs/ApartmentManagementSystem_React/ams-react/src/App.jsx), add two protected routes:

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
const totalUnread = contacts.reduce((n, c) => n + Number(c.unread_count), 0);
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

- [ ] Run `add_chat_messages.sql` migration on `ams_db`
- [ ] Create `backend/api/get_messages.php`
- [ ] Create `backend/api/send_message.php`
- [ ] Create `backend/api/get_chat_contacts.php`
- [ ] Create `ams-react/src/Components/ChatWindow.jsx`
- [ ] Create `ams-react/src/AdminPages/AdminChat.jsx`
- [ ] Create `ams-react/src/TenantPages/TenantChat.jsx`
- [ ] Add routes in `App.jsx`
- [ ] Add nav link + unread badge in admin sidebar and tenant nav
- [ ] Add CSS to `index.css`
- [ ] Verify `get_users.php` accepts `?role=admin` filter (add if missing)

---

## 10. Security Notes

| Concern | Mitigation |
|---|---|
| IDOR — tenant reading another tenant's messages | `get_messages.php` filters by `HTTP_X_USER_ID` (injected by `axiosConfig.js`), never a client-supplied `me` param |
| Admin impersonation | `verify_admin()` already available in `config.php` — not required for chat send/receive since both parties are authenticated users |
| XSS | PHP stores raw text; React renders via JSX (auto-escaped) — safe |
| Message spam | Add `LIMIT 10 per minute` rate-limit in `send_message.php` if needed; out of scope for v1 |
