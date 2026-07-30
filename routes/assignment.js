// backend/routes/assignment.js

const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const auth = require('../middleware/auth');
const Shipment = require('../models/Shipment');
const User = require('../models/User');
const AssignmentLog = require('../models/AssignmentLog');
const { createAuditLog } = require('../middleware/audit');
const { createNotification } = require('./notification');

// ✅ Import the service
let assignmentService;
try {
    assignmentService = require('../services/dynamicAssignmentService');
    console.log('✅ Dynamic Assignment Service loaded');
} catch (err) {
    console.error('❌ Assignment Service not found:', err.message);
    assignmentService = {
        autoAssignAllShipments: async () => ({ 
            success: true,
            assigned: 0, 
            unassigned: 0, 
            message: 'Service not available' 
        }),
        getAssignmentStats: async () => ({ 
            pendingShipments: 0, 
            assignedShipments: 0, 
            availableDrivers: 0, 
            averageDriverLoad: '0', 
            totalDrivers: 0,
            utilizationRate: 0,
            assignmentSuccessRate: 0,
            totalAssignments: 0
        }),
        getAssignmentHistory: async () => ([]),
        assignSingleShipment: async () => ({ 
            success: false, 
            message: 'Service not available' 
        }),
        getDriverPerformanceMetrics: async () => ({
            totalAssignments: 0,
            accepted: 0,
            rejected: 0,
            completed: 0,
            averageScore: 0,
            acceptanceRate: 0,
            completionRate: 0
        })
    };
}

// ============================================================
// 🔔 NOTIFICATION SERVICE
// ============================================================
let notificationService;
try {
    notificationService = require('../services/notificationService');
    console.log('✅ Notification service loaded');
} catch (err) {
    console.log('⚠️ Notification service not available:', err.message);
    notificationService = {
        sendNotification: async () => ({ success: false, message: 'Service not available' }),
        sendDeliveryStatus: async () => ({ success: false, message: 'Service not available' })
    };
}

