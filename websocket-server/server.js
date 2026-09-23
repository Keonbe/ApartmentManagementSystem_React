require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // In production, specify the React app's URL
        methods: ["GET", "POST"]
    }
});

// Database connection configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ams_db'
};

let pool;

async function createPool() {
    pool = mysql.createPool(dbConfig);
    console.log('Database pool created.');
}

createPool();

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // User joins a private room based on their user ID
    socket.on('join', (userId) => {
        socket.join(`user_${userId}`);
        console.log(`User ${userId} joined their private room.`);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });

    // Handle sending a message
    socket.on('send_message', async (data) => {
        const { sender_id, receiver_id, message } = data;
        
        try {
            if (!pool) await createPool();
            
            const [result] = await pool.execute(
                'INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, ?, ?)',
                [sender_id, receiver_id, message]
            );
            
            const newMessage = {
                id: result.insertId,
                sender_id,
                receiver_id,
                message,
                created_at: new Date()
            };

            // Emit to the receiver's room
            io.to(`user_${receiver_id}`).emit('receive_message', newMessage);
            
            // Also emit to the sender's room in case they have multiple tabs open
            io.to(`user_${sender_id}`).emit('receive_message', newMessage);

            console.log(`Message sent from ${sender_id} to ${receiver_id}: ${message}`);
        } catch (error) {
            console.error('Error saving message:', error);
            socket.emit('error', { message: 'Failed to send message' });
        }
    });

    // Handle typing indicator
    socket.on('typing', (data) => {
        const { sender_id, receiver_id, is_typing } = data;
        if (is_typing) {
            io.to(`user_${receiver_id}`).emit('user_typing', { sender_id });
        } else {
            io.to(`user_${receiver_id}`).emit('user_stop_typing', { sender_id });
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`WebSocket server running on port ${PORT}`);
});
