const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// ============================================================
// 📦 Models
// ============================================================
const WebhookSubscription = mongoose.model('WebhookSubscription');
const User = mongoose.model('User');

// ============================================================
// 🔒 Middleware
// ============================================================
const getUserFromToken = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ success: false, message: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'tamyokiy_super_secret_key_2026');
        const user = await User.findById(decoded.id);
        
        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }
};

// ============================================================
// 📊 GET /api/v1/webhooks/logs - MUST BE FIRST!
// ============================================================
router.get('/logs', getUserFromToken, async (req, res) => {
    try {
        console.log('📊 Logs endpoint called');
        
        // Get user's webhooks
        const webhooks = await WebhookSubscription.find({ 
            userId: req.user._id 
        }).select('_id');

        const webhookIds = webhooks.map(w => w._id);

        // If no webhooks, return empty
        if (webhookIds.length === 0) {
            return res.json({
                success: true,
                data: [],
                stats: {
                    total: 0,
                    success: 0,
                    failed: 0,
                    pending: 0,
                    successRate: 0
                }
            });
        }

        // Try to get logs
        let logs = [];
        try {
            const WebhookLog = mongoose.model('WebhookLog');
            logs = await WebhookLog.find({
                webhookId: { $in: webhookIds }
            })
            .sort({ timestamp: -1 })
            .limit(50);
        } catch (err) {
            console.log('⚠️ WebhookLog model not available:', err.message);
        }

        const total = logs.length;
        const success = logs.filter(l => l.status === 'delivered' || l.status === 'success').length;
        const failed = logs.filter(l => l.status === 'failed' || l.status === 'failure').length;
        const pending = logs.filter(l => l.status === 'pending').length;

        res.json({
            success: true,
            data: logs,
            stats: {
                total,
                success,
                failed,
                pending,
                successRate: total > 0 ? Math.round((success / total) * 100) : 0
            }
        });
    } catch (err) {
        console.error('❌ Logs error:', err.message);
        res.json({
            success: true,
            data: [],
            stats: {
                total: 0,
                success: 0,
                failed: 0,
                pending: 0,
                successRate: 0
            }
        });
    }
});

// ============================================================
// 📋 GET /api/v1/webhooks - List all webhooks
// ============================================================
router.get('/', getUserFromToken, async (req, res) => {
    try {
        const webhooks = await WebhookSubscription.find({ 
            userId: req.user._id 
        }).sort({ createdAt: -1 });

        res.json({
            success: true,
            data: webhooks,
            count: webhooks.length
        });
    } catch (err) {
        console.error('❌ GET webhooks error:', err.message);
        res.json({
            success: true,
            data: [],
            count: 0
        });
    }
});

// ============================================================
// ➕ POST /api/v1/webhooks - Create webhook
// ============================================================
router.post('/', getUserFromToken, async (req, res) => {
    try {
        const { name, url, events, secret, enabled = true } = req.body;

        if (!name || !url || !events || events.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Name, URL, and at least one event are required'
            });
        }

        const webhook = new WebhookSubscription({
            userId: req.user._id,
            name,
            url,
            events,
            secret: secret || crypto.randomBytes(32).toString('hex'),
            enabled
        });

        await webhook.save();

        res.status(201).json({
            success: true,
            data: webhook,
            message: 'Webhook created successfully'
        });
    } catch (err) {
        console.error('❌ POST webhook error:', err.message);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// ============================================================
// 📋 GET /api/v1/webhooks/:id - Get single webhook
// ============================================================
router.get('/:id', getUserFromToken, async (req, res) => {
    try {
        const webhook = await WebhookSubscription.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!webhook) {
            return res.status(404).json({
                success: false,
                message: 'Webhook not found'
            });
        }

        res.json({
            success: true,
            data: webhook
        });
    } catch (err) {
        console.error('❌ GET webhook error:', err.message);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// ============================================================
// ✏️ PUT /api/v1/webhooks/:id - Update webhook
// ============================================================
router.put('/:id', getUserFromToken, async (req, res) => {
    try {
        const { name, url, events, secret, enabled } = req.body;

        const webhook = await WebhookSubscription.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!webhook) {
            return res.status(404).json({
                success: false,
                message: 'Webhook not found'
            });
        }

        if (name) webhook.name = name;
        if (url) webhook.url = url;
        if (events) webhook.events = events;
        if (secret) webhook.secret = secret;
        if (enabled !== undefined) webhook.enabled = enabled;

        await webhook.save();

        res.json({
            success: true,
            data: webhook,
            message: 'Webhook updated successfully'
        });
    } catch (err) {
        console.error('❌ PUT webhook error:', err.message);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// ============================================================
// 🗑️ DELETE /api/v1/webhooks/:id - Delete webhook
// ============================================================
router.delete('/:id', getUserFromToken, async (req, res) => {
    try {
        const webhook = await WebhookSubscription.findOneAndDelete({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!webhook) {
            return res.status(404).json({
                success: false,
                message: 'Webhook not found'
            });
        }

        res.json({
            success: true,
            message: 'Webhook deleted successfully'
        });
    } catch (err) {
        console.error('❌ DELETE webhook error:', err.message);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// ============================================================
// 🧪 POST /api/v1/webhooks/:id/test - Test webhook
// ============================================================
router.post('/:id/test', getUserFromToken, async (req, res) => {
    try {
        const webhook = await WebhookSubscription.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!webhook) {
            return res.status(404).json({
                success: false,
                message: 'Webhook not found'
            });
        }

        const testPayload = {
            event: 'test.webhook',
            timestamp: new Date().toISOString(),
            data: {
                message: 'Test webhook from TAMYOKIY Logistics',
                success: true,
                webhookId: webhook._id,
                webhookName: webhook.name
            }
        };

        let responseStatus = 200;
        let responseText = 'OK';

        try {
            const signature = crypto
                .createHmac('sha256', webhook.secret)
                .update(JSON.stringify(testPayload))
                .digest('hex');

            const response = await fetch(webhook.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Webhook-Signature': signature,
                    'X-Webhook-Id': webhook._id.toString(),
                    'X-Webhook-Event': 'test.webhook'
                },
                body: JSON.stringify(testPayload)
            });

            responseStatus = response.status;
            responseText = await response.text();
        } catch (fetchErr) {
            console.log('⚠️ Webhook fetch error:', fetchErr.message);
            responseStatus = 500;
            responseText = fetchErr.message;
        }

        res.json({
            success: responseStatus >= 200 && responseStatus < 300,
            data: {
                status: responseStatus,
                response: responseText,
                delivered: responseStatus >= 200 && responseStatus < 300
            },
            message: responseStatus >= 200 && responseStatus < 300 ? '✅ Test webhook sent successfully' : '❌ Test webhook failed'
        });
    } catch (err) {
        console.error('❌ Test webhook error:', err.message);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

module.exports = router;