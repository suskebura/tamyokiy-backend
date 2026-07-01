const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const Rating = require('../models/Rating');
const Shipment = require('../models/shipment');
const User = require('../models/user');
const { createNotification } = require('./notification');
const { createAuditLog } = require('../middleware/audit');

// ================================================================
// SUBMIT RATING FOR A DELIVERED SHIPMENT
// ================================================================
router.post('/submit', auth, async (req, res) => {
    try {
        const {
            trackingNumber,
            driverRating,
            serviceRating,
            comment,
            deliveryOnTime,
            packageCondition,
            wouldRecommend
        } = req.body;

        // Validate required fields
        if (!trackingNumber) {
            return res.status(400).json({
                success: false,
                message: 'Tracking number is required'
            });
        }

        if (!driverRating || !serviceRating) {
            return res.status(400).json({
                success: false,
                message: 'Please rate both driver and service'
            });
        }

        // Validate rating ranges
        if (driverRating < 1 || driverRating > 5 || serviceRating < 1 || serviceRating > 5) {
            return res.status(400).json({
                success: false,
                message: 'Ratings must be between 1 and 5'
            });
        }

        // Find the shipment
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

        // Check if shipment is delivered
        if (shipment.status !== 'delivered') {
            return res.status(400).json({
                success: false,
                message: 'You can only rate delivered shipments'
            });
        }

        // Check if already rated
        const existingRating = await Rating.findOne({ shipmentId: shipment._id });
        if (existingRating) {
            return res.status(400).json({
                success: false,
                message: 'You have already rated this shipment'
            });
        }

        // Check if driver assigned
        if (!shipment.assignedDriver) {
            return res.status(400).json({
                success: false,
                message: 'No driver assigned to this shipment'
            });
        }

        // Calculate overall rating
        const overallRating = (driverRating + serviceRating) / 2;

        // Create rating
        const rating = new Rating({
            shipmentId: shipment._id,
            trackingNumber: trackingNumber,
            userId: req.user.id,
            driverId: shipment.assignedDriver,
            driverName: shipment.assignedDriverName || 'Unknown Driver',
            driverRating: driverRating,
            serviceRating: serviceRating,
            overallRating: Math.round(overallRating * 10) / 10,
            comment: comment || null,
            deliveryOnTime: deliveryOnTime || null,
            packageCondition: packageCondition || null,
            wouldRecommend: wouldRecommend || null
        });

        await rating.save();

        // Update driver's average rating
        const driverStats = await Rating.getDriverAverageRating(shipment.assignedDriver);
        
        await User.findByIdAndUpdate(shipment.assignedDriver, {
            rating: driverStats.averageRating
        });

        // Notify driver
        await createNotification(
            shipment.assignedDriver,
            '⭐ New Rating Received!',
            `You received a ${driverRating}⭐ rating from ${req.user.name} for shipment ${trackingNumber}`,
            'success',
            trackingNumber
        );

        // Notify customer (thank you)
        await createNotification(
            req.user.id,
            '🙏 Thank You for Your Feedback!',
            `Your rating for ${trackingNumber} has been submitted. Driver: ${shipment.assignedDriverName} (${driverRating}⭐)`,
            'success',
            trackingNumber
        );

        res.json({
            success: true,
            message: 'Rating submitted successfully',
            rating: {
                driverRating: rating.driverRating,
                serviceRating: rating.serviceRating,
                overallRating: rating.overallRating,
                comment: rating.comment,
                driverName: rating.driverName
            }
        });

    } catch (err) {
        console.error('Submit rating error:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// ================================================================
// GET RATING FOR A SHIPMENT
// ================================================================
router.get('/shipment/:trackingNumber', auth, async (req, res) => {
    try {
        const rating = await Rating.findOne({
            trackingNumber: req.params.trackingNumber,
            userId: req.user.id
        });

        if (!rating) {
            return res.json({
                success: true,
                hasRated: false,
                message: 'No rating found for this shipment'
            });
        }

        res.json({
            success: true,
            hasRated: true,
            rating: {
                driverRating: rating.driverRating,
                serviceRating: rating.serviceRating,
                overallRating: rating.overallRating,
                comment: rating.comment,
                driverName: rating.driverName,
                createdAt: rating.createdAt
            }
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// ================================================================
// GET MY RATINGS (as a driver)
// ================================================================
router.get('/my-ratings', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        
        if (user.role !== 'driver') {
            return res.status(403).json({
                success: false,
                message: 'Driver access only'
            });
        }

        const { limit = 50, page = 1 } = req.query;
        
        const ratings = await Rating.find({
            driverId: req.user.id
        })
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .populate('userId', 'name email');

        const total = await Rating.countDocuments({
            driverId: req.user.id
        });

        const stats = await Rating.getDriverAverageRating(req.user.id);

        // Rating distribution
        const distribution = await Rating.aggregate([
            { $match: { driverId: req.user.id } },
            { $group: {
                _id: '$driverRating',
                count: { $sum: 1 }
            }},
            { $sort: { _id: -1 } }
        ]);

        res.json({
            success: true,
            ratings,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
            stats,
            distribution: distribution.map(d => ({
                stars: d._id,
                count: d.count
            }))
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

module.exports = router;
