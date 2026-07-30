// backend/routes/sentiment.js
// 📊 Sentiment Analysis Routes

const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const sentimentService = require('../services/sentimentService');
const SentimentLog = require('../models/SentimentLog');
const Ticket = require('../models/Ticket');
const User = require('../models/User');

// ============================================================
// 📊 GET SENTIMENT STATS
// ============================================================
router.get('/stats', adminAuth, async (req, res) => {
    try {
        const stats = await sentimentService.getSentimentStats();
        res.json({
            success: true,
            stats
        });
    } catch (err) {
        console.error('Stats error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 📋 GET ALL SENTIMENT LOGS
// ============================================================
router.get('/logs', adminAuth, async (req, res) => {
    try {
        const { limit = 50, page = 1, sentiment, isUrgent } = req.query;
        
        let query = {};
        if (sentiment) query.sentiment = sentiment;
        if (isUrgent !== undefined) query.isUrgent = isUrgent === 'true';
        
        const logs = await SentimentLog.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));
        
        const total = await SentimentLog.countDocuments(query);
        
        res.json({
            success: true,
            logs,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit))
        });
    } catch (err) {
        console.error('Get logs error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 📋 GET RECENT SENTIMENTS
// ============================================================
router.get('/recent', adminAuth, async (req, res) => {
    try {
        const { limit = 20 } = req.query;
        
        const logs = await SentimentLog.find()
            .sort({ createdAt: -1 })
            .limit(parseInt(limit));
        
        res.json({
            success: true,
            sentiments: logs
        });
    } catch (err) {
        console.error('Get recent sentiments error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 🔍 ANALYZE SINGLE TICKET
// ============================================================
router.post('/analyze/ticket/:id', adminAuth, async (req, res) => {
    try {
        const result = await sentimentService.analyzeTicket(req.params.id);
        
        if (!result) {
            return res.status(404).json({ 
                success: false, 
                message: 'Ticket not found' 
            });
        }
        
        res.json({
            success: true,
            data: result,
            message: 'Sentiment analysis complete'
        });
    } catch (err) {
        console.error('Analyze error:', err);
        res.status(500).json({ 
            success: false, 
            message: err.message 
        });
    }
});

// ============================================================
// 🔍 ANALYZE ALL TICKETS (Batch)
// ============================================================
router.post('/analyze/all', adminAuth, async (req, res) => {
    try {
        const tickets = await Ticket.find({});
        let analyzed = 0;
        let errors = 0;
        
        for (const ticket of tickets) {
            try {
                await sentimentService.analyzeTicket(ticket._id);
                analyzed++;
            } catch (err) {
                errors++;
                console.error(`Error analyzing ${ticket.ticketNumber}:`, err.message);
            }
        }
        
        res.json({
            success: true,
            message: `Analyzed ${analyzed} tickets, ${errors} errors`,
            analyzed,
            errors,
            total: tickets.length
        });
    } catch (err) {
        console.error('Batch analyze error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 🚨 GET URGENT/ANGRY TICKETS
// ============================================================
router.get('/urgent', adminAuth, async (req, res) => {
    try {
        const { limit = 20 } = req.query;
        
        // Get sentiment logs for urgent/angry tickets
        const logs = await SentimentLog.find({
            $or: [{ isUrgent: true }, { isAngry: true }],
            entityType: 'ticket'
        })
        .sort({ createdAt: -1 })
        .limit(parseInt(limit));
        
        // Get the actual tickets
        const ticketIds = logs.map(l => l.entityId);
        const tickets = await Ticket.find({ _id: { $in: ticketIds } })
            .populate('userId', 'name email');
        
        // Merge sentiment data with tickets
        const enrichedTickets = tickets.map(ticket => {
            const log = logs.find(l => 
                l.entityId?.toString() === ticket._id.toString()
            );
            return {
                ...ticket.toObject(),
                sentiment: log ? {
                    sentiment: log.sentiment,
                    confidence: log.confidence,
                    scores: log.scores,
                    isUrgent: log.isUrgent,
                    isAngry: log.isAngry,
                    escalationLevel: log.escalationLevel,
                    matchedKeywords: log.matchedKeywords
                } : null
            };
        });
        
        res.json({
            success: true,
            tickets: enrichedTickets,
            total: enrichedTickets.length
        });
    } catch (err) {
        console.error('Urgent tickets error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 📊 GET SENTIMENT TRENDS
// ============================================================
router.get('/trends', adminAuth, async (req, res) => {
    try {
        const { days = 30 } = req.query;
        
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));
        
        const trends = await SentimentLog.aggregate([
            { $match: { createdAt: { $gte: startDate } } },
            {
                $group: {
                    _id: { 
                        date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                        sentiment: '$sentiment'
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.date': 1 } }
        ]);
        
        // Format for charts
        const formatted = {};
        trends.forEach(t => {
            if (!formatted[t._id.date]) {
                formatted[t._id.date] = { 
                    positive: 0, 
                    negative: 0, 
                    neutral: 0, 
                    urgent: 0,
                    angry: 0,
                    total: 0
                };
            }
            formatted[t._id.date][t._id.sentiment] = t.count;
            formatted[t._id.date].total += t.count;
        });
        
        // Convert to array format for charting
        const chartData = Object.keys(formatted).map(date => ({
            date,
            ...formatted[date]
        }));
        
        res.json({
            success: true,
            data: chartData,
            days: parseInt(days),
            summary: {
                totalEntries: chartData.reduce((sum, d) => sum + d.total, 0),
                totalDays: chartData.length,
                avgDaily: chartData.length > 0 ? 
                    Math.round(chartData.reduce((sum, d) => sum + d.total, 0) / chartData.length) : 0
            }
        });
    } catch (err) {
        console.error('Trends error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 📊 GET SENTIMENT BY TICKET ID
// ============================================================
router.get('/ticket/:id', adminAuth, async (req, res) => {
    try {
        const log = await SentimentLog.findOne({
            entityType: 'ticket',
            entityId: req.params.id
        }).sort({ createdAt: -1 });
        
        if (!log) {
            return res.json({
                success: true,
                hasSentiment: false,
                message: 'No sentiment analysis found for this ticket'
            });
        }
        
        res.json({
            success: true,
            hasSentiment: true,
            sentiment: {
                sentiment: log.sentiment,
                confidence: log.confidence,
                scores: log.scores,
                isUrgent: log.isUrgent,
                isAngry: log.isAngry,
                escalationLevel: log.escalationLevel,
                matchedKeywords: log.matchedKeywords,
                analyzedAt: log.createdAt
            }
        });
    } catch (err) {
        console.error('Get ticket sentiment error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 📋 EXPORT SENTIMENT REPORT AS CSV
// ============================================================
router.get('/export/csv', adminAuth, async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));
        
        const logs = await SentimentLog.find({
            createdAt: { $gte: startDate }
        })
        .sort({ createdAt: -1 })
        .limit(1000);
        
        if (logs.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No sentiment data found for the selected period'
            });
        }
        
        // CSV Headers
        let csv = 'Ticket,Entity Type,Category,Sentiment,Confidence,Urgent,Angry,Escalation,Score,Matched Keywords,Created\n';
        
        logs.forEach(log => {
            const row = [
                log.metadata?.ticketNumber || log.metadata?.trackingNumber || 'N/A',
                log.entityType || 'N/A',
                log.metadata?.category || 'N/A',
                log.sentiment || 'neutral',
                log.confidence || 0,
                log.isUrgent ? 'Yes' : 'No',
                log.isAngry ? 'Yes' : 'No',
                log.escalationLevel || 'normal',
                log.scores?.overall || 50,
                Object.values(log.matchedKeywords || {}).flat().join('; ').substring(0, 100) || 'None',
                log.createdAt ? new Date(log.createdAt).toISOString().split('T')[0] : 'N/A'
            ];
            csv += row.join(',') + '\n';
        });
        
        // Set response headers for CSV download
        const filename = `sentiment_report_${new Date().toISOString().split('T')[0]}.csv`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        res.send(csv);
        
    } catch (err) {
        console.error('Export error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 👤 GET CUSTOMER SENTIMENT HISTORY
// ============================================================
router.get('/customer/:userId', adminAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Get the user
        const user = await User.findById(userId).select('name email');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        // Get sentiment logs for this user
        const logs = await SentimentLog.find({
            'metadata.userId': userId
        }).sort({ createdAt: -1 });
        
        // Get tickets for this user
        const tickets = await Ticket.find({ userId: userId })
            .select('ticketNumber title status priority createdAt')
            .sort({ createdAt: -1 });
        
        // Calculate summary
        const summary = {
            total: logs.length,
            angry: logs.filter(l => l.isAngry).length,
            urgent: logs.filter(l => l.isUrgent).length,
            positive: logs.filter(l => l.sentiment === 'positive').length,
            negative: logs.filter(l => l.sentiment === 'negative').length,
            neutral: logs.filter(l => l.sentiment === 'neutral').length,
            averageConfidence: logs.length > 0 
                ? Math.round(logs.reduce((sum, l) => sum + l.confidence, 0) / logs.length) 
                : 0,
            totalTickets: tickets.length,
            openTickets: tickets.filter(t => t.status !== 'closed' && t.status !== 'resolved').length
        };
        
        // Calculate sentiment trend over time
        const trend = logs.slice(0, 30).map(log => ({
            date: log.createdAt.toISOString().split('T')[0],
            sentiment: log.sentiment,
            confidence: log.confidence,
            isUrgent: log.isUrgent,
            isAngry: log.isAngry
        }));
        
        res.json({
            success: true,
            user: {
                id: user._id,
                name: user.name,
                email: user.email
            },
            summary,
            recentTickets: tickets.slice(0, 5),
            sentimentTrend: trend,
            logs: logs.slice(0, 20)
        });
    } catch (err) {
        console.error('Customer history error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 📊 GET SENTIMENT SUMMARY BY CUSTOMER
// ============================================================
router.get('/customers/summary', adminAuth, async (req, res) => {
    try {
        const summary = await SentimentLog.aggregate([
            {
                $group: {
                    _id: '$metadata.userId',
                    total: { $sum: 1 },
                    angry: { $sum: { $cond: ['$isAngry', 1, 0] } },
                    urgent: { $sum: { $cond: ['$isUrgent', 1, 0] } },
                    positive: { $sum: { $cond: [{ $eq: ['$sentiment', 'positive'] }, 1, 0] } },
                    negative: { $sum: { $cond: [{ $eq: ['$sentiment', 'negative'] }, 1, 0] } },
                    avgConfidence: { $avg: '$confidence' },
                    lastActivity: { $max: '$createdAt' }
                }
            },
            { $sort: { total: -1 } },
            { $limit: 20 }
        ]);
        
        // Get user names
        const userIds = summary.map(s => s._id).filter(id => id);
        const users = await User.find({ _id: { $in: userIds } }).select('name email');
        
        const enriched = summary.map(s => {
            const user = users.find(u => u._id.toString() === s._id?.toString());
            return {
                userId: s._id,
                name: user?.name || 'Unknown',
                email: user?.email || 'Unknown',
                total: s.total,
                angry: s.angry,
                urgent: s.urgent,
                positive: s.positive,
                negative: s.negative,
                avgConfidence: Math.round(s.avgConfidence || 0),
                lastActivity: s.lastActivity
            };
        });
        
        res.json({
            success: true,
            customers: enriched
        });
    } catch (err) {
        console.error('Customer summary error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 🔍 ANALYZE TEXT SENTIMENT (For testing) - ADDED
// ============================================================
router.post('/analyze/text', adminAuth, async (req, res) => {
    try {
        const { text } = req.body;
        
        if (!text) {
            return res.status(400).json({
                success: false,
                message: 'Text is required'
            });
        }
        
        // Use the sentiment service to analyze
        const result = sentimentService.analyzeSentiment(text);
        
        // Log the analysis for testing purposes
        try {
            const sentimentLog = new SentimentLog({
                entityType: 'test',
                entityId: null,
                text: text.substring(0, 500),
                sentiment: result.sentiment,
                confidence: result.confidence,
                scores: result.scores,
                isUrgent: result.isUrgent,
                isAngry: result.isAngry,
                escalationLevel: result.escalationLevel,
                matchedKeywords: result.matchedKeywords,
                nlpScore: result.nlpScore,
                metadata: {
                    testedBy: req.user.name || req.user.email || 'Unknown',
                    testedAt: new Date()
                }
            });
            await sentimentLog.save();
        } catch (logErr) {
            // Don't fail the request if logging fails
            console.error('⚠️ Failed to save test log:', logErr.message);
        }
        
        res.json({
            success: true,
            data: result,
            message: 'Text analyzed successfully'
        });
        
    } catch (err) {
        console.error('❌ Analyze text error:', err);
        res.status(500).json({
            success: false,
            message: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

// ============================================================
// 📊 BULK ANALYZE TICKETS WITH FILTERS
// ============================================================
router.post('/analyze/bulk', adminAuth, async (req, res) => {
    try {
        const { status, priority, category, limit = 100 } = req.body;
        
        let query = {};
        if (status) query.status = status;
        if (priority) query.priority = priority;
        if (category) query.category = category;
        
        const tickets = await Ticket.find(query)
            .limit(parseInt(limit));
        
        if (tickets.length === 0) {
            return res.json({
                success: true,
                message: 'No tickets found matching the criteria',
                analyzed: 0,
                errors: 0,
                total: 0,
                results: []
            });
        }
        
        let analyzed = 0;
        let errors = 0;
        const results = [];
        
        for (const ticket of tickets) {
            try {
                const result = await sentimentService.analyzeTicket(ticket._id);
                if (result) {
                    analyzed++;
                    results.push({
                        ticketNumber: ticket.ticketNumber,
                        title: ticket.title.substring(0, 50),
                        sentiment: result.sentiment.sentiment,
                        confidence: result.sentiment.confidence,
                        isUrgent: result.sentiment.isUrgent,
                        isAngry: result.sentiment.isAngry,
                        escalationLevel: result.sentiment.escalationLevel
                    });
                }
            } catch (err) {
                errors++;
                console.error(`Error analyzing ${ticket.ticketNumber}:`, err.message);
            }
        }
        
        res.json({
            success: true,
            message: `Analyzed ${analyzed} tickets, ${errors} errors`,
            analyzed,
            errors,
            total: tickets.length,
            results: results.slice(0, 20)
        });
    } catch (err) {
        console.error('Bulk analyze error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 📊 GET SENTIMENT SCORE DISTRIBUTION
// ============================================================
router.get('/distribution', adminAuth, async (req, res) => {
    try {
        const distribution = await SentimentLog.aggregate([
            {
                $group: {
                    _id: null,
                    avgUrgency: { $avg: '$scores.urgency' },
                    avgAnger: { $avg: '$scores.anger' },
                    avgFrustration: { $avg: '$scores.frustration' },
                    avgPositive: { $avg: '$scores.positive' },
                    avgNegative: { $avg: '$scores.negative' },
                    avgSatisfaction: { $avg: '$scores.satisfaction' },
                    avgOverall: { $avg: '$scores.overall' }
                }
            }
        ]);
        
        // Get count by sentiment
        const sentimentCounts = await SentimentLog.aggregate([
            { $group: { _id: '$sentiment', count: { $sum: 1 } } }
        ]);
        
        res.json({
            success: true,
            averages: distribution[0] || {
                avgUrgency: 0,
                avgAnger: 0,
                avgFrustration: 0,
                avgPositive: 0,
                avgNegative: 0,
                avgSatisfaction: 0,
                avgOverall: 50
            },
            sentimentCounts
        });
    } catch (err) {
        console.error('Distribution error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

console.log('✅ Sentiment routes loaded successfully!');

module.exports = router;