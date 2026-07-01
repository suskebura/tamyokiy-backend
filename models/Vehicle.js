const mongoose = require('mongoose');

const VehicleSchema = new mongoose.Schema({
    // Basic Info
    plateNumber: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },
    vehicleType: {
        type: String,
        enum: ['bike', 'car', 'van', 'truck', 'heavy_truck'],
        required: true
    },
    brand: {
        type: String,
        required: true
    },
    model: {
        type: String,
        required: true
    },
    year: {
        type: Number,
        required: true
    },
    color: {
        type: String,
        default: 'White'
    },
    
    // Capacity
    capacity: {
        weight: { type: Number, default: 0 }, // in kg
        volume: { type: Number, default: 0 }   // in cubic meters
    },
    
    // Fuel
    fuelType: {
        type: String,
        enum: ['petrol', 'diesel', 'electric', 'hybrid'],
        default: 'diesel'
    },
    fuelEfficiency: {
        type: Number, // km per liter
        default: 0
    },
    
    // Status
    status: {
        type: String,
        enum: ['active', 'inactive', 'maintenance', 'retired'],
        default: 'active'
    },
    
    // Driver Assignment
    assignedDriver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    assignedDriverName: {
        type: String,
        default: null
    },
    assignedAt: {
        type: Date,
        default: null
    },
    
    // Location (Live GPS)
    currentLocation: {
        lat: { type: Number, default: null },
        lng: { type: Number, default: null },
        address: { type: String, default: null },
        updatedAt: { type: Date, default: null }
    },
    
    // Mileage
    totalMileage: {
        type: Number,
        default: 0
    },
    lastMileageUpdate: {
        type: Date,
        default: null
    },
    
    // Maintenance
    lastMaintenance: {
        type: Date,
        default: null
    },
    nextMaintenance: {
        type: Date,
        default: null
    },
    maintenanceInterval: {
        type: Number, // in kilometers
        default: 5000
    },
    
    // Documents
    insuranceExpiry: {
        type: Date,
        default: null
    },
    inspectionExpiry: {
        type: Date,
        default: null
    },
    registrationExpiry: {
        type: Date,
        default: null
    },
    
    // Metadata
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

// Update timestamp on save
VehicleSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Get vehicle status color
VehicleSchema.methods.getStatusColor = function() {
    const colors = {
        'active': '#4caf50',
        'inactive': '#9e9e9e',
        'maintenance': '#ff9800',
        'retired': '#ff6b6b'
    };
    return colors[this.status] || '#9e9e9e';
};

// Get vehicle type icon
VehicleSchema.methods.getTypeIcon = function() {
    const icons = {
        'bike': 'fa-motorcycle',
        'car': 'fa-car',
        'van': 'fa-truck',
        'truck': 'fa-truck',
        'heavy_truck': 'fa-truck-fast'
    };
    return icons[this.vehicleType] || 'fa-car';
};

// Get vehicle type label
VehicleSchema.methods.getTypeLabel = function() {
    const labels = {
        'bike': '🏍️ Bike',
        'car': '🚗 Car',
        'van': '🚐 Van',
        'truck': '🚚 Truck',
        'heavy_truck': '🚛 Heavy Truck'
    };
    return labels[this.vehicleType] || '🚗 Car';
};

module.exports = mongoose.model('Vehicle', VehicleSchema);