const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    shipmentId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Shipment' 
    },
    trackingNumber: { 
        type: String 
    },
    amount: { 
        type: Number, 
        required: true 
    },
    currency: { 
        type: String, 
        default: 'usd' 
    },
    paymentMethod: { 
        type: String, 
        enum: ['credit_card', 'apple_pay', 'google_pay', 'paypal', 'cash'],
        default: 'credit_card'
    },
    stripePaymentIntentId: { 
        type: String, 
        required: true, 
        unique: true 
    },
    status: { 
        type: String, 
        enum: ['pending', 'succeeded', 'failed', 'refunded', 'canceled'],
        default: 'pending' 
    },
    receiptUrl: { 
        type: String 
    },
    metadata: { 
        type: Object 
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    },
    paidAt: { 
        type: Date 
    }
});

module.exports = mongoose.model('Payment', PaymentSchema);