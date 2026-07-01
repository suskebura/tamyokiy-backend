const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const WarehouseInventory = require('../models/WarehouseInventory');
const { createAuditLog } = require('../middleware/audit');

// ===== GET ALL INVENTORY (Admin only) =====
router.get('/', adminAuth, async (req, res) => {
    try {
        const { warehouseId, status, page = 1, limit = 50 } = req.query;
        
        let query = {};
        if (warehouseId) query.warehouseId = warehouseId;
        if (status) query.status = status;
        
        const inventory = await WarehouseInventory.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .populate('warehouseId', 'name code location')
            .populate('shipmentId', 'trackingNumber senderName receiverName weight amount');
        
        const total = await WarehouseInventory.countDocuments(query);
        
        res.json({
            success: true,
            inventory,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit))
        });
    } catch (err) {
        console.error('Get inventory error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== GET SINGLE INVENTORY ITEM =====
router.get('/:id', adminAuth, async (req, res) => {
    try {
        const inventory = await WarehouseInventory.findById(req.params.id)
            .populate('warehouseId', 'name code location contact')
            .populate('shipmentId', 'trackingNumber senderName senderAddress receiverName receiverAddress weight amount');
        
        if (!inventory) {
            return res.status(404).json({ success: false, message: 'Inventory item not found' });
        }
        
        res.json({ success: true, inventory });
    } catch (err) {
        console.error('Get inventory item error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== UPDATE INVENTORY STATUS =====
router.put('/:id/status', adminAuth, async (req, res) => {
    try {
        const { status, location, notes } = req.body;
        
        const inventory = await WarehouseInventory.findById(req.params.id);
        if (!inventory) {
            return res.status(404).json({ success: false, message: 'Inventory item not found' });
        }
        
        // Update status and timestamps
        inventory.status = status;
        
        const statusDateMap = {
            'received': 'receivedAt',
            'sorted': 'sortedAt',
            'packed': 'packedAt',
            'loaded': 'loadedAt',
            'dispatched': 'dispatchedAt',
            'delivered': 'deliveredAt'
        };
        
        if (statusDateMap[status]) {
            inventory[statusDateMap[status]] = new Date();
        }
        
        if (location) inventory.location = location;
        if (notes) inventory.notes = notes;
        
        await inventory.save();
        
        await createAuditLog(
            req,
            'UPDATE_INVENTORY_STATUS',
            'WarehouseInventory',
            inventory._id,
            `Updated inventory status to ${status} for ${inventory.trackingNumber}`
        );
        
        res.json({
            success: true,
            message: `Status updated to ${status}`,
            inventory
        });
    } catch (err) {
        console.error('Update inventory error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== DELETE INVENTORY ITEM =====
router.delete('/:id', adminAuth, async (req, res) => {
    try {
        const inventory = await WarehouseInventory.findById(req.params.id);
        if (!inventory) {
            return res.status(404).json({ success: false, message: 'Inventory item not found' });
        }
        
        await inventory.deleteOne();
        
        await createAuditLog(
            req,
            'DELETE_INVENTORY',
            'WarehouseInventory',
            req.params.id,
            `Deleted inventory item ${inventory.trackingNumber}`
        );
        
        res.json({ success: true, message: 'Inventory item deleted' });
    } catch (err) {
        console.error('Delete inventory error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== GET INVENTORY STATS =====
router.get('/stats/summary', adminAuth, async (req, res) => {
    try {
        const total = await WarehouseInventory.countDocuments();
        const byStatus = await WarehouseInventory.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);
        
        const statusMap = {};
        byStatus.forEach(item => {
            statusMap[item._id] = item.count;
        });
        
        res.json({
            success: true,
            stats: {
                total,
                byStatus: statusMap
            }
        });
    } catch (err) {
        console.error('Get inventory stats error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;