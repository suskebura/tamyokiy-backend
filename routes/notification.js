const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// Import services
const notificationService = require('../services/notificationService');

// ============================================================
// 📱 SEND TEST NOTIFICATION
// ============================================================
router.post('/test', async (req, res) => {
    try {
        const { email, phone, trackingNumber, event, language } = req.body;
        
        let userId = null;
        const token = req.headers.authorization?.split(' ')[1];
        if (token) {
            try {
                const jwt = require('jsonwebtoken');
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                userId = decoded.id;
            } catch (e) {
                console.log('⚠️ Invalid token for notification test');
            }
        }
        
        const result = await notificationService.sendNotification({
            userId: userId,
            email: email,
            phone: phone,
            trackingNumber: trackingNumber || 'TAMTEST123',
            event: event || 'created',
            data: { amount: 50 },
            language: language || 'en'
        });
        
        res.json({ success: true, result: result });
    } catch (err) {
        console.error('❌ Test notification error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 📊 SEND BULK NOTIFICATION
// ============================================================
router.post('/bulk', async (req, res) => {
    try {
        const { users, event, data } = req.body;
        
        if (!users || !Array.isArray(users) || users.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Users array required' 
            });
        }
        
        const results = await notificationService.sendBulkNotifications(users, event, data);
        res.json({ 
            success: true, 
            results: results,
            total: users.length 
        });
    } catch (err) {
        console.error('❌ Bulk notification error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 📋 GET NOTIFICATIONS FOR USER
// ============================================================
router.get('/', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.id;
        
        const Notification = mongoose.model('Notification');
        const notifications = await Notification.find({ userId: userId })
            .sort({ createdAt: -1 })
            .limit(50);
        
        const unreadCount = await Notification.countDocuments({ 
            userId: userId, 
            read: false 
        });
        
        res.json({
            success: true,
            notifications: notifications,
            unreadCount: unreadCount
        });
    } catch (err) {
        console.error('❌ Get notifications error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// ✅ MARK NOTIFICATION AS READ
// ============================================================
router.put('/:id/read', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.id;
        
        const Notification = mongoose.model('Notification');
        const notification = await Notification.findOne({
            _id: req.params.id,
            userId: userId
        });
        
        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }
        
        notification.read = true;
        await notification.save();
        
        res.json({ success: true, message: 'Marked as read' });
    } catch (err) {
        console.error('❌ Mark read error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// ✅ MARK ALL NOTIFICATIONS AS READ
// ============================================================
router.put('/read-all', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.id;
        
        const Notification = mongoose.model('Notification');
        await Notification.updateMany(
            { userId: userId, read: false },
            { read: true }
        );
        
        res.json({ success: true, message: 'All notifications marked as read' });
    } catch (err) {
        console.error('❌ Mark all read error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 🗑️ DELETE NOTIFICATION
// ============================================================
router.delete('/:id', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.id;
        
        const Notification = mongoose.model('Notification');
        const notification = await Notification.findOneAndDelete({
            _id: req.params.id,
            userId: userId
        });
        
        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }
        
        res.json({ success: true, message: 'Notification deleted' });
    } catch (err) {
        console.error('❌ Delete notification error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ✅ EXPORT ROUTER
module.exports = router;