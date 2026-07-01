// routes/driverLocation.js

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const DriverLocation = require('../models/DriverLocation');
const User = require('../models/User');

// ===== UPDATE DRIVER LOCATION (Driver only) =====
router.post('/update', auth, async (req, res) => {
    console.log('📍 updateDriverLocation() called');
    
    try {
        const driver = await User.findById(req.user.id);
        
        if (driver.role !== 'driver') {
            return res.status(403).json({
                success: false,
                message: 'Driver access only'
            });
        }

        const { lat, lng, accuracy, speed, heading, status, routeId, trackingNumber, address } = req.body;

        if (lat === undefined || lng === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Latitude and longitude are required'
            });
        }

        // Find or create driver location
        let driverLocation = await DriverLocation.findOne({ driverId: req.user.id });

        if (driverLocation) {
            // Update existing
            driverLocation.lat = lat;
            driverLocation.lng = lng;
            driverLocation.accuracy = accuracy || 0;
            driverLocation.speed = speed || 0;
            driverLocation.heading = heading || 0;
            driverLocation.updatedAt = new Date();
            if (status) driverLocation.status = status;
            if (routeId) driverLocation.routeId = routeId;
            if (trackingNumber) driverLocation.trackingNumber = trackingNumber;
            if (address) driverLocation.address = address;
            
            // Add to history
            driverLocation.addToHistory(lat, lng, speed);
        } else {
            // Create new
            driverLocation = new DriverLocation({
                driverId: req.user.id,
                driverName: driver.name,
                driverEmail: driver.email,
                vehicleType: driver.vehicleType || 'Standard Vehicle',
                lat: lat,
                lng: lng,
                accuracy: accuracy || 0,
                speed: speed || 0,
                heading: heading || 0,
                status: status || 'online',
                routeId: routeId || null,
                trackingNumber: trackingNumber || null,
                address: address || null,
                history: [{ lat, lng, speed, timestamp: new Date() }]
            });
        }

        await driverLocation.save();
        
        console.log(`✅ Driver ${driver.name} location updated: ${lat}, ${lng}`);

        res.json({
            success: true,
            message: 'Location updated',
            driverLocation
        });
    } catch (err) {
        console.error('❌ Update location error:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// ===== GET DRIVER LOCATION (Anyone authenticated) =====
router.get('/:driverId', auth, async (req, res) => {
    try {
        const driverLocation = await DriverLocation.findOne({
            driverId: req.params.driverId
        });

        if (!driverLocation) {
            return res.status(404).json({
                success: false,
                message: 'Driver location not found'
            });
        }

        res.json({
            success: true,
            driverLocation
        });
    } catch (err) {
        console.error('❌ Get driver location error:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// ===== GET ALL ONLINE DRIVERS (Admin only) =====
router.get('/online/all', adminAuth, async (req, res) => {
    try {
        const drivers = await DriverLocation.find({
            status: { $in: ['online', 'delivering'] }
        }).sort({ updatedAt: -1 });

        res.json({
            success: true,
            count: drivers.length,
            drivers
        });
    } catch (err) {
        console.error('❌ Get online drivers error:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// ===== GET DRIVER LOCATION HISTORY (Admin only) =====
router.get('/history/:driverId', adminAuth, async (req, res) => {
    try {
        const driverLocation = await DriverLocation.findOne({
            driverId: req.params.driverId
        });

        if (!driverLocation) {
            return res.status(404).json({
                success: false,
                message: 'Driver not found'
            });
        }

        res.json({
            success: true,
            history: driverLocation.history || [],
            driverName: driverLocation.driverName
        });
    } catch (err) {
        console.error('❌ Get history error:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// ===== UPDATE DRIVER STATUS (Driver only) =====
router.put('/status', auth, async (req, res) => {
    console.log('🔄 updateDriverStatus() called');
    
    try {
        const driver = await User.findById(req.user.id);
        
        if (driver.role !== 'driver') {
            return res.status(403).json({
                success: false,
                message: 'Driver access only'
            });
        }

        const { status, routeId, trackingNumber } = req.body;

        if (!status) {
            return res.status(400).json({
                success: false,
                message: 'Status is required'
            });
        }

        const validStatuses = ['online', 'offline', 'delivering', 'busy'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status. Must be: ' + validStatuses.join(', ')
            });
        }

        let driverLocation = await DriverLocation.findOne({ driverId: req.user.id });

        if (driverLocation) {
            driverLocation.status = status;
            if (routeId) driverLocation.routeId = routeId;
            if (trackingNumber) driverLocation.trackingNumber = trackingNumber;
            await driverLocation.save();
        } else {
            // Create new if doesn't exist
            driverLocation = new DriverLocation({
                driverId: req.user.id,
                driverName: driver.name,
                driverEmail: driver.email,
                vehicleType: driver.vehicleType || 'Standard Vehicle',
                lat: 0,
                lng: 0,
                status: status,
                routeId: routeId || null,
                trackingNumber: trackingNumber || null,
                history: []
            });
            await driverLocation.save();
        }

        console.log(`✅ Driver ${driver.name} status updated to ${status}`);

        res.json({
            success: true,
            message: `Status updated to ${status}`,
            status: status,
            driverLocation
        });
    } catch (err) {
        console.error('❌ Update status error:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

module.exports = router;