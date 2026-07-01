const mongoose = require('mongoose');

const WarehouseInventorySchema = new mongoose.Schema({
    warehouseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Warehouse',
        required: true
    },
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
    // Status within warehouse
    status: {
        type: String,
        enum: [
            'received',      // Arrived at warehouse
            'sorted',        // Sorted and categorized
            'packed',        // Packed for distribution
            'loaded',        // Loaded on delivery vehicle
            'dispatched',    // Left warehouse
            'delivered'      // Delivered to customer
        ],
        default: 'received'
    },
    // Location within warehouse
    location: {
        aisle: { type: String, default: null },
        shelf: { type: String, default: null },
        bin: { type: String, default: null }
    },
    // Timestamps for each stage
    receivedAt: {
        type: Date,
        default: Date.now
    },
    sortedAt: {
        type: Date,
        default: null
    },
    packedAt: {
        type: Date,
        default: null
    },
    loadedAt: {
        type: Date,
        default: null
    },
    dispatchedAt: {
        type: Date,
        default: null
    },
    deliveredAt: {
        type: Date,
        default: null
    },
    // Assigned driver for dispatch
    assignedDriverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    assignedDriverName: {
        type: String,
        default: null
    },
    // Notes
    notes: {
        type: String,
        default: null
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

// ✅ ADD INDEXES - trackingNumber already has index:true
WarehouseInventorySchema.index({ warehouseId: 1, status: 1 });
WarehouseInventorySchema.index({ assignedDriverId: 1 });

// Update timestamp on save
WarehouseInventorySchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('WarehouseInventory', WarehouseInventorySchema);