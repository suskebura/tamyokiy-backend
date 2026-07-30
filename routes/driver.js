const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Shipment = require('../models/Shipment');
const User = require('../models/User');
const Route = require('../models/Route');
const DriverLocation = require('../models/DriverLocation');
// ❌ REMOVE THIS LINE: const { createNotification } = require('./notification');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ============================================================
// ✅ NOTIFICATION HELPER (inline to avoid circular dependency)
// ============================================================
async function createNotification(userId, title, message, type = 'info', link = null) {
    try {
        const Notification = require('../models/Notification');
        const notification = new Notification({
            userId: userId,
            title: title,
            message: message,
            type: type,
            link: link,
            read: false,
            createdAt: new Date()
        });
        await notification.save();
        return notification;
    } catch (err) {
        console.error('❌ Failed to create notification:', err.message);
        return null;
    }
}

// ================================================================
// 🔥 TEST ROUTE - TO VERIFY THE FILE IS LOADED
// ================================================================
router.get('/test', auth, async (req, res) => {
    console.log('✅ /api/driver/test was called!');
    res.json({
        success: true,
        message: 'Driver route is working!',
        userId: req.user.id,
        userRole: req.user.role
    });
});

// ================================================================
// 🆕 GET DRIVER'S ASSIGNED ROUTE
// ================================================================
router.get('/my-route', auth, async (req, res) => {
    console.log('✅ /api/driver/my-route was called!');
    console.log('Driver ID:', req.user.id);
    
    try {
        const driverId = req.user.id;
        
        // Find active route assigned to this driver
        const route = await Route.findOne({
            driverId: driverId,
            status: { $in: ['planned', 'in_progress'] }
        });
        
        console.log('Route found:', route ? 'Yes' : 'No');
        
        if (!route) {
            return res.json({
                success: true,
                hasRoute: false,
                message: 'No active route assigned'
            });
        }
        
        // Populate stops with shipment details
        const populatedRoute = await Route.findById(route._id)
            .populate('stops.shipmentId', 'trackingNumber senderName receiverName weight amount');
        
        res.json({
            success: true,
            hasRoute: true,
            route: populatedRoute,
            progress: populatedRoute.getProgress ? populatedRoute.getProgress() : 0
        });
    } catch (err) {
        console.error('Get driver route error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================================================================
// 🆕 MARK STOP AS COMPLETED
// ================================================================
router.put('/my-route/stop/:stopId', auth, async (req, res) => {
    console.log('✅ /api/driver/my-route/stop was called!');
    console.log('Stop ID:', req.params.stopId);
    
    try {
        const { status, notes } = req.body;
        const driverId = req.user.id;
        const stopId = req.params.stopId;
        
        // Find active route for this driver
        const route = await Route.findOne({
            driverId: driverId,
            status: { $in: ['planned', 'in_progress'] }
        });
        
        if (!route) {
            return res.status(404).json({
                success: false,
                message: 'No active route found'
            });
        }
        
        // Find the stop
        const stop = route.stops.id(stopId);
        if (!stop) {
            return res.status(404).json({
                success: false,
                message: 'Stop not found'
            });
        }
        
        // Update stop status
        stop.status = status || 'completed';
        stop.completedAt = new Date();
        if (notes) stop.notes = notes;
        
        // Update completed stops count
        route.completedStops = route.stops.filter(s => s.status === 'completed').length;
        
        // If all stops completed, mark route as completed
        if (route.completedStops === route.totalStops && route.totalStops > 0) {
            route.status = 'completed';
            route.completedAt = new Date();
        }
        
        await route.save();
        
        // Update shipment status if stop has shipment
        if (stop.shipmentId) {
            const shipment = await Shipment.findById(stop.shipmentId);
            if (shipment) {
                if (stop.type === 'delivery') {
                    shipment.status = 'delivered';
                    if (!shipment.deliveryProof) {
                        shipment.deliveryProof = {};
                    }
                    shipment.deliveryProof.deliveredAt = new Date();
                    shipment.deliveryProof.deliveredBy = req.user.name;
                } else if (stop.type === 'pickup') {
                    shipment.status = 'picked_up';
                }
                await shipment.save();
                
                // Notify customer - NOW USING INLINE FUNCTION
                await createNotification(
                    shipment.userId,
                    `📦 Shipment Update`,
                    `Your shipment ${shipment.trackingNumber} has been ${stop.type === 'delivery' ? 'delivered' : 'picked up'}`,
                    'success',
                    shipment.trackingNumber
                );
            }
        }
        
        res.json({
            success: true,
            message: 'Stop completed successfully',
            route: route,
            progress: route.completedStops / route.totalStops * 100
        });
    } catch (err) {
        console.error('Complete stop error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================================================================
// 🆕 GET DRIVER'S COMPLETED ROUTES
// ================================================================
router.get('/my-routes/completed', auth, async (req, res) => {
    try {
        const driverId = req.user.id;
        const { limit = 20, page = 1 } = req.query;
        
        const routes = await Route.find({
            driverId: driverId,
            status: 'completed'
        })
            .sort({ completedAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));
        
        const total = await Route.countDocuments({
            driverId: driverId,
            status: 'completed'
        });
        
        res.json({
            success: true,
            routes,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit))
        });
    } catch (err) {
        console.error('Get completed routes error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================================================================
// 🆕 GET DRIVER ROUTE STATS
// ================================================================
router.get('/my-route/stats', auth, async (req, res) => {
    try {
        const driverId = req.user.id;
        
        const totalRoutes = await Route.countDocuments({ driverId: driverId });
        const completedRoutes = await Route.countDocuments({ driverId: driverId, status: 'completed' });
        const inProgressRoutes = await Route.countDocuments({ driverId: driverId, status: 'in_progress' });
        
        const totalStops = await Route.aggregate([
            { $match: { driverId: driverId } },
            { $unwind: '$stops' },
            { $count: 'total' }
        ]);
        
        const completedStops = await Route.aggregate([
            { $match: { driverId: driverId } },
            { $unwind: '$stops' },
            { $match: { 'stops.status': 'completed' } },
            { $count: 'total' }
        ]);
        
        res.json({
            success: true,
            stats: {
                totalRoutes,
                completedRoutes,
                inProgressRoutes,
                totalStops: totalStops[0]?.total || 0,
                completedStops: completedStops[0]?.total || 0,
                completionRate: totalStops[0]?.total > 0 
                    ? Math.round((completedStops[0]?.total || 0) / totalStops[0]?.total * 100) 
                    : 0
            }
        });
    } catch (err) {
        console.error('Get route stats error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================================================================
// 📊 GET WEEKLY STATS FOR DRIVER - ✅ FIXED ENDPOINT
// ================================================================
router.get('/weekly-stats', auth, async (req, res) => {
    try {
        const driverId = req.user.id;
        const today = new Date();
        const weeklyDeliveries = [];
        
        // Get last 7 days (Mon-Sun)
        const dayOfWeek = today.getDay(); // 0 = Sunday
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const monday = new Date(today);
        monday.setDate(today.getDate() - daysToMonday);
        monday.setHours(0, 0, 0, 0);
        
        const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        
        for (let i = 0; i < 7; i++) {
            const date = new Date(monday);
            date.setDate(monday.getDate() + i);
            date.setHours(0, 0, 0, 0);
            const nextDate = new Date(date);
            nextDate.setDate(date.getDate() + 1);
            
            const count = await Shipment.countDocuments({
                assignedDriver: driverId,
                status: 'delivered',
                createdAt: { $gte: date, $lt: nextDate }
            });
            
            weeklyDeliveries.push(count);
        }
        
        res.json({
            success: true,
            deliveries: weeklyDeliveries,
            weekStart: monday.toISOString().split('T')[0],
            weekEnd: new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        });
        
    } catch (err) {
        console.error('Weekly stats error:', err);
        res.status(500).json({ 
            success: false, 
            message: err.message 
        });
    }
});

// ================================================================
// GET DRIVER DASHBOARD DATA
// ================================================================
router.get('/dashboard', auth, async (req, res) => {
    try {
        const driver = await User.findById(req.user.id);
        
        if (driver.role !== 'driver') {
            return res.status(403).json({ success: false, message: 'Driver access only' });
        }

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
                email: driver.email,
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
        console.error('Driver dashboard error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================================================================
// UPDATE DRIVER STATUS
// ================================================================
router.put('/status', auth, async (req, res) => {
    try {
        const { driverStatus } = req.body;
        const driver = await User.findById(req.user.id);
        
        if (driver.role !== 'driver') {
            return res.status(403).json({ success: false, message: 'Driver access only' });
        }
        
        const validStatuses = ['available', 'on_delivery', 'offline', 'busy'];
        if (!validStatuses.includes(driverStatus)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }
        
        driver.driverStatus = driverStatus;
        await driver.save();
        
        // Also update DriverLocation status if exists
        await DriverLocation.findOneAndUpdate(
            { driverId: req.user.id },
            { status: driverStatus === 'on_delivery' ? 'delivering' : driverStatus }
        );
        
        res.json({ success: true, driverStatus: driver.driverStatus });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================================================================
// GET ASSIGNED SHIPMENTS
// ================================================================
router.get('/shipments', auth, async (req, res) => {
    try {
        const shipments = await Shipment.find({ assignedDriver: req.user.id })
            .sort({ createdAt: -1 });
        
        res.json({ success: true, shipments: shipments });
    } catch (err) {
        console.error('Get shipments error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================================================================
// UPDATE SHIPMENT STATUS
// ================================================================
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
        
        const oldStatus = shipment.status;
        
        shipment.status = status;
        shipment.trackingHistory.push({
            status: status,
            note: note || `Driver updated status to ${status}`,
            updatedAt: new Date()
        });
        
        await shipment.save();
        
        await createNotification(
            shipment.userId,
            `🚚 Shipment Update`,
            `Your shipment ${shipment.trackingNumber} status changed from ${oldStatus} to ${status}`,
            'info',
            shipment.trackingNumber
        );
        
        res.json({ success: true, shipment });
    } catch (err) {
        console.error('Update status error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================================================================
// COMPLETE DELIVERY WITH PROOF
// ================================================================
const uploadDir = path.join(__dirname, '../uploads/delivery-proofs');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const trackingNumber = req.params.trackingNumber;
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        cb(null, `${trackingNumber}_${file.fieldname}_${timestamp}${ext}`);
    }
});

const upload = multer({ 
    storage: storage, 
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPEG, PNG, JPG, and WEBP images are allowed'), false);
        }
    }
}).fields([
    { name: 'deliveryPhoto', maxCount: 1 },
    { name: 'signature', maxCount: 1 }
]);

router.post('/complete/:trackingNumber', auth, (req, res) => {
    upload(req, res, async (err) => {
        if (err) {
            console.error('Upload error:', err);
            return res.status(400).json({ 
                success: false, 
                message: err.message || 'File upload error' 
            });
        }
        
        try {
            const { recipientName, deliveryNote } = req.body;
            const shipment = await Shipment.findOne({ trackingNumber: req.params.trackingNumber });
            
            if (!shipment) {
                if (req.files) {
                    Object.values(req.files).forEach(files => {
                        files.forEach(file => {
                            if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
                        });
                    });
                }
                return res.status(404).json({ success: false, message: 'Shipment not found' });
            }
            
            if (shipment.assignedDriver?.toString() !== req.user.id) {
                return res.status(403).json({ success: false, message: 'Not assigned to you' });
            }
            
            let photoUrl = null;
            let signatureUrl = null;
            
            if (req.files) {
                if (req.files.deliveryPhoto) {
                    photoUrl = `/uploads/delivery-proofs/${req.files.deliveryPhoto[0].filename}`;
                }
                if (req.files.signature) {
                    signatureUrl = `/uploads/delivery-proofs/${req.files.signature[0].filename}`;
                }
            }
            
            shipment.status = 'delivered';
            shipment.deliveryProof = {
                recipientName: recipientName,
                recipientSignature: signatureUrl,
                deliveryPhoto: photoUrl,
                deliveredAt: new Date(),
                deliveredBy: req.user.name,
                deliveryNote: deliveryNote || null
            };
            
            shipment.trackingHistory.push({
                status: 'delivered',
                note: `Delivered to ${recipientName}${deliveryNote ? ': ' + deliveryNote : ''}`,
                updatedAt: new Date()
            });
            
            await shipment.save();
            
            const driver = await User.findById(req.user.id);
            driver.completedDeliveries = (driver.completedDeliveries || 0) + 1;
            driver.totalEarnings = (driver.totalEarnings || 0) + (shipment.amount || 0);
            await driver.save();
            
            await createNotification(
                shipment.userId,
                `✅ Shipment Delivered`,
                `Your shipment ${shipment.trackingNumber} has been delivered to ${recipientName}. Thank you for using TAMYOKIY!`,
                'success',
                shipment.trackingNumber
            );
            
            res.json({ 
                success: true, 
                message: 'Delivery completed with proof!',
                proof: {
                    recipientName: recipientName,
                    hasPhoto: !!photoUrl,
                    hasSignature: !!signatureUrl
                }
            });
        } catch (err) {
            console.error('Complete delivery error:', err);
            if (req.files) {
                Object.values(req.files).forEach(files => {
                    files.forEach(file => {
                        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
                    });
                });
            }
            res.status(500).json({ success: false, message: err.message });
        }
    });
});

// ================================================================
// 📍 START GPS TRACKING (Driver) - ✅ ADDED
// ================================================================
router.post('/start-gps', auth, async (req, res) => {
    console.log('📍 [GPS] Starting GPS tracking for driver:', req.user.id);
    
    try {
        const driver = await User.findById(req.user.id);
        if (driver.role !== 'driver') {
            return res.status(403).json({ success: false, message: 'Driver access only' });
        }

        const { trackingNumber, lat, lng } = req.body;
        
        // Create or update driver location entry
        let driverLocation = await DriverLocation.findOne({ driverId: req.user.id });
        
        if (!driverLocation) {
            driverLocation = new DriverLocation({
                driverId: req.user.id,
                driverName: driver.name,
                driverEmail: driver.email,
                vehicleType: driver.vehicleType || 'Standard Vehicle',
                lat: lat || 0,
                lng: lng || 0,
                status: 'online',
                trackingNumber: trackingNumber || null,
                updatedAt: new Date()
            });
            await driverLocation.save();
            console.log('✅ [GPS] Created new location entry for driver');
        } else {
            driverLocation.status = 'online';
            if (trackingNumber) driverLocation.trackingNumber = trackingNumber;
            if (lat !== undefined && lng !== undefined) {
                driverLocation.lat = lat;
                driverLocation.lng = lng;
                driverLocation.addToHistory(lat, lng);
            }
            driverLocation.updatedAt = new Date();
            await driverLocation.save();
            console.log('✅ [GPS] Updated existing location entry for driver');
        }

        // Also update driver status
        driver.driverStatus = 'on_delivery';
        await driver.save();

        res.json({
            success: true,
            message: 'GPS tracking started',
            driverLocation: {
                lat: driverLocation.lat,
                lng: driverLocation.lng,
                status: driverLocation.status,
                trackingNumber: driverLocation.trackingNumber
            }
        });
    } catch (err) {
        console.error('❌ [GPS] Start GPS error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================================================================
// 🛑 STOP GPS TRACKING (Driver) - ✅ ADDED
// ================================================================
router.post('/stop-gps', auth, async (req, res) => {
    console.log('📍 [GPS] Stopping GPS tracking for driver:', req.user.id);
    
    try {
        const driverLocation = await DriverLocation.findOneAndUpdate(
            { driverId: req.user.id },
            { 
                status: 'offline',
                updatedAt: new Date()
            },
            { new: true }
        );
        
        if (!driverLocation) {
            return res.status(404).json({
                success: false,
                message: 'Driver location not found. Start GPS first.'
            });
        }

        // Also update driver status
        const driver = await User.findById(req.user.id);
        if (driver) {
            driver.driverStatus = 'available';
            await driver.save();
        }

        console.log('✅ [GPS] GPS tracking stopped');
        res.json({
            success: true,
            message: 'GPS tracking stopped',
            status: 'offline'
        });
    } catch (err) {
        console.error('❌ [GPS] Stop GPS error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================================================================
// 📍 GET GPS STATUS (Driver) - ✅ ADDED
// ================================================================
router.get('/gps-status', auth, async (req, res) => {
    try {
        const driverLocation = await DriverLocation.findOne({ driverId: req.user.id });
        
        if (!driverLocation) {
            return res.json({
                success: true,
                isActive: false,
                message: 'GPS not started'
            });
        }

        res.json({
            success: true,
            isActive: driverLocation.status !== 'offline',
            status: driverLocation.status,
            location: {
                lat: driverLocation.lat,
                lng: driverLocation.lng,
                speed: driverLocation.speed,
                accuracy: driverLocation.accuracy
            },
            trackingNumber: driverLocation.trackingNumber,
            lastUpdate: driverLocation.updatedAt
        });
    } catch (err) {
        console.error('❌ [GPS] Get GPS status error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;