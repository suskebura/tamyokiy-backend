const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const catchAsync = require('../utils/catchAsync');
const carbonService = require('../services/carbonCalculationService');

// Get models
const CarbonFootprint = mongoose.model('CarbonFootprint');
const Shipment = mongoose.model('Shipment');
const User = mongoose.model('User');

// ============================================================
// 🌿 CARBON PAYMENT MODEL (Define if not exists)
// ============================================================
let CarbonPayment;
try {
    CarbonPayment = mongoose.model('CarbonPayment');
} catch (e) {
    const CarbonPaymentSchema = new mongoose.Schema({
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        userEmail: {
            type: String,
            required: true
        },
        userName: {
            type: String,
            default: 'User'
        },
        paymentId: {
            type: String,
            unique: true,
            required: true
        },
        invoiceNumber: {
            type: String,
            unique: true,
            required: true
        },
        co2Amount: {
            type: Number,
            required: true
        },
        provider: {
            type: String,
            enum: ['tree_planting', 'renewable_energy', 'forest_conservation', 'community_project'],
            required: true
        },
        providerName: {
            type: String,
            required: true
        },
        treesPlanted: {
            type: Number,
            default: 0
        },
        paymentMethod: {
            type: String,
            enum: ['credit_card', 'apple_pay', 'google_pay', 'paypal'],
            default: 'credit_card'
        },
        amount: {
            type: Number,
            required: true
        },
        currency: {
            type: String,
            default: 'USD'
        },
        status: {
            type: String,
            enum: ['pending', 'completed', 'paid', 'failed', 'cancelled', 'refunded'],
            default: 'pending'
        },
        paidAt: {
            type: Date,
            default: null
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        }
    }, {
        timestamps: true
    });

    CarbonPaymentSchema.pre('save', function(next) {
        if (!this.invoiceNumber) {
            const year = new Date().getFullYear();
            const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
            this.invoiceNumber = `INV-CO-${year}-${random}`;
        }
        if (!this.paymentId) {
            this.paymentId = 'PAY_' + Date.now().toString(36).toUpperCase() + 
                            Math.random().toString(36).substring(2, 6).toUpperCase();
        }
        next();
    });

    CarbonPayment = mongoose.model('CarbonPayment', CarbonPaymentSchema);
    console.log('✅ CarbonPayment model created');
}

