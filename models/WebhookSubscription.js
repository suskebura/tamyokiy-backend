// models/WebhookSubscription.js
// 🔔 Webhook Subscriptions

const mongoose = require('mongoose');

const WebhookSubscriptionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    url: {
        type: String,
        required: true,
        trim: true
    },
    // Events to subscribe to
    events: [{
        type: String,
        enum: [
            'shipment.created',
            'shipment.updated',
            'shipment.status_changed',
            'shipment.delivered',
            'shipment.failed',
            'driver.assigned',
            'payment.succeeded',
            'payment.failed',
            'rating.created',
            'ticket.created',
            'ticket.updated',
            'anomaly.detected'
        ]
    }],
    // Headers to include
    headers: {
        type: Map,
        of: String,
        default: new Map()
    },
    // Status
    isActive: {
        type: Boolean,
        default: true
    },
    // Retry configuration
    retryConfig: {
        maxAttempts: { type: Number, default: 3 },
        retryDelay: { type: Number, default: 5000 }, // milliseconds
        timeout: { type: Number, default: 10000 } // milliseconds
    },
    // Statistics
    lastTriggered: {
        type: Date,
        default: null
    },
    successCount: {
        type: Number,
        default: 0
    },
    failureCount: {
        type: Number,
        default: 0
    },
    lastError: {
        type: String,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Method to check if event is subscribed
WebhookSubscriptionSchema.methods.hasEvent = function(event) {
    return this.events.includes(event);
};

module.exports = mongoose.model('WebhookSubscription', WebhookSubscriptionSchema);