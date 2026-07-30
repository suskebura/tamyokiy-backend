const mongoose = require('mongoose');

const RefundRequestSchema = new mongoose.Schema({
    shipmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shipment',
        required: true
    },
    trackingNumber: {
        type: String,
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    userEmail: {
        type: String,
        required: true
    },
    reason: {
        type: String,
        enum: ['damaged', 'wrong_delivery', 'cancelled', 'delayed', 'lost', 'incorrect_item', 'other'],
        required: true
    },
    description: {
        type: String,
        default: ''
    },
    photos: [{
        type: String
    }],
    status: {
        type: String,
        enum: ['pending', 'under_review', 'approved', 'processed', 'rejected'],
        default: 'pending'
    },
    adminNotes: {
        type: String,
        default: ''
    },
    refundAmount: {
        type: Number,
        default: 0
    },
    processedAt: {
        type: Date
    },
    requestedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('RefundRequest', RefundRequestSchema);