// ============================================================
// 🌿 POST /api/carbon/eco-options - Get eco shipping options
// ============================================================
router.post('/eco-options', auth, async (req, res) => {
    try {
        console.log('🌿 ECO-OPTIONS ROUTE CALLED!');
        const { weight = 10, distance = 50 } = req.body;
        console.log('📦 Weight:', weight, 'Distance:', distance);

        const baseCO2 = distance * 0.15 * (weight / 100);
        const basePrice = 10 + (weight * 5) + (distance * 0.5);

        const options = [
            {
                tier: 'standard',
                name: '🚛 Standard Shipping',
                description: 'Regular shipping with diesel vehicles',
                co2Emissions: {
                    co2: parseFloat((baseCO2).toFixed(2)),
                    co2e: parseFloat((baseCO2 * 1.1).toFixed(2)),
                    unit: 'kg'
                },
                estimatedDays: Math.ceil(weight / 10) + 3,
                price: parseFloat(basePrice.toFixed(2)),
                ecoFriendly: false,
                badge: null,
                savings: null,
                offsetCost: 0,
                totalCost: parseFloat(basePrice.toFixed(2)),
                equivalences: {
                    treesPlanted: parseFloat((baseCO2 * 0.045).toFixed(2)),
                    carsOffRoad: parseFloat((baseCO2 * 0.0000045).toFixed(5)),
                    flightsCanceled: parseFloat((baseCO2 * 0.00000015).toFixed(6))
                }
            },
            {
                tier: 'eco',
                name: '🌿 Eco-Friendly Shipping',
                description: 'Hybrid vehicles with reduced emissions',
                co2Emissions: {
                    co2: parseFloat((baseCO2 * 0.53).toFixed(2)),
                    co2e: parseFloat((baseCO2 * 0.53 * 1.1).toFixed(2)),
                    unit: 'kg'
                },
                estimatedDays: Math.ceil(weight / 10) + 4,
                price: parseFloat((basePrice + 20).toFixed(2)),
                ecoFriendly: true,
                badge: '🌱 47% less CO₂',
                savings: {
                    co2Reduction: '47%',
                    treesEquivalent: parseFloat((baseCO2 * 0.53 * 0.045).toFixed(2))
                },
                offsetCost: parseFloat((baseCO2 * 0.53 * 0.02).toFixed(2)),
                totalCost: parseFloat((basePrice + 20 + (baseCO2 * 0.53 * 0.02)).toFixed(2)),
                equivalences: {
                    treesPlanted: parseFloat((baseCO2 * 0.53 * 0.045).toFixed(2)),
                    carsOffRoad: parseFloat((baseCO2 * 0.53 * 0.0000045).toFixed(5)),
                    flightsCanceled: parseFloat((baseCO2 * 0.53 * 0.00000015).toFixed(6))
                }
            },
            {
                tier: 'premium-eco',
                name: '⭐ Premium Eco Shipping',
                description: 'Electric vehicles with zero tailpipe emissions',
                co2Emissions: {
                    co2: parseFloat((baseCO2 * 0.18).toFixed(2)),
                    co2e: parseFloat((baseCO2 * 0.18 * 1.1).toFixed(2)),
                    unit: 'kg'
                },
                estimatedDays: Math.ceil(weight / 10) + 5,
                price: parseFloat((basePrice + 50).toFixed(2)),
                ecoFriendly: true,
                badge: '⭐ 82% less CO₂',
                savings: {
                    co2Reduction: '82%',
                    treesEquivalent: parseFloat((baseCO2 * 0.18 * 0.045).toFixed(2))
                },
                offsetCost: parseFloat((baseCO2 * 0.18 * 0.02).toFixed(2)),
                totalCost: parseFloat((basePrice + 50 + (baseCO2 * 0.18 * 0.02)).toFixed(2)),
                equivalences: {
                    treesPlanted: parseFloat((baseCO2 * 0.18 * 0.045).toFixed(2)),
                    carsOffRoad: parseFloat((baseCO2 * 0.18 * 0.0000045).toFixed(5)),
                    flightsCanceled: parseFloat((baseCO2 * 0.18 * 0.00000015).toFixed(6))
                }
            }
        ];

        const bestEcoOption = options.filter(o => o.ecoFriendly).sort((a, b) => a.co2Emissions.co2 - b.co2Emissions.co2)[0];
        const standardOption = options.find(o => o.tier === 'standard');

        console.log('✅ Eco options generated successfully');

        res.json({
            success: true,
            data: {
                options: options,
                comparison: {
                    standard: standardOption,
                    bestEco: bestEcoOption,
                    co2Saved: standardOption ? parseFloat((standardOption.co2Emissions.co2 - (bestEcoOption?.co2Emissions.co2 || 0)).toFixed(2)) : 0,
                    percentageReduction: standardOption && bestEcoOption ? 
                        Math.round(((standardOption.co2Emissions.co2 - bestEcoOption.co2Emissions.co2) / standardOption.co2Emissions.co2) * 100) : 0,
                    costDifference: standardOption && bestEcoOption ? 
                        parseFloat((bestEcoOption.price - standardOption.price).toFixed(2)) : 0,
                    treesDifference: standardOption && bestEcoOption ? 
                        parseFloat(((bestEcoOption.equivalences?.treesPlanted || 0) - (standardOption.equivalences?.treesPlanted || 0)).toFixed(2)) : 0
                },
                summary: {
                    weight: weight,
                    distance: distance,
                    baseCO2: parseFloat(baseCO2.toFixed(2)),
                    ecoOptionsAvailable: options.filter(o => o.ecoFriendly).length,
                    bestReduction: bestEcoOption ? bestEcoOption.savings.co2Reduction : '0%'
                }
            }
        });
    } catch (err) {
        console.error('❌ Eco options error:', err.message);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// ============================================================
// 📄 GET /api/carbon/payments - Get payment history
// ============================================================
router.get('/payments', auth, catchAsync(async (req, res) => {
    const payments = await CarbonPayment.find({
        userId: req.user._id
    }).sort({ createdAt: -1 });

    res.json({
        success: true,
        data: payments,
        count: payments.length
    });
}));

// ============================================================
// 💳 POST /api/carbon/offset-payment - Create payment
// ============================================================
router.post('/offset-payment', auth, catchAsync(async (req, res) => {
    const { amount, provider = 'tree_planting', paymentMethod = 'credit_card' } = req.body;
    
    if (!amount || amount <= 0) {
        return res.status(400).json({
            success: false,
            message: 'Please provide a valid CO₂ amount to offset'
        });
    }
    
    const providerNames = {
        'tree_planting': '🌳 Tree Planting Project',
        'renewable_energy': '☀️ Renewable Energy Project',
        'forest_conservation': '🌲 Forest Conservation Project',
        'community_project': '👥 Community Project'
    };
    
    const costs = {
        'tree_planting': 0.02,
        'renewable_energy': 0.015,
        'forest_conservation': 0.025,
        'community_project': 0.03
    };
    
    const costPerKg = costs[provider] || 0.02;
    const totalCost = amount * costPerKg;
    const treesPlanted = amount * 0.045;
    const paymentId = 'PAY_' + Date.now().toString(36).toUpperCase() + 
                      Math.random().toString(36).substring(2, 6).toUpperCase();
    const invoiceNumber = 'INV-CO-' + Date.now().toString(36).toUpperCase() + 
                          Math.random().toString(36).substring(2, 4).toUpperCase();
    
    const existingPayment = await CarbonPayment.findOne({ 
        userId: req.user._id,
        co2Amount: amount,
        provider: provider,
        status: 'pending'
    });
    
    if (existingPayment) {
        return res.json({
            success: true,
            message: 'Payment already exists',
            data: {
                paymentId: existingPayment.paymentId,
                invoiceNumber: existingPayment.invoiceNumber,
                amount: parseFloat(existingPayment.amount.toFixed(2)),
                currency: existingPayment.currency,
                co2Offset: existingPayment.co2Amount,
                treesPlanted: parseFloat(existingPayment.treesPlanted.toFixed(2)),
                provider: existingPayment.provider,
                providerName: existingPayment.providerName,
                paymentMethod: existingPayment.paymentMethod,
                status: existingPayment.status
            }
        });
    }
    
    const payment = new CarbonPayment({
        userId: req.user._id,
        userEmail: req.user.email,
        userName: req.user.name || 'User',
        paymentId: paymentId,
        invoiceNumber: invoiceNumber,
        co2Amount: amount,
        provider: provider,
        providerName: providerNames[provider] || provider,
        treesPlanted: treesPlanted,
        paymentMethod: paymentMethod,
        amount: totalCost,
        currency: 'USD',
        status: 'pending',
        createdAt: new Date()
    });
    
    await payment.save();
    
    console.log(`💳 Payment created: ${paymentId} for ${req.user.email}`);
    console.log(`   Invoice: ${invoiceNumber}`);
    console.log(`   Amount: ${amount} kg CO₂, Cost: $${totalCost.toFixed(2)}`);
    console.log(`   Trees: ${treesPlanted.toFixed(2)}, Method: ${paymentMethod}`);
    
    res.json({
        success: true,
        message: 'Payment created successfully',
        data: {
            paymentId: paymentId,
            invoiceNumber: invoiceNumber,
            amount: parseFloat(totalCost.toFixed(2)),
            currency: 'USD',
            co2Offset: amount,
            treesPlanted: parseFloat(treesPlanted.toFixed(2)),
            provider: provider,
            providerName: providerNames[provider] || provider,
            paymentMethod: paymentMethod,
            status: 'pending'
        }
    });
}));

// ============================================================
// ✅ POST /api/carbon/offset-confirm - Confirm payment
// ============================================================
router.post('/offset-confirm', auth, catchAsync(async (req, res) => {
    const { paymentId, amount, provider } = req.body;
    
    if (!paymentId) {
        return res.status(400).json({
            success: false,
            message: 'Payment ID is required'
        });
    }
    
    const payment = await CarbonPayment.findOne({
        paymentId: paymentId,
        userId: req.user._id
    });
    
    if (!payment) {
        return res.status(404).json({
            success: false,
            message: 'Payment not found'
        });
    }
    
    if (payment.status === 'completed' || payment.status === 'paid') {
        return res.status(400).json({
            success: false,
            message: 'Payment already completed'
        });
    }
    
    payment.status = 'completed';
    payment.paidAt = new Date();
    await payment.save();
    
    const footprints = await CarbonFootprint.find({ 
        clientId: req.user._id
    }).sort({ createdAt: 1 });
    
    let remainingOffset = payment.co2Amount;
    let updatedCount = 0;
    let totalOffsetApplied = 0;
    
    for (const fp of footprints) {
        if (remainingOffset <= 0) break;
        
        const currentOffset = fp.offset?.offsetAmount || 0;
        const totalEmissions = fp.totalEmissions?.co2e || fp.totalEmissions?.co2 || 0;
        const remainingEmissions = totalEmissions - currentOffset;
        
        if (remainingEmissions > 0) {
            const toOffset = Math.min(remainingEmissions, remainingOffset);
            
            if (!fp.offset) {
                fp.offset = {
                    offsetAmount: 0,
                    offsetProvider: payment.provider,
                    offsetId: payment.paymentId,
                    offsetCost: 0,
                    offsetCurrency: 'USD',
                    offsetDate: new Date()
                };
            }
            
            fp.offset.offsetAmount = (fp.offset.offsetAmount || 0) + toOffset;
            fp.offset.offsetProvider = payment.provider;
            fp.offset.offsetId = payment.paymentId;
            fp.offset.offsetCost = (fp.offset.offsetCost || 0) + (toOffset * 0.02);
            fp.offset.offsetCurrency = 'USD';
            fp.offset.offsetDate = new Date();
            fp.ecoFriendly = true;
            
            remainingOffset -= toOffset;
            totalOffsetApplied += toOffset;
            updatedCount++;
            await fp.save();
        }
    }
    
    console.log(`✅ Carbon offset confirmed for user ${req.user.email}`);
    console.log(`   Payment ID: ${paymentId}`);
    console.log(`   Invoice: ${payment.invoiceNumber}`);
    console.log(`   Total Offset: ${totalOffsetApplied} kg CO₂`);
    console.log(`   Updated ${updatedCount} footprints`);
    console.log(`   Remaining offset: ${remainingOffset} kg CO₂`);
    
    res.json({
        success: true,
        message: 'Carbon offset confirmed successfully! 🌳',
        data: {
            paymentId: payment.paymentId,
            invoiceNumber: payment.invoiceNumber,
            co2Offset: payment.co2Amount,
            totalOffsetApplied: parseFloat(totalOffsetApplied.toFixed(2)),
            remainingOffset: parseFloat(remainingOffset.toFixed(2)),
            updatedCount: updatedCount,
            treesPlanted: parseFloat(payment.treesPlanted.toFixed(2)),
            status: payment.status,
            paidAt: payment.paidAt
        }
    });
}));

// ============================================================
// 📄 GET /api/carbon/invoice/:invoiceId - Get invoice
// ============================================================
router.get('/invoice/:invoiceId', auth, catchAsync(async (req, res) => {
    const payment = await CarbonPayment.findOne({
        invoiceNumber: req.params.invoiceId,
        userId: req.user._id
    });

    if (!payment) {
        return res.status(404).json({
            success: false,
            message: 'Invoice not found'
        });
    }

    res.json({
        success: true,
        data: payment
    });
}));

// ============================================================
// 📄 GET /api/carbon/invoice-pdf/:invoiceId - View invoice as HTML (FIXED)
// ============================================================
router.get('/invoice-pdf/:invoiceId', async (req, res) => {
    try {
        console.log('📄 Invoice PDF route called!');
        
        // ✅ Get token from query OR header
        const token = req.query.token || req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No token provided'
            });
        }
        
        // Verify token
        const jwt = require('jsonwebtoken');
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }
        
        // Find payment
        const payment = await CarbonPayment.findOne({
            invoiceNumber: req.params.invoiceId,
            userId: decoded.id
        });

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Invoice not found'
            });
        }

        // ✅ Define variables
        const isPaid = payment.status === 'completed' || payment.status === 'paid';
        const statusBadge = isPaid ? '✅ PAID' : '⏳ PENDING';
        const statusClass = isPaid ? 'badge-paid' : 'badge-pending';

        const html = `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Carbon Offset Invoice ${payment.invoiceNumber}</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Arial', sans-serif; padding: 40px; background: #f5f5f5; }
                .invoice-box { max-width: 800px; margin: auto; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
                .header { text-align: center; border-bottom: 3px solid #2ecc71; padding-bottom: 25px; margin-bottom: 25px; }
                .header h1 { color: #2ecc71; margin: 0; font-size: 28px; }
                .header .sub { color: #888; font-size: 14px; margin-top: 5px; }
                .logo { font-size: 32px; margin-bottom: 10px; }
                .badge { display: inline-block; padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: bold; }
                .badge-paid { background: #2ecc71; color: white; }
                .badge-pending { background: #ff9800; color: white; }
                .details { margin: 25px 0; }
                .row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f0f0f0; }
                .label { color: #666; font-weight: bold; }
                .total { font-size: 22px; color: #2ecc71; font-weight: bold; }
                .footer { text-align: center; margin-top: 30px; color: #888; font-size: 12px; border-top: 1px solid #eee; padding-top: 20px; }
                .green-box { background: #f0faf0; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0; }
                .green-box p { color: #2ecc71; font-size: 18px; margin: 0; }
                .green-box .sub { color: #888; font-size: 13px; margin-top: 5px; }
                @media print { .invoice-box { box-shadow: none; } body { background: white; padding: 20px; } }
            </style>
        </head>
        <body>
            <div class="invoice-box">
                <div class="header">
                    <div class="logo">🌿</div>
                    <h1>TAMYOKIY Carbon Offset</h1>
                    <div class="sub">Carbon Neutrality Certificate & Invoice</div>
                </div>
                <div style="text-align: center; margin: 15px 0;">
                    <span class="badge ${statusClass}">${statusBadge}</span>
                </div>
                <div class="details">
                    <div class="row"><span class="label">📄 Invoice Number:</span><span><strong>${payment.invoiceNumber}</strong></span></div>
                    <div class="row"><span class="label">📅 Date:</span><span>${new Date(payment.paidAt || payment.createdAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span></div>
                    <div class="row"><span class="label">👤 Customer:</span><span>${payment.userName}</span></div>
                    <div class="row"><span class="label">📧 Email:</span><span>${payment.userEmail}</span></div>
                    <div class="row"><span class="label">💳 Payment Method:</span><span>${payment.paymentMethod.replace('_', ' ').toUpperCase()}</span></div>
                </div>
                <h3 style="color: #2ecc71; margin: 30px 0 15px 0; border-bottom: 2px solid #2ecc71; padding-bottom: 10px;">🌱 Carbon Offset Details</h3>
                <div class="details">
                    <div class="row"><span class="label">🌿 CO₂ Offset:</span><span><strong>${payment.co2Amount} kg</strong></span></div>
                    <div class="row"><span class="label">🌳 Project:</span><span>${payment.providerName}</span></div>
                    <div class="row"><span class="label">🌲 Trees Planted:</span><span>🌳 ${payment.treesPlanted.toFixed(2)}</span></div>
                    <div class="row" style="border-bottom: 2px solid #2ecc71; padding-bottom: 15px; margin-bottom: 5px;">
                        <span class="label" style="font-size: 18px; color: #2ecc71;">💰 Total Amount:</span>
                        <span class="total">$${payment.amount.toFixed(2)} USD</span>
                    </div>
                </div>
                <div class="green-box">
                    <p>🌳 Thank you for helping the planet!</p>
                    <div class="sub">You offset <strong>${payment.co2Amount} kg</strong> of CO₂ and planted <strong>${payment.treesPlanted.toFixed(2)} trees</strong>.</div>
                    <div class="sub" style="margin-top: 8px; color: #666;">💚 Your contribution supports ${payment.providerName}</div>
                </div>
                <div class="footer">
                    <p style="font-weight: bold; color: #2ecc71;">TAMYOKIY Logistics Inc.</p>
                    <p>Carbon Offset Program • Sustainability Initiative</p>
                    <p style="margin-top: 8px;">🌍 Together, we're making a difference</p>
                </div>
            </div>
        </body>
        </html>`;
        
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Content-Disposition', `inline; filename="invoice-${payment.invoiceNumber}.html"`);
        res.send(html);
        
    } catch (err) {
        console.error('❌ Invoice error:', err.message);
        console.error('Stack:', err.stack);
        res.status(500).json({
            success: false,
            message: err.message,
            stack: err.stack
        });
    }
});

