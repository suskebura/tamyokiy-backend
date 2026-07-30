const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Payment = require('../models/Payment');
const Shipment = require('../models/Shipment');
const Invoice = require('../models/Invoice');
// ❌ REMOVE THIS LINE: const { createNotification } = require('./notification');

// ============================================================
// ✅ NOTIFICATION HELPER (inline to avoid circular dependency)
// ============================================================
async function createNotification(userId, title, message, type = 'info', link = null) {
    try {
        const Notification = require('../models/Notification');
        const notification = new Notification({
            userId: userId,
            title: title,
            message: message,
            type: type,
            link: link,
            read: false,
            createdAt: new Date()
        });
        await notification.save();
        return notification;
    } catch (err) {
        console.error('❌ Failed to create notification:', err.message);
        return null;
    }
}

// ============================================================
// 🌿 CARBON CALCULATION FUNCTION
// ============================================================
const calculateCarbonPayment = (shippingOption, weight, distance) => {
    // Base CO2 calculation: distance * emission factor * (weight / 100)
    const baseCO2 = distance * 0.15 * (weight / 100);
    
    const options = {
        standard: { 
            co2: baseCO2, 
            price: 100, 
            fee: 0,
            label: 'Standard',
            ecoFriendly: false,
            tier: 'standard'
        },
        eco: { 
            co2: baseCO2 * 0.53, 
            price: 120, 
            fee: 20,
            label: 'Eco',
            ecoFriendly: true,
            tier: 'silver',
            saving: '47%'
        },
        'premium-eco': { 
            co2: baseCO2 * 0.18, 
            price: 150, 
            fee: 50,
            label: 'Premium Eco',
            ecoFriendly: true,
            tier: 'gold',
            saving: '82%'
        }
    };
    
    const result = options[shippingOption] || options.standard;
    
    // Calculate trees needed to offset
    const treesNeeded = result.co2 * 0.045; // 0.045 trees per kg CO2
    
    return {
        ...result,
        weight,
        distance,
        treesNeeded: parseFloat(treesNeeded.toFixed(2)),
        offsetCost: result.co2 * 0.02, // $0.02 per kg CO2
        equivalences: {
            trees: parseFloat(treesNeeded.toFixed(2)),
            carsOffRoad: parseFloat((result.co2 * 0.0000045).toFixed(5)),
            flights: parseFloat((result.co2 * 0.00000015).toFixed(6))
        }
    };
};

// ============================================================
// 💰 PAYMENT METHODS CONFIG
// ============================================================
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

// ============================================================
// 📊 GET AVAILABLE PAYMENT METHODS
// ============================================================
router.get('/methods', auth, async (req, res) => {
    res.json({
        success: true,
        methods: PAYMENT_METHODS
    });
});

