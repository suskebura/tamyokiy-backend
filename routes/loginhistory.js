const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const LoginHistory = require('../models/LoginHistory');

// ===== GET USER'S OWN LOGIN HISTORY =====
router.get('/my-history', auth, async (req, res) => {
    try {
        const { limit = 50, page = 1 } = req.query;
        
        const histories = await LoginHistory.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));
        
        const total = await LoginHistory.countDocuments({ userId: req.user.id });
        
        res.json({
            success: true,
            histories,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit))
        });
    } catch (error) {
        console.error('Get login history error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ===== GET RECENT LOGIN HISTORY (last 10) =====
router.get('/recent', auth, async (req, res) => {
    try {
        const histories = await LoginHistory.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .limit(10);
        
        res.json({ success: true, histories });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ===== GET LAST LOGIN (for dashboard) =====
router.get('/last-login', auth, async (req, res) => {
    try {
        const lastLogin = await LoginHistory.findOne({ 
            userId: req.user.id, 
            status: 'success' 
        }).sort({ createdAt: -1 });
        
        res.json({ success: true, lastLogin });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ===== ADMIN: GET ALL LOGIN HISTORY =====
router.get('/admin/all', adminAuth, async (req, res) => {
    try {
        const { limit = 100, page = 1, userId, status, search } = req.query;
        
        let query = {};
        if (userId) query.userId = userId;
        if (status) query.status = status;
        if (search) {
            query.$or = [
                { userEmail: { $regex: search, $options: 'i' } },
                { userName: { $regex: search, $options: 'i' } },
                { ipAddress: { $regex: search, $options: 'i' } }
            ];
        }
        
        const histories = await LoginHistory.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .populate('userId', 'name email role');
        
        const total = await LoginHistory.countDocuments(query);
        
        res.json({
            success: true,
            histories,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ===== ADMIN: GET LOGIN STATISTICS =====
router.get('/admin/stats', adminAuth, async (req, res) => {
    try {
        const totalLogins = await LoginHistory.countDocuments();
        const successfulLogins = await LoginHistory.countDocuments({ status: 'success' });
        const failedLogins = await LoginHistory.countDocuments({ status: 'failed' });
        
        // Last 7 days login activity
        const last7Days = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            date.setHours(0, 0, 0, 0);
            const nextDate = new Date(date);
            nextDate.setDate(nextDate.getDate() + 1);
            
            const count = await LoginHistory.countDocuments({
                createdAt: { $gte: date, $lt: nextDate }
            });
            
            last7Days.push({
                date: date.toISOString().split('T')[0],
                count
            });
        }
        
        // Top IP addresses
        const topIps = await LoginHistory.aggregate([
            { $group: { _id: '$ipAddress', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);
        
        // Device statistics
        const deviceStats = await LoginHistory.aggregate([
            { $group: { _id: '$deviceInfo', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        
        // Browser statistics
        const browserStats = await LoginHistory.aggregate([
            { $group: { _id: '$browser', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        
        res.json({
            success: true,
            stats: {
                totalLogins,
                successfulLogins,
                failedLogins,
                successRate: totalLogins > 0 ? ((successfulLogins / totalLogins) * 100).toFixed(1) : 0,
                last7Days,
                topIps,
                deviceStats,
                browserStats
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;