// ============================================================
// 📄 GET /api/carbon/invoice-pdf/:invoiceId/download - Download invoice (FIXED)
// ============================================================
router.get('/invoice-pdf/:invoiceId/download', async (req, res) => {
    try {
        console.log('📄 Invoice DOWNLOAD route called!');
        console.log('📄 Invoice ID:', req.params.invoiceId);
        
        // ✅ Get token from query OR header
        const token = req.query.token || req.headers.authorization?.split(' ')[1];
        
        console.log('🔑 Token received:', token ? '✅ Yes' : '❌ No');
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No token provided'
            });
        }
        
        // Verify token
        const jwt = require('jsonwebtoken');
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
            console.log('✅ Token verified for user:', decoded.id);
        } catch (err) {
            console.log('❌ Token verification failed:', err.message);
            return res.status(401).json({
                success: false,
                message: 'Invalid token: ' + err.message
            });
        }
        
        // Find payment
        const payment = await CarbonPayment.findOne({
            invoiceNumber: req.params.invoiceId,
            userId: decoded.id
        });

        console.log('💳 Payment found:', payment ? '✅ Yes' : '❌ No');

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Invoice not found for this user'
            });
        }

        // ✅ DEFINE statusClass HERE - THIS IS THE FIX!
        const isPaid = payment.status === 'completed' || payment.status === 'paid' || payment.status === 'success';
        const statusBadge = isPaid ? '✅ PAID' : '⏳ PENDING';
        const statusClass = isPaid ? 'badge-paid' : 'badge-pending';

        console.log('📊 Invoice Status:', payment.status);
        console.log('📊 Is Paid:', isPaid);
        console.log('📊 Status Class:', statusClass);

        const html = `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Carbon Offset Invoice ${payment.invoiceNumber}</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Arial', sans-serif; padding: 40px; background: #f5f5f5; }
                .invoice-box { max-width: 800px; margin: auto; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
                .header { text-align: center; border-bottom: 3px solid #2ecc71; padding-bottom: 25px; margin-bottom: 25px; }
                .header h1 { color: #2ecc71; margin: 0; font-size: 28px; }
                .header .sub { color: #888; font-size: 14px; margin-top: 5px; }
                .logo { font-size: 32px; margin-bottom: 10px; }
                .badge { display: inline-block; padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: bold; }
                .badge-paid { background: #2ecc71; color: white; }
                .badge-pending { background: #ff9800; color: white; }
                .badge-failed { background: #e74c3c; color: white; }
                .details { margin: 25px 0; }
                .row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f0f0f0; }
                .label { color: #666; font-weight: bold; }
                .total { font-size: 22px; color: #2ecc71; font-weight: bold; }
                .footer { text-align: center; margin-top: 30px; color: #888; font-size: 12px; border-top: 1px solid #eee; padding-top: 20px; }
                .green-box { background: #f0faf0; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0; }
                .green-box p { color: #2ecc71; font-size: 18px; margin: 0; }
                .green-box .sub { color: #888; font-size: 13px; margin-top: 5px; }
                @media print { .invoice-box { box-shadow: none; } body { background: white; padding: 20px; } }
            </style>
        </head>
        <body>
            <div class="invoice-box">
                <div class="header">
                    <div class="logo">🌿</div>
                    <h1>TAMYOKIY Carbon Offset</h1>
                    <div class="sub">Carbon Neutrality Certificate & Invoice</div>
                </div>
                <div style="text-align: center; margin: 15px 0;">
                    <span class="badge ${statusClass}">${statusBadge}</span>
                </div>
                <div class="details">
                    <div class="row"><span class="label">📄 Invoice Number:</span><span><strong>${payment.invoiceNumber}</strong></span></div>
                    <div class="row"><span class="label">📅 Date:</span><span>${new Date(payment.paidAt || payment.createdAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span></div>
                    <div class="row"><span class="label">👤 Customer:</span><span>${payment.userName}</span></div>
                    <div class="row"><span class="label">📧 Email:</span><span>${payment.userEmail}</span></div>
                    <div class="row"><span class="label">💳 Payment Method:</span><span>${payment.paymentMethod.replace('_', ' ').toUpperCase()}</span></div>
                </div>
                <h3 style="color: #2ecc71; margin: 30px 0 15px 0; border-bottom: 2px solid #2ecc71; padding-bottom: 10px;">🌱 Carbon Offset Details</h3>
                <div class="details">
                    <div class="row"><span class="label">🌿 CO₂ Offset:</span><span><strong>${payment.co2Amount} kg</strong></span></div>
                    <div class="row"><span class="label">🌳 Project:</span><span>${payment.providerName}</span></div>
                    <div class="row"><span class="label">🌲 Trees Planted:</span><span>🌳 ${payment.treesPlanted.toFixed(2)}</span></div>
                    <div class="row" style="border-bottom: 2px solid #2ecc71; padding-bottom: 15px; margin-bottom: 5px;">
                        <span class="label" style="font-size: 18px; color: #2ecc71;">💰 Total Amount:</span>
                        <span class="total">$${payment.amount.toFixed(2)} USD</span>
                    </div>
                </div>
                <div class="green-box">
                    <p>🌳 Thank you for helping the planet!</p>
                    <div class="sub">You offset <strong>${payment.co2Amount} kg</strong> of CO₂ and planted <strong>${payment.treesPlanted.toFixed(2)} trees</strong>.</div>
                    <div class="sub" style="margin-top: 8px; color: #666;">💚 Your contribution supports ${payment.providerName}</div>
                </div>
                <div class="footer">
                    <p style="font-weight: bold; color: #2ecc71;">TAMYOKIY Logistics Inc.</p>
                    <p>Carbon Offset Program • Sustainability Initiative</p>
                    <p style="margin-top: 8px;">🌍 Together, we're making a difference</p>
                </div>
            </div>
        </body>
        </html>`;
        
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Content-Disposition', `attachment; filename="invoice-${payment.invoiceNumber}.html"`);
        res.send(html);
        console.log('✅ Invoice download successful!');
        
    } catch (err) {
        console.error('❌ Invoice download error:', err.message);
        console.error('Stack:', err.stack);
        res.status(500).json({
            success: false,
            message: err.message,
            stack: err.stack
        });
    }
});
// ============================================================
// 📊 GET /api/carbon/summary - Client carbon summary
// ============================================================
router.get('/summary', auth, catchAsync(async (req, res) => {
    const { startDate, endDate } = req.query;
    const summary = await carbonService.getClientCarbonSummary(
        req.user._id,
        startDate ? new Date(startDate) : undefined,
        endDate ? new Date(endDate) : undefined
    );

    res.json({
        success: true,
        data: summary
    });
}));

