const mongoose = require('mongoose');

const ReturnRequestSchema = new mongoose.Schema({
    originalShipmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shipment',
        required: true
    },
    trackingNumber: { type: String, required: true },
    client: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    reason: {
        type: String,
        enum: ['damaged', 'wrong_item', 'defective', 'wrong_size', 'customer_remorse', 'other'],
        required: true
    },
    description: { type: String, default: '' },
    returnType: {
        type: String,
        enum: ['pickup', 'dropoff', 'mail_in'],
        default: 'pickup'
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'picked_up', 'in_transit', 'delivered', 'completed', 'rejected'],
        default: 'pending'
    },
    returnTrackingNumber: { type: String },
    returnLabel: { type: String },
    photos: [{ type: String }],
    adminNotes: { type: String, default: '' },
    refundAmount: { type: Number, default: 0 },
    refundStatus: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'rejected'],
        default: 'pending'
    },
    createdAt: { type: Date, default: Date.now },
    completedAt: { type: Date }
});

module.exports = mongoose.model('ReturnRequest', ReturnRequestSchema);