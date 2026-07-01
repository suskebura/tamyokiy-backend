const mongoose = require('mongoose');

const InvoiceSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    shipmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shipment',
        required: true
    },
    trackingNumber: {
        type: String,
        required: true
    },
    invoiceNumber: {
        type: String,
        unique: true,
        sparse: true
    },
    amount: {
        type: Number,
        required: true
    },
    tax: {
        type: Number,
        default: 0
    },
    total: {
        type: Number,
        required: true
    },
    paymentMethod: {
        type: String,
        enum: ['credit_card', 'apple_pay', 'google_pay', 'paypal', 'cash'],
        default: 'credit_card'
    },
    status: {
        type: String,
        enum: ['paid', 'unpaid', 'cancelled'],
        default: 'unpaid'
    },
    paidAt: {
        type: Date,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// ✅ Generate invoice number before saving
InvoiceSchema.pre('save', function(next) {
    console.log('📄 Generating invoice number...');
    if (!this.invoiceNumber) {
        const year = new Date().getFullYear();
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        this.invoiceNumber = `INV-${year}-${random}`;
        console.log(`✅ Invoice number generated: ${this.invoiceNumber}`);
    }
    next();
});

// ✅ Also handle if invoiceNumber is still missing
InvoiceSchema.pre('validate', function(next) {
    if (!this.invoiceNumber) {
        const year = new Date().getFullYear();
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        this.invoiceNumber = `INV-${year}-${random}`;
    }
    next();
});

module.exports = mongoose.model('Invoice', InvoiceSchema);