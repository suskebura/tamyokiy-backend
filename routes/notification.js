const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Notification = require('../models/Notification');

// ===== GET USER NOTIFICATIONS =====
router.get('/', auth, async (req, res) => {
    try {
        const { limit = 50 } = req.query;
        
        const notifications = await Notification.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .limit(parseInt(limit));
        
        const unreadCount = await Notification.countDocuments({ 
            userId: req.user.id, 
            isRead: false 
        });
        
        res.json({ 
            success: true, 
            notifications, 
            unreadCount 
        });
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ===== MARK SINGLE NOTIFICATION AS READ =====
router.put('/:id/read', auth, async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, userId: req.user.id },
            { isRead: true },
            { new: true }
        );
        
        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Mark read error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ===== MARK ALL NOTIFICATIONS AS READ =====
router.put('/read-all', auth, async (req, res) => {
    try {
        await Notification.updateMany(
            { userId: req.user.id, isRead: false },
            { isRead: true }
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Mark all read error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ===== DELETE NOTIFICATION =====
router.delete('/:id', auth, async (req, res) => {
    try {
        const notification = await Notification.findOneAndDelete({ 
            _id: req.params.id, 
            userId: req.user.id 
        });
        
        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Delete notification error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ===== CREATE NOTIFICATION (INTERNAL FUNCTION) =====
const createNotification = async (userId, title, message, type = 'info', relatedId = null) => {
    try {
        if (!userId) {
            console.log('⚠️ Cannot create notification: userId is missing');
            return null;
        }
        
        const notification = new Notification({ 
            userId, 
            title, 
            message, 
            type,
            relatedId 
        });
        
        await notification.save();
        console.log(`🔔 [NOTIFICATION] ${title} -> User: ${userId}`);
        return notification;
    } catch (error) {
        console.error('❌ Notification creation error:', error.message);
        return null;
    }
};

module.exports = { router, createNotification };