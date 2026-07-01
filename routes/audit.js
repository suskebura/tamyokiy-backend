const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const AuditLog = require('../models/Auditlog');

// Get all audit logs (admin only)
router.get('/', adminAuth, async (req, res, next) => {
    try {
        const { page = 1, limit = 50, action, entityType, userId } = req.query;
        
        let query = {};
        if (action) query.action = action;
        if (entityType) query.entityType = entityType;
        if (userId) query.userId = userId;
        
        const logs = await AuditLog.find(query)
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .populate('userId', 'name email');
        
        const total = await AuditLog.countDocuments(query);
        
        res.json({
            logs,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / limit)
        });
    } catch (err) {
        next(err);
    }
});

// Get audit log by ID
router.get('/:id', adminAuth, async (req, res, next) => {
    try {
        const log = await AuditLog.findById(req.params.id).populate('userId', 'name email');
        if (!log) {
            return res.status(404).json({ message: 'Log not found' });
        }
        res.json(log);
    } catch (err) {
        next(err);
    }
});

// Get audit statistics
router.get('/stats/summary', adminAuth, async (req, res, next) => {
    try {
        const totalActions = await AuditLog.countDocuments();
        const actionsByType = await AuditLog.aggregate([
            { $group: { _id: '$action', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        const actionsByEntity = await AuditLog.aggregate([
            { $group: { _id: '$entityType', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        
        res.json({ totalActions, actionsByType, actionsByEntity });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