// ============================================================
// 📈 GET /api/carbon/trend - Real monthly carbon trend
// ============================================================
router.get('/trend', auth, catchAsync(async (req, res) => {
    const { period = 'monthly', months = 12 } = req.query;
    const userId = req.user._id;

    const footprints = await CarbonFootprint.find({ 
        clientId: userId 
    }).sort({ createdAt: 1 });

    if (footprints.length === 0) {
        const labels = [];
        const data = [];
        const now = new Date();
        for (let i = parseInt(months) - 1; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            labels.push(d.toLocaleString('default', { month: 'short' }));
            data.push(0);
        }
        return res.json({
            success: true,
            data: { 
                labels, 
                data,
                summary: {
                    total: 0,
                    average: 0,
                    highest: 0,
                    lowest: 0,
                    trend: 'neutral'
                }
            }
        });
    }

    const monthlyData = {};
    const now = new Date();
    
    footprints.forEach(fp => {
        const date = new Date(fp.createdAt || fp.calculationDate || fp.timestamp);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyData[key]) {
            monthlyData[key] = 0;
        }
        const co2 = fp.totalEmissions?.co2 || fp.co2 || fp.carbonEmission || 0;
        monthlyData[key] += co2;
    });

    const labels = [];
    const data = [];
    const numMonths = parseInt(months);
    
    for (let i = numMonths - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        labels.push(d.toLocaleString('default', { month: 'short' }));
        const value = monthlyData[key] || 0;
        data.push(Math.round(value * 10) / 10);
    }

    const total = data.reduce((sum, val) => sum + val, 0);
    const average = data.length > 0 ? Math.round((total / data.length) * 10) / 10 : 0;
    const highest = data.length > 0 ? Math.max(...data) : 0;
    const lowest = data.length > 0 ? Math.min(...data.filter(d => d > 0)) : 0;
    
    let trend = 'neutral';
    if (data.length >= 3) {
        const firstHalf = data.slice(0, Math.floor(data.length / 2)).filter(d => d > 0);
        const secondHalf = data.slice(Math.floor(data.length / 2)).filter(d => d > 0);
        const avgFirst = firstHalf.length > 0 ? firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length : 0;
        const avgSecond = secondHalf.length > 0 ? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length : 0;
        
        if (avgSecond > avgFirst * 1.1) trend = 'increasing';
        else if (avgSecond < avgFirst * 0.9) trend = 'decreasing';
        else trend = 'stable';
    }

    const ecoCount = footprints.filter(fp => fp.ecoFriendly === true).length;
    const ecoPercentage = footprints.length > 0 ? Math.round((ecoCount / footprints.length) * 100) : 0;

    res.json({
        success: true,
        data: { 
            labels, 
            data,
            summary: {
                total: Math.round(total * 10) / 10,
                average,
                highest,
                lowest,
                trend,
                totalShipments: footprints.length,
                ecoPercentage,
                estimatedTrees: Math.round(total * 0.045 * 10) / 10
            }
        }
    });
}));

