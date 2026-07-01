const mongoose = require('mongoose');

const MaintenanceSchema = new mongoose.Schema({
    vehicleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Vehicle',
        required: true
    },
    vehiclePlate: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['routine', 'repair', 'emergency', 'inspection', 'oil_change', 'tire_change', 'engine_repair', 'other'],
        required: true
    },
    description: {
        type: String,
        required: true
    },
    cost: {
        type: Number,
        default: 0
    },
    mileage: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['scheduled', 'in_progress', 'completed', 'cancelled'],
        default: 'scheduled'
    },
    scheduledDate: {
        type: Date,
        required: true
    },
    completedDate: {
        type: Date,
        default: null
    },
    performedBy: {
        type: String,
        default: null
    },
    notes: {
        type: String,
        default: null
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
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

MaintenanceSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('Maintenance', MaintenanceSchema);