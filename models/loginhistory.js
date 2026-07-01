const mongoose = require('mongoose');

const LoginHistorySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    userEmail: {
        type: String,
        required: true
    },
    userName: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['success', 'failed'],
        required: true
    },
    ipAddress: {
        type: String,
        default: null
    },
    userAgent: {
        type: String,
        default: null
    },
    deviceInfo: {
        type: String,
        default: null
    },
    browser: {
        type: String,
        default: null
    },
    os: {
        type: String,
        default: null
    },
    location: {
        city: { type: String, default: null },
        country: { type: String, default: null },
        region: { type: String, default: null }
    },
    failedReason: {
        type: String,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
});

// Compound index for faster queries
LoginHistorySchema.index({ userId: 1, createdAt: -1 });
LoginHistorySchema.index({ userEmail: 1, createdAt: -1 });

module.exports = mongoose.model('LoginHistory', LoginHistorySchema);