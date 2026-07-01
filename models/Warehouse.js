const mongoose = require('mongoose');

const WarehouseSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },
    location: {
        address: {
            type: String,
            required: true
        },
        city: {
            type: String,
            required: true
        },
        country: {
            type: String,
            default: 'Ethiopia'
        },
        coordinates: {
            lat: { type: Number, default: null },
            lng: { type: Number, default: null }
        }
    },
    contact: {
        phone: { type: String },
        email: { type: String },
        manager: { type: String }
    },
    capacity: {
        total: { type: Number, default: 0 },
        used: { type: Number, default: 0 },
        available: { type: Number, default: 0 }
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'maintenance'],
        default: 'active'
    },
    operatingHours: {
        open: { type: String, default: '08:00' },
        close: { type: String, default: '18:00' }
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// ✅ ADD INDEXES - code already has unique:true, so no need for duplicate index
// Only keep status index
WarehouseSchema.index({ status: 1 });

module.exports = mongoose.model('Warehouse', WarehouseSchema);