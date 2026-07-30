const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const catchAsync = require('../../../utils/catchAsync');

const Shipment = mongoose.model('Shipment');
const User = mongoose.model('User');
const DriverLocation = mongoose.model('DriverLocation');

// Import webhook service
const webhookService = require('../../../services/webhookDeliveryService');

// ============================================================
// 🌿 CARBON PRICING UTILITY FUNCTIONS
// ============================================================
const calculateShippingPrice = (shippingTier, ecoTier, weight, distance) => {
    // Base prices per tier
    const basePrices = {
        standard: 10,
        express: 25,
        overnight: 50
    };

    // Eco multipliers
    const ecoMultipliers = {
        standard: 1.0,
        eco: 0.53,    // 47% less CO2
        'premium-eco': 0.18  // 82% less CO2
    };

    // Base CO2 calculation
    const baseCO2 = distance * 0.15 * (weight / 100);
    
    // Apply eco multiplier
    const co2 = baseCO2 * (ecoMultipliers[ecoTier] || 1.0);
    const co2e = co2 * 1.1;

    // Calculate price
    const basePrice = basePrices[shippingTier] || basePrices.standard;
    const ecoFee = ecoTier !== 'standard' ? 20 : 0;
    const weightFee = weight * 5;
    const distanceFee = distance * 0.5;
    
    const finalPrice = basePrice + ecoFee + weightFee + distanceFee;
    const offsetCost = co2 * 0.02; // $0.02 per kg CO2

    return {
        basePrice: parseFloat(basePrice.toFixed(2)),
        ecoMultiplier: ecoMultipliers[ecoTier] || 1.0,
        ecoFee: parseFloat(ecoFee.toFixed(2)),
        weightFee: parseFloat(weightFee.toFixed(2)),
        distanceFee: parseFloat(distanceFee.toFixed(2)),
        finalPrice: parseFloat(finalPrice.toFixed(2)),
        offsetCost: parseFloat(offsetCost.toFixed(2)),
        carbon: {
            co2: parseFloat(co2.toFixed(2)),
            co2e: parseFloat(co2e.toFixed(2)),
            reduction: ecoTier !== 'standard' 
                ? parseFloat(((1 - ecoMultipliers[ecoTier]) * 100).toFixed(0))
                : 0
        }
    };
};

const getShippingOptions = (weight, distance) => {
    const tiers = ['standard', 'express', 'overnight'];
    const ecoOptions = ['standard', 'eco', 'premium-eco'];
    
    const options = [];
    
    for (const tier of tiers) {
        for (const eco of ecoOptions) {
            const price = calculateShippingPrice(tier, eco, weight, distance);
            options.push({
                shippingTier: tier,
                ecoTier: eco,
                label: `${tier.charAt(0).toUpperCase() + tier.slice(1)}${eco !== 'standard' ? ' + Eco' : ''}`,
                price: price.finalPrice,
                co2: price.carbon.co2,
                co2e: price.carbon.co2e,
                reduction: price.carbon.reduction,
                isEco: eco !== 'standard',
                ecoLabel: eco === 'standard' ? 'Standard' : eco === 'eco' ? '🌿 Eco' : '⭐ Premium Eco'
            });
        }
    }
    
    return options;
};

// ============================================================
// 🔑 API Key Authentication Middleware
// ============================================================
const apiKeyAuth = async (req, res, next) => {
    try {
        const apiKey = req.headers['x-api-key'];
        
        if (!apiKey) {
            return res.status(401).json({
                success: false,
                message: 'API key required. Please provide x-api-key header'
            });
        }

        const ApiKey = mongoose.model('ApiKey');
        const keyDoc = await ApiKey.findOne({ 
            key: apiKey,
            isActive: true
        });

        if (!keyDoc) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or inactive API key'
            });
        }

        if (keyDoc.expiresAt && new Date() > keyDoc.expiresAt) {
            return res.status(401).json({
                success: false,
                message: 'API key has expired'
            });
        }

        keyDoc.lastUsed = new Date();
        await keyDoc.save();

        req.apiKey = {
            clientId: keyDoc.userId,
            permissions: keyDoc.permissions,
            keyId: keyDoc._id
        };

        next();
    } catch (error) {
        console.error('❌ API Key Auth Error:', error);
        res.status(500).json({
            success: false,
            message: 'Authentication error'
        });
    }
};

