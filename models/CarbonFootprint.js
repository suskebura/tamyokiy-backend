const mongoose = require('mongoose');

const CarbonFootprintSchema = new mongoose.Schema({
    shipmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shipment',
        required: true,
        index: true
    },
    clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    totalEmissions: {
        co2: { type: Number, default: 0 },
        co2e: { type: Number, default: 0 },
        nox: { type: Number, default: 0 },
        pm: { type: Number, default: 0 }
    },
    activity: {
        distance: { type: Number, default: 0 },
        weight: { type: Number, default: 0 },
        duration: { type: Number, default: 0 }
    },
    ecoFriendly: { 
        type: Boolean, 
        default: false 
    },
    ecoTier: {
        type: String,
        enum: ['standard', 'eco', 'premium-eco'],
        default: 'standard'
    },
    offset: {
        offsetAmount: { type: Number, default: 0 },
        offsetProvider: { type: String },
        offsetId: { type: String },
        offsetCost: { type: Number }
    },
    comparison: {
        standardEmissions: { type: Number },
        ecoSavings: { type: Number }
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

CarbonFootprintSchema.index({ clientId: 1, createdAt: -1 });
CarbonFootprintSchema.index({ shipmentId: 1 });

module.exports = mongoose.model('CarbonFootprint', CarbonFootprintSchema);