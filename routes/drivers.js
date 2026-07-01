const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Shipment = require('../models/Shipment');
const User = require('../models/User');

// ===== GET DRIVER DASHBOARD DATA =====
router.get('/dashboard', auth, async (req, res) => {
    try {
        const driver = await User.findById(req.user.id);
        
        if (driver.role !== 'driver') {
            return res.status(403).json({ success: false, message: 'Driver access only' });
        }

        // Get assigned shipments
        const pendingDeliveries = await Shipment.find({
            assignedDriver: req.user.id,
            status: { $ne: 'delivered' }
        }).sort({ createdAt: 1 });

        const completedDeliveries = await Shipment.find({
            assignedDriver: req.user.id,
            status: 'delivered'
        }).sort({ deliveredAt: -1 }).limit(20);

        res.json({
            success: true,
            driver: {
                id: driver._id,
                name: driver.name,
                phone: driver.phone,
                licenseNumber: driver.licenseNumber,
                vehicleType: driver.vehicleType,
                driverStatus: driver.driverStatus,
                rating: driver.rating,
                completedDeliveries: driver.completedDeliveries || 0,
                totalEarnings: driver.totalEarnings || 0
            },
            pendingDeliveries,
            completedDeliveries
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== UPDATE DRIVER STATUS =====
router.put('/status', auth, async (req, res) => {
    try {
        const { driverStatus } = req.body;
        const driver = await User.findById(req.user.id);
        
        if (driver.role !== 'driver') {
            return res.status(403).json({ success: false, message: 'Driver access only' });
        }
        
        driver.driverStatus = driverStatus;
        await driver.save();
        
        res.json({ success: true, driverStatus: driver.driverStatus });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== UPDATE SHIPMENT STATUS (DRIVER) =====
router.put('/shipments/:trackingNumber/status', auth, async (req, res) => {
    try {
        const { status, note } = req.body;
        const shipment = await Shipment.findOne({ trackingNumber: req.params.trackingNumber });
        
        if (!shipment) {
            return res.status(404).json({ success: false, message: 'Shipment not found' });
        }
        
        if (shipment.assignedDriver?.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Not assigned to you' });
        }
        
        shipment.status = status;
        shipment.trackingHistory.push({
            status: status,
            note: note || `Status updated to ${status}`,
            updatedAt: new Date()
        });
        
        await shipment.save();
        
        res.json({ success: true, shipment });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;