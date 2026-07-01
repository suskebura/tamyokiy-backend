const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const WarehouseInventory = require('../models/WarehouseInventory');
const Shipment = require('../models/shipment');
const User = require('../models/user');
const { createNotification } = require('./notification');

// ===== GET PICKUPS FOR DRIVER =====
router.get('/pickups', auth, async (req, res) => {
    try {
        // Find driver
        const driver = await User.findById(req.user.id);
        if (!driver || driver.role !== 'driver') {
            return res.status(403).json({ 
                success: false, 
                message: 'Driver access only' 
            });
        }
        
        // Find shipments assigned to this driver that are loaded (ready for pickup)
        const shipments = await Shipment.find({
            assignedDriver: req.user.id,
            status: 'out_for_delivery'
        });
        
        const shipmentIds = shipments.map(s => s._id);
        
        // Find warehouse inventory for these shipments
        const inventory = await WarehouseInventory.find({
            shipmentId: { $in: shipmentIds },
            status: 'loaded' // Ready for pickup
        }).populate('warehouseId', 'name code location contact operatingHours');
        
        const pickups = inventory.map(item => {
            const warehouse = item.warehouseId;
            const shipment = shipments.find(s => s._id.toString() === item.shipmentId.toString());
            return {
                trackingNumber: item.trackingNumber,
                warehouseName: warehouse?.name || 'Unknown',
                warehouseAddress: warehouse?.location?.address || null,
                warehousePhone: warehouse?.contact?.phone || null,
                operatingHours: warehouse?.operatingHours ? 
                    `${warehouse.operatingHours.open} - ${warehouse.operatingHours.close}` : 
                    '08:00 - 18:00',
                receiverName: shipment?.receiverName || 'Unknown',
                receiverAddress: shipment?.receiverAddress || 'Unknown',
                weight: shipment?.weight || 0,
                status: item.status
            };
        });
        
        // Count unique warehouses
        const warehouseNames = new Set(pickups.map(p => p.warehouseName));
        
        // Today's pickups
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayPickups = pickups.filter(p => {
            const item = inventory.find(i => i.trackingNumber === p.trackingNumber);
            return item && new Date(item.createdAt) >= today;
        });
        
        res.json({
            success: true,
            pickups: pickups,
            warehouseCount: warehouseNames.size,
            todayPickups: todayPickups.length
        });
    } catch (err) {
        console.error('Error loading pickups:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== MARK AS PICKED UP =====
router.put('/pickup/:trackingNumber', auth, async (req, res) => {
    try {
        const shipment = await Shipment.findOne({
            trackingNumber: req.params.trackingNumber,
            assignedDriver: req.user.id
        });
        
        if (!shipment) {
            return res.status(404).json({ 
                success: false, 
                message: 'Shipment not found or not assigned to you' 
            });
        }
        
        const inventory = await WarehouseInventory.findOne({
            trackingNumber: req.params.trackingNumber
        });
        
        if (!inventory) {
            return res.status(404).json({ 
                success: false, 
                message: 'Shipment not found in warehouse' 
            });
        }
        
        // Update inventory
        inventory.status = 'dispatched';
        inventory.dispatchedAt = new Date();
        await inventory.save();
        
        // Update shipment
        shipment.status = 'in_transit';
        shipment.trackingHistory.push({
            status: 'in_transit',
            note: 'Driver picked up from warehouse',
            updatedAt: new Date()
        });
        await shipment.save();
        
        // Notify client
        await createNotification(
            shipment.userId,
            '🚚 Shipment Picked Up',
            `Your shipment ${shipment.trackingNumber} has been picked up from the warehouse and is in transit.`,
            'info',
            shipment.trackingNumber
        );
        
        res.json({
            success: true,
            message: 'Shipment marked as picked up'
        });
    } catch (err) {
        console.error('Pickup error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
