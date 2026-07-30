const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const catchAsync = require('../../../utils/catchAsync');

const Shipment = mongoose.model('Shipment');
const DriverLocation = mongoose.model('DriverLocation');

// ============================================================
// 🔍 GET /api/v1/tracking/:trackingNumber - Public tracking
// ============================================================
router.get('/:trackingNumber', catchAsync(async (req, res) => {
    const { trackingNumber } = req.params;

    const shipment = await Shipment.findOne({ trackingNumber })
        .populate('driver', 'name phone rating')
        .populate('vehicle', 'plateNumber type color');

    if (!shipment) {
        return res.status(404).json({
            success: false,
            message: 'Shipment not found'
        });
    }

    let driverLocation = null;
    if (shipment.driver) {
        driverLocation = await DriverLocation.findOne({
            driverId: shipment.driver._id
        }).sort({ timestamp: -1 });
    }

    res.json({
        success: true,
        data: {
            trackingNumber: shipment.trackingNumber,
            status: shipment.status,
            statusHistory: shipment.statusHistory,
            pickupAddress: shipment.pickupAddress,
            deliveryAddress: shipment.deliveryAddress,
            estimatedDelivery: shipment.estimatedDelivery,
            driver: shipment.driver ? {
                name: shipment.driver.name,
                phone: shipment.driver.phone,
                rating: shipment.driver.rating,
                location: driverLocation ? {
                    lat: driverLocation.location.coordinates[1],
                    lng: driverLocation.location.coordinates[0],
                    timestamp: driverLocation.timestamp
                } : null
            } : null,
            vehicle: shipment.vehicle ? {
                plateNumber: shipment.vehicle.plateNumber,
                type: shipment.vehicle.type,
                color: shipment.vehicle.color
            } : null
        }
    });
}));

// ✅ CORRECT - At the very end
module.exports = router;