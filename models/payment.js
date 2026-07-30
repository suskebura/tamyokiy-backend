const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    trackingNumber: {
        type: String,
        required: true,
        index: true
    },
    amount: {
        type: Number,
        required: true
    },
    paymentMethod: {
        type: String,
        enum: ['credit_card', 'apple_pay', 'google_pay', 'paypal', 'bank_transfer'],
        default: 'credit_card'
    },
    status: {
        type: String,
        enum: ['pending', 'succeeded', 'failed', 'refunded'],
        default: 'pending'
    },
    // ✅ FIXED: Make stripePaymentIntentId optional
    stripePaymentIntentId: {
        type: String,
        default: null
    },
    stripePaymentMethodId: {
        type: String,
        default: null
    },
    shippingType: {
        type: String,
        enum: ['standard', 'eco', 'premium-eco'],
        default: 'standard'
    },
    offsetCarbon: {
        type: Boolean,
        default: false
    },
    carbonData: {
        co2: { type: Number, default: 0 },
        treesPlanted: { type: Number, default: 0 }
    },
    paidAt: {
        type: Date
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Payment', PaymentSchema);