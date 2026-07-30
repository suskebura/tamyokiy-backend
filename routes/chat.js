const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// ============================================================
// 👥 GET USERS FOR CHAT
// ============================================================

router.get('/users', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const currentUser = await mongoose.model('User').findById(decoded.id);
        
        if (!currentUser) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const users = await mongoose.model('User').find({ 
            _id: { $ne: currentUser._id } 
        }).select('name email role createdAt');
        
        res.json({ success: true, users });
        
    } catch (err) {
        console.error('Get users error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 📥 GET CHAT CONVERSATIONS
// ============================================================

router.get('/conversations', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await mongoose.model('User').findById(decoded.id);
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const Chat = mongoose.model('Chat');
        const conversations = await Chat.find({
            $or: [
                { sender: user._id },
                { receiver: user._id }
            ]
        })
        .sort({ createdAt: -1 })
        .populate('sender', 'name email role')
        .populate('receiver', 'name email role');
        
        const conversationMap = {};
        conversations.forEach(msg => {
            const partnerId = msg.sender._id.toString() === user._id.toString() 
                ? msg.receiver._id.toString() 
                : msg.sender._id.toString();
            
            if (!conversationMap[partnerId]) {
                const partner = msg.sender._id.toString() === user._id.toString() 
                    ? msg.receiver 
                    : msg.sender;
                conversationMap[partnerId] = {
                    partner: partner,
                    messages: [],
                    unreadCount: 0,
                    lastMessage: null
                };
            }
            
            conversationMap[partnerId].messages.push(msg);
            if (!msg.isRead && msg.receiver._id.toString() === user._id.toString()) {
                conversationMap[partnerId].unreadCount++;
            }
            conversationMap[partnerId].lastMessage = msg;
        });
        
        const result = Object.values(conversationMap);
        
        res.json({ 
            success: true, 
            conversations: result,
            totalUnread: result.reduce((sum, c) => sum + c.unreadCount, 0)
        });
        
    } catch (err) {
        console.error('Get conversations error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 💬 GET MESSAGES FOR A CONVERSATION
// ============================================================

router.get('/conversation/:userId', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const currentUser = await mongoose.model('User').findById(decoded.id);
        
        if (!currentUser) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const { userId } = req.params;
        const Chat = mongoose.model('Chat');
        
        const messages = await Chat.find({
            $or: [
                { sender: currentUser._id, receiver: userId },
                { sender: userId, receiver: currentUser._id }
            ]
        })
        .sort({ createdAt: 1 })
        .populate('sender', 'name email role')
        .populate('receiver', 'name email role');
        
        // Mark messages as read
        await Chat.updateMany(
            { 
                sender: userId, 
                receiver: currentUser._id,
                isRead: false 
            },
            { 
                isRead: true,
                readAt: new Date()
            }
        );
        
        res.json({ 
            success: true, 
            messages: messages,
            count: messages.length
        });
        
    } catch (err) {
        console.error('Get conversation error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 📤 SEND MESSAGE - FIXED (No notification)
// ============================================================

router.post('/send', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const User = mongoose.model('User');
        const sender = await User.findById(decoded.id);
        
        if (!sender) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const { receiverId, message, subject } = req.body;
        
        if (!receiverId || !message) {
            return res.status(400).json({ success: false, message: 'Receiver and message required' });
        }
        
        const receiver = await User.findById(receiverId);
        if (!receiver) {
            return res.status(404).json({ success: false, message: 'Receiver not found' });
        }
        
        const Chat = mongoose.model('Chat');
        const chat = new Chat({
            sender: sender._id,
            senderName: sender.name,
            senderRole: sender.role,
            receiver: receiver._id,
            receiverName: receiver.name,
            receiverRole: receiver.role,
            message: message,
            subject: subject || 'General Inquiry',
            isRead: false,
            createdAt: new Date()
        });
        
        await chat.save();
        
        // ✅ FIX: Send response without creating notification
        res.json({ 
            success: true, 
            message: 'Message sent successfully',
            chat: chat
        });
        
    } catch (err) {
        console.error('Chat send error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 📊 MARK MESSAGES AS READ
// ============================================================

router.put('/mark-read/:userId', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const currentUser = await mongoose.model('User').findById(decoded.id);
        const { userId } = req.params;
        const Chat = mongoose.model('Chat');
        
        await Chat.updateMany(
            { 
                sender: userId, 
                receiver: currentUser._id,
                isRead: false 
            },
            { 
                isRead: true,
                readAt: new Date()
            }
        );
        
        res.json({ success: true, message: 'Messages marked as read' });
        
    } catch (err) {
        console.error('Mark read error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 📊 GET UNREAD COUNT
// ============================================================

router.get('/unread/count', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const Chat = mongoose.model('Chat');
        
        const count = await Chat.countDocuments({
            receiver: decoded.id,
            isRead: false
        });
        
        res.json({ success: true, unreadCount: count });
        
    } catch (err) {
        console.error('Unread count error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;