const mongoose = require('mongoose');

const ShipmentSchema = new mongoose.Schema({
    trackingNumber: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    senderName: { type: String, required: true },
    senderAddress: { type: String, required: true },
    receiverName: { type: String, required: true },
    receiverAddress: { type: String, required: true },
    weight: { type: Number },
    amount: { type: Number, default: 0 },
    // ===== 🔥 COST FIELD FOR PROFIT ANALYSIS =====
    cost: { type: Number, default: 0 },
    isPaid: { type: Boolean, default: false },
    paidAt: { type: Date },
    status: { 
        type: String, 
        enum: ['pending', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'cancelled'],
        default: 'pending'
    },
    // ============================================================
    // 🆕 QR CODE & BARCODE FIELDS
    // ============================================================
    qrCode: {
        type: String,
        default: null
    },
    barcode: {
        type: String,
        default: null
    },
    qrCodeGeneratedAt: {
        type: Date,
        default: null
    },
    // ============================================================
    trackingHistory: [
        {
            status: { type: String, required: true },
            note: { type: String },
            updatedAt: { type: Date, default: Date.now }
        }
    ],
    notes: [{
        text: { type: String, required: true },
        createdBy: { type: String, required: true },
        createdAt: { type: Date, default: Date.now }
    }],
    // ===== DELIVERY PROOF PHOTO FIELDS (UP TO 3 PHOTOS) =====
    deliveryPhoto: {
        type: String,
        default: null
    },
    deliveryPhoto2: {
        type: String,
        default: null
    },
    deliveryPhoto3: {
        type: String,
        default: null
    },
    deliveryPhotoUploadedAt: {
        type: Date,
        default: null
    },
    deliveryPhotoUploadedBy: {
        type: String,
        default: null
    },
    // ===== DRIVER ASSIGNMENT =====
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
    // ===== PROOF OF DELIVERY =====
    deliveryProof: {
        recipientName: { type: String, default: null },
        recipientSignature: { type: String, default: null },
        deliveryPhoto: { type: String, default: null },
        deliveredAt: { type: Date, default: null },
        deliveredBy: { type: String, default: null },
        deliveryNote: { type: String, default: null }
    },
    // ===== ESTIMATED DELIVERY & DISTANCE =====
    estimatedDelivery: { type: Date, default: null },
    distance: { type: Number, default: null }, // in km
    serviceType: { 
        type: String, 
        enum: ['standard', 'express', 'overnight'],
        default: 'standard'
    },
    // ============================================================
    // 🆕 FAILED DELIVERY FIELDS
    // ============================================================
    failureReason: {
        type: String,
        enum: [
            'wrong_address',
            'customer_not_home',
            'damaged',
            'lost',
            'refused',
            'failed_attempt',
            'weather',
            'vehicle_issue',
            'delayed',
            'other'
        ],
        default: null
    },
    failureNote: {
        type: String,
        default: null
    },
    failedAt: {
        type: Date,
        default: null
    },
    failedBy: {
        type: String,
        default: null
    },
    // ============================================================
    createdAt: { type: Date, default: Date.now }
});

// ✅ REMOVED DUPLICATE INDEX - trackingNumber already has unique:true

module.exports = mongoose.model('Shipment', ShipmentSchema);