const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Payment = require('../models/Payment');
const Shipment = require('../models/Shipment');
const Invoice = require('../models/Invoice');
const { createNotification } = require('./notification');

// ===== PAYMENT METHODS CONFIG =====
const PAYMENT_METHODS = {
    credit_card: { 
        name: 'Credit Card', 
        icon: 'fa-credit-card', 
        color: '#4caf50',
        bg: 'linear-gradient(135deg, #D4AF37, #FFD700)'
    },
    apple_pay: { 
        name: 'Apple Pay', 
        icon: 'fa-apple', 
        color: '#000',
        bg: '#000'
    },
    google_pay: { 
        name: 'Google Pay', 
        icon: 'fa-google', 
        color: '#4285f4',
        bg: '#4285f4'
    },
    paypal: { 
        name: 'PayPal', 
        icon: 'fa-paypal', 
        color: '#003087',
        bg: '#003087'
    }
};

// ===== GET AVAILABLE PAYMENT METHODS =====
router.get('/methods', auth, async (req, res) => {
    res.json({
        success: true,
        methods: PAYMENT_METHODS
    });
});

// ===== CREATE CHECKOUT SESSION =====
router.post('/create-checkout-session', auth, async (req, res, next) => {
    try {
        const { trackingNumber, amount, paymentMethod } = req.body;
        
        console.log('📥 Create checkout request:', { trackingNumber, amount, paymentMethod });
        
        // ✅ Find shipment with userId
        const shipment = await Shipment.findOne({ 
            trackingNumber: trackingNumber,
            userId: req.user.id 
        });
        
        if (!shipment) {
            console.log('❌ Shipment not found:', { trackingNumber, userId: req.user.id });
            return res.status(404).json({ 
                success: false, 
                message: 'Shipment not found' 
            });
        }
        
        console.log('✅ Shipment found:', shipment.trackingNumber);
        
        // Calculate final amount
        let finalAmount = amount;
        if (!finalAmount && shipment.amount) {
            finalAmount = shipment.amount;
        } else if (!finalAmount) {
            finalAmount = 10 + (shipment.weight * 5);
        }
        
        const method = paymentMethod || 'credit_card';
        console.log(`💰 Payment initiated for ${trackingNumber} - Amount: $${finalAmount} - Method: ${method}`);
        
        // Create payment record
        const payment = new Payment({
            userId: req.user.id,
            shipmentId: shipment._id,
            trackingNumber: trackingNumber,
            amount: finalAmount,
            currency: 'usd',
            paymentMethod: method,
            stripePaymentIntentId: 'mock_' + Date.now(),
            status: 'pending'
        });
        await payment.save();
        
        // ✅ Redirect to payment form
        const redirectUrl = `http://localhost:5500/payment-form.html?tracking=${trackingNumber}&amount=${finalAmount}&method=${method}`;
        console.log('🔗 Redirect URL:', redirectUrl);
        
        res.json({ 
            success: true,
            url: redirectUrl,
            trackingNumber: trackingNumber,
            amount: finalAmount,
            method: method
        });
    } catch (err) {
        console.error('❌ Payment create error:', err);
        res.status(500).json({ 
            success: false, 
            message: err.message || 'Internal server error' 
        });
    }
});

// ===== MOCK WEBHOOK =====
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    res.json({ received: true });
});

// ===== MARK PAYMENT AS SUCCESSFUL =====
router.post('/mock-success', auth, async (req, res, next) => {
    try {
        const { trackingNumber, amount, paymentMethod } = req.body;
        const method = paymentMethod || 'credit_card';
        
        console.log(`📝 Processing payment for ${trackingNumber} - Amount: $${amount} - Method: ${method}`);
        
        // Update payment
        const payment = await Payment.findOneAndUpdate(
            { trackingNumber, userId: req.user.id },
            { 
                status: 'succeeded', 
                paidAt: new Date(),
                paymentMethod: method
            },
            { new: true }
        );
        
        // Update shipment
        const shipment = await Shipment.findOneAndUpdate(
            { trackingNumber },
            { isPaid: true, paidAt: new Date() },
            { new: true }
        );
        
        if (!shipment) {
            return res.status(404).json({ success: false, message: 'Shipment not found' });
        }
        
        // Generate invoice
        const finalAmount = amount || shipment.amount || 50;
        const tax = finalAmount * 0.1;
        const total = finalAmount + tax;
        
        const year = new Date().getFullYear();
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        const invoiceNumber = `INV-${year}-${random}`;
        
        let invoice = await Invoice.findOne({ trackingNumber, userId: req.user.id });
        
        if (!invoice) {
            invoice = new Invoice({
                userId: req.user.id,
                shipmentId: shipment._id,
                trackingNumber: trackingNumber,
                invoiceNumber: invoiceNumber,
                amount: finalAmount,
                tax: tax,
                total: total,
                paymentMethod: method,
                status: 'paid',
                paidAt: new Date()
            });
            await invoice.save();
            console.log(`✅ Invoice created: ${invoice.invoiceNumber} via ${method}`);
        } else {
            invoice.status = 'paid';
            invoice.paidAt = new Date();
            invoice.paymentMethod = method;
            await invoice.save();
            console.log(`✅ Invoice updated: ${invoice.invoiceNumber} via ${method}`);
        }
        
        // Create notification
        const methodNames = {
            credit_card: 'Credit Card',
            apple_pay: 'Apple Pay',
            google_pay: 'Google Pay',
            paypal: 'PayPal'
        };
        
        await createNotification(
            req.user.id,
            '💰 Payment Successful',
            `Payment of $${finalAmount} for ${trackingNumber} successful via ${methodNames[method] || 'Credit Card'}. Invoice: ${invoice.invoiceNumber}`,
            'success',
            trackingNumber
        );
        
        console.log(`✅ Payment completed for ${trackingNumber} - Amount: $${finalAmount} - Invoice: ${invoice.invoiceNumber}`);
        
        res.json({
            success: true,
            message: 'Payment recorded successfully',
            paymentMethod: method,
            invoice: {
                number: invoice.invoiceNumber,
                amount: invoice.amount,
                tax: invoice.tax,
                total: invoice.total,
                status: invoice.status,
                paymentMethod: invoice.paymentMethod
            }
        });
    } catch (err) {
        console.error('❌ Payment success error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== GET PAYMENT HISTORY =====
router.get('/history', auth, async (req, res, next) => {
    try {
        const payments = await Payment.find({ userId: req.user.id }).sort({ createdAt: -1 });
        res.json(payments);
    } catch (err) {
        next(err);
    }
});

// ===== GET PAYMENT BY TRACKING NUMBER =====
router.get('/shipment/:trackingNumber', auth, async (req, res, next) => {
    try {
        const payment = await Payment.findOne({ trackingNumber: req.params.trackingNumber });
        res.json(payment);
    } catch (err) {
        next(err);
    }
});

module.exports = router;