// models/DriverLocation.js

const mongoose = require('mongoose');

const DriverLocationSchema = new mongoose.Schema({
    driverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
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
        default: null
    },
    lat: {
        type: Number,
        required: true,
        default: 0
    },
    lng: {
        type: Number,
        required: true,
        default: 0
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
    updatedAt: {
        type: Date,
        default: Date.now
    },
    history: [{
        lat: { type: Number },
        lng: { type: Number },
        timestamp: { type: Date, default: Date.now },
        speed: { type: Number, default: 0 }
    }]
});

// Limit history to last 100 entries
DriverLocationSchema.methods.addToHistory = function(lat, lng, speed = 0) {
    this.history.push({ lat, lng, speed, timestamp: new Date() });
    if (this.history.length > 100) {
        this.history = this.history.slice(-100);
    }
};

module.exports = mongoose.model('DriverLocation', DriverLocationSchema);