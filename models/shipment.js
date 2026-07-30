const mongoose = require('mongoose');

const ShipmentSchema = new mongoose.Schema({
    trackingNumber: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    senderName: { type: String, required: true },
    senderAddress: { type: String, required: true },
    senderPhone: { type: String, default: '' },
    senderEmail: { type: String, default: '' },
    receiverName: { type: String, required: true },
    receiverAddress: { type: String, required: true },
    receiverPhone: { type: String, default: '' },
    receiverEmail: { type: String, default: '' },
    weight: { type: Number, default: 0 },
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
    // 📦 BULK UPLOAD FIELDS
    // ============================================================
    bulkUpload: {
        type: Boolean,
        default: false
    },
    bulkBatchId: {
        type: String,
        default: null
    },
    bulkRowIndex: {
        type: Number,
        default: null
    },
    
    // ============================================================
    // 🔄 RECURRING SHIPMENT FIELDS
    // ============================================================
    recurring: {
        type: Boolean,
        default: false
    },
    recurringSchedule: {
        frequency: {
            type: String,
            enum: ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'custom'],
            default: null
        },
        daysOfWeek: {
            type: [String],
            default: []
        },
        daysOfMonth: {
            type: [Number],
            default: []
        },
        intervalDays: {
            type: Number,
            default: 0
        },
        startDate: {
            type: Date,
            default: null
        },
        endDate: {
            type: Date,
            default: null
        },
        nextPickupDate: {
            type: Date,
            default: null
        },
        lastPickupDate: {
            type: Date,
            default: null
        },
        pickupTimeWindow: {
            start: { type: String, default: '09:00' },
            end: { type: String, default: '17:00' }
        },
        preferredDriver: {
            type: String,
            default: ''
        },
        specialInstructions: {
            type: String,
            default: ''
        }
    },
    recurringContractId: {
        type: String,
        default: null
    },
    recurringParentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'RecurringShipment',
        default: null
    },
    recurringInstanceNumber: {
        type: Number,
        default: 0
    },
    
    // ============================================================
    // 📦 RETURNS / REVERSE LOGISTICS FIELDS
    // ============================================================
    isReturn: {
        type: Boolean,
        default: false
    },
    returnReason: {
        type: String,
        enum: ['damaged', 'wrong_item', 'not_delivered', 'defective', 'changed_mind', 'other'],
        default: null
    },
    returnDescription: {
        type: String,
        default: ''
    },
    returnStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'completed'],
        default: null
    },
    returnApprovedAt: {
        type: Date,
        default: null
    },
    returnRejectedAt: {
        type: Date,
        default: null
    },
    returnRejectionReason: {
        type: String,
        default: ''
    },
    returnCompletedAt: {
        type: Date,
        default: null
    },
    originalShipmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shipment',
        default: null
    },
    returnLabelGenerated: {
        type: Boolean,
        default: false
    },
    returnLabelUrl: {
        type: String,
        default: null
    },
    
    // ============================================================
    // 🛡️ INSURANCE FIELDS
    // ============================================================
    insuranceClaimId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Insurance',
        default: null
    },
    declaredValue: {
        type: Number,
        default: 0
    },
    insured: {
        type: Boolean,
        default: false
    },
    insurancePolicyNumber: {
        type: String,
        default: null
    },
    insurancePremium: {
        type: Number,
        default: 0
    },
    insuranceCoverageAmount: {
        type: Number,
        default: 0
    },
    
    // ============================================================
    // 🌿 CARBON FOOTPRINT FIELDS
    // ============================================================
    shippingTier: {
        type: String,
        enum: ['standard', 'express', 'overnight'],
        default: 'standard'
    },
    ecoOption: {
        type: String,
        enum: ['standard', 'eco', 'premium-eco'],
        default: 'standard'
    },
    carbonEmissions: {
        co2: { type: Number, default: 0 },
        co2e: { type: Number, default: 0 },
        offsetCost: { type: Number, default: 0 }
    },
    carbonOffset: {
        type: Boolean,
        default: false
    },
    carbonFootprintId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CarbonFootprint',
        default: null
    },
    carbonData: {
        co2: { type: Number, default: 0 },
        co2e: { type: Number, default: 0 },
        ecoFriendly: { type: Boolean, default: false },
        ecoTier: { type: String, enum: ['gold', 'silver', 'bronze', 'standard'], default: 'standard' },
        calculatedAt: { type: Date, default: null }
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
    assignmentAttempts: { 
        type: Number, 
        default: 0 
    },
    lastAssignmentAttempt: { 
        type: Date, 
        default: null 
    },
    
    // ===== ASSIGNMENT STATUS =====
    assignmentStatus: {
        type: String,
        enum: ['pending', 'accepted', 'rejected', 'completed'],
        default: 'pending'
    },
    rejectionReason: {
        type: String,
        default: null
    },
    rejectedAt: {
        type: Date,
        default: null
    },
    acceptedAt: {
        type: Date,
        default: null
    },
    completedAt: {
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
    
    // ✅ UPDATED: Added 'eco' to serviceType enum
    serviceType: { 
        type: String, 
        enum: ['standard', 'express', 'overnight', 'eco'],
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
    // 🆕 PROXIMITY NOTIFICATION FIELD
    // ============================================================
    lastProximityNotified: {
        type: Date,
        default: null
    },
    
    // ============================================================
    createdAt: { type: Date, default: Date.now },

    // ============================================================
    // 🆕 LOCATION COORDINATES
    // ============================================================
    senderLat: { type: Number, default: null },
    senderLng: { type: Number, default: null },
    receiverLat: { type: Number, default: null },
    receiverLng: { type: Number, default: null },

    // ============================================================
    // 🤖 ETA PREDICTION & DELAY RISK FIELDS
    // ============================================================
    realTimeETA: {
        estimatedAt: { type: Date, default: null },
        minutesLeft: { type: Number, default: null },
        confidence: { type: Number, default: null },
        updatedAt: { type: Date, default: null }
    },

    delayRisk: {
        score: { type: Number, default: 0 },
        level: { 
            type: String, 
            enum: ['low', 'medium', 'high', 'critical'], 
            default: 'low' 
        },
        factors: { type: [String], default: [] },
        predictedAt: { type: Date, default: null }
    },

    etaHistory: [{
        predictedAt: { type: Date },
        predictedMinutes: { type: Number },
        actualMinutes: { type: Number },
        confidence: { type: Number },
        factors: {
            trafficDuration: { type: Number },
            weatherCondition: { type: String },
            driverSpeed: { type: Number },
            timeOfDay: { type: Number },
            dayOfWeek: { type: Number },
            routeDistance: { type: Number }
        },
        wasDelayed: { type: Boolean, default: false },
        delayMinutes: { type: Number, default: 0 }
    }]
});

// ============================================================
// ✅ INDEXES FOR FASTER QUERIES
// ============================================================
ShipmentSchema.index({ trackingNumber: 1 });
ShipmentSchema.index({ userId: 1 });
ShipmentSchema.index({ status: 1 });
ShipmentSchema.index({ assignedDriver: 1 });
ShipmentSchema.index({ createdAt: -1 });
ShipmentSchema.index({ estimatedDelivery: 1 });
ShipmentSchema.index({ 'realTimeETA.updatedAt': -1 });
ShipmentSchema.index({ lastProximityNotified: 1 });
// Carbon indexes for faster queries
ShipmentSchema.index({ 'carbonEmissions.co2': -1 });
ShipmentSchema.index({ ecoOption: 1 });
ShipmentSchema.index({ carbonOffset: 1 });
ShipmentSchema.index({ 'carbonData.ecoFriendly': 1 });
// Service type index
ShipmentSchema.index({ serviceType: 1 });

// ============================================================
// 📦 BULK UPLOAD INDEXES
// ============================================================
ShipmentSchema.index({ bulkUpload: 1 });
ShipmentSchema.index({ bulkBatchId: 1 });

// ============================================================
// 🔄 RECURRING INDEXES
// ============================================================
ShipmentSchema.index({ recurring: 1 });
ShipmentSchema.index({ 'recurringSchedule.nextPickupDate': 1 });
ShipmentSchema.index({ recurringContractId: 1 });

// ============================================================
// 📦 RETURNS INDEXES
// ============================================================
ShipmentSchema.index({ isReturn: 1 });
ShipmentSchema.index({ returnStatus: 1 });
ShipmentSchema.index({ originalShipmentId: 1 });

// ============================================================
// 🛡️ INSURANCE INDEXES
// ============================================================
ShipmentSchema.index({ insuranceClaimId: 1 });
ShipmentSchema.index({ insured: 1 });

// ============================================================
// 👤 ASSIGNMENT INDEXES
// ============================================================
ShipmentSchema.index({ assignmentStatus: 1 });
ShipmentSchema.index({ assignedDriver: 1, assignmentStatus: 1 });

module.exports = mongoose.model('Shipment', ShipmentSchema);