// ============================================================
// 📦 GET /api/v1/shipments/shipping-options - Get shipping options with carbon
// ============================================================
router.get('/shipping-options', apiKeyAuth, catchAsync(async (req, res) => {
    const { weight = 10, distance = 50 } = req.query;
    
    const options = getShippingOptions(parseFloat(weight), parseFloat(distance));
    
    res.json({
        success: true,
        data: options
    });
}));

// ============================================================
// 📦 GET /api/v1/shipments - List shipments
// ============================================================
router.get('/', apiKeyAuth, catchAsync(async (req, res) => {
    const { clientId } = req.apiKey;
    const { status, page = 1, limit = 20 } = req.query;

    console.log('🔍 Looking for shipments with userId:', clientId);

    const query = { userId: clientId };
    if (status) query.status = status;

    console.log('🔍 Query:', JSON.stringify(query));

    const shipments = await Shipment.find(query)
        .populate('assignedDriver', 'name email phone')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Shipment.countDocuments(query);

    res.json({
        success: true,
        data: shipments,
        count: shipments.length,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
        }
    });
}));

// ============================================================
// 📦 POST /api/v1/shipments - Create shipment (WITH CARBON CALCULATION)
// ============================================================
router.post('/', apiKeyAuth, catchAsync(async (req, res) => {
    const { clientId } = req.apiKey;
    const {
        senderName,
        senderAddress,
        receiverName,
        receiverAddress,
        senderLat,
        senderLng,
        receiverLat,
        receiverLng,
        weight,
        amount,
        serviceType,
        priority,
        packageDetails,
        specialInstructions,
        scheduledPickup,
        pickupAddress,
        deliveryAddress,
        receiverPhone,
        senderPhone,
        email,
        notes,
        distance, // Optional: allow client to provide distance
        shippingTier = 'standard',
        ecoOption = 'standard',
        offsetCarbon = false
    } = req.body;

    console.log('📝 Creating shipment for user ID:', clientId);
    console.log('📝 Request body:', {
        senderName,
        senderAddress,
        receiverName,
        receiverAddress,
        weight,
        amount,
        serviceType,
        distance,
        shippingTier,
        ecoOption,
        offsetCarbon
    });

    // Calculate distance if coordinates provided
    let calculatedDistance = distance || 50;
    if (senderLat && senderLng && receiverLat && receiverLng) {
        const toRad = (value) => (value * Math.PI) / 180;
        const R = 6371;
        const dLat = toRad(receiverLat - senderLat);
        const dLon = toRad(receiverLng - senderLng);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(toRad(senderLat)) * Math.cos(toRad(receiverLat)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        calculatedDistance = R * c;
        if (calculatedDistance < 1) calculatedDistance = 1;
        console.log(`📍 Calculated distance: ${calculatedDistance.toFixed(2)} km`);
    }

    // Calculate price and carbon
    const weightKg = parseFloat(weight) || 10;
    const priceData = calculateShippingPrice(
        shippingTier || 'standard',
        ecoOption || 'standard',
        weightKg,
        calculatedDistance
    );

    console.log('🌿 Carbon:', priceData.carbon);
    console.log('💰 Price:', priceData.finalPrice);

    // Generate tracking number
    const trackingNumber = 'TRK' + Date.now().toString(36).toUpperCase() + 
                          Math.random().toString(36).substring(2, 6).toUpperCase();

    // Create shipment with userId
    const shipmentData = {
        userId: clientId,
        trackingNumber,
        senderName: senderName || 'Sender',
        senderAddress: senderAddress || pickupAddress || 'Address',
        receiverName: receiverName || 'Receiver',
        receiverAddress: receiverAddress || deliveryAddress || 'Address',
        senderLat: senderLat || null,
        senderLng: senderLng || null,
        receiverLat: receiverLat || null,
        receiverLng: receiverLng || null,
        weight: weightKg,
        amount: priceData.finalPrice,
        cost: priceData.basePrice,
        serviceType: serviceType || 'standard',
        priority: priority || 'normal',
        shippingTier: shippingTier || 'standard',
        ecoOption: ecoOption || 'standard',
        carbonEmissions: {
            co2: priceData.carbon.co2,
            co2e: priceData.carbon.co2e,
            offsetCost: offsetCarbon ? priceData.offsetCost : 0
        },
        carbonOffset: offsetCarbon || false,
        status: 'pending',
        trackingHistory: [{
            status: 'pending',
            note: `Shipment created via API with ${shippingTier || 'standard'}${ecoOption !== 'standard' ? ' Eco' : ''} option`,
            updatedAt: new Date()
        }]
    };

    // Add optional fields if provided
    if (packageDetails) shipmentData.packageDetails = packageDetails;
    if (specialInstructions) shipmentData.specialInstructions = specialInstructions;
    if (scheduledPickup) shipmentData.scheduledPickup = new Date(scheduledPickup);
    if (receiverPhone) shipmentData.receiverPhone = receiverPhone;
    if (senderPhone) shipmentData.senderPhone = senderPhone;
    if (email) shipmentData.email = email;
    if (notes) shipmentData.notes = notes;

    const shipment = new Shipment(shipmentData);
    await shipment.save();

    console.log('✅ Shipment saved with userId:', shipment.userId);
    console.log('✅ Tracking Number:', shipment.trackingNumber);
    console.log('✅ Shipment ID:', shipment._id);

    // ============================================================
    // ✅ SAVE CARBON FOOTPRINT
    // ============================================================
    let carbonData = null;
    try {
        const CarbonFootprint = mongoose.model('CarbonFootprint');
        
        // Determine eco-friendliness
        const isEcoFriendly = ecoOption !== 'standard';
        let ecoTier = 'standard';
        if (priceData.carbon.co2e < 5) ecoTier = 'gold';
        else if (priceData.carbon.co2e < 15) ecoTier = 'silver';
        else if (priceData.carbon.co2e < 30) ecoTier = 'bronze';
        
        // Create carbon footprint record
        const carbonFootprint = new CarbonFootprint({
            shipmentId: shipment._id,
            clientId: clientId,
            totalEmissions: {
                co2: priceData.carbon.co2,
                co2e: priceData.carbon.co2e,
                unit: 'kg'
            },
            activity: {
                distance: parseFloat(calculatedDistance.toFixed(2)),
                weight: weightKg,
                vehicleType: 'delivery_van',
                fuelType: 'diesel'
            },
            ecoFriendly: isEcoFriendly,
            ecoTier: ecoTier,
            offset: offsetCarbon ? {
                offsetAmount: priceData.carbon.co2,
                offsetCost: priceData.offsetCost,
                offsetProvider: 'TAMYOKIY Carbon Offset Program'
            } : undefined,
            calculationDate: new Date(),
            timestamp: new Date(),
            breakdown: {
                distanceEmission: parseFloat((calculatedDistance * 0.15 * (weightKg / 100)).toFixed(2)),
                weightEmission: parseFloat((weightKg * 0.001).toFixed(2)),
                methodology: 'EPA emission factors for delivery vehicles',
                ecoReduction: priceData.carbon.reduction
            }
        });
        
        await carbonFootprint.save();
        
        // Update shipment with carbon reference
        shipment.carbonFootprintId = carbonFootprint._id;
        shipment.carbonData = {
            co2: carbonFootprint.totalEmissions.co2,
            co2e: carbonFootprint.totalEmissions.co2e,
            ecoFriendly: carbonFootprint.ecoFriendly,
            ecoTier: carbonFootprint.ecoTier,
            calculatedAt: new Date()
        };
        await shipment.save();
        
        carbonData = {
            co2: carbonFootprint.totalEmissions.co2,
            co2e: carbonFootprint.totalEmissions.co2e,
            ecoFriendly: carbonFootprint.ecoFriendly,
            ecoTier: carbonFootprint.ecoTier,
            distance: carbonFootprint.activity.distance,
            weight: carbonFootprint.activity.weight,
            reduction: priceData.carbon.reduction,
            message: isEcoFriendly 
                ? `🌿 Eco-friendly shipment! ${priceData.carbon.reduction}% less CO2` 
                : 'Consider eco-friendly shipping options for lower emissions'
        };
        
        console.log(`🌿 Carbon footprint saved for ${shipment.trackingNumber}: ${priceData.carbon.co2}kg CO2`);
        console.log(`🌿 Eco-friendly: ${isEcoFriendly ? 'Yes ✅' : 'No ❌'} (Tier: ${ecoTier})`);
        
        // Trigger carbon webhook
        try {
            await webhookService.deliverEvent('carbon.calculated', {
                shipmentId: shipment._id,
                trackingNumber: shipment.trackingNumber,
                co2: carbonFootprint.totalEmissions.co2,
                co2e: carbonFootprint.totalEmissions.co2e,
                ecoFriendly: carbonFootprint.ecoFriendly,
                ecoTier: carbonFootprint.ecoTier,
                calculatedAt: new Date()
            });
        } catch (carbonWebhookErr) {
            console.error('⚠️ Carbon webhook error:', carbonWebhookErr.message);
        }
        
    } catch (carbonErr) {
        console.error('⚠️ Carbon save error:', carbonErr.message);
        // Don't fail the request - carbon is a bonus feature
    }

    // Trigger shipment webhook
    try {
        await webhookService.deliverEvent('shipment.created', {
            shipmentId: shipment._id,
            trackingNumber: shipment.trackingNumber,
            clientId: clientId,
            status: shipment.status,
            createdAt: shipment.createdAt,
            senderName: shipment.senderName,
            senderAddress: shipment.senderAddress,
            receiverName: shipment.receiverName,
            receiverAddress: shipment.receiverAddress,
            weight: shipment.weight,
            amount: shipment.amount,
            serviceType: shipment.serviceType,
            shippingTier: shipment.shippingTier,
            ecoOption: shipment.ecoOption,
            carbon: carbonData,
            offsetCarbon: offsetCarbon
        });
    } catch (webhookErr) {
        console.error('⚠️ Webhook delivery error:', webhookErr.message);
    }

    // Return response with carbon data
    res.status(201).json({
        success: true,
        message: 'Shipment created successfully with carbon footprint tracking',
        data: {
            shipment: shipment,
            carbon: carbonData ? {
                co2: carbonData.co2,
                co2e: carbonData.co2e,
                ecoFriendly: carbonData.ecoFriendly,
                ecoTier: carbonData.ecoTier,
                distance: carbonData.distance,
                reduction: carbonData.reduction,
                message: carbonData.message
            } : null,
            priceBreakdown: {
                basePrice: priceData.basePrice,
                ecoFee: priceData.ecoFee,
                weightFee: priceData.weightFee,
                distanceFee: priceData.distanceFee,
                offsetCost: offsetCarbon ? priceData.offsetCost : 0,
                total: priceData.finalPrice
            }
        }
    });
}));

// ============================================================
// 📦 GET /api/v1/shipments/:id - Get shipment with carbon
// ============================================================
router.get('/:id', apiKeyAuth, catchAsync(async (req, res) => {
    const { clientId } = req.apiKey;
    const shipment = await Shipment.findOne({
        _id: req.params.id,
        userId: clientId
    }).populate('assignedDriver', 'name email phone rating');

    if (!shipment) {
        return res.status(404).json({
            success: false,
            message: 'Shipment not found'
        });
    }

    // Get carbon data if available
    let carbonData = null;
    if (shipment.carbonFootprintId) {
        try {
            const CarbonFootprint = mongoose.model('CarbonFootprint');
            carbonData = await CarbonFootprint.findById(shipment.carbonFootprintId);
        } catch (err) {
            console.error('Error fetching carbon data:', err.message);
        }
    }

    res.json({
        success: true,
        data: {
            ...shipment.toObject(),
            carbon: carbonData
        }
    });
}));

// ============================================================
// 📦 PUT /api/v1/shipments/:id - Update shipment
// ============================================================
router.put('/:id', apiKeyAuth, catchAsync(async (req, res) => {
    const { clientId } = req.apiKey;
    const { 
        status, 
        senderName,
        senderAddress,
        receiverName,
        receiverAddress,
        weight,
        amount,
        serviceType,
        priority,
        specialInstructions,
        senderLat,
        senderLng,
        receiverLat,
        receiverLng,
        packageDetails,
        notes,
        ecoOption,
        offsetCarbon
    } = req.body;

    const shipment = await Shipment.findOne({
        _id: req.params.id,
        userId: clientId
    });

    if (!shipment) {
        return res.status(404).json({
            success: false,
            message: 'Shipment not found'
        });
    }

    const oldStatus = shipment.status;
    const statusChanged = status && status !== oldStatus;

    // Update fields
    if (status) {
        shipment.status = status;
        shipment.trackingHistory.push({
            status: status,
            note: 'Status updated via API',
            updatedAt: new Date()
        });
    }
    if (senderName) shipment.senderName = senderName;
    if (senderAddress) shipment.senderAddress = senderAddress;
    if (receiverName) shipment.receiverName = receiverName;
    if (receiverAddress) shipment.receiverAddress = receiverAddress;
    if (weight !== undefined) shipment.weight = parseFloat(weight);
    if (amount !== undefined) shipment.amount = parseFloat(amount);
    if (serviceType) shipment.serviceType = serviceType;
    if (priority) shipment.priority = priority;
    if (specialInstructions !== undefined) shipment.specialInstructions = specialInstructions;
    if (senderLat !== undefined) shipment.senderLat = senderLat;
    if (senderLng !== undefined) shipment.senderLng = senderLng;
    if (receiverLat !== undefined) shipment.receiverLat = receiverLat;
    if (receiverLng !== undefined) shipment.receiverLng = receiverLng;
    if (packageDetails) shipment.packageDetails = packageDetails;
    if (notes) shipment.notes = notes;
    if (ecoOption) shipment.ecoOption = ecoOption;
    if (offsetCarbon !== undefined) shipment.carbonOffset = offsetCarbon;

    await shipment.save();

    // If status changed to delivered, update carbon footprint
    if (status === 'delivered' && statusChanged) {
        try {
            const CarbonFootprint = mongoose.model('CarbonFootprint');
            await CarbonFootprint.findOneAndUpdate(
                { shipmentId: shipment._id },
                { 
                    deliveredAt: new Date(),
                    'activity.actualDistance': shipment.actualDistance || null
                },
                { new: true }
            );
            console.log(`✅ Carbon footprint updated for delivered shipment: ${shipment.trackingNumber}`);
        } catch (err) {
            console.error('Error updating carbon footprint:', err.message);
        }
    }

    // Trigger webhook if status changed
    if (statusChanged) {
        try {
            await webhookService.deliverEvent(`shipment.${status}`, {
                shipmentId: shipment._id,
                trackingNumber: shipment.trackingNumber,
                oldStatus,
                newStatus: status,
                updatedAt: new Date()
            });
        } catch (webhookErr) {
            console.error('Webhook delivery error:', webhookErr.message);
        }
    }

    res.json({
        success: true,
        message: 'Shipment updated successfully',
        data: shipment
    });
}));

// ============================================================
// 📦 DELETE /api/v1/shipments/:id - Cancel shipment
// ============================================================
router.delete('/:id', apiKeyAuth, catchAsync(async (req, res) => {
    const { clientId } = req.apiKey;
    const shipment = await Shipment.findOne({
        _id: req.params.id,
        userId: clientId
    });

    if (!shipment) {
        return res.status(404).json({
            success: false,
            message: 'Shipment not found'
        });
    }

    if (shipment.status === 'delivered') {
        return res.status(400).json({
            success: false,
            message: 'Cannot cancel a delivered shipment'
        });
    }

    if (shipment.status === 'cancelled') {
        return res.status(400).json({
            success: false,
            message: 'Shipment is already cancelled'
        });
    }

    shipment.status = 'cancelled';
    shipment.trackingHistory.push({
        status: 'cancelled',
        note: 'Cancelled via API',
        updatedAt: new Date()
    });

    await shipment.save();

    try {
        await webhookService.deliverEvent('shipment.cancelled', {
            shipmentId: shipment._id,
            trackingNumber: shipment.trackingNumber,
            cancelledAt: new Date()
        });
    } catch (webhookErr) {
        console.error('Webhook delivery error:', webhookErr.message);
    }

    res.json({
        success: true,
        message: 'Shipment cancelled successfully'
    });
}));

// ============================================================
// 📦 GET /api/v1/shipments/stats - Get shipment statistics
// ============================================================
router.get('/stats', apiKeyAuth, catchAsync(async (req, res) => {
    const { clientId } = req.apiKey;
    
    const query = { userId: clientId };

    const total = await Shipment.countDocuments(query);
    const pending = await Shipment.countDocuments({ ...query, status: 'pending' });
    const inTransit = await Shipment.countDocuments({ ...query, status: 'in_transit' });
    const delivered = await Shipment.countDocuments({ ...query, status: 'delivered' });
    const cancelled = await Shipment.countDocuments({ ...query, status: 'cancelled' });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recent = await Shipment.countDocuments({
        ...query,
        createdAt: { $gte: thirtyDaysAgo }
    });

    const stats = await Shipment.aggregate([
        { $match: query },
        { $group: {
            _id: null,
            totalWeight: { $sum: '$weight' },
            avgWeight: { $avg: '$weight' },
            maxWeight: { $max: '$weight' },
            minWeight: { $min: '$weight' },
            totalAmount: { $sum: '$amount' },
            avgAmount: { $avg: '$amount' },
            maxAmount: { $max: '$amount' },
            totalCO2: { $sum: '$carbonEmissions.co2' },
            avgCO2: { $avg: '$carbonEmissions.co2' },
            ecoShipments: { $sum: { $cond: [{ $ne: ['$ecoOption', 'standard'] }, 1, 0] } }
        }}
    ]);

    // Get carbon stats from CarbonFootprint model
    let carbonStats = null;
    try {
        const CarbonFootprint = mongoose.model('CarbonFootprint');
        const carbonAgg = await CarbonFootprint.aggregate([
            { $match: { clientId: clientId } },
            { $group: {
                _id: null,
                totalCO2: { $sum: '$totalEmissions.co2' },
                totalCO2e: { $sum: '$totalEmissions.co2e' },
                avgCO2: { $avg: '$totalEmissions.co2' },
                ecoFriendlyCount: { $sum: { $cond: ['$ecoFriendly', 1, 0] } },
                totalShipments: { $sum: 1 }
            }}
        ]);
        if (carbonAgg.length > 0) {
            carbonStats = carbonAgg[0];
            carbonStats.ecoPercentage = carbonStats.totalShipments > 0 
                ? Math.round((carbonStats.ecoFriendlyCount / carbonStats.totalShipments) * 100) 
                : 0;
        }
    } catch (err) {
        console.error('Error fetching carbon stats:', err.message);
    }

    res.json({
        success: true,
        data: {
            total,
            pending,
            inTransit,
            delivered,
            cancelled,
            recent,
            completionRate: total > 0 ? Math.round((delivered / total) * 100) : 0,
            stats: stats.length > 0 ? stats[0] : null,
            carbon: carbonStats
        }
    });
}));

// ============================================================
// 📦 GET /api/v1/shipments/tracking/:number - Track by tracking number
// ============================================================
router.get('/tracking/:number', apiKeyAuth, catchAsync(async (req, res) => {
    const { clientId } = req.apiKey;
    const trackingNumber = req.params.number;

    const shipment = await Shipment.findOne({
        trackingNumber,
        userId: clientId
    }).populate('assignedDriver', 'name phone email');

    if (!shipment) {
        return res.status(404).json({
            success: false,
            message: 'Shipment not found with this tracking number'
        });
    }

    // Get carbon data
    let carbonData = null;
    if (shipment.carbonFootprintId) {
        try {
            const CarbonFootprint = mongoose.model('CarbonFootprint');
            carbonData = await CarbonFootprint.findById(shipment.carbonFootprintId);
        } catch (err) {
            console.error('Error fetching carbon data:', err.message);
        }
    }

    res.json({
        success: true,
        data: {
            trackingNumber: shipment.trackingNumber,
            status: shipment.status,
            trackingHistory: shipment.trackingHistory,
            senderName: shipment.senderName,
            senderAddress: shipment.senderAddress,
            receiverName: shipment.receiverName,
            receiverAddress: shipment.receiverAddress,
            weight: shipment.weight,
            amount: shipment.amount,
            serviceType: shipment.serviceType,
            shippingTier: shipment.shippingTier,
            ecoOption: shipment.ecoOption,
            carbonOffset: shipment.carbonOffset,
            driver: shipment.assignedDriver ? {
                name: shipment.assignedDriver.name,
                phone: shipment.assignedDriver.phone,
                email: shipment.assignedDriver.email
            } : null,
            carbon: carbonData ? {
                co2: carbonData.totalEmissions?.co2,
                co2e: carbonData.totalEmissions?.co2e,
                ecoFriendly: carbonData.ecoFriendly,
                ecoTier: carbonData.ecoTier
            } : null
        }
    });
}));

// ============================================================
// 📦 PUT /api/v1/shipments/:id/assign-driver - Assign driver
// ============================================================
router.put('/:id/assign-driver', apiKeyAuth, catchAsync(async (req, res) => {
    const { clientId } = req.apiKey;
    const { driverId } = req.body;

    if (!driverId) {
        return res.status(400).json({
            success: false,
            message: 'Driver ID is required'
        });
    }

    const shipment = await Shipment.findOne({
        _id: req.params.id,
        userId: clientId
    });

    if (!shipment) {
        return res.status(404).json({
            success: false,
            message: 'Shipment not found'
        });
    }

    const driver = await User.findById(driverId);
    if (!driver) {
        return res.status(404).json({
            success: false,
            message: 'Driver not found'
        });
    }

    shipment.assignedDriver = driverId;
    shipment.status = 'assigned';
    shipment.trackingHistory.push({
        status: 'assigned',
        note: `Driver assigned: ${driver.name}`,
        updatedAt: new Date()
    });

    await shipment.save();

    try {
        await webhookService.deliverEvent('shipment.assigned', {
            shipmentId: shipment._id,
            trackingNumber: shipment.trackingNumber,
            driverId: driverId,
            driverName: driver.name,
            assignedAt: new Date()
        });
    } catch (webhookErr) {
        console.error('Webhook delivery error:', webhookErr.message);
    }

    res.json({
        success: true,
        message: 'Driver assigned successfully',
        data: shipment
    });
}));

// ============================================================
// 📦 GET /api/v1/shipments/recent - Get recent shipments
// ============================================================
router.get('/recent', apiKeyAuth, catchAsync(async (req, res) => {
    const { clientId } = req.apiKey;
    const { limit = 5 } = req.query;

    const shipments = await Shipment.find({ userId: clientId })
        .populate('assignedDriver', 'name email phone')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit));

    res.json({
        success: true,
        data: shipments,
        count: shipments.length
    });
}));

