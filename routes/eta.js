// routes/eta.js
// ETA Prediction API Routes - FREE

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const Shipment = require('../models/Shipment');
const { predictFreeETA } = require('../utils/freeETAPredictor');

// ============================================================
// 📍 PREDICT ETA FOR A SHIPMENT (Authenticated)
// ============================================================
router.post('/predict', auth, async (req, res) => {
    try {
        console.log('📊 ETA prediction request received');
        console.log('📦 Request body:', req.body);
        
        const {
            trackingNumber,
            originLat,
            originLng,
            destLat,
            destLng,
            weight,
            serviceType,
            driverId
        } = req.body;

        // Validate required fields
        if (!originLat || !originLng || !destLat || !destLng) {
            return res.status(400).json({
                success: false,
                message: 'Origin and destination coordinates are required'
            });
        }

        // Get shipment data if tracking number provided
        let shipment = null;
        if (trackingNumber) {
            shipment = await Shipment.findOne({ trackingNumber });
            if (!shipment) {
                return res.status(404).json({
                    success: false,
                    message: 'Shipment not found'
                });
            }
        }

        // Prepare prediction data
        const predictionData = {
            originLat: parseFloat(originLat),
            originLng: parseFloat(originLng),
            destLat: parseFloat(destLat),
            destLng: parseFloat(destLng),
            weight: weight || shipment?.weight || 5,
            serviceType: serviceType || shipment?.serviceType || 'standard',
            driverId: driverId || shipment?.assignedDriver || null,
            createdAt: shipment?.createdAt || new Date()
        };

        console.log('📊 Prediction data:', predictionData);

        // Get prediction
        const prediction = await predictFreeETA(predictionData);
        console.log('✅ Prediction result:', prediction);

        // If shipment exists, save the prediction
        if (shipment) {
            shipment.realTimeETA = {
                estimatedAt: new Date(),
                minutesLeft: prediction.minutes,
                confidence: prediction.confidence,
                updatedAt: new Date()
            };

            shipment.delayRisk = {
                score: prediction.delayRisk?.score || 0,
                level: prediction.delayRisk?.level || 'low',
                factors: prediction.delayRisk?.factors || [],
                predictedAt: new Date()
            };

            // Save coordinates if not set
            if (!shipment.senderLat) {
                shipment.senderLat = parseFloat(originLat);
                shipment.senderLng = parseFloat(originLng);
            }
            if (!shipment.receiverLat) {
                shipment.receiverLat = parseFloat(destLat);
                shipment.receiverLng = parseFloat(destLng);
            }

            await shipment.save();
        }

        res.json({
            success: true,
            prediction,
            shipment: shipment ? {
                trackingNumber: shipment.trackingNumber,
                status: shipment.status,
                realTimeETA: shipment.realTimeETA,
                delayRisk: shipment.delayRisk
            } : null
        });

    } catch (error) {
        console.error('❌ ETA prediction error:', error);
        res.status(500).json({
            success: false,
            message: 'Error predicting ETA',
            error: error.message
        });
    }
});

// ============================================================
// 🔍 GET ETA FOR A SHIPMENT - Works with OR without token
// ============================================================
router.get('/shipment/:trackingNumber', async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        console.log(`🔍 Getting ETA for shipment: ${trackingNumber}`);

        // Try to get user from token if present, but don't require it
        let userId = null;
        try {
            const token = req.headers.authorization?.split(' ')[1];
            if (token) {
                const jwt = require('jsonwebtoken');
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                userId = decoded.id;
                console.log('✅ User authenticated for ETA:', userId);
            }
        } catch (tokenError) {
            console.log('ℹ️ No valid token, proceeding as public');
        }

        // Find the shipment
        const shipment = await Shipment.findOne({ trackingNumber });
        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: 'Shipment not found'
            });
        }

        // If already delivered
        if (shipment.status === 'delivered') {
            return res.json({
                success: true,
                status: 'delivered',
                deliveredAt: shipment.deliveryProof?.deliveredAt,
                message: 'Shipment already delivered',
                shipment: {
                    trackingNumber: shipment.trackingNumber,
                    status: shipment.status,
                    estimatedDelivery: shipment.estimatedDelivery
                }
            });
        }

        // Check if we have coordinates
        if (!shipment.senderLat || !shipment.receiverLat) {
            console.log('⚠️ No coordinates available for shipment');
            return res.json({
                success: true,
                hasPrediction: false,
                message: 'No coordinates available for ETA prediction',
                shipment: {
                    trackingNumber: shipment.trackingNumber,
                    status: shipment.status,
                    estimatedDelivery: shipment.estimatedDelivery,
                    senderLat: shipment.senderLat || null,
                    receiverLat: shipment.receiverLat || null
                }
            });
        }

        console.log(`📍 Coordinates found: sender(${shipment.senderLat}, ${shipment.senderLng}) receiver(${shipment.receiverLat}, ${shipment.receiverLng})`);

        // Get prediction
        const prediction = await predictFreeETA({
            originLat: shipment.senderLat,
            originLng: shipment.senderLng,
            destLat: shipment.receiverLat,
            destLng: shipment.receiverLng,
            weight: shipment.weight || 5,
            serviceType: shipment.serviceType || 'standard',
            driverId: shipment.assignedDriver || null,
            createdAt: shipment.createdAt
        });

        console.log('✅ Prediction result:', prediction);

        // Update shipment with prediction
        shipment.realTimeETA = {
            estimatedAt: new Date(),
            minutesLeft: prediction.minutes,
            confidence: prediction.confidence,
            updatedAt: new Date()
        };

        shipment.delayRisk = {
            score: prediction.delayRisk?.score || 0,
            level: prediction.delayRisk?.level || 'low',
            factors: prediction.delayRisk?.factors || [],
            predictedAt: new Date()
        };

        await shipment.save();

        res.json({
            success: true,
            hasPrediction: true,
            prediction,
            shipment: {
                trackingNumber: shipment.trackingNumber,
                status: shipment.status,
                realTimeETA: shipment.realTimeETA,
                delayRisk: shipment.delayRisk,
                estimatedDelivery: shipment.estimatedDelivery,
                senderLat: shipment.senderLat,
                receiverLat: shipment.receiverLat
            }
        });

    } catch (error) {
        console.error('❌ Get ETA error:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting ETA',
            error: error.message
        });
    }
});

