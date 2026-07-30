const express = require('express');
const router = express.Router();
// ✅ Use this
const catchAsync = require('../../../utils/catchAsync');

// ============================================================
// 💰 POST /api/v1/rates/estimate - Get shipping rates
// ============================================================
router.post('/estimate', catchAsync(async (req, res) => {
    const {
        pickupAddress,
        deliveryAddress,
        weight,
        dimensions,
        priority = 'standard',
        packageType = 'parcel'
    } = req.body;

    // Calculate distance (mock - in production use OSRM/Google Maps)
    const distance = calculateDistance(
        pickupAddress.lat || 0,
        pickupAddress.lng || 0,
        deliveryAddress.lat || 0,
        deliveryAddress.lng || 0
    );

    // Calculate rate based on distance, weight, and priority
    const baseRate = 5.00; // Base rate
    const distanceRate = distance * 0.50; // $0.50 per km
    const weightRate = (weight || 1) * 2.00; // $2.00 per kg
    const priorityMultiplier = {
        standard: 1,
        express: 1.5,
        premium: 2
    };

    const total = (baseRate + distanceRate + weightRate) * 
                  (priorityMultiplier[priority] || 1);
    
    const estimatedTime = {
        standard: Math.ceil(distance / 40) + 1, // 40km/h average
        express: Math.ceil(distance / 60) + 0.5,
        premium: Math.ceil(distance / 80) + 0.25
    };

    res.json({
        success: true,
        data: {
            rates: [
                {
                    service: 'Standard',
                    price: total.toFixed(2),
                    estimatedDays: Math.ceil(estimatedTime.standard || 1),
                    description: 'Standard delivery service'
                },
                {
                    service: 'Express',
                    price: (total * 1.5).toFixed(2),
                    estimatedDays: Math.ceil(estimatedTime.express || 1),
                    description: 'Express delivery service'
                },
                {
                    service: 'Premium',
                    price: (total * 2).toFixed(2),
                    estimatedDays: 1,
                    description: 'Premium same-day delivery'
                }
            ],
            distance: distance.toFixed(1),
            weight: weight || 1,
            priority
        }
    });
}));

// Helper: Calculate distance (mock)
function calculateDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) {
        return 10 + Math.random() * 20; // Random distance for demo
    }
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// ✅ CORRECT - At the very end
module.exports = router;