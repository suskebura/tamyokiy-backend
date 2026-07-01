const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const WarehouseInventory = require('../models/WarehouseInventory');
const Shipment = require('../models/shipment');
const User = require('../models/user');
const { createNotification } = require('./notification');

// ===== GET CLIENT'S STORED ITEMS =====
router.get('/my-items', auth, async (req, res) => {
    try {
        const shipments = await Shipment.find({ 
            userId: req.user.id,
            status: { $ne: 'delivered' }
        });
        
        const shipmentIds = shipments.map(s => s._id);
        
        const inventory = await WarehouseInventory.find({
            shipmentId: { $in: shipmentIds },
            status: { $nin: ['delivered'] }
        }).populate('warehouseId', 'name code location contact');
        
        // Enhance with storage days
        const enhancedItems = inventory.map(item => {
            const days = Math.floor((Date.now() - new Date(item.receivedAt)) / (1000 * 60 * 60 * 24)) || 1;
            return {
                ...item.toObject(),
                storageDays: days,
                storageCost: days * 2.00 // $2/day
            };
        });
        
        res.json({
            success: true,
            count: enhancedItems.length,
            items: enhancedItems
        });
    } catch (err) {
        console.error('Error loading stored items:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== REQUEST DISPATCH =====
router.post('/request-dispatch', auth, async (req, res) => {
    try {
        const { inventoryId, deliveryAddress, receiverName } = req.body;
        
        if (!deliveryAddress || !receiverName) {
            return res.status(400).json({
                success: false,
                message: 'Delivery address and receiver name are required'
            });
        }
        
        const inventory = await WarehouseInventory.findById(inventoryId)
            .populate('shipmentId');
        
        if (!inventory) {
            return res.status(404).json({ 
                success: false, 
                message: 'Item not found' 
            });
        }
        
        // Check if this belongs to the client
        if (inventory.shipmentId.userId.toString() !== req.user.id) {
            return res.status(403).json({ 
                success: false, 
                message: 'Not your item' 
            });
        }
        
        // Update shipment with new address
        const shipment = await Shipment.findById(inventory.shipmentId._id);
        if (shipment) {
            shipment.receiverAddress = deliveryAddress;
            shipment.receiverName = receiverName;
            await shipment.save();
        }
        
        // Update inventory status
        inventory.status = 'dispatched';
        inventory.dispatchedAt = new Date();
        inventory.notes = `Dispatch requested by ${req.user.name}. New address: ${deliveryAddress}`;
        await inventory.save();
        
        // Find admin users to notify
        const admins = await User.find({ role: 'admin' });
        for (const admin of admins) {
            await createNotification(
                admin._id,
                '📦 Dispatch Request',
                `Client ${req.user.name} requested dispatch for ${inventory.trackingNumber}`,
                'info',
                inventory.trackingNumber
            );
        }
        
        res.json({
            success: true,
            message: 'Dispatch request submitted! You will be notified when your item is shipped.',
            trackingNumber: inventory.trackingNumber
        });
    } catch (err) {
        console.error('Dispatch request error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
