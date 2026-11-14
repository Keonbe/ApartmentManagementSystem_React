require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mysql = require('mysql2/promise');

// Real-time relay for chat. The REST endpoints (send_message.php and friends)
// stay the source of truth for history; this server only has to be as strict as
// they are:
//   - a connection needs a live session token (the same `sessions` row the PHP
//     side checks), and the user is whoever that token belongs to;
//   - a client never says who it is: `sender_id` in a payload is ignored;
//   - a message passes the same checks as send_message.php and leaves the same
//     activity-log row.

const MAX_MESSAGE_LENGTH = 2000; // keep equal to send_message.php
const RATE_LIMIT_MESSAGES = 20;  // per socket ...
const RATE_LIMIT_WINDOW_MS = 10_000; // ... per window

// Same list as backend/cors.php. Override with ALLOWED_ORIGINS (comma separated).
const DEFAULT_ORIGINS = [
    'https://angcanan-ams.com',
    'https://www.angcanan-ams.com',
    'http://localhost:5174',
    'http://localhost:5173',
    'http://168.107.72.9',
];
const configuredOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
const ALLOWED_ORIGINS = configuredOrigins.length ? configuredOrigins : DEFAULT_ORIGINS;

// Matches APP_TIMEZONE (Asia/Manila = +08:00) so messages.created_at agrees with PHP.
const DB_TIME_ZONE = process.env.DB_TIME_ZONE || '+08:00';

const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: ALLOWED_ORIGINS,
        methods: ['GET', 'POST'],
    },
});

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME || 'ams_db',
};

let pool;

function createPool() {
    pool = mysql.createPool(dbConfig);
    // Every pooled connection uses the same clock as the PHP side.
    pool.pool.on('connection', (conn) => conn.query('SET time_zone = ?', [DB_TIME_ZONE]));
    console.log('Database pool created.');
}

createPool();

// The session behind a token, or null: the same rule as get_authenticated_user()
// in backend/config.php (live role and archive state from `users`, unexpired).
async function sessionUser(token) {
    if (typeof token !== 'string' || !/^[0-9a-f]{64}$/i.test(token)) return null;
    const [rows] = await pool.execute(
        `SELECT s.user_id, u.role
           FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token = ? AND s.expires_at > NOW() AND u.is_archived = 0`,
        [token],
    );
    return rows.length ? { id: Number(rows[0].user_id), role: rows[0].role } : null;
}

// Handshake: no valid session, no connection.
io.use(async (socket, next) => {
    try {
        const user = await sessionUser(socket.handshake.auth?.token);
        if (!user) return next(new Error('unauthorized'));
        socket.data.userId = user.id;
        socket.data.token = socket.handshake.auth.token;
        socket.data.sent = [];
        next();
    } catch (error) {
        console.error('Socket auth error:', error.code || error.message);
        next(new Error('unavailable'));
    }
});

const toId = (value) => (Number.isInteger(value) && value > 0 ? value : (/^\d+$/.test(String(value)) ? Number(value) : 0));

function rateLimited(socket) {
    const now = Date.now();
    socket.data.sent = socket.data.sent.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (socket.data.sent.length >= RATE_LIMIT_MESSAGES) return true;
    socket.data.sent.push(now);
    return false;
}

io.on('connection', (socket) => {
    const userId = socket.data.userId;
    // The only room a client can be in is its own.
    socket.join(`user_${userId}`);

    // Older clients still emit `join`; the id they send is ignored.
    socket.on('join', () => socket.join(`user_${userId}`));

    socket.on('disconnect', () => {});

    socket.on('send_message', async (data, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        const fail = (message, code = 'invalid') => {
            socket.emit('error', { message, code });
            reply({ ok: false, error: message, code });
        };

        try {
            if (rateLimited(socket)) return fail('You are sending messages too quickly. Please wait a moment.', 'rate_limited');

            // Logged out or revoked since the handshake: drop the connection.
            const user = await sessionUser(socket.data.token);
            if (!user || user.id !== userId) {
                fail('Your session has ended. Please sign in again.', 'unauthorized');
                return socket.disconnect(true);
            }

            const receiverId = toId(data?.receiver_id);
            const replyToId = data?.reply_to_id == null ? null : toId(data.reply_to_id);
            const text = typeof data?.message === 'string' ? data.message.trim() : '';

            if (!receiverId || !text) return fail('Missing required fields');
            if (Array.from(text).length > MAX_MESSAGE_LENGTH) {
                return fail(`Messages can be up to ${MAX_MESSAGE_LENGTH} characters.`);
            }
            if (receiverId === userId) return fail('Cannot send a message to yourself');

            const [people] = await pool.execute('SELECT id FROM users WHERE id IN (?, ?)', [userId, receiverId]);
            if (people.length < 2) return fail('User not found');

            if (replyToId) {
                const [target] = await pool.execute(
                    `SELECT id FROM messages
                      WHERE id = ? AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))`,
                    [replyToId, userId, receiverId, receiverId, userId],
                );
                if (!target.length) return fail('Reply target not found in this conversation');
            }

            const [result] = await pool.execute(
                'INSERT INTO messages (sender_id, receiver_id, message, reply_to_id) VALUES (?, ?, ?, ?)',
                [userId, receiverId, text, replyToId],
            );
            // Same row send_message.php writes ('chat' is normalised to 'system' there).
            await pool.execute(
                'INSERT INTO activity_logs (performed_by, category, action, details) VALUES (?, ?, ?, ?)',
                [userId, 'system', 'send_message', `Messaged user ${receiverId}`],
            );

            const newMessage = {
                id: result.insertId,
                sender_id: userId,
                receiver_id: receiverId,
                message: text,
                attachment_path: null,
                reply_to_id: replyToId,
                created_at: new Date(),
            };

            io.to(`user_${receiverId}`).emit('receive_message', newMessage);
            // The sender's other tabs get it too.
            io.to(`user_${userId}`).emit('receive_message', newMessage);
            reply({ ok: true, message: newMessage });

            // Ids only: message bodies are private and stay out of the logs.
            console.log(`Message ${result.insertId} from ${userId} to ${receiverId}`);
        } catch (error) {
            console.error('Error saving message:', error.code || error.message);
            fail('Failed to send message', 'server_error');
        }
    });

    socket.on('typing', (data) => {
        const receiverId = toId(data?.receiver_id);
        if (!receiverId || receiverId === userId) return;
        io.to(`user_${receiverId}`).emit(data?.is_typing ? 'user_typing' : 'user_stop_typing', { sender_id: userId });
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`WebSocket server running on port ${PORT}`);
});