// ============================================================
// 💰 GET CARBON PAYMENT STATS
// ============================================================
router.get('/carbon-stats', auth, async (req, res) => {
    try {
        const payments = await Payment.find({ 
            userId: req.user.id,
            status: 'succeeded'
        });

        let totalCO2 = 0;
        let totalOffsetCost = 0;
        let ecoShipments = 0;

        payments.forEach(p => {
            if (p.carbon) {
                totalCO2 += p.carbon.co2 || 0;
                totalOffsetCost += p.carbon.offsetCost || 0;
                if (p.carbon.shippingOption === 'eco' || p.carbon.shippingOption === 'premium-eco') {
                    ecoShipments++;
                }
            }
        });

        const treesPlanted = totalCO2 * 0.045;

        res.json({
            success: true,
            data: {
                totalCO2: parseFloat(totalCO2.toFixed(2)),
                totalOffsetCost: parseFloat(totalOffsetCost.toFixed(2)),
                treesPlanted: parseFloat(treesPlanted.toFixed(2)),
                ecoShipments,
                totalPayments: payments.length
            }
        });
    } catch (err) {
        console.error('❌ Error fetching carbon stats:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 🌿 CREATE PAYMENT WITH CARBON CALCULATION
// ============================================================
router.post('/create', auth, async (req, res) => {
    try {
        const { 
            trackingNumber, 
            amount, 
            paymentMethod,
            shippingOption = 'standard',
            offsetCarbon = false
        } = req.body;

        console.log('📥 Create payment with carbon:', { 
            trackingNumber, 
            amount, 
            paymentMethod,
            shippingOption,
            offsetCarbon
        });

        // Find shipment
        const shipment = await Shipment.findOne({ 
            trackingNumber: trackingNumber,
            userId: req.user.id 
        });

        if (!shipment) {
            return res.status(404).json({ 
                success: false, 
                message: 'Shipment not found' 
            });
        }

        // Calculate carbon
        const weight = shipment.weight || 10;
        const distance = shipment.distance || 50;
        const carbon = calculateCarbonPayment(shippingOption, weight, distance);

        // Calculate offset cost
        let offsetCost = 0;
        let treesPlanted = 0;
        if (offsetCarbon) {
            offsetCost = carbon.offsetCost;
            treesPlanted = carbon.treesNeeded;
        }

        // Calculate total amount
        const shippingPrice = carbon.price;
        const ecoFee = carbon.fee;
        const totalAmount = shippingPrice + ecoFee + (offsetCarbon ? offsetCost : 0);

        console.log('🌿 Carbon calculation:', {
            shippingOption,
            co2: carbon.co2,
            shippingPrice,
            ecoFee,
            offsetCost,
            totalAmount,
            treesPlanted
        });

        // Create payment record
        const payment = new Payment({
            userId: req.user.id,
            shipmentId: shipment._id,
            trackingNumber: trackingNumber,
            amount: totalAmount,
            currency: 'usd',
            paymentMethod: paymentMethod || 'credit_card',
            status: 'pending',
            carbon: {
                co2: parseFloat(carbon.co2.toFixed(2)),
                offset: offsetCarbon,
                offsetCost: parseFloat(offsetCost.toFixed(2)),
                shippingOption: shippingOption,
                treesPlanted: parseFloat(treesPlanted.toFixed(2)),
                equivalences: {
                    trees: parseFloat(carbon.equivalences.trees.toFixed(2)),
                    carsOffRoad: parseFloat(carbon.equivalences.carsOffRoad.toFixed(5)),
                    flights: parseFloat(carbon.equivalences.flights.toFixed(6))
                }
            },
            shippingOption: shippingOption,
            ecoFriendly: carbon.ecoFriendly,
            ecoTier: carbon.tier
        });

        await payment.save();

        // Update shipment with carbon data
        shipment.carbonData = {
            co2: carbon.co2,
            shippingOption: shippingOption,
            ecoFriendly: carbon.ecoFriendly,
            offset: offsetCarbon,
            treesPlanted: treesPlanted
        };
        await shipment.save();

        // Redirect to payment form
        const redirectUrl = `http://localhost:5500/payment-form.html?tracking=${trackingNumber}&amount=${totalAmount}&method=${paymentMethod || 'credit_card'}&shipping=${shippingOption}&offset=${offsetCarbon}`;

        res.json({
            success: true,
            url: redirectUrl,
            trackingNumber: trackingNumber,
            amount: totalAmount,
            method: paymentMethod || 'credit_card',
            carbon: {
                co2: carbon.co2,
                offset: offsetCarbon,
                offsetCost: offsetCost,
                treesPlanted: treesPlanted,
                shippingOption: shippingOption,
                ecoFriendly: carbon.ecoFriendly,
                tier: carbon.tier
            }
        });

    } catch (err) {
        console.error('❌ Payment create error:', err);
        res.status(500).json({ 
            success: false, 
            message: err.message || 'Internal server error' 
        });
    }
});

// ============================================================
// 🔄 CREATE CHECKOUT SESSION (Legacy - redirects to new flow)
// ============================================================
router.post('/create-checkout-session', auth, async (req, res) => {
    try {
        const { trackingNumber, amount, paymentMethod } = req.body;
        
        console.log('📥 Create checkout request:', { trackingNumber, amount, paymentMethod });
        
        const shipment = await Shipment.findOne({ 
            trackingNumber: trackingNumber,
            userId: req.user.id 
        });
        
        if (!shipment) {
            return res.status(404).json({ 
                success: false, 
                message: 'Shipment not found' 
            });
        }
        
        let finalAmount = amount || shipment.amount || 50;
        const method = paymentMethod || 'credit_card';
        
        // Create payment record
        const payment = new Payment({
            userId: req.user.id,
            shipmentId: shipment._id,
            trackingNumber: trackingNumber,
            amount: finalAmount,
            currency: 'usd',
            paymentMethod: method,
            status: 'pending'
        });
        await payment.save();
        
        // Redirect to payment form with carbon options
        const redirectUrl = `http://localhost:5500/payment.html?tracking=${trackingNumber}&amount=${finalAmount}&method=${method}`;
        
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

// ============================================================
// ✅ MARK PAYMENT AS SUCCESSFUL
// ============================================================
router.post('/mock-success', auth, async (req, res) => {
    try {
        const { trackingNumber, amount, paymentMethod, shippingOption, offsetCarbon } = req.body;
        const method = paymentMethod || 'credit_card';
        const option = shippingOption || 'standard';
        const offset = offsetCarbon || false;
        
        console.log(`📝 Processing payment for ${trackingNumber} - Amount: $${amount} - Method: ${method} - Shipping: ${option}`);

        // Get shipment
        const shipment = await Shipment.findOne({ 
            trackingNumber: trackingNumber,
            userId: req.user.id 
        });

        if (!shipment) {
            return res.status(404).json({ success: false, message: 'Shipment not found' });
        }

        // Calculate carbon
        const weight = shipment.weight || 10;
        const distance = shipment.distance || 50;
        const carbon = calculateCarbonPayment(option, weight, distance);

        // Update payment
        const payment = await Payment.findOneAndUpdate(
            { trackingNumber, userId: req.user.id },
            { 
                status: 'succeeded', 
                paidAt: new Date(),
                paymentMethod: method,
                shippingOption: option,
                carbon: {
                    co2: carbon.co2,
                    offset: offset,
                    offsetCost: offset ? carbon.offsetCost : 0,
                    shippingOption: option,
                    treesPlanted: offset ? carbon.treesNeeded : 0,
                    equivalences: carbon.equivalences
                },
                ecoFriendly: carbon.ecoFriendly,
                ecoTier: carbon.tier
            },
            { new: true }
        );

        // Update shipment
        shipment.isPaid = true;
        shipment.paidAt = new Date();
        shipment.carbonData = {
            co2: carbon.co2,
            shippingOption: option,
            ecoFriendly: carbon.ecoFriendly,
            offset: offset,
            treesPlanted: offset ? carbon.treesNeeded : 0
        };
        await shipment.save();

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
                paidAt: new Date(),
                carbonData: {
                    co2: carbon.co2,
                    shippingOption: option,
                    ecoFriendly: carbon.ecoFriendly,
                    offset: offset,
                    treesPlanted: offset ? carbon.treesNeeded : 0
                }
            });
            await invoice.save();
        } else {
            invoice.status = 'paid';
            invoice.paidAt = new Date();
            invoice.paymentMethod = method;
            invoice.carbonData = {
                co2: carbon.co2,
                shippingOption: option,
                ecoFriendly: carbon.ecoFriendly,
                offset: offset,
                treesPlanted: offset ? carbon.treesNeeded : 0
            };
            await invoice.save();
        }

        // Create notification - NOW USING THE INLINE FUNCTION
        const methodNames = {
            credit_card: 'Credit Card',
            apple_pay: 'Apple Pay',
            google_pay: 'Google Pay',
            paypal: 'PayPal'
        };

        const ecoMsg = carbon.ecoFriendly ? ' 🌿 Eco-friendly shipping selected!' : '';
        
        await createNotification(
            req.user.id,
            '💰 Payment Successful',
            `Payment of $${finalAmount} for ${trackingNumber} successful via ${methodNames[method] || 'Credit Card'}. Invoice: ${invoice.invoiceNumber}${ecoMsg}`,
            'success',
            trackingNumber
        );

        console.log(`✅ Payment completed for ${trackingNumber} - Amount: $${finalAmount} - CO2: ${carbon.co2.toFixed(2)}kg${ecoMsg}`);

        res.json({
            success: true,
            message: 'Payment recorded successfully',
            paymentMethod: method,
            carbon: {
                co2: carbon.co2,
                ecoFriendly: carbon.ecoFriendly,
                tier: carbon.tier,
                offset: offset,
                treesPlanted: offset ? carbon.treesNeeded : 0
            },
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

// ============================================================
// 📊 GET PAYMENT HISTORY
// ============================================================
router.get('/history', auth, async (req, res) => {
    try {
        const payments = await Payment.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .populate('shipmentId', 'trackingNumber senderName receiverName weight');
        
        res.json({
            success: true,
            data: payments
        });
    } catch (err) {
        console.error('❌ Error fetching payment history:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 📊 GET PAYMENT BY TRACKING NUMBER
// ============================================================
router.get('/shipment/:trackingNumber', auth, async (req, res) => {
    try {
        const payment = await Payment.findOne({ 
            trackingNumber: req.params.trackingNumber,
            userId: req.user.id
        });
        
        if (!payment) {
            return res.status(404).json({ 
                success: false, 
                message: 'Payment not found' 
            });
        }
        
        res.json({
            success: true,
            data: payment
        });
    } catch (err) {
        console.error('❌ Error fetching payment:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 📊 GET CARBON FOOTPRINT SUMMARY
// ============================================================
router.get('/carbon-summary', auth, async (req, res) => {
    try {
        const payments = await Payment.find({ 
            userId: req.user.id,
            status: 'succeeded'
        });

        let totalCO2 = 0;
        let totalOffsetCO2 = 0;
        let ecoShipments = 0;
        let totalTreesPlanted = 0;
        let totalOffsetCost = 0;
        let standardShipments = 0;

        payments.forEach(p => {
            if (p.carbon) {
                totalCO2 += p.carbon.co2 || 0;
                if (p.carbon.offset) {
                    totalOffsetCO2 += p.carbon.co2 || 0;
                    totalOffsetCost += p.carbon.offsetCost || 0;
                    totalTreesPlanted += p.carbon.treesPlanted || 0;
                }
                if (p.ecoFriendly) {
                    ecoShipments++;
                } else {
                    standardShipments++;
                }
            }
        });

        const totalPayments = payments.length;
        const ecoPercentage = totalPayments > 0 ? (ecoShipments / totalPayments) * 100 : 0;
        const carbonSaved = totalCO2 * 0.53; // Assuming eco option saves ~47%

        res.json({
            success: true,
            data: {
                totalCO2: parseFloat(totalCO2.toFixed(2)),
                totalOffsetCO2: parseFloat(totalOffsetCO2.toFixed(2)),
                totalOffsetCost: parseFloat(totalOffsetCost.toFixed(2)),
                totalTreesPlanted: parseFloat(totalTreesPlanted.toFixed(2)),
                ecoShipments,
                standardShipments,
                totalPayments,
                ecoPercentage: parseFloat(ecoPercentage.toFixed(1)),
                carbonSaved: parseFloat(carbonSaved.toFixed(2)),
                equivalences: {
                    trees: parseFloat((totalCO2 * 0.045).toFixed(2)),
                    carsOffRoad: parseFloat((totalCO2 * 0.0000045).toFixed(5)),
                    flights: parseFloat((totalCO2 * 0.00000015).toFixed(6))
                }
            }
        });
    } catch (err) {
        console.error('❌ Error fetching carbon summary:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 📊 MOCK WEBHOOK
// ============================================================
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    res.json({ received: true });
});

module.exports = router;