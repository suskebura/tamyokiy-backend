const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const Message = require('../models/Message');
const User = require('../models/User');
const { createNotification } = require('./notification');
const { createAuditLog } = require('../middleware/audit');

// ================================================================
// GET ALL CONVERSATIONS FOR A USER
// ================================================================
router.get('/conversations', auth, async (req, res, next) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role || 'client';
        
        // Get all messages where user is sender or receiver
        const messages = await Message.find({
            $or: [
                { senderId: userId },
                { receiverId: userId }
            ]
        }).sort({ createdAt: -1 });
        
        // Group by conversationId
        const conversations = {};
        messages.forEach(msg => {
            if (!conversations[msg.conversationId]) {
                conversations[msg.conversationId] = {
                    conversationId: msg.conversationId,
                    messages: [],
                    participants: {
                        senderId: msg.senderId,
                        senderName: msg.senderName,
                        senderRole: msg.senderRole,
                        receiverId: msg.receiverId,
                        receiverName: msg.receiverName,
                        receiverRole: msg.receiverRole
                    },
                    lastMessage: msg,
                    unreadCount: 0
                };
            }
            
            // Count unread messages for this user
            if (msg.receiverId.toString() === userId && !msg.isRead) {
                conversations[msg.conversationId].unreadCount++;
            }
            
            conversations[msg.conversationId].messages.push(msg);
        });
        
        // Get unread count for each conversation
        const result = Object.values(conversations).map(conv => ({
            ...conv,
            messages: conv.messages.slice(0, 5), // Last 5 messages
            totalMessages: conv.messages.length
        }));
        
        // Sort by last message date
        result.sort((a, b) => new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt));
        
        res.json({
            success: true,
            conversations: result,
            totalUnread: result.reduce((sum, c) => sum + c.unreadCount, 0)
        });
    } catch (err) {
        console.error('Get conversations error:', err);
        next(err);
    }
});

// ================================================================
// GET MESSAGES FOR A CONVERSATION
// ================================================================
router.get('/conversation/:conversationId', auth, async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { conversationId } = req.params;
        const { limit = 50, before } = req.query;
        
        let query = { conversationId };
        
        // If before is provided, get older messages (pagination)
        if (before) {
            query.createdAt = { $lt: new Date(before) };
        }
        
        const messages = await Message.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .populate('senderId', 'name email role profilePicture')
            .populate('receiverId', 'name email role profilePicture');
        
        // Mark messages as read
        await Message.updateMany(
            {
                conversationId,
                receiverId: userId,
                isRead: false
            },
            {
                isRead: true,
                readAt: new Date()
            }
        );
        
        res.json({
            success: true,
            messages: messages.reverse(),
            count: messages.length
        });
    } catch (err) {
        console.error('Get messages error:', err);
        next(err);
    }
});