// ============================================================
// 🔄 UPDATE ALL IN-TRANSIT SHIPMENTS (Admin only / Cron)
// ============================================================
router.post('/update-all', adminAuth, async (req, res) => {
    try {
        const shipments = await Shipment.find({
            status: { $in: ['picked_up', 'in_transit', 'out_for_delivery'] }
        });

        let updated = 0;
        let errors = 0;

        for (const shipment of shipments) {
            try {
                // Skip if no coordinates
                if (!shipment.senderLat || !shipment.receiverLat) {
                    continue;
                }

                const prediction = await predictFreeETA({
                    originLat: shipment.senderLat,
                    originLng: shipment.senderLng,
                    destLat: shipment.receiverLat,
                    destLng: shipment.receiverLng,
                    weight: shipment.weight || 5,
                    serviceType: shipment.serviceType || 'standard',
                    driverId: shipment.assignedDriver || null,
                    createdAt: shipment.createdAt
                });

                shipment.realTimeETA = {
                    estimatedAt: new Date(),
                    minutesLeft: prediction.minutes,
                    confidence: prediction.confidence,
                    updatedAt: new Date()
                };

                shipment.delayRisk = {
                    score: prediction.delayRisk?.score || 0,
                    level: prediction.delayRisk?.level || 'low',
                    factors: prediction.delayRisk?.factors || [],
                    predictedAt: new Date()
                };

                await shipment.save();
                updated++;

                // If high risk, create notification
                if (prediction.delayRisk?.level === 'high' || prediction.delayRisk?.level === 'critical') {
                    const { createNotification } = require('./notification');
                    await createNotification(
                        shipment.userId,
                        '⚠️ Delivery Delay Risk',
                        `Shipment ${shipment.trackingNumber} may arrive later than expected due to: ${prediction.delayRisk.factors.join(', ')}`,
                        'warning',
                        shipment.trackingNumber
                    );
                }

            } catch (err) {
                errors++;
                console.error(`❌ Error updating ${shipment.trackingNumber}:`, err.message);
            }
        }

        res.json({
            success: true,
            message: `Updated ${updated} shipments, ${errors} errors`,
            total: shipments.length,
            updated,
            errors
        });

    } catch (error) {
        console.error('❌ Update all error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating shipments',
            error: error.message
        });
    }
});

// ============================================================
// 📊 GET ETA STATISTICS (Admin only)
// ============================================================
router.get('/stats', adminAuth, async (req, res) => {
    try {
        const total = await Shipment.countDocuments();
        const withETA = await Shipment.countDocuments({
            'realTimeETA.updatedAt': { $ne: null }
        });
        const withDelayRisk = await Shipment.countDocuments({
            'delayRisk.level': { $in: ['high', 'critical'] }
        });
        const delivered = await Shipment.countDocuments({ status: 'delivered' });

        // Get average confidence
        const result = await Shipment.aggregate([
            { $match: { 'realTimeETA.confidence': { $ne: null } } },
            { $group: { _id: null, avgConfidence: { $avg: '$realTimeETA.confidence' } } }
        ]);

        const avgConfidence = result.length > 0 ? Math.round(result[0].avgConfidence) : 0;

        res.json({
            success: true,
            stats: {
                totalShipments: total,
                withRealTimeETA: withETA,
                withDelayRisk: withDelayRisk,
                delivered: delivered,
                averageConfidence: avgConfidence
            }
        });

    } catch (error) {
        console.error('❌ Stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting stats',
            error: error.message
        });
    }
});

