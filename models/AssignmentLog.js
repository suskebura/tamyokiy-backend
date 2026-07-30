// backend/models/AssignmentLog.js

const mongoose = require('mongoose');

const AssignmentLogSchema = new mongoose.Schema({
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
    driverId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User',
        required: true 
    },
    driverName: { type: String, required: true },
    
    // Scoring breakdown
    score: { type: Number, required: true },
    factors: {
        proximity: { type: Number, default: 0 },
        load: { type: Number, default: 0 },
        rating: { type: Number, default: 0 },
        onTime: { type: Number, default: 0 },
        vehicleMatch: { type: Number, default: 0 }
    },
    
    // Status tracking
    status: { 
        type: String, 
        enum: ['assigned', 'accepted', 'rejected', 'timed_out', 'completed'],
        default: 'assigned'
    },
    acceptedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },
    completedAt: { type: Date, default: null },
    
    assignedAt: { type: Date, default: Date.now }
});

// Indexes for faster queries
AssignmentLogSchema.index({ trackingNumber: 1, status: 1 });
AssignmentLogSchema.index({ driverId: 1, assignedAt: -1 });

module.exports = mongoose.model('AssignmentLog', AssignmentLogSchema);