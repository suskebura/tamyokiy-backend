const mongoose = require('mongoose');

const AnomalyLogSchema = new mongoose.Schema({
    // What was detected
    type: {
        type: String,
        enum: [
            'too_fast_delivery',
            'repeated_failed_delivery',
            'suspicious_payment',
            'fake_delivery_proof',
            'unusual_route',
            'multiple_failed_same_customer',
            'driver_abuse',
            'payment_fraud',
            'bulk_anomaly'
        ],
        required: true
    },
    
    // Who was involved
    driverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    driverName: {
        type: String
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    userEmail: {
        type: String
    },
    
    // Shipment details
    trackingNumber: {
        type: String,
        index: true
    },
    shipmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shipment'
    },
    
    // Anomaly details
    severity: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
    },
    score: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    description: {
        type: String,
        required: true
    },
    evidence: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    
    // Status
    status: {
        type: String,
        enum: ['detected', 'investigating', 'confirmed', 'false_alarm', 'resolved'],
        default: 'detected'
    },
    investigatedBy: {
        type: String,
        default: null
    },
    investigatedAt: {
        type: Date,
        default: null
    },
    resolvedAt: {
        type: Date,
        default: null
    },
    notes: {
        type: String,
        default: null
    },
    
    // Metadata
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Indexes for faster queries
AnomalyLogSchema.index({ driverId: 1, createdAt: -1 });
AnomalyLogSchema.index({ severity: 1, status: 1 });
AnomalyLogSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model('AnomalyLog', AnomalyLogSchema);