// ============================================================
// 🧠 AUTO-ASSIGN ALL PENDING SHIPMENTS
// ============================================================
router.post('/auto-assign', adminAuth, async (req, res) => {
    try {
        console.log('🧠 Auto-assignment triggered by:', req.user.email);
        
        const result = await assignmentService.autoAssignAllShipments();
        
        await createAuditLog(
            req,
            'AUTO_ASSIGN',
            'Assignment',
            null,
            `Auto-assigned ${result.assigned} shipments to drivers`
        );
        
        res.json({
            success: true,
            ...result
        });
        
    } catch (error) {
        console.error('Auto-assign error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ============================================================
// 📊 GET ASSIGNMENT STATISTICS
// ============================================================
router.get('/stats', adminAuth, async (req, res) => {
    try {
        const stats = await assignmentService.getAssignmentStats();
        res.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('Assignment stats error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ============================================================
// 📋 GET ASSIGNMENT HISTORY
// ============================================================
router.get('/history', adminAuth, async (req, res) => {
    try {
        const { limit = 50, status } = req.query;
        const history = await assignmentService.getAssignmentHistory(parseInt(limit), status);
        res.json({
            success: true,
            history
        });
    } catch (error) {
        console.error('History error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ============================================================
// 🎯 ASSIGN SINGLE SHIPMENT - WITH NOTIFICATION
// ============================================================
router.post('/assign/:trackingNumber', adminAuth, async (req, res) => {
    try {
        const result = await assignmentService.assignSingleShipment(
            req.params.trackingNumber
        );
        
        // ============================================================
        // 🔔 SEND NOTIFICATION TO CLIENT
        // ============================================================
        if (result.success && result.driverId) {
            try {
                const shipment = await Shipment.findOne({ 
                    trackingNumber: req.params.trackingNumber 
                }).populate('userId', 'name email phone');
                
                const driver = await User.findById(result.driverId);
                
                if (shipment && shipment.userId) {
                    // Send notification to client
                    await notificationService.sendNotification({
                        userId: shipment.userId._id,
                        email: shipment.userId.email,
                        phone: shipment.userId.phone,
                        trackingNumber: shipment.trackingNumber,
                        event: 'driver_assigned',
                        data: {
                            driverName: driver ? driver.name : 'Driver assigned',
                            trackingNumber: shipment.trackingNumber
                        },
                        language: 'en'
                    });
                    
                    // Also send in-app notification
                    await createNotification(
                        shipment.userId._id,
                        '👤 Driver Assigned',
                        `A driver has been assigned to your shipment ${shipment.trackingNumber}`,
                        'info',
                        shipment.trackingNumber
                    );
                    
                    console.log(`🔔 Driver assigned notification sent for ${shipment.trackingNumber}`);
                }
                
                // Send notification to driver
                if (driver) {
                    await notificationService.sendNotification({
                        userId: driver._id,
                        email: driver.email,
                        phone: driver.phone,
                        trackingNumber: shipment.trackingNumber,
                        event: 'driver_assigned',
                        data: {
                            driverName: driver.name,
                            trackingNumber: shipment.trackingNumber,
                            pickupAddress: shipment.senderAddress,
                            deliveryAddress: shipment.receiverAddress
                        },
                        language: 'en'
                    });
                    
                    await createNotification(
                        driver._id,
                        '📦 New Shipment Assigned',
                        `You have been assigned to shipment ${shipment.trackingNumber}`,
                        'info',
                        shipment.trackingNumber
                    );
                    
                    console.log(`🔔 Assignment notification sent to driver ${driver.name}`);
                }
            } catch (notifErr) {
                console.error('⚠️ Notification error:', notifErr.message);
            }
        }
        
        await createAuditLog(
            req,
            'ASSIGN_SINGLE',
            'Shipment',
            req.params.trackingNumber,
            `Single assignment: ${result.message}`
        );
        
        res.json(result);
        
    } catch (error) {
        console.error('Single assignment error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ============================================================
// 🔄 GET RECENT ASSIGNMENTS (Dashboard)
// ============================================================
router.get('/recent', adminAuth, async (req, res) => {
    try {
        const history = await assignmentService.getAssignmentHistory(20);
        res.json({
            success: true,
            assignments: history
        });
    } catch (error) {
        console.error('Recent assignments error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ============================================================
// 📈 GET ASSIGNMENT METRICS
// ============================================================
router.get('/metrics', adminAuth, async (req, res) => {
    try {
        const now = new Date();
        const last24h = new Date(now - 24 * 60 * 60 * 1000);
        const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
        
        const total24h = await Shipment.countDocuments({
            assignedAt: { $gte: last24h }
        });
        
        const total7d = await Shipment.countDocuments({
            assignedAt: { $gte: last7d }
        });
        
        const shipments = await Shipment.find({
            assignedAt: { $gte: last24h }
        }).select('createdAt assignedAt');
        
        let totalTime = 0;
        shipments.forEach(s => {
            if (s.createdAt && s.assignedAt) {
                totalTime += (s.assignedAt - s.createdAt) / 1000;
            }
        });
        const avgTime = shipments.length > 0 ? Math.round(totalTime / shipments.length) : 0;
        
        const pending = await Shipment.countDocuments({
            status: 'pending',
            assignedDriver: null
        });
        
        res.json({
            success: true,
            metrics: {
                assignments24h: total24h,
                assignments7d: total7d,
                averageAssignmentTime: avgTime,
                pendingShipments: pending,
                timestamp: now.toISOString()
            }
        });
        
    } catch (error) {
        console.error('Metrics error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ============================================================
// 🆕 📊 GET DRIVER PERFORMANCE METRICS
// ============================================================
router.get('/driver-performance/:driverId', adminAuth, async (req, res) => {
    try {
        const metrics = await assignmentService.getDriverPerformanceMetrics(req.params.driverId);
        res.json({ 
            success: true, 
            metrics 
        });
    } catch (error) {
        console.error('Driver performance error:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// ============================================================
// 🆕 ❌ DRIVER REJECT ASSIGNMENT - COMPLETELY REWRITTEN
// ============================================================
router.post('/reject/:trackingNumber', auth, async (req, res) => {
    try {
        const { reason } = req.body;
        const driverId = req.user.id;
        
        console.log(`❌ [REJECT] Driver ${driverId} rejecting ${req.params.trackingNumber}`);
        
        // 1. Get the driver
        const driver = await User.findById(driverId);
        if (!driver) {
            return res.status(404).json({
                success: false,
                message: 'Driver not found'
            });
        }
        
        // 2. Check if shipment is assigned to this driver
        const shipment = await Shipment.findOne({
            trackingNumber: req.params.trackingNumber,
            assignedDriver: driverId
        });
        
        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: 'Shipment not found or not assigned to you'
            });
        }
        
        console.log(`📦 Shipment found: ${shipment.trackingNumber}, current status: ${shipment.status}`);
        
        // 3. Check if already accepted
        const existingLog = await AssignmentLog.findOne({
            trackingNumber: req.params.trackingNumber,
            driverId: driverId,
            status: 'accepted'
        });
        
        if (existingLog) {
            return res.status(400).json({
                success: false,
                message: 'You already accepted this assignment'
            });
        }
        
        // 4. SAVE REJECTION TO LOG
        const rejectionLog = await AssignmentLog.findOneAndUpdate(
            { 
                trackingNumber: req.params.trackingNumber, 
                driverId: driverId 
            },
            { 
                rejectedAt: new Date(),
                status: 'rejected',
                rejectionReason: reason || 'Driver rejected',
                driverName: driver.name,
                shipmentId: shipment._id,
                score: 0
            },
            { 
                upsert: true, 
                new: true 
            }
        );
        
        console.log(`✅ Rejection logged: ${rejectionLog._id}`);
        
        // 5. REMOVE DRIVER FROM SHIPMENT
        shipment.assignedDriver = null;
        shipment.assignedDriverName = null;
        shipment.assignmentAttempts = (shipment.assignmentAttempts || 0) + 1;
        shipment.lastAssignmentAttempt = new Date();
        await shipment.save();
        
        console.log(`✅ Shipment updated: attempts ${shipment.assignmentAttempts}`);
        
        // 6. REMOVE FROM DRIVER'S ASSIGNED SHIPMENTS
        await User.findByIdAndUpdate(driverId, {
            $pull: { assignedShipments: shipment._id }
        });
        
        // 7. UPDATE DRIVER STATUS
        await User.findByIdAndUpdate(driverId, {
            driverStatus: 'available'
        });
        
        console.log(`✅ Driver ${driver.name} status set to available`);
        
        // 8. TRIGGER RE-ASSIGNMENT
        setTimeout(async () => {
            try {
                const result = await assignmentService.autoAssignAllShipments();
                console.log(`🔄 [RE-ASSIGN] ${result.assigned} shipments assigned after rejection`);
            } catch (err) {
                console.log('⚠️ Re-assignment error:', err.message);
            }
        }, 2000);
        
        res.json({
            success: true,
            message: 'Assignment rejected, re-assigning...',
            log: rejectionLog,
            shipment: {
                trackingNumber: shipment.trackingNumber,
                status: shipment.status,
                assignmentAttempts: shipment.assignmentAttempts
            }
        });
        
    } catch (error) {
        console.error('❌ Reject assignment error:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// ============================================================
// ✅ DRIVER ACCEPT ASSIGNMENT - WITH NOTIFICATION
// ============================================================
router.post('/accept/:trackingNumber', auth, async (req, res) => {
    try {
        const driverId = req.user.id;
        
        console.log(`✅ [ACCEPT] Driver ${driverId} accepting ${req.params.trackingNumber}`);
        
        const driver = await User.findById(driverId);
        if (!driver) {
            return res.status(404).json({
                success: false,
                message: 'Driver not found'
            });
        }
        
        const shipment = await Shipment.findOne({
            trackingNumber: req.params.trackingNumber,
            assignedDriver: driverId
        });
        
        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: 'Shipment not found or not assigned to you'
            });
        }
        
        // Check if already rejected
        const existingLog = await AssignmentLog.findOne({
            trackingNumber: req.params.trackingNumber,
            driverId: driverId,
            status: 'rejected'
        });
        
        if (existingLog) {
            return res.status(400).json({
                success: false,
                message: 'You already rejected this assignment'
            });
        }
        
        // Update assignment log
        const updatedLog = await AssignmentLog.findOneAndUpdate(
            { trackingNumber: req.params.trackingNumber, driverId },
            { 
                acceptedAt: new Date(),
                status: 'accepted',
                $setOnInsert: {
                    shipmentId: shipment._id,
                    driverName: driver.name,
                    score: 85
                }
            },
            { 
                upsert: true, 
                new: true 
            }
        );
        
        // Update driver status
        await User.findByIdAndUpdate(driverId, {
            driverStatus: 'on_delivery'
        });
        
        // ============================================================
        // 🔔 SEND NOTIFICATION TO CLIENT
        // ============================================================
        try {
            if (shipment.userId) {
                const client = await User.findById(shipment.userId);
                if (client) {
                    await notificationService.sendNotification({
                        userId: client._id,
                        email: client.email,
                        phone: client.phone,
                        trackingNumber: shipment.trackingNumber,
                        event: 'driver_assigned',
                        data: {
                            driverName: driver.name,
                            trackingNumber: shipment.trackingNumber
                        },
                        language: 'en'
                    });
                    
                    await createNotification(
                        client._id,
                        '👤 Driver Confirmed',
                        `Driver ${driver.name} has accepted your shipment ${shipment.trackingNumber}`,
                        'success',
                        shipment.trackingNumber
                    );
                    
                    console.log(`🔔 Driver acceptance notification sent to client`);
                }
            }
        } catch (notifErr) {
            console.error('⚠️ Notification error:', notifErr.message);
        }
        
        res.json({
            success: true,
            message: '✅ Assignment accepted!',
            trackingNumber: req.params.trackingNumber,
            log: updatedLog
        });
    } catch (error) {
        console.error('Accept assignment error:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// ============================================================
// ✅ DRIVER COMPLETE ASSIGNMENT
// ============================================================
router.post('/complete/:trackingNumber', auth, async (req, res) => {
    try {
        const driverId = req.user.id;
        
        console.log(`✔️ [COMPLETE] Driver ${driverId} completing ${req.params.trackingNumber}`);
        
        const shipment = await Shipment.findOne({
            trackingNumber: req.params.trackingNumber,
            assignedDriver: driverId
        });
        
        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: 'Shipment not found or not assigned to you'
            });
        }
        
        // Update assignment log
        await AssignmentLog.findOneAndUpdate(
            { trackingNumber: req.params.trackingNumber, driverId },
            { 
                completedAt: new Date(),
                status: 'completed'
            }
        );
        
        // Update shipment status
        shipment.status = 'delivered';
        await shipment.save();
        
        // Update driver stats
        await User.findByIdAndUpdate(driverId, {
            $inc: { completedDeliveries: 1 }
        });
        
        // ============================================================
        // 🔔 SEND NOTIFICATION TO CLIENT
        // ============================================================
        try {
            if (shipment.userId) {
                const client = await User.findById(shipment.userId);
                if (client) {
                    await notificationService.sendNotification({
                        userId: client._id,
                        email: client.email,
                        phone: client.phone,
                        trackingNumber: shipment.trackingNumber,
                        event: 'delivered',
                        data: {
                            deliveredAt: new Date().toLocaleString(),
                            driverName: req.user.name
                        },
                        language: 'en'
                    });
                    
                    await createNotification(
                        client._id,
                        '✅ Shipment Delivered',
                        `Your shipment ${shipment.trackingNumber} has been delivered successfully!`,
                        'success',
                        shipment.trackingNumber
                    );
                    
                    console.log(`🔔 Delivery completion notification sent to client`);
                }
            }
        } catch (notifErr) {
            console.error('⚠️ Notification error:', notifErr.message);
        }
        
        res.json({
            success: true,
            message: '✅ Assignment completed!'
        });
    } catch (error) {
        console.error('Complete assignment error:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

// ============================================================
// 📋 GET ASSIGNMENT LOGS (Admin)
// ============================================================
router.get('/logs', adminAuth, async (req, res) => {
    try {
        const { limit = 50, status } = req.query;
        const logs = await assignmentService.getAssignmentHistory(
            parseInt(limit),
            status
        );
        res.json({ 
            success: true, 
            logs 
        });
    } catch (error) {
        console.error('Get logs error:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

module.exports = router;