// ============================================================
// 📊 GET /api/carbon/stats - Carbon statistics
// ============================================================
router.get('/stats', auth, catchAsync(async (req, res) => {
    const stats = await CarbonFootprint.aggregate([
        { $match: { clientId: req.user._id } },
        { $group: {
            _id: null,
            totalCO2: { $sum: '$totalEmissions.co2' },
            totalCO2e: { $sum: '$totalEmissions.co2e' },
            totalShipments: { $sum: 1 },
            totalEcoShipments: { 
                $sum: { $cond: ['$ecoFriendly', 1, 0] } 
            },
            totalDistance: { $sum: '$activity.distance' },
            totalOffset: { $sum: '$offset.offsetAmount' }
        }}
    ]);

    const data = stats.length > 0 ? stats[0] : {
        totalCO2: 0,
        totalCO2e: 0,
        totalShipments: 0,
        totalEcoShipments: 0,
        totalDistance: 0,
        totalOffset: 0
    };

    const equivalence = {
        treesPlanted: Math.round(data.totalCO2e * 0.045 * 100) / 100,
        carsOffRoad: Math.round(data.totalCO2e * 0.0000045 * 100) / 100,
        flightsCanceled: Math.round(data.totalCO2e * 0.00000015 * 100) / 100,
        energySaved: Math.round(data.totalCO2e * 0.5 * 100) / 100
    };

    res.json({
        success: true,
        data: {
            ...data,
            ecoPercentage: data.totalShipments > 0 
                ? Math.round((data.totalEcoShipments / data.totalShipments) * 100) 
                : 0,
            averageCO2PerShipment: data.totalShipments > 0 
                ? parseFloat((data.totalCO2 / data.totalShipments).toFixed(2))
                : 0,
            equivalence
        }
    });
}));

