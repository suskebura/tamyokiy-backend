const mongoose = require('mongoose');

const RouteStopSchema = new mongoose.Schema({
    shipmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shipment'
    },
    trackingNumber: {
        type: String
    },
    stopOrder: {
        type: Number,
        required: true
    },
    type: {
        type: String,
        enum: ['pickup', 'delivery'],
        required: true
    },
    address: {
        type: String,
        required: true
    },
    receiverName: {
        type: String
    },
    receiverPhone: {
        type: String
    },
    status: {
        type: String,
        enum: ['pending', 'arrived', 'completed', 'skipped'],
        default: 'pending'
    },
    notes: {
        type: String,
        default: null
    },
    eta: {
        type: Date,
        default: null
    },
    actualTime: {
        type: Date,
        default: null
    },
    completedAt: {
        type: Date,
        default: null
    }
});

const RouteSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        default: null
    },
    routeNumber: {
        type: String,
        unique: true
    },
    driverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    driverName: {
        type: String,
        default: null
    },
    driverVehicle: {
        type: String,
        default: null
    },
    status: {
        type: String,
        enum: ['planned', 'in_progress', 'completed', 'cancelled'],
        default: 'planned'
    },
    stops: [RouteStopSchema],
    startLocation: {
        lat: { type: Number, default: null },
        lng: { type: Number, default: null },
        address: { type: String, default: null }
    },
    endLocation: {
        lat: { type: Number, default: null },
        lng: { type: Number, default: null },
        address: { type: String, default: null }
    },
    totalDistance: {
        type: Number,
        default: 0
    },
    estimatedDuration: {
        type: Number,
        default: 0
    },
    totalStops: {
        type: Number,
        default: 0
    },
    completedStops: {
        type: Number,
        default: 0
    },
    startedAt: {
        type: Date,
        default: null
    },
    completedAt: {
        type: Date,
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
    }
});

// ===== AUTO-GENERATE ROUTE NUMBER =====
RouteSchema.pre('save', function(next) {
    if (!this.routeNumber) {
        const year = new Date().getFullYear();
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        this.routeNumber = `R-${year}-${random}`;
    }
    next();
});

// ===== UPDATE TOTAL STOPS COUNT =====
RouteSchema.pre('save', function(next) {
    if (this.stops) {
        this.totalStops = this.stops.length;
        this.completedStops = this.stops.filter(s => s.status === 'completed').length;
    }
    next();
});

// ===== GET ROUTE PROGRESS =====
RouteSchema.methods.getProgress = function() {
    if (this.totalStops === 0) return 0;
    return Math.round((this.completedStops / this.totalStops) * 100);
};

// ===== GET REMAINING STOPS =====
RouteSchema.methods.getRemainingStops = function() {
    return this.stops.filter(s => s.status === 'pending' || s.status === 'arrived');
};

// ===== GET COMPLETED STOPS =====
RouteSchema.methods.getCompletedStops = function() {
    return this.stops.filter(s => s.status === 'completed');
};

// ===== MARK STOP AS COMPLETED =====
RouteSchema.methods.completeStop = async function(stopId, data = {}) {
    const stop = this.stops.id(stopId);
    if (!stop) throw new Error('Stop not found');
    
    stop.status = 'completed';
    stop.actualTime = new Date();
    stop.completedAt = new Date();
    if (data.notes) stop.notes = data.notes;
    
    this.completedStops = this.stops.filter(s => s.status === 'completed').length;
    
    // If all stops completed, mark route as completed
    if (this.completedStops === this.totalStops) {
        this.status = 'completed';
        this.completedAt = new Date();
    }
    
    await this.save();
    return this;
};

// ===== UPDATE ROUTE STATUS =====
RouteSchema.methods.updateStatus = async function(status) {
    this.status = status;
    if (status === 'in_progress' && !this.startedAt) {
        this.startedAt = new Date();
    }
    if (status === 'completed') {
        this.completedAt = new Date();
    }
    await this.save();
    return this;
};

module.exports = mongoose.model('Route', RouteSchema);