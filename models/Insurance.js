// models/Insurance.js - FIXED
const mongoose = require('mongoose');

const insuranceSchema = new mongoose.Schema({
    claimNumber: {
        type: String,
        unique: true,
        // ✅ REMOVE required: true - it will be auto-generated
    },
    trackingNumber: {
        type: String,
        required: true,
        index: true
    },
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    customerName: {
        type: String,
        required: true
    },
    customerEmail: {
        type: String,
        required: true
    },
    reason: {
        type: String,
        required: true,
        enum: ['damaged', 'lost', 'wrong_item', 'defective', 'other']
    },
    description: {
        type: String,
        default: ''
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    declaredValue: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'paid'],
        default: 'pending'
    },
    rejectionReason: {
        type: String,
        default: ''
    },
    adminNote: {
        type: String,
        default: ''
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    reviewedAt: {
        type: Date
    },
    paidAt: {
        type: Date
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// ============================================================
// ✅ AUTO-GENERATE CLAIM NUMBER BEFORE SAVE
// ============================================================
insuranceSchema.pre('save', function(next) {
    // Only generate if claimNumber is not set
    if (!this.claimNumber) {
        const year = new Date().getFullYear();
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        this.claimNumber = `CLM-${year}-${random}`;
    }
    this.updatedAt = new Date();
    next();
});

// ============================================================
// ✅ ADD INDEXES
// ============================================================
insuranceSchema.index({ claimNumber: 1 }, { unique: true });
insuranceSchema.index({ trackingNumber: 1 });
insuranceSchema.index({ customerId: 1 });
insuranceSchema.index({ status: 1 });

module.exports = mongoose.model('Insurance', insuranceSchema);