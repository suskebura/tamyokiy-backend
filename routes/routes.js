const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const Route = require('../models/Route');
const Shipment = require('../models/Shipment');
const User = require('../models/User');
const { createNotification } = require('./notification');
const { createAuditLog } = require('../middleware/audit');

// ================================================================
// 📋 GET ALL ROUTES
// ================================================================
router.get('/', auth, async (req, res) => {
    try {
        const { status, driverId, limit = 50, page = 1 } = req.query;
        
        let query = {};
        if (status) query.status = status;
        if (driverId) query.driverId = driverId;
        
        const routes = await Route.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .populate('driverId', 'name email phone vehicleType')
            .populate('createdBy', 'name email');
        
        const total = await Route.countDocuments(query);
        
        res.json({
            success: true,
            routes,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit))
        });
    } catch (err) {
        console.error('Get routes error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================================================================
// 📋 GET SINGLE ROUTE
// ================================================================
router.get('/:id', auth, async (req, res) => {
    try {
        const route = await Route.findById(req.params.id)
            .populate('driverId', 'name email phone vehicleType rating')
            .populate('createdBy', 'name email')
            .populate('stops.shipmentId', 'trackingNumber senderName receiverName amount weight');
        
        if (!route) {
            return res.status(404).json({ success: false, message: 'Route not found' });
        }
        
        res.json({
            success: true,
            route,
            progress: route.getProgress()
        });
    } catch (err) {
        console.error('Get route error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================================================================
// 🆕 CREATE ROUTE
// ================================================================
router.post('/', auth, async (req, res) => {
    try {
        const {
            name,
            description,
            driverId,
            stops,
            startLocation,
            endLocation,
            totalDistance,
            estimatedDuration
        } = req.body;
        
        // Validate required fields
        if (!name) {
            return res.status(400).json({ success: false, message: 'Route name is required' });
        }
        
        if (!stops || stops.length === 0) {
            return res.status(400).json({ success: false, message: 'At least one stop is required' });
        }
        
        // Get driver info if assigned
        let driverName = null;
        let driverVehicle = null;
        if (driverId) {
            const driver = await User.findById(driverId);
            if (driver && driver.role === 'driver') {
                driverName = driver.name;
                driverVehicle = driver.vehicleType || 'Standard Vehicle';
            }
        }
        
        // Process stops - get shipment details
        const processedStops = [];
        for (let i = 0; i < stops.length; i++) {
            const stop = stops[i];
            let shipmentData = {};
            
            if (stop.shipmentId) {
                const shipment = await Shipment.findById(stop.shipmentId);
                if (shipment) {
                    shipmentData = {
                        trackingNumber: shipment.trackingNumber,
                        address: stop.type === 'delivery' ? shipment.receiverAddress : shipment.senderAddress,
                        receiverName: stop.type === 'delivery' ? shipment.receiverName : shipment.senderName,
                        receiverPhone: stop.type === 'delivery' ? shipment.receiverPhone : shipment.senderPhone
                    };
                }
            }
            
            processedStops.push({
                shipmentId: stop.shipmentId || null,
                trackingNumber: stop.trackingNumber || shipmentData.trackingNumber || null,
                stopOrder: i + 1,
                type: stop.type || 'delivery',
                address: stop.address || shipmentData.address || 'Address not specified',
                receiverName: stop.receiverName || shipmentData.receiverName || 'Unknown',
                receiverPhone: stop.receiverPhone || shipmentData.receiverPhone || null,
                notes: stop.notes || null,
                eta: stop.eta || null
            });
        }
        
        // Create route
        const route = new Route({
            name,
            description: description || null,
            driverId: driverId || null,
            driverName: driverName || null,
            driverVehicle: driverVehicle || null,
            stops: processedStops,
            startLocation: startLocation || null,
            endLocation: endLocation || null,
            totalDistance: totalDistance || 0,
            estimatedDuration: estimatedDuration || 0,
            totalStops: processedStops.length,
            createdBy: req.user.id
        });
        
        await route.save();
        
        // Notify driver if assigned
        if (driverId) {
            await createNotification(
                driverId,
                '🗺️ New Route Assigned',
                `You have been assigned to route "${name}" with ${processedStops.length} stops.`,
                'info',
                route._id
            );
        }
        
        await createAuditLog(
            req,
            'CREATE_ROUTE',
            'Route',
            route._id,
            `Created route "${name}" with ${processedStops.length} stops`
        );
        
        res.status(201).json({
            success: true,
            message: 'Route created successfully',
            route,
            routeNumber: route.routeNumber
        });
        
    } catch (err) {
        console.error('Create route error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================================================================
// ✏️ UPDATE ROUTE
// ================================================================
router.put('/:id', auth, async (req, res) => {
    try {
        const {
            name,
            description,
            driverId,
            status,
            startLocation,
            endLocation,
            totalDistance,
            estimatedDuration
        } = req.body;
        
        const route = await Route.findById(req.params.id);
        if (!route) {
            return res.status(404).json({ success: false, message: 'Route not found' });
        }
        
        // Update fields
        if (name) route.name = name;
        if (description !== undefined) route.description = description;
        if (startLocation) route.startLocation = startLocation;
        if (endLocation) route.endLocation = endLocation;
        if (totalDistance !== undefined) route.totalDistance = totalDistance;
        if (estimatedDuration !== undefined) route.estimatedDuration = estimatedDuration;
        
        // Update driver if changed
        if (driverId && driverId !== route.driverId?.toString()) {
            const driver = await User.findById(driverId);
            if (driver && driver.role === 'driver') {
                route.driverId = driver._id;
                route.driverName = driver.name;
                route.driverVehicle = driver.vehicleType || 'Standard Vehicle';
                
                await createNotification(
                    driverId,
                    '🗺️ Route Assigned',
                    `You have been assigned to route "${route.name}".`,
                    'info',
                    route._id
                );
            }
        }
        
        // Update status if provided
        if (status) {
            await route.updateStatus(status);
        }
        
        await route.save();
        
        await createAuditLog(
            req,
            'UPDATE_ROUTE',
            'Route',
            route._id,
            `Updated route "${route.name}"`
        );
        
        res.json({
            success: true,
            message: 'Route updated successfully',
            route
        });
        
    } catch (err) {
        console.error('Update route error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================================================================
// 🗑️ DELETE ROUTE
// ================================================================
router.delete('/:id', auth, async (req, res) => {
    try {
        const route = await Route.findById(req.params.id);
        if (!route) {
            return res.status(404).json({ success: false, message: 'Route not found' });
        }
        
        // Don't delete completed routes (optional)
        if (route.status === 'completed') {
            return res.status(400).json({ 
                success: false, 
                message: 'Cannot delete a completed route' 
            });
        }
        
        await route.deleteOne();
        
        await createAuditLog(
            req,
            'DELETE_ROUTE',
            'Route',
            req.params.id,
            `Deleted route "${route.name}"`
        );
        
        res.json({
            success: true,
            message: 'Route deleted successfully'
        });
        
    } catch (err) {
        console.error('Delete route error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================================================================
// 🚚 ASSIGN DRIVER TO ROUTE
// ================================================================
router.put('/:id/assign-driver', auth, async (req, res) => {
    try {
        const { driverId } = req.body;
        
        if (!driverId) {
            return res.status(400).json({ success: false, message: 'Driver ID is required' });
        }
        
        const route = await Route.findById(req.params.id);
        if (!route) {
            return res.status(404).json({ success: false, message: 'Route not found' });
        }
        
        const driver = await User.findById(driverId);
        if (!driver || driver.role !== 'driver') {
            return res.status(404).json({ success: false, message: 'Driver not found' });
        }
        
        // Check if driver is available
        if (driver.driverStatus === 'on_delivery') {
            return res.status(400).json({ 
                success: false, 
                message: 'Driver is currently on delivery' 
            });
        }
        
        route.driverId = driver._id;
        route.driverName = driver.name;
        route.driverVehicle = driver.vehicleType || 'Standard Vehicle';
        await route.save();
        
        await createNotification(
            driverId,
            '🗺️ New Route Assigned',
            `You have been assigned to route "${route.name}" with ${route.totalStops} stops.`,
            'info',
            route._id
        );
        
        await createAuditLog(
            req,
            'ASSIGN_DRIVER_ROUTE',
            'Route',
            route._id,
            `Assigned driver ${driver.name} to route "${route.name}"`
        );
        
        res.json({
            success: true,
            message: `Driver ${driver.name} assigned to route`,
            route
        });
        
    } catch (err) {
        console.error('Assign driver error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================================================================
// 📊 UPDATE ROUTE STATUS
// ================================================================
router.put('/:id/status', auth, async (req, res) => {
    try {
        const { status } = req.body;
        
        const validStatuses = ['planned', 'in_progress', 'completed', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid status. Must be: planned, in_progress, completed, cancelled' 
            });
        }
        
        const route = await Route.findById(req.params.id);
        if (!route) {
            return res.status(404).json({ success: false, message: 'Route not found' });
        }
        
        await route.updateStatus(status);
        
        // Notify driver if assigned
        if (route.driverId) {
            await createNotification(
                route.driverId,
                `🗺️ Route ${status.replace('_', ' ')}`,
                `Route "${route.name}" is now ${status.replace('_', ' ')}.`,
                status === 'completed' ? 'success' : 'info',
                route._id
            );
        }
        
        await createAuditLog(
            req,
            'UPDATE_ROUTE_STATUS',
            'Route',
            route._id,
            `Updated route "${route.name}" status to ${status}`
        );
        
        res.json({
            success: true,
            message: `Route status updated to ${status}`,
            route
        });
        
    } catch (err) {
        console.error('Update status error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================================================================
// ✅ UPDATE STOP STATUS
// ================================================================
router.put('/:routeId/stops/:stopId/status', auth, async (req, res) => {
    try {
        const { status, notes } = req.body;
        
        const validStatuses = ['pending', 'arrived', 'completed', 'skipped'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid stop status. Must be: pending, arrived, completed, skipped' 
            });
        }
        
        const route = await Route.findById(req.params.routeId);
        if (!route) {
            return res.status(404).json({ success: false, message: 'Route not found' });
        }
        
        const stop = route.stops.id(req.params.stopId);
        if (!stop) {
            return res.status(404).json({ success: false, message: 'Stop not found' });
        }
        
        stop.status = status;
        if (notes) stop.notes = notes;
        if (status === 'completed') {
            stop.completedAt = new Date();
            stop.actualTime = new Date();
        }
        
        // Update completed stops count
        route.completedStops = route.stops.filter(s => s.status === 'completed').length;
        
        // Auto-complete route if all stops done
        if (route.completedStops === route.totalStops && route.totalStops > 0) {
            route.status = 'completed';
            route.completedAt = new Date();
        }
        
        await route.save();
        
        // If stop is completed and has shipment, update shipment status
        if (status === 'completed' && stop.shipmentId) {
            const shipment = await Shipment.findById(stop.shipmentId);
            if (shipment) {
                if (stop.type === 'delivery') {
                    shipment.status = 'delivered';
                } else if (stop.type === 'pickup') {
                    shipment.status = 'picked_up';
                }
                await shipment.save();
            }
        }
        
        await createAuditLog(
            req,
            'UPDATE_STOP_STATUS',
            'Route',
            route._id,
            `Stop ${stop.stopOrder} (${stop.type}) updated to ${status}`
        );
        
        res.json({
            success: true,
            message: `Stop ${stop.stopOrder} updated to ${status}`,
            route,
            progress: route.getProgress()
        });
        
    } catch (err) {
        console.error('Update stop error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================================================================
// 📊 GET ROUTE STATS
// ================================================================
router.get('/stats/summary', auth, async (req, res) => {
    try {
        const totalRoutes = await Route.countDocuments();
        const planned = await Route.countDocuments({ status: 'planned' });
        const inProgress = await Route.countDocuments({ status: 'in_progress' });
        const completed = await Route.countDocuments({ status: 'completed' });
        const cancelled = await Route.countDocuments({ status: 'cancelled' });
        
        // Total stops across all routes
        const routes = await Route.find({});
        let totalStops = 0;
        let completedStops = 0;
        
        routes.forEach(route => {
            totalStops += route.totalStops || 0;
            completedStops += route.completedStops || 0;
        });
        
        // Get driver stats
        const driverIds = routes.map(r => r.driverId).filter(id => id);
        const uniqueDrivers = new Set(driverIds.map(id => id.toString()));
        
        res.json({
            success: true,
            stats: {
                totalRoutes,
                planned,
                inProgress,
                completed,
                cancelled,
                totalStops,
                completedStops,
                completionRate: totalStops > 0 ? Math.round((completedStops / totalStops) * 100) : 0,
                activeDrivers: uniqueDrivers.size
            }
        });
        
    } catch (err) {
        console.error('Route stats error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;