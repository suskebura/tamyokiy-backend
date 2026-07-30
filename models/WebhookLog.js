// models/WebhookLog.js
// 📋 Webhook Delivery Logs

const mongoose = require('mongoose');

const WebhookLogSchema = new mongoose.Schema({
    subscriptionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WebhookSubscription',
        required: true
    },
    event: {
        type: String,
        required: true
    },
    payload: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    url: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['success', 'failed', 'pending', 'retry'],
        default: 'pending'
    },
    responseStatus: {
        type: Number,
        default: null
    },
    responseBody: {
        type: String,
        default: null
    },
    attempt: {
        type: Number,
        default: 1
    },
    error: {
        type: String,
        default: null
    },
    duration: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('WebhookLog', WebhookLogSchema);