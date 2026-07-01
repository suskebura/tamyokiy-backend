const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const Warehouse = require('../models/Warehouse');
const WarehouseInventory = require('../models/WarehouseInventory');
const Shipment = require('../models/Shipment');
const User = require('../models/User');
const { createNotification } = require('./notification');
const { createAuditLog } = require('../middleware/audit');

// ================================================================
// 📦 WAREHOUSE MANAGEMENT
// ================================================================

// ===== CREATE WAREHOUSE (Admin only) =====
router.post('/warehouses', adminAuth, async (req, res) => {
    try {
        const { name, code, location, contact, capacity, operatingHours } = req.body;
        
        // Check if warehouse code already exists
        const existing = await Warehouse.findOne({ code: code.toUpperCase() });
        if (existing) {
            return res.status(400).json({
                success: false,
                message: 'Warehouse code already exists'
            });
        }
        
        const warehouse = new Warehouse({
            name,
            code: code.toUpperCase(),
            location,
            contact,
            capacity: {
                total: capacity || 0,
                used: 0,
                available: capacity || 0
            },
            operatingHours
        });
        
        await warehouse.save();
        
        await createAuditLog(
            req,
            'CREATE_WAREHOUSE',
            'Warehouse',
            warehouse._id,
            `Created warehouse: ${warehouse.name} (${warehouse.code})`
        );
        
        res.status(201).json({
            success: true,
            message: 'Warehouse created successfully',
            warehouse
        });
    } catch (err) {
        console.error('Create warehouse error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== GET ALL WAREHOUSES =====
router.get('/warehouses', auth, async (req, res) => {
    try {
        const warehouses = await Warehouse.find().sort({ createdAt: -1 });
        res.json({
            success: true,
            count: warehouses.length,
            warehouses
        });
    } catch (err) {
        console.error('Get warehouses error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== GET SINGLE WAREHOUSE =====
router.get('/warehouses/:id', auth, async (req, res) => {
    try {
        const warehouse = await Warehouse.findById(req.params.id);
        if (!warehouse) {
            return res.status(404).json({
                success: false,
                message: 'Warehouse not found'
            });
        }
        res.json({ success: true, warehouse });
    } catch (err) {
        console.error('Get warehouse error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== UPDATE WAREHOUSE (Admin only) =====
router.put('/warehouses/:id', adminAuth, async (req, res) => {
    try {
        const { name, location, contact, capacity, status, operatingHours } = req.body;
        
        const warehouse = await Warehouse.findById(req.params.id);
        if (!warehouse) {
            return res.status(404).json({
                success: false,
                message: 'Warehouse not found'
            });
        }
        
        if (name) warehouse.name = name;
        if (location) warehouse.location = location;
        if (contact) warehouse.contact = contact;
        if (capacity !== undefined) {
            warehouse.capacity.total = capacity;
            warehouse.capacity.available = capacity - warehouse.capacity.used;
        }
        if (status) warehouse.status = status;
        if (operatingHours) warehouse.operatingHours = operatingHours;
        
        await warehouse.save();
        
        await createAuditLog(
            req,
            'UPDATE_WAREHOUSE',
            'Warehouse',
            warehouse._id,
            `Updated warehouse: ${warehouse.name}`
        );
        
        res.json({
            success: true,
            message: 'Warehouse updated successfully',
            warehouse
        });
    } catch (err) {
        console.error('Update warehouse error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== DELETE WAREHOUSE (Admin only) =====
router.delete('/warehouses/:id', adminAuth, async (req, res) => {
    try {
        const warehouse = await Warehouse.findById(req.params.id);
        if (!warehouse) {
            return res.status(404).json({
                success: false,
                message: 'Warehouse not found'
            });
        }
        
        // Check if warehouse has inventory
        const inventoryCount = await WarehouseInventory.countDocuments({
            warehouseId: req.params.id
        });
        
        if (inventoryCount > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete warehouse with ${inventoryCount} items in inventory. Transfer or process them first.`
            });
        }
        
        await warehouse.deleteOne();
        
        await createAuditLog(
            req,
            'DELETE_WAREHOUSE',
            'Warehouse',
            req.params.id,
            `Deleted warehouse: ${warehouse.name}`
        );
        
        res.json({
            success: true,
            message: 'Warehouse deleted successfully'
        });
    } catch (err) {
        console.error('Delete warehouse error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================================================================
// 📦 WAREHOUSE INVENTORY MANAGEMENT
// ================================================================

// ===== RECEIVE SHIPMENT AT WAREHOUSE =====
router.post('/inventory/receive', adminAuth, async (req, res) => {
    try {
        const { trackingNumber, warehouseCode, location, notes } = req.body;
        
        // Find warehouse
        const warehouse = await Warehouse.findOne({ code: warehouseCode.toUpperCase() });
        if (!warehouse) {
            return res.status(404).json({
                success: false,
                message: 'Warehouse not found'
            });
        }
        
        // Find shipment
        const shipment = await Shipment.findOne({ trackingNumber });
        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: 'Shipment not found'
            });
        }
        
        // Check if already in inventory
        const existing = await WarehouseInventory.findOne({
            trackingNumber,
            warehouseId: warehouse._id
        });
        
        if (existing) {
            return res.status(400).json({
                success: false,
                message: 'Shipment already in this warehouse inventory'
            });
        }
        
        // Create inventory entry
        const inventory = new WarehouseInventory({
            warehouseId: warehouse._id,
            shipmentId: shipment._id,
            trackingNumber: shipment.trackingNumber,
            status: 'received',
            receivedAt: new Date(),
            location: location || null,
            notes: notes || null
        });
        
        await inventory.save();
        
        // Update warehouse capacity
        warehouse.capacity.used += 1;
        warehouse.capacity.available = warehouse.capacity.total - warehouse.capacity.used;
        await warehouse.save();
        
        // Update shipment status
        shipment.status = 'in_transit';
        shipment.trackingHistory.push({
            status: 'in_transit',
            note: `Shipment received at ${warehouse.name} warehouse`,
            updatedAt: new Date()
        });
        await shipment.save();
        
        // Notify customer
        await createNotification(
            shipment.userId,
            '📦 Shipment Arrived at Warehouse',
            `Your shipment ${trackingNumber} has arrived at ${warehouse.name} warehouse for processing.`,
            'info',
            trackingNumber
        );
        
        await createAuditLog(
            req,
            'RECEIVE_SHIPMENT',
            'WarehouseInventory',
            inventory._id,
            `Shipment ${trackingNumber} received at ${warehouse.name}`
        );
        
        res.json({
            success: true,
            message: `Shipment ${trackingNumber} received at ${warehouse.name}`,
            inventory
        });
    } catch (err) {
        console.error('Receive shipment error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== UPDATE WAREHOUSE STATUS (Sort, Pack, Load, Dispatch) =====
router.put('/inventory/:inventoryId/status', adminAuth, async (req, res) => {
    try {
        const { status, location, notes } = req.body;
        
        const inventory = await WarehouseInventory.findById(req.params.inventoryId)
            .populate('warehouseId');
        
        if (!inventory) {
            return res.status(404).json({
                success: false,
                message: 'Inventory record not found'
            });
        }
        
        // Validate status transition
        const validTransitions = {
            'received': ['sorted'],
            'sorted': ['packed'],
            'packed': ['loaded'],
            'loaded': ['dispatched'],
            'dispatched': ['delivered']
        };
        
        if (status !== inventory.status && !validTransitions[inventory.status]?.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status transition from ${inventory.status} to ${status}`
            });
        }
        
        // Update status and timestamps
        inventory.status = status;
        
        const statusDateMap = {
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
        
        // If dispatched, update shipment status
        if (status === 'dispatched') {
            const shipment = await Shipment.findById(inventory.shipmentId);
            if (shipment) {
                shipment.status = 'out_for_delivery';
                shipment.trackingHistory.push({
                    status: 'out_for_delivery',
                    note: `Shipment dispatched from ${inventory.warehouseId.name} warehouse`,
                    updatedAt: new Date()
                });
                await shipment.save();
                
                // Notify customer
                await createNotification(
                    shipment.userId,
                    '🚚 Shipment Out for Delivery',
                    `Your shipment ${shipment.trackingNumber} has been dispatched from ${inventory.warehouseId.name} warehouse and is out for delivery!`,
                    'info',
                    shipment.trackingNumber
                );
            }
        }
        
        // If delivered, update shipment status
        if (status === 'delivered') {
            const shipment = await Shipment.findById(inventory.shipmentId);
            if (shipment && shipment.status !== 'delivered') {
                shipment.status = 'delivered';
                shipment.trackingHistory.push({
                    status: 'delivered',
                    note: `Shipment delivered from ${inventory.warehouseId.name} warehouse`,
                    updatedAt: new Date()
                });
                await shipment.save();
                
                // Update warehouse capacity
                const warehouse = await Warehouse.findById(inventory.warehouseId);
                if (warehouse) {
                    warehouse.capacity.used = Math.max(0, warehouse.capacity.used - 1);
                    warehouse.capacity.available = warehouse.capacity.total - warehouse.capacity.used;
                    await warehouse.save();
                }
                
                // Notify customer
                await createNotification(
                    shipment.userId,
                    '✅ Shipment Delivered!',
                    `Your shipment ${shipment.trackingNumber} has been delivered successfully. Thank you for choosing TAMYOKIY!`,
                    'success',
                    shipment.trackingNumber
                );
            }
        }
        
        await createAuditLog(
            req,
            'UPDATE_INVENTORY_STATUS',
            'WarehouseInventory',
            inventory._id,
            `Updated inventory status to ${status} for ${inventory.trackingNumber}`
        );
        
        res.json({
            success: true,
            message: `Inventory status updated to ${status}`,
            inventory
        });
    } catch (err) {
        console.error('Update inventory error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== GET WAREHOUSE INVENTORY =====
router.get('/inventory/:warehouseId', auth, async (req, res) => {
    try {
        const { status, page = 1, limit = 50 } = req.query;
        
        let query = { warehouseId: req.params.warehouseId };
        if (status) query.status = status;
        
        const inventory = await WarehouseInventory.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .populate('shipmentId', 'trackingNumber senderName receiverName weight amount')
            .populate('assignedDriverId', 'name email');
        
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

// ===== GET SHIPMENT WAREHOUSE STATUS =====
router.get('/shipment/:trackingNumber', auth, async (req, res) => {
    try {
        const inventory = await WarehouseInventory.findOne({
            trackingNumber: req.params.trackingNumber
        }).populate('warehouseId', 'name code location');
        
        if (!inventory) {
            return res.json({
                success: true,
                inWarehouse: false,
                message: 'Shipment not in warehouse'
            });
        }
        
        res.json({
            success: true,
            inWarehouse: true,
            inventory
        });
    } catch (err) {
        console.error('Get shipment warehouse status error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== ASSIGN DRIVER TO WAREHOUSE SHIPMENT =====
router.put('/inventory/:inventoryId/assign-driver', adminAuth, async (req, res) => {
    try {
        const { driverId } = req.body;
        
        const inventory = await WarehouseInventory.findById(req.params.inventoryId);
        if (!inventory) {
            return res.status(404).json({
                success: false,
                message: 'Inventory record not found'
            });
        }
        
        const driver = await User.findById(driverId);
        if (!driver || driver.role !== 'driver') {
            return res.status(404).json({
                success: false,
                message: 'Driver not found'
            });
        }
        
        inventory.assignedDriverId = driver._id;
        inventory.assignedDriverName = driver.name;
        await inventory.save();
        
        // Also update the shipment
        const shipment = await Shipment.findById(inventory.shipmentId);
        if (shipment) {
            shipment.assignedDriver = driver._id;
            shipment.assignedDriverName = driver.name;
            shipment.assignedAt = new Date();
            await shipment.save();
        }
        
        // Notify driver
        await createNotification(
            driver._id,
            '📦 New Shipment Ready for Pickup',
            `Shipment ${inventory.trackingNumber} is ready for pickup at ${inventory.warehouseId?.name || 'warehouse'}.`,
            'info',
            inventory.trackingNumber
        );
        
        await createAuditLog(
            req,
            'ASSIGN_DRIVER_WAREHOUSE',
            'WarehouseInventory',
            inventory._id,
            `Assigned driver ${driver.name} to ${inventory.trackingNumber}`
        );
        
        res.json({
            success: true,
            message: `Driver ${driver.name} assigned successfully`,
            inventory
        });
    } catch (err) {
        console.error('Assign driver error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== GET WAREHOUSE STATISTICS =====
router.get('/stats', adminAuth, async (req, res) => {
    try {
        const totalWarehouses = await Warehouse.countDocuments();
        const activeWarehouses = await Warehouse.countDocuments({ status: 'active' });
        
        const totalInventory = await WarehouseInventory.countDocuments();
        const received = await WarehouseInventory.countDocuments({ status: 'received' });
        const sorted = await WarehouseInventory.countDocuments({ status: 'sorted' });
        const packed = await WarehouseInventory.countDocuments({ status: 'packed' });
        const loaded = await WarehouseInventory.countDocuments({ status: 'loaded' });
        const dispatched = await WarehouseInventory.countDocuments({ status: 'dispatched' });
        const delivered = await WarehouseInventory.countDocuments({ status: 'delivered' });
        
        // Total capacity across warehouses
        const warehouses = await Warehouse.find();
        const totalCapacity = warehouses.reduce((sum, w) => sum + (w.capacity.total || 0), 0);
        const totalUsed = warehouses.reduce((sum, w) => sum + (w.capacity.used || 0), 0);
        
        res.json({
            success: true,
            stats: {
                totalWarehouses,
                activeWarehouses,
                totalInventory,
                inventoryByStatus: {
                    received,
                    sorted,
                    packed,
                    loaded,
                    dispatched,
                    delivered
                },
                capacity: {
                    total: totalCapacity,
                    used: totalUsed,
                    available: totalCapacity - totalUsed,
                    utilization: totalCapacity > 0 ? Math.round((totalUsed / totalCapacity) * 100) : 0
                }
            }
        });
    } catch (err) {
        console.error('Get warehouse stats error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;