// ============================================================
// 📦 GET /api/v1/shipments/search - Search shipments
// ============================================================
router.get('/search', apiKeyAuth, catchAsync(async (req, res) => {
    const { clientId } = req.apiKey;
    const { q, status, page = 1, limit = 20 } = req.query;

    const query = { userId: clientId };

    if (q) {
        query.$or = [
            { trackingNumber: { $regex: q, $options: 'i' } },
            { senderName: { $regex: q, $options: 'i' } },
            { receiverName: { $regex: q, $options: 'i' } },
            { senderAddress: { $regex: q, $options: 'i' } },
            { receiverAddress: { $regex: q, $options: 'i' } }
        ];
    }

    if (status) query.status = status;

    const shipments = await Shipment.find(query)
        .populate('assignedDriver', 'name email phone')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Shipment.countDocuments(query);

    res.json({
        success: true,
        data: shipments,
        count: shipments.length,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
        }
    });
}));

// ============================================================
// 📦 GET /api/v1/shipments/delivered - Get delivered shipments
// ============================================================
router.get('/delivered', apiKeyAuth, catchAsync(async (req, res) => {
    const { clientId } = req.apiKey;
    const { startDate, endDate, page = 1, limit = 20 } = req.query;

    const query = {
        userId: clientId,
        status: 'delivered'
    };

    if (startDate || endDate) {
        query.deliveredAt = {};
        if (startDate) query.deliveredAt.$gte = new Date(startDate);
        if (endDate) query.deliveredAt.$lte = new Date(endDate);
    }

    const shipments = await Shipment.find(query)
        .populate('assignedDriver', 'name email phone')
        .sort({ deliveredAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Shipment.countDocuments(query);

    res.json({
        success: true,
        data: shipments,
        count: shipments.length,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
        }
    });
}));

// ============================================================
// 📦 GET /api/v1/shipments/export - Export shipments
// ============================================================
router.get('/export', apiKeyAuth, catchAsync(async (req, res) => {
    const { clientId } = req.apiKey;
    const { format = 'csv', status, startDate, endDate } = req.query;

    const query = { userId: clientId };
    if (status) query.status = status;
    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const shipments = await Shipment.find(query)
        .populate('assignedDriver', 'name email phone')
        .sort({ createdAt: -1 });

    if (format === 'csv') {
        const headers = ['Tracking Number', 'Status', 'Sender', 'Sender Address', 'Receiver', 'Receiver Address', 'Weight (kg)', 'Amount', 'Service Type', 'Shipping Tier', 'Eco Option', 'CO2 (kg)', 'Carbon Offset', 'Eco Friendly', 'Created At', 'Delivered At'];
        const rows = shipments.map(s => [
            s.trackingNumber,
            s.status,
            s.senderName,
            s.senderAddress,
            s.receiverName,
            s.receiverAddress,
            s.weight || 0,
            s.amount || 0,
            s.serviceType || 'standard',
            s.shippingTier || 'standard',
            s.ecoOption || 'standard',
            s.carbonEmissions?.co2 || s.carbonData?.co2 || 0,
            s.carbonOffset ? 'Yes' : 'No',
            s.carbonData?.ecoFriendly ? 'Yes' : 'No',
            s.createdAt ? new Date(s.createdAt).toISOString().split('T')[0] : '',
            s.deliveredAt ? new Date(s.deliveredAt).toISOString().split('T')[0] : ''
        ]);

        let csv = headers.join(',') + '\n';
        rows.forEach(row => {
            csv += row.join(',') + '\n';
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=shipments-${new Date().toISOString().split('T')[0]}.csv`);
        return res.send(csv);
    }

    res.json({
        success: true,
        data: shipments,
        count: shipments.length
    });
}));

module.exports = router;