// ================================================================
// SEND A NEW MESSAGE - FIXED (fetches sender from database)
// ================================================================
router.post('/send', auth, async (req, res, next) => {
    try {
        const { receiverId, subject, message, parentMessageId } = req.body;
        const senderId = req.user.id;
        
        // ✅ FIX: Get sender from database to ensure we have name
        const sender = await User.findById(senderId);
        if (!sender) {
            return res.status(404).json({
                success: false,
                message: 'Sender not found'
            });
        }
        
        const senderName = sender.name;
        const senderRole = sender.role || 'client';
        
        console.log('📤 Send message request:', { 
            receiverId, 
            subject, 
            message: message ? message.substring(0, 50) : 'EMPTY',
            senderName,
            senderRole,
            senderId
        });
        
        // ✅ Validate required fields
        if (!receiverId) {
            return res.status(400).json({
                success: false,
                message: 'Receiver ID is required'
            });
        }
        
        if (!message || message.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Message content is required'
            });
        }
        
        // Check if receiver exists
        const receiver = await User.findById(receiverId);
        if (!receiver) {
            return res.status(404).json({
                success: false,
                message: 'Receiver not found'
            });
        }
        
        console.log('✅ Receiver found:', receiver.name, receiver.role);
        console.log('✅ Sender found:', senderName, senderRole);
        
        // Generate conversation ID
        let conversationId;
        if (parentMessageId) {
            const parentMessage = await Message.findById(parentMessageId);
            if (parentMessage) {
                conversationId = parentMessage.conversationId;
            } else {
                conversationId = generateConversationId(senderId, receiverId);
            }
        } else {
            conversationId = generateConversationId(senderId, receiverId);
        }
        
        // Create the message
        const newMessage = new Message({
            senderId,
            senderName: senderName,
            senderRole: senderRole,
            receiverId,
            receiverName: receiver.name,
            receiverRole: receiver.role || 'client',
            subject: subject || 'New Message',
            message: message.trim(),
            conversationId,
            parentMessageId: parentMessageId || null
        });
        
        await newMessage.save();
        console.log('✅ Message saved:', newMessage._id);
        
        // If replying, increment reply count on parent
        if (parentMessageId) {
            await Message.findByIdAndUpdate(parentMessageId, {
                $inc: { replyCount: 1 }
            });
        }
        
        // Populate sender and receiver info
        await newMessage.populate('senderId', 'name email role profilePicture');
        await newMessage.populate('receiverId', 'name email role profilePicture');
        
        // 🔔 Send notification to receiver
        await createNotification(
            receiverId,
            '📩 New Message',
            `${senderName} sent you a message: ${message.substring(0, 60)}${message.length > 60 ? '...' : ''}`,
            'info',
            conversationId
        );
        
        // 🔔 Also send to admin if driver is messaging
        if (senderRole === 'driver' && receiver.role !== 'admin') {
            const admins = await User.find({ role: 'admin' });
            admins.forEach(admin => {
                createNotification(
                    admin._id,
                    '📩 New Message from Driver',
                    `${senderName} sent a message: ${message.substring(0, 60)}${message.length > 60 ? '...' : ''}`,
                    'info',
                    conversationId
                );
            });
        }
        
        // 📝 Audit log
        await createAuditLog(
            req,
            'SEND_MESSAGE',
            'Message',
            newMessage._id,
            `Sent message to ${receiver.name} (${receiver.role})`
        );
        
        res.status(201).json({
            success: true,
            message: 'Message sent successfully',
            data: newMessage
        });
    } catch (err) {
        console.error('❌ Send message error:', err.message);
        console.error('❌ Stack:', err.stack);
        res.status(500).json({
            success: false,
            message: err.message || 'Internal server error'
        });
    }
});

// ================================================================
// MARK MESSAGES AS READ
// ================================================================
router.put('/read/:conversationId', auth, async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { conversationId } = req.params;
        
        const result = await Message.updateMany(
            {
                conversationId,
                receiverId: userId,
                isRead: false
            },
            {
                isRead: true,
                readAt: new Date()
            }
        );
        
        res.json({
            success: true,
            message: `${result.modifiedCount} messages marked as read`
        });
    } catch (err) {
        console.error('Mark read error:', err);
        next(err);
    }
});

// ================================================================
// DELETE A MESSAGE (Admin only)
// ================================================================
router.delete('/:messageId', adminAuth, async (req, res, next) => {
    try {
        const { messageId } = req.params;
        
        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }
        
        await message.deleteOne();
        
        await createAuditLog(
            req,
            'DELETE_MESSAGE',
            'Message',
            messageId,
            `Deleted message from ${message.senderName} to ${message.receiverName}`
        );
        
        res.json({
            success: true,
            message: 'Message deleted successfully'
        });
    } catch (err) {
        console.error('Delete message error:', err);
        next(err);
    }
});

// ================================================================
// GET UNREAD MESSAGE COUNT
// ================================================================
router.get('/unread/count', auth, async (req, res, next) => {
    try {
        const userId = req.user.id;
        
        const count = await Message.countDocuments({
            receiverId: userId,
            isRead: false
        });
        
        res.json({
            success: true,
            unreadCount: count
        });
    } catch (err) {
        console.error('Unread count error:', err);
        next(err);
    }
});

// ================================================================
// ADMIN: GET ALL DRIVERS (for messaging)
// ================================================================
router.get('/admin/drivers', adminAuth, async (req, res, next) => {
    try {
        const drivers = await User.find({ role: 'driver' })
            .select('name email phone vehicleType driverStatus profilePicture')
            .sort({ name: 1 });
        
        res.json({
            success: true,
            drivers
        });
    } catch (err) {
        console.error('Get drivers error:', err);
        next(err);
    }
});

// ================================================================
// ADMIN: GET ALL ADMINS (for drivers to message)
// ================================================================
router.get('/admin/list', auth, async (req, res, next) => {
    try {
        const admins = await User.find({ role: 'admin' })
            .select('name email profilePicture')
            .sort({ name: 1 });
        
        res.json({
            success: true,
            admins
        });
    } catch (err) {
        console.error('Get admins error:', err);
        next(err);
    }
});

// ================================================================
// HELPER: Generate Conversation ID
// ================================================================
function generateConversationId(user1Id, user2Id) {
    const ids = [user1Id.toString(), user2Id.toString()].sort();
    return `${ids[0]}_${ids[1]}`;
}

module.exports = router;