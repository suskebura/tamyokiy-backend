const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
// ✅ Use this
const catchAsync = require('../../../utils/catchAsync');

const User = mongoose.model('User');
const DriverLocation = mongoose.model('DriverLocation');

// ... rest of your route code
// ============================================================
// 🚚 GET /api/v1/drivers - List available drivers
// ============================================================
router.get('/', catchAsync(async (req, res) => {
    const { 
        lat, 
        lng, 
        radius = 10,
        available = true,
        limit = 20 
    } = req.query;

    let query = { 
        role: 'driver',
        status: available ? 'available' : { $ne: 'offline' }
    };

    let drivers = await User.find(query)
        .select('name email phone rating status avatar')
        .limit(parseInt(limit));

    // If location provided, filter by proximity
    if (lat && lng) {
        const driverIds = drivers.map(d => d._id);
        const locations = await DriverLocation.find({
            driverId: { $in: driverIds }
        }).sort({ timestamp: -1 });

        // Get latest location for each driver
        const latestLocations = {};
        locations.forEach(loc => {
            if (!latestLocations[loc.driverId]) {
                latestLocations[loc.driverId] = loc;
            }
        });

        // Calculate distance and filter
        drivers = drivers.filter(driver => {
            const location = latestLocations[driver._id];
            if (!location) return false;
            
            const distance = calculateDistance(
                parseFloat(lat),
                parseFloat(lng),
                location.location.coordinates[1],
                location.location.coordinates[0]
            );
            
            return distance <= parseFloat(radius);
        });

        // Add location and distance to response
        drivers = drivers.map(driver => ({
            ...driver.toObject(),
            location: latestLocations[driver._id] ? {
                lat: latestLocations[driver._id].location.coordinates[1],
                lng: latestLocations[driver._id].location.coordinates[0],
                timestamp: latestLocations[driver._id].timestamp
            } : null,
            distance: latestLocations[driver._id] ? 
                calculateDistance(
                    parseFloat(lat),
                    parseFloat(lng),
                    latestLocations[driver._id].location.coordinates[1],
                    latestLocations[driver._id].location.coordinates[0]
                ) : null
        }));
    }

    res.json({
        success: true,
        data: drivers,
        count: drivers.length
    });
}));

// ============================================================
// 🚚 GET /api/v1/drivers/:id/location - Get driver GPS
// ============================================================
router.get('/:id/location', catchAsync(async (req, res) => {
    const driver = await User.findOne({
        _id: req.params.id,
        role: 'driver'
    });

    if (!driver) {
        return res.status(404).json({
            success: false,
            message: 'Driver not found'
        });
    }

    const location = await DriverLocation.findOne({
        driverId: driver._id
    }).sort({ timestamp: -1 });

    if (!location) {
        return res.status(404).json({
            success: false,
            message: 'Driver location not available'
        });
    }

    res.json({
        success: true,
        data: {
            driverId: driver._id,
            name: driver.name,
            location: {
                lat: location.location.coordinates[1],
                lng: location.location.coordinates[0],
                accuracy: location.accuracy,
                timestamp: location.timestamp
            },
            status: driver.status
        }
    });
}));

// Helper: Calculate distance using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
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