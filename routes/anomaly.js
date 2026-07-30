// routes/anomaly.js
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const AnomalyLog = require('../models/AnomalyLog');
const anomalyService = require('../services/anomalyDetectionService');
const User = require('../models/User'); // ✅ Only ONE import of User

// ============================================================
// 📊 GET ALL ANOMALIES
// ============================================================
router.get('/', adminAuth, async (req, res) => {
    try {
        const { status, severity, type, limit = 50, page = 1 } = req.query;
        
        let query = {};
        if (status) query.status = status;
        if (severity) query.severity = severity;
        if (type) query.type = type;
        
        const anomalies = await AnomalyLog.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .populate('driverId', 'name email phone')
            .populate('userId', 'name email');
        
        const total = await AnomalyLog.countDocuments(query);
        
        res.json({
            success: true,
            anomalies,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit))
        });
        
    } catch (err) {
        console.error('❌ Get anomalies error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 📊 GET ANOMALY STATS
// ============================================================
router.get('/stats', adminAuth, async (req, res) => {
    try {
        let stats = {
            total: 0,
            detected: 0,
            investigating: 0,
            confirmed: 0,
            resolved: 0,
            falseAlarms: 0,
            bySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
            byType: {}
        };
        
        try {
            stats = await anomalyService.getStats();
        } catch (err) {
            console.log('⚠️ Error getting stats from service, using manual query:', err.message);
            
            // Manual stats if service fails
            const total = await AnomalyLog.countDocuments();
            const detected = await AnomalyLog.countDocuments({ status: 'detected' });
            const investigating = await AnomalyLog.countDocuments({ status: 'investigating' });
            const confirmed = await AnomalyLog.countDocuments({ status: 'confirmed' });
            const resolved = await AnomalyLog.countDocuments({ status: 'resolved' });
            const falseAlarms = await AnomalyLog.countDocuments({ status: 'false_alarm' });
            
            // Severity breakdown
            const low = await AnomalyLog.countDocuments({ severity: 'low' });
            const medium = await AnomalyLog.countDocuments({ severity: 'medium' });
            const high = await AnomalyLog.countDocuments({ severity: 'high' });
            const critical = await AnomalyLog.countDocuments({ severity: 'critical' });
            
            // Type breakdown
            const types = await AnomalyLog.aggregate([
                { $group: { _id: '$type', count: { $sum: 1 } } }
            ]);
            const byType = {};
            types.forEach(t => { byType[t._id] = t.count; });
            
            stats = {
                total,
                detected,
                investigating,
                confirmed,
                resolved,
                falseAlarms,
                bySeverity: { low, medium, high, critical },
                byType
            };
        }
        
        res.json({
            success: true,
            stats
        });
        
    } catch (err) {
        console.error('❌ Get stats error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 🔍 RUN ANOMALY DETECTION - ✅ FIXED: Added /run endpoint
// ============================================================
router.post('/run', adminAuth, async (req, res) => {
    try {
        console.log('🔍 Running anomaly detection...');
        const results = await anomalyService.runFullDetection();
        res.json({
            success: true,
            ...results
        });
    } catch (err) {
        console.error('❌ Run detection error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 🔍 SCAN ANOMALY DETECTION (Alias for /run)
// ============================================================
router.post('/scan', adminAuth, async (req, res) => {
    try {
        console.log('🔍 Scanning for anomalies...');
        const results = await anomalyService.runFullDetection();
        res.json({
            success: true,
            ...results
        });
    } catch (err) {
        console.error('❌ Scan error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 📋 GET SINGLE ANOMALY
// ============================================================
router.get('/:id', adminAuth, async (req, res) => {
    try {
        const anomaly = await AnomalyLog.findById(req.params.id)
            .populate('driverId', 'name email phone')
            .populate('userId', 'name email');
        
        if (!anomaly) {
            return res.status(404).json({ success: false, message: 'Anomaly not found' });
        }
        
        res.json({ success: true, anomaly });
        
    } catch (err) {
        console.error('❌ Get anomaly error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// ✏️ UPDATE ANOMALY STATUS
// ============================================================
router.put('/:id', adminAuth, async (req, res) => {
    try {
        const { status, notes } = req.body;
        
        const anomaly = await AnomalyLog.findById(req.params.id);
        if (!anomaly) {
            return res.status(404).json({ success: false, message: 'Anomaly not found' });
        }
        
        const oldStatus = anomaly.status;
        anomaly.status = status || anomaly.status;
        if (notes) anomaly.notes = notes;
        if (status === 'investigating') {
            anomaly.investigatedAt = new Date();
            anomaly.investigatedBy = req.user.name || req.user.email;
        }
        if (status === 'resolved' || status === 'confirmed' || status === 'false_alarm') {
            anomaly.resolvedAt = new Date();
        }
        anomaly.updatedAt = new Date();
        
        await anomaly.save();
        
        // Create notification for the change
        try {
            const { createNotification } = require('./notification');
            await createNotification(
                req.user.id,
                '📋 Anomaly Status Updated',
                `Anomaly ${anomaly._id} status changed from ${oldStatus} to ${anomaly.status}`,
                anomaly.severity === 'high' || anomaly.severity === 'critical' ? 'error' : 'info',
                anomaly._id
            );
        } catch (notifErr) {
            console.log('⚠️ Notification error:', notifErr.message);
        }
        
        res.json({
            success: true,
            message: 'Anomaly updated',
            anomaly
        });
        
    } catch (err) {
        console.error('❌ Update anomaly error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// ✅ MARK ANOMALY AS FALSE POSITIVE (Quick Action)
// ============================================================
router.put('/:id/false-positive', adminAuth, async (req, res) => {
    try {
        const anomaly = await AnomalyLog.findById(req.params.id);
        if (!anomaly) {
            return res.status(404).json({ success: false, message: 'Anomaly not found' });
        }
        
        // Check if already resolved
        if (anomaly.status === 'resolved' || anomaly.status === 'false_alarm') {
            return res.status(400).json({
                success: false,
                message: `Anomaly already ${anomaly.status}`
            });
        }
        
        const oldStatus = anomaly.status;
        anomaly.status = 'false_alarm';
        anomaly.notes = (anomaly.notes ? anomaly.notes + '\n' : '') + 
            `✅ Marked as false positive by ${req.user.name || req.user.email} on ${new Date().toISOString()}`;
        anomaly.resolvedAt = new Date();
        anomaly.updatedAt = new Date();
        await anomaly.save();
        
        // Create notification
        try {
            const { createNotification } = require('./notification');
            await createNotification(
                req.user.id,
                '✅ False Positive Marked',
                `Anomaly ${anomaly._id} was marked as false positive (was ${oldStatus})`,
                'success',
                anomaly._id
            );
        } catch (notifErr) {
            console.log('⚠️ Notification error:', notifErr.message);
        }
        
        res.json({
            success: true,
            message: 'Anomaly marked as false positive',
            anomaly
        });
        
    } catch (err) {
        console.error('❌ False positive error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 🗑️ DELETE ANOMALY
// ============================================================
router.delete('/:id', adminAuth, async (req, res) => {
    try {
        const anomaly = await AnomalyLog.findById(req.params.id);
        if (!anomaly) {
            return res.status(404).json({ success: false, message: 'Anomaly not found' });
        }
        
        // Don't allow deleting critical anomalies unless resolved
        if (anomaly.severity === 'critical' && anomaly.status !== 'resolved' && anomaly.status !== 'false_alarm') {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete critical anomaly. Please resolve or mark as false positive first.'
            });
        }
        
        await AnomalyLog.findByIdAndDelete(req.params.id);
        
        // Create notification
        try {
            const { createNotification } = require('./notification');
            await createNotification(
                req.user.id,
                '🗑️ Anomaly Deleted',
                `Anomaly ${anomaly._id} (${anomaly.type}) was deleted by ${req.user.name || req.user.email}`,
                'warning',
                anomaly._id
            );
        } catch (notifErr) {
            console.log('⚠️ Notification error:', notifErr.message);
        }
        
        res.json({ success: true, message: 'Anomaly deleted' });
        
    } catch (err) {
        console.error('❌ Delete anomaly error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 📊 GET ANOMALIES BY TYPE (For Charts)
// ============================================================
router.get('/types/stats', adminAuth, async (req, res) => {
    try {
        const typeStats = await AnomalyLog.aggregate([
            { $group: { _id: '$type', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        
        const severityStats = await AnomalyLog.aggregate([
            { $group: { _id: '$severity', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        
        const statusStats = await AnomalyLog.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        
        // Daily trend (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const dailyTrend = await AnomalyLog.aggregate([
            { $match: { createdAt: { $gte: thirtyDaysAgo } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);
        
        res.json({
            success: true,
            data: {
                byType: typeStats,
                bySeverity: severityStats,
                byStatus: statusStats,
                dailyTrend: dailyTrend
            }
        });
        
    } catch (err) {
        console.error('❌ Type stats error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 📊 GET RECENT ANOMALIES (For Dashboard)
// ============================================================
router.get('/recent/:limit', adminAuth, async (req, res) => {
    try {
        const limit = parseInt(req.params.limit) || 10;
        
        const anomalies = await AnomalyLog.find()
            .sort({ createdAt: -1 })
            .limit(limit)
            .populate('driverId', 'name')
            .populate('userId', 'name');
        
        res.json({
            success: true,
            anomalies
        });
        
    } catch (err) {
        console.error('❌ Recent anomalies error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 📊 GET ANOMALY SCORE SUMMARY
// ============================================================
router.get('/score/summary', adminAuth, async (req, res) => {
    try {
        const summary = await AnomalyLog.aggregate([
            {
                $group: {
                    _id: null,
                    avgScore: { $avg: '$score' },
                    maxScore: { $max: '$score' },
                    minScore: { $min: '$score' },
                    total: { $sum: 1 }
                }
            }
        ]);
        
        const highScoreCount = await AnomalyLog.countDocuments({ 
            score: { $gte: 70 },
            status: { $nin: ['resolved', 'false_alarm'] }
        });
        
        res.json({
            success: true,
            summary: {
                averageScore: summary[0]?.avgScore ? Math.round(summary[0].avgScore) : 0,
                maxScore: summary[0]?.maxScore || 0,
                minScore: summary[0]?.minScore || 0,
                total: summary[0]?.total || 0,
                highScoreCount,
                riskLevel: highScoreCount > 5 ? 'critical' :
                          highScoreCount > 2 ? 'high' :
                          highScoreCount > 0 ? 'medium' : 'low'
            }
        });
        
    } catch (err) {
        console.error('❌ Score summary error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

console.log('✅ Anomaly routes loaded successfully!');

module.exports = router;