// ============================================================
// 🌳 POST /api/carbon/offset - Original offset endpoint
// ============================================================
router.post('/offset', auth, catchAsync(async (req, res) => {
    const { amount, provider = 'tree_planting' } = req.body;

    if (!amount || amount <= 0) {
        return res.status(400).json({
            success: false,
            message: 'Please provide a valid CO₂ amount to offset'
        });
    }

    const providerNames = {
        'tree_planting': '🌳 Tree Planting Project',
        'renewable_energy': '☀️ Renewable Energy Project',
        'forest_conservation': '🌲 Forest Conservation Project',
        'community_project': '👥 Community Project'
    };
    
    const costs = {
        'tree_planting': 0.02,
        'renewable_energy': 0.015,
        'forest_conservation': 0.025,
        'community_project': 0.03
    };
    
    const costPerKg = costs[provider] || 0.02;
    const totalCost = amount * costPerKg;
    const treesPlanted = amount * 0.045;
    const paymentId = 'PAY_' + Date.now().toString(36).toUpperCase() + 
                      Math.random().toString(36).substring(2, 6).toUpperCase();
    const invoiceNumber = 'INV-CO-' + Date.now().toString(36).toUpperCase() + 
                          Math.random().toString(36).substring(2, 4).toUpperCase();

    const payment = new CarbonPayment({
        userId: req.user._id,
        userEmail: req.user.email,
        userName: req.user.name || 'User',
        paymentId: paymentId,
        invoiceNumber: invoiceNumber,
        co2Amount: amount,
        provider: provider,
        providerName: providerNames[provider] || provider,
        treesPlanted: treesPlanted,
        paymentMethod: 'credit_card',
        amount: totalCost,
        currency: 'USD',
        status: 'completed',
        paidAt: new Date()
    });

    await payment.save();

    const footprints = await CarbonFootprint.find({ 
        clientId: req.user._id
    }).sort({ createdAt: 1 });
    
    let remainingOffset = amount;
    let updatedCount = 0;
    let totalOffsetApplied = 0;
    
    for (const fp of footprints) {
        if (remainingOffset <= 0) break;
        
        const currentOffset = fp.offset?.offsetAmount || 0;
        const totalEmissions = fp.totalEmissions?.co2e || fp.totalEmissions?.co2 || 0;
        const remainingEmissions = totalEmissions - currentOffset;
        
        if (remainingEmissions > 0) {
            const toOffset = Math.min(remainingEmissions, remainingOffset);
            
            if (!fp.offset) {
                fp.offset = {
                    offsetAmount: 0,
                    offsetProvider: provider,
                    offsetId: paymentId,
                    offsetCost: 0,
                    offsetCurrency: 'USD',
                    offsetDate: new Date()
                };
            }
            
            fp.offset.offsetAmount = (fp.offset.offsetAmount || 0) + toOffset;
            fp.offset.offsetProvider = provider;
            fp.offset.offsetId = paymentId;
            fp.offset.offsetCost = (fp.offset.offsetCost || 0) + (toOffset * 0.02);
            fp.offset.offsetCurrency = 'USD';
            fp.offset.offsetDate = new Date();
            fp.ecoFriendly = true;
            
            remainingOffset -= toOffset;
            totalOffsetApplied += toOffset;
            updatedCount++;
            await fp.save();
        }
    }

    console.log(`🌳 Carbon offset applied for user ${req.user.email}`);
    console.log(`   Invoice: ${invoiceNumber}`);
    console.log(`   Amount: ${amount} kg CO₂`);
    console.log(`   Cost: $${totalCost.toFixed(2)}`);
    console.log(`   Trees Planted: ${treesPlanted.toFixed(2)}`);
    console.log(`   Updated ${updatedCount} shipments`);
    console.log(`   Remaining offset: ${remainingOffset.toFixed(2)} kg`);

    res.json({
        success: true,
        message: 'Carbon offset applied successfully! 🌳',
        data: {
            paymentId: paymentId,
            invoiceNumber: invoiceNumber,
            amount: amount,
            provider: provider,
            providerName: providerNames[provider] || provider,
            cost: parseFloat(totalCost.toFixed(2)),
            treesPlanted: parseFloat(treesPlanted.toFixed(2)),
            updatedCount: updatedCount,
            remainingOffset: parseFloat(remainingOffset.toFixed(2)),
            status: 'completed'
        }
    });
}));

