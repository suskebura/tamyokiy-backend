const mongoose = require('mongoose');

const RecurringShipmentSchema = new mongoose.Schema({
    client: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    senderName: { type: String, required: true },
    senderAddress: { type: String, required: true },
    senderPhone: { type: String, default: '' },
    receiverName: { type: String, required: true },
    receiverAddress: { type: String, required: true },
    receiverPhone: { type: String, default: '' },
    weight: { type: Number, required: true },
    serviceType: {
        type: String,
        enum: ['standard', 'express', 'overnight'],
        default: 'standard'
    },
    declaredValue: { type: Number, default: 0 },
    frequency: {
        type: String,
        enum: ['daily', 'weekly', 'bi-weekly', 'monthly'],
        required: true
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    nextRunDate: { type: Date, required: true },
    lastRunDate: { type: Date },
    isActive: { type: Boolean, default: true },
    totalShipments: { type: Number, default: 0 },
    notes: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('RecurringShipment', RecurringShipmentSchema);