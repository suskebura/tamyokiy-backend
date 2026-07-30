const mongoose = require('mongoose');

const DriverLocationSchema = new mongoose.Schema({
    driverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    driverName: {
        type: String,
        required: true
    },
    driverEmail: {
        type: String,
        required: true
    },
    vehicleType: {
        type: String,
        default: 'Standard Vehicle'
    },
    lat: {
        type: Number,
        required: true
    },
    lng: {
        type: Number,
        required: true
    },
    accuracy: {
        type: Number,
        default: 0
    },
    speed: {
        type: Number,
        default: 0
    },
    heading: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['online', 'offline', 'delivering', 'busy'],
        default: 'offline'
    },
    routeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Route',
        default: null
    },
    trackingNumber: {
        type: String,
        default: null
    },
    address: {
        type: String,
        default: null
    },
    history: [{
        lat: Number,
        lng: Number,
        speed: Number,
        timestamp: {
            type: Date,
            default: Date.now
        }
    }],
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// ✅ ADD THIS METHOD
DriverLocationSchema.methods.addToHistory = function(lat, lng, speed) {
    this.history.push({
        lat: lat,
        lng: lng,
        speed: speed || 0,
        timestamp: new Date()
    });
    if (this.history.length > 100) {
        this.history = this.history.slice(-100);
    }
};

// ✅ Indexes
DriverLocationSchema.index({ driverId: 1, updatedAt: -1 });
DriverLocationSchema.index({ trackingNumber: 1 });

// ✅ EXPORT
module.exports = mongoose.model('DriverLocation', DriverLocationSchema);