// ============================================================
// 📊 GET /api/carbon/shipment/:id - Get shipment carbon
// ============================================================
router.get('/shipment/:id', auth, catchAsync(async (req, res) => {
    const carbon = await CarbonFootprint.findOne({ 
        shipmentId: req.params.id,
        clientId: req.user._id
    });

    if (!carbon) {
        return res.status(404).json({
            success: false,
            message: 'Carbon data not found for this shipment'
        });
    }

    res.json({
        success: true,
        data: carbon
    });
}));

// ============================================================
// 🌿 POST /api/carbon/calculate/:shipmentId - Calculate carbon for shipment
// ============================================================
router.post('/calculate/:shipmentId', auth, catchAsync(async (req, res) => {
    const { shipmentId } = req.params;
    const { vehicleId, distance, routeId } = req.body;
    
    console.log(`🌿 Calculating carbon for shipment: ${shipmentId}`);
    
    const shipment = await Shipment.findById(shipmentId)
        .populate('vehicle')
        .populate('driver');
    
    if (!shipment) {
        return res.status(404).json({
            success: false,
            message: 'Shipment not found'
        });
    }
    
    if (shipment.client && shipment.client.toString() !== req.user._id.toString()) {
        return res.status(403).json({
            success: false,
            message: 'Access denied'
        });
    }
    
    if (req.user.role !== 'admin' && req.user.role !== 'driver') {
        if (shipment.userId && shipment.userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }
    }
    
    try {
        const result = await carbonService.calculateShipmentFootprint(
            shipment,
            vehicleId || shipment.vehicle?._id,
            { 
                distance: distance || shipment.distance || 50,
                routeId: routeId || shipment.routeId
            }
        );
        
        const carbonFootprint = new CarbonFootprint({
            shipmentId: shipment._id,
            clientId: shipment.client || shipment.userId || req.user._id,
            vehicleId: shipment.vehicle?._id || vehicleId,
            driverId: shipment.driver?._id || req.user._id,
            totalEmissions: {
                co2: result.totalCO2 || 0,
                co2e: result.totalCO2e || 0,
                unit: 'kg'
            },
            activity: {
                distance: result.distance || distance || 50,
                duration: result.duration || 0,
                fuelConsumed: result.fuelConsumed || 0,
                fuelType: result.fuelType || 'diesel'
            },
            breakdown: result.breakdown || {},
            ecoFriendly: result.ecoFriendly || false,
            ecoTier: result.ecoTier || 'standard',
            recommendations: result.recommendations || [],
            calculationDate: new Date(),
            timestamp: new Date(),
            createdAt: new Date()
        });
        
        await carbonFootprint.save();
        
        shipment.carbonFootprint = {
            co2: result.totalCO2 || 0,
            co2e: result.totalCO2e || 0,
            calculatedAt: new Date()
        };
        await shipment.save();
        
        res.json({
            success: true,
            message: 'Carbon footprint calculated successfully',
            data: {
                ...result,
                footprintId: carbonFootprint._id
            }
        });
    } catch (err) {
        console.error('❌ Carbon calculation error:', err.message);
        res.status(500).json({
            success: false,
            message: err.message || 'Failed to calculate carbon footprint'
        });
    }
}));

module.exports = router;