// ============================================================
// 📊 GET ETA ACCURACY STATS - ✅ FIXED: Now works for DRIVERS too!
// ============================================================
router.get('/accuracy-stats', auth, async (req, res) => {
    try {
        const { period = 'month' } = req.query;
        const userId = req.user.id;
        const userRole = req.user.role;
        
        console.log(`📊 ETA accuracy stats requested by: ${userRole} (${userId})`);
        
        const now = new Date();
        let startDate = new Date();
        if (period === 'month') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        } else if (period === 'quarter') {
            const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
            startDate = new Date(now.getFullYear(), quarterMonth, 1);
        } else if (period === 'year') {
            startDate = new Date(now.getFullYear(), 0, 1);
        } else if (period === 'all') {
            startDate = new Date(2026, 0, 1);
        }
        
        // ✅ FIX: Build query based on user role
        let query = {
            'realTimeETA.estimatedAt': { $ne: null },
            createdAt: { $gte: startDate }
        };
        
        // ✅ If driver, only get their shipments
        if (userRole === 'driver') {
            query.assignedDriver = userId;
            console.log('👤 Driver mode: filtering by assignedDriver');
        }
        
        // Get all shipments with ETA predictions
        const shipments = await Shipment.find(query);
        
        const totalWithETA = shipments.length;
        
        // Calculate accuracy
        let totalError = 0;
        let totalAbsoluteError = 0;
        let onTimeCount = 0;
        let earlyCount = 0;
        let lateCount = 0;
        let deliveredCount = 0;
        let predictedCount = 0;
        
        shipments.forEach(s => {
            if (s.status === 'delivered' && s.deliveryProof?.deliveredAt && s.realTimeETA?.minutesLeft) {
                const deliveredAt = new Date(s.deliveryProof.deliveredAt);
                const createdAt = new Date(s.createdAt);
                const actualMinutes = (deliveredAt - createdAt) / (1000 * 60);
                const predictedMinutes = s.realTimeETA.minutesLeft;
                
                const error = actualMinutes - predictedMinutes;
                totalError += error;
                totalAbsoluteError += Math.abs(error);
                deliveredCount++;
                predictedCount++;
                
                if (error <= 0) {
                    onTimeCount++;
                } else if (error < 5) {
                    earlyCount++;
                } else {
                    lateCount++;
                }
            }
        });
        
        const avgError = deliveredCount > 0 ? totalError / deliveredCount : 0;
        const avgAbsoluteError = deliveredCount > 0 ? totalAbsoluteError / deliveredCount : 0;
        const accuracyScore = avgAbsoluteError < 10 ? 95 : 
                             avgAbsoluteError < 30 ? 85 :
                             avgAbsoluteError < 60 ? 70 : 50;
        
        // Risk distribution
        const riskDistribution = await Shipment.aggregate([
            { $match: query },
            { $match: { 'delayRisk.level': { $ne: null } } },
            { $group: { _id: '$delayRisk.level', count: { $sum: 1 } } }
        ]);
        
        const riskMap = { low: 0, medium: 0, high: 0, critical: 0 };
        riskDistribution.forEach(r => {
            riskMap[r._id] = r.count;
        });
        
        // Get recent predictions
        const recentPredictions = await Shipment.find(query)
            .sort({ 'realTimeETA.estimatedAt': -1 })
            .limit(20)
            .select('trackingNumber status realTimeETA deliveryProof createdAt');
        
        const recentData = recentPredictions.map(s => {
            const deliveredAt = s.deliveryProof?.deliveredAt ? new Date(s.deliveryProof.deliveredAt) : null;
            const createdAt = new Date(s.createdAt);
            const predictedMinutes = s.realTimeETA?.minutesLeft || 0;
            let actualMinutes = null;
            let error = null;
            let errorPercent = null;
            
            if (deliveredAt) {
                actualMinutes = (deliveredAt - createdAt) / (1000 * 60);
                error = actualMinutes - predictedMinutes;
                errorPercent = predictedMinutes > 0 ? (error / predictedMinutes) * 100 : 0;
            }
            
            return {
                trackingNumber: s.trackingNumber,
                predictedMinutes: Math.round(predictedMinutes),
                actualMinutes: actualMinutes ? Math.round(actualMinutes) : null,
                error: error ? Math.round(error) : null,
                errorPercent: errorPercent ? Math.round(errorPercent) : null,
                status: s.status,
                deliveredAt: deliveredAt
            };
        });
        
        res.json({
            success: true,
            stats: {
                totalWithETA,
                deliveredCount,
                predictedCount,
                avgError: Math.round(avgError * 10) / 10,
                avgAbsoluteError: Math.round(avgAbsoluteError * 10) / 10,
                accuracyScore: Math.round(accuracyScore),
                onTimeCount,
                earlyCount,
                lateCount,
                onTimeRate: deliveredCount > 0 ? Math.round((onTimeCount / deliveredCount) * 100) : 0,
                earlyRate: deliveredCount > 0 ? Math.round((earlyCount / deliveredCount) * 100) : 0,
                lateRate: deliveredCount > 0 ? Math.round((lateCount / deliveredCount) * 100) : 0,
                riskDistribution: riskMap
            },
            recentPredictions: recentData,
            period,
            userRole: userRole // For debugging
        });
        
    } catch (error) {
        console.error('❌ ETA accuracy stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting ETA accuracy stats',
            error: error.message
        });
    }
});

module.exports = router;