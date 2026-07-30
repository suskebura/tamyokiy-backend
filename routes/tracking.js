const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Shipment = require('../models/Shipment');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { createNotification } = require('./notification');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const calculateETA = require('../utils/etaCalculator');
const { generateTrackingCodes } = require('../utils/qrCode');

// ============================================================
// ✅ FIXED: Use the CORRECT service name
// ============================================================
const dynamicAssignmentService = require('../services/dynamicAssignmentService');

// ============================================================
// 🚨 ANOMALY DETECTION SERVICE
// ============================================================
let anomalyService = null;
try {
    anomalyService = require('../services/anomalyDetectionService');
    console.log('✅ Anomaly detection service loaded');
} catch (err) {
    console.log('⚠️ Anomaly detection service not available:', err.message);
}

// ============================================================
// 🔔 NOTIFICATION SERVICE
// ============================================================
let notificationService = null;
try {
    notificationService = require('../services/notificationService');
    console.log('✅ Notification service loaded');
} catch (err) {
    console.log('⚠️ Notification service not available:', err.message);
}

// ============================================================
// 📁 CONFIGURE MULTER FOR DELIVERY PHOTO UPLOAD
// ============================================================
const uploadDir = path.join(__dirname, '../uploads/delivery-proofs');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const photoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const trackingNumber = req.params.trackingNumber;
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        cb(null, `${trackingNumber}_proof_${timestamp}${ext}`);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only JPEG, PNG, JPG, and WEBP images are allowed'), false);
    }
};

const uploadPhoto = multer({
    storage: photoStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: fileFilter
}).single('deliveryPhoto');

// ============================================================
// 📁 CONFIGURE MULTER FOR CUSTOMER DELIVERY PHOTO UPLOAD
// ============================================================
const customerPhotoUploadDir = path.join(__dirname, '../uploads/delivery-photos');
if (!fs.existsSync(customerPhotoUploadDir)) {
    fs.mkdirSync(customerPhotoUploadDir, { recursive: true });
}

const customerPhotoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, customerPhotoUploadDir);
    },
    filename: (req, file, cb) => {
        const trackingNumber = req.params.trackingNumber;
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        cb(null, `${trackingNumber}_${timestamp}${ext}`);
    }
});

const customerPhotoFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only JPEG, PNG, JPG, and WEBP images are allowed'));
    }
};

const uploadCustomerPhoto = multer({
    storage: customerPhotoStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: customerPhotoFilter
}).single('deliveryPhoto');

// ============================================================
// 🔢 GENERATE UNIQUE TRACKING NUMBER
// ============================================================
function generateTracking() {
    return 'TAM' + Date.now() + Math.floor(Math.random() * 1000);
}

// ============================================================
// 🧠 AUTO-ASSIGNMENT HELPER - FIXED
// ============================================================
async function triggerAutoAssignment(trackingNumber) {
    try {
        console.log(`🔄 Auto-assigning shipment ${trackingNumber}...`);
        setTimeout(async () => {
            try {
                const result = await dynamicAssignmentService.autoAssignAllShipments();
                if (result.assigned > 0) {
                    console.log(`✅ Auto-assigned ${result.assigned} shipments (including ${trackingNumber})`);
                } else {
                    console.log(`ℹ️ No drivers available for ${trackingNumber}`);
                }
            } catch (err) {
                console.log('⚠️ Auto-assign error:', err.message);
            }
        }, 3000);
    } catch (err) {
        console.log('⚠️ Assignment service not available:', err.message);
    }
}

// ============================================================
// 📦 CREATE SHIPMENT (WITH COORDINATES & AUTO-ASSIGN)
// ============================================================
router.post('/', auth, [
    body('senderName').notEmpty().withMessage('Sender name is required').trim(),
    body('senderAddress').notEmpty().withMessage('Sender address is required').trim(),
    body('receiverName').notEmpty().withMessage('Receiver name is required').trim(),
    body('receiverAddress').notEmpty().withMessage('Receiver address is required').trim(),
    body('weight').isFloat({ min: 0.1 }).withMessage('Weight must be at least 0.1 kg'),
    body('serviceType').optional().isIn(['standard', 'express', 'overnight']).withMessage('Invalid service type'),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const {
            senderName,
            senderAddress,
            receiverName,
            receiverAddress,
            weight,
            distance,
            serviceType,
            senderLat,
            senderLng,
            receiverLat,
            receiverLng
        } = req.body;

        console.log('📦 Creating shipment with coordinates:', {
            senderLat: senderLat || 'null',
            senderLng: senderLng || 'null',
            receiverLat: receiverLat || 'null',
            receiverLng: receiverLng || 'null'
        });

        const trackingNumber = generateTracking();
        const amount = 10 + (weight * 5);

        const etaResult = calculateETA(weight, serviceType || 'standard');
        const estimatedDelivery = etaResult.estimatedDate;

        const shipment = new Shipment({
            trackingNumber,
            userId: req.user.id,
            senderName,
            senderAddress,
            receiverName,
            receiverAddress,
            weight,
            amount,
            distance: distance || null,
            serviceType: serviceType || 'standard',
            estimatedDelivery: estimatedDelivery,
            senderLat: senderLat || null,
            senderLng: senderLng || null,
            receiverLat: receiverLat || null,
            receiverLng: receiverLng || null,
            trackingHistory: [{
                status: 'pending',
                note: `Shipment created. Estimated delivery: ${estimatedDelivery.toLocaleDateString()}`,
                updatedAt: new Date()
            }]
        });

        await shipment.save();

        // Generate QR Code and Barcode
        const baseUrl = process.env.BASE_URL || 'http://localhost:5500';
        const codes = await generateTrackingCodes(trackingNumber, baseUrl);

        if (codes.qrCode) {
            shipment.qrCode = codes.qrCode;
            shipment.barcode = codes.barcode;
            shipment.qrCodeGeneratedAt = new Date();
            await shipment.save();
            console.log(`✅ QR Code and Barcode generated for ${trackingNumber}`);
        }

        // Create notification
        await createNotification(
            req.user.id,
            '📦 Shipment Created',
            `Your shipment ${trackingNumber} has been created. Amount: $${amount}. Estimated delivery: ${estimatedDelivery.toLocaleDateString()}`,
            'success',
            trackingNumber
        );

        // 🔥 TRIGGER AUTO-ASSIGNMENT - FIXED
        await triggerAutoAssignment(trackingNumber);

        res.status(201).json({
            success: true,
            trackingNumber,
            amount,
            estimatedDelivery: estimatedDelivery,
            serviceType: serviceType || 'standard',
            daysToAdd: etaResult.daysToAdd,
            qrCode: codes.qrCode,
            barcode: codes.barcode,
            coordinates: {
                senderLat: shipment.senderLat,
                senderLng: shipment.senderLng,
                receiverLat: shipment.receiverLat,
                receiverLng: shipment.receiverLng
            }
        });
    } catch (err) {
        console.error('Create shipment error:', err);
        res.status(500).json({ message: err.message });
    }
});

// ============================================================
// 📍 UPDATE SHIPMENT (ADD COORDINATES)
// ============================================================
router.put('/:trackingNumber', auth, async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        const { senderLat, senderLng, receiverLat, receiverLng } = req.body;

        const shipment = await Shipment.findOne({ trackingNumber });
        if (!shipment) {
            return res.status(404).json({ success: false, message: 'Shipment not found' });
        }

        if (senderLat !== undefined) shipment.senderLat = senderLat;
        if (senderLng !== undefined) shipment.senderLng = senderLng;
        if (receiverLat !== undefined) shipment.receiverLat = receiverLat;
        if (receiverLng !== undefined) shipment.receiverLng = receiverLng;

        await shipment.save();

        res.json({
            success: true,
            message: 'Shipment updated successfully',
            shipment: {
                trackingNumber: shipment.trackingNumber,
                senderLat: shipment.senderLat,
                senderLng: shipment.senderLng,
                receiverLat: shipment.receiverLat,
                receiverLng: shipment.receiverLng
            }
        });
    } catch (err) {
        console.error('Update shipment error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 🔍 TRACK SHIPMENT (PUBLIC)
// ============================================================
router.get('/:trackingNumber', async (req, res) => {
    try {
        const shipment = await Shipment.findOne({ trackingNumber: req.params.trackingNumber });
        if (!shipment) return res.status(404).json({ message: 'Shipment not found' });
        res.json(shipment);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ============================================================
// 📊 GET SHIPMENT WITH PROGRESS PERCENTAGE
// ============================================================
router.get('/:trackingNumber/progress', async (req, res) => {
    try {
        const shipment = await Shipment.findOne({ trackingNumber: req.params.trackingNumber });
        if (!shipment) return res.status(404).json({ message: 'Shipment not found' });

        const statusOrder = ['pending', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered'];
        const currentIndex = statusOrder.indexOf(shipment.status);
        const progressPercentage = ((currentIndex + 1) / statusOrder.length) * 100;

        const statusMessages = {
            'pending': '📋 Package pending pickup',
            'picked_up': '📦 Package picked up by carrier',
            'in_transit': '🚚 Package in transit',
            'out_for_delivery': '🏠 Package out for delivery',
            'delivered': '✅ Package delivered successfully'
        };

        res.json({
            success: true,
            shipment: {
                ...shipment.toObject(),
                progressPercentage: Math.round(progressPercentage),
                currentStatusMessage: statusMessages[shipment.status]
            }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ============================================================
// 👤 GET USER'S SHIPMENTS
// ============================================================
router.get('/my/shipments', auth, async (req, res) => {
    try {
        const shipments = await Shipment.find({ userId: req.user.id }).sort({ createdAt: -1 });
        res.json(shipments);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ============================================================
// 🚚 DRIVER: Get assigned shipments
// ============================================================
router.get('/driver/shipments', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (user.role !== 'driver') {
            return res.status(403).json({ message: 'Driver access only' });
        }

        const shipments = await Shipment.find({ assignedDriver: req.user.id })
            .sort({ createdAt: -1 });
        res.json(shipments);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ============================================================
// 📦 UPDATE SHIPMENT STATUS - WITH NOTIFICATION (FULL ENDPOINT)
// ============================================================

router.put('/:trackingNumber/status', auth, async (req, res) => {
    console.log('🔵 ========================================');
    console.log('🔵 UPDATE SHIPMENT STATUS ENDPOINT HIT');
    console.log('🔵 ========================================');
    console.log('📦 Tracking Number:', req.params.trackingNumber);
    console.log('📊 New Status:', req.body.status);
    
    try {
        const { trackingNumber } = req.params;
        const { status, note, failureReason, deliveredAt, signature, newEta } = req.body;
        
        // Find shipment with client populated
        const shipment = await Shipment.findOne({ trackingNumber })
            .populate('userId', 'name email phone');
        
        if (!shipment) {
            console.log('❌ Shipment not found');
            return res.status(404).json({ success: false, message: 'Shipment not found' });
        }
        
        // Check if user is authorized (admin or assigned driver)
        const user = await User.findById(req.user.id);
        const isAdmin = user.role === 'admin';
        const isAssignedDriver = shipment.assignedDriver && 
            shipment.assignedDriver.toString() === req.user.id;
        
        if (!isAdmin && !isAssignedDriver) {
            return res.status(403).json({ 
                success: false, 
                message: 'Not authorized to update this shipment' 
            });
        }
        
        console.log('📦 Shipment found:', shipment.trackingNumber);
        console.log('📊 Current status:', shipment.status);
        console.log('📊 New status:', status);
        
        // Update status
        const oldStatus = shipment.status;
        shipment.status = status;
        shipment.statusHistory = shipment.statusHistory || [];
        shipment.statusHistory.push({
            status: status,
            timestamp: new Date(),
            note: note || status.replace('_', ' ').toUpperCase()
        });
        
        if (status === 'delivered') {
            shipment.deliveredAt = new Date();
            if (deliveredAt) shipment.deliveredAt = new Date(deliveredAt);
            if (signature) {
                shipment.deliveryProof = shipment.deliveryProof || {};
                shipment.deliveryProof.recipientName = signature;
            }
        }
        
        if (status === 'failed' && failureReason) {
            shipment.failureReason = failureReason;
        }
        
        if (status === 'delayed' && newEta) {
            shipment.estimatedDelivery = new Date();
            shipment.estimatedDelivery.setDate(shipment.estimatedDelivery.getDate() + parseInt(newEta) || 2);
        }
        
        await shipment.save();
        console.log('✅ Shipment status updated');
        
        // ============================================================
        // 🔔 SEND NOTIFICATION TO USER
        // ============================================================
        try {
            const client = shipment.userId;
            
            if (client) {
                console.log('👤 Sending notification to:', client.email || client.phone);
                
                // Prepare data based on status
                let data = {
                    trackingNumber: trackingNumber,
                    driverName: shipment.assignedDriverName || null,
                    estimatedDelivery: shipment.estimatedDelivery
                };
                
                if (status === 'delivered') {
                    data.deliveredAt = shipment.deliveredAt ? shipment.deliveredAt.toLocaleString() : new Date().toLocaleString();
                    data.signature = shipment.deliveryProof?.recipientName || null;
                }
                
                if (status === 'failed') {
                    data.reason = failureReason || 'Unknown';
                }
                
                if (status === 'delayed') {
                    data.newEta = newEta || 'Check tracking';
                }
                
                // Send notification via notification service
                if (notificationService) {
                    await notificationService.sendDeliveryStatus(client, trackingNumber, status, data);
                    console.log(`🔔 Notification sent for ${trackingNumber} - Status: ${status}`);
                }
                
                // Also send in-app notification
                await createNotification(
                    client._id,
                    `🚚 Shipment Update: ${status.toUpperCase()}`,
                    `Your shipment ${trackingNumber} status has been updated to ${status.replace('_', ' ')}`,
                    status === 'delivered' ? 'success' : 'info',
                    trackingNumber
                );
            }
        } catch (notifErr) {
            console.error('⚠️ Notification error:', notifErr.message);
        }
        
        res.json({
            success: true,
            message: 'Status updated successfully',
            shipment: shipment
        });
        
    } catch (err) {
        console.error('❌ Status update error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 🔄 DRIVER: Update shipment status WITH REAL-TIME ANOMALY DETECTION
// ============================================================
router.put('/driver/update-status/:trackingNumber', auth, async (req, res) => {
    try {
        const { status } = req.body;
        const shipment = await Shipment.findOne({ trackingNumber: req.params.trackingNumber });

        if (!shipment) {
            return res.status(404).json({ message: 'Shipment not found' });
        }

        if (shipment.assignedDriver?.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Not assigned to you' });
        }

        const oldStatus = shipment.status;

        shipment.status = status;
        shipment.trackingHistory.push({
            status: status,
            note: `Driver updated status to ${status}`,
            updatedAt: new Date()
        });

        await shipment.save();

        // 🚨 REAL-TIME ANOMALY DETECTION
        try {
            if (anomalyService && (status === 'delivered' || status === 'failed')) {
                console.log(`🔍 Running real-time anomaly check for ${shipment.trackingNumber} (${status})`);
                await anomalyService.checkShipmentAnomaly(shipment, req.user.id);
            }
        } catch (err) {
            console.error('⚠️ Real-time anomaly check error:', err.message);
        }

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
        res.status(500).json({ message: err.message });
    }
});

// ============================================================
// ✅ DRIVER: Complete delivery with proof
// ============================================================
router.post('/driver/complete/:trackingNumber', auth, (req, res) => {
    uploadPhoto(req, res, async (err) => {
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
                return res.status(404).json({ message: 'Shipment not found' });
            }

            if (shipment.assignedDriver?.toString() !== req.user.id) {
                return res.status(403).json({ message: 'Not assigned to you' });
            }

            let photoUrl = null;
            if (req.file) {
                photoUrl = `/uploads/delivery-proofs/${req.file.filename}`;
            }

            shipment.status = 'delivered';
            shipment.deliveryProof = {
                recipientName: recipientName,
                recipientSignature: 'Signature captured',
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

            // 🚨 REAL-TIME ANOMALY DETECTION for delivery completion
            try {
                if (anomalyService) {
                    console.log(`🔍 Running real-time anomaly check for completed delivery ${shipment.trackingNumber}`);
                    await anomalyService.checkShipmentAnomaly(shipment, req.user.id);
                }
            } catch (err) {
                console.error('⚠️ Real-time anomaly check error:', err.message);
            }

            // Update driver stats
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

            res.json({ success: true, message: 'Delivery completed successfully' });
        } catch (err) {
            console.error('Complete delivery error:', err);
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            res.status(500).json({ message: err.message });
        }
    });
});

// ============================================================
// 📸 UPLOAD DELIVERY PHOTO (CUSTOMER)
// ============================================================
router.post('/upload-photo/:trackingNumber', auth, (req, res) => {
    uploadCustomerPhoto(req, res, async (err) => {
        if (err) {
            console.error('Upload error:', err);
            return res.status(400).json({
                success: false,
                message: err.message || 'File upload error'
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No photo uploaded'
            });
        }

        try {
            const shipment = await Shipment.findOne({
                trackingNumber: req.params.trackingNumber,
                userId: req.user.id
            });

            if (!shipment) {
                if (fs.existsSync(req.file.path)) {
                    fs.unlinkSync(req.file.path);
                }
                return res.status(404).json({
                    success: false,
                    message: 'Shipment not found'
                });
            }

            if (shipment.status !== 'delivered') {
                if (fs.existsSync(req.file.path)) {
                    fs.unlinkSync(req.file.path);
                }
                return res.status(400).json({
                    success: false,
                    message: 'Shipment must be delivered before uploading a photo'
                });
            }

            const photoUrl = `/uploads/delivery-photos/${req.file.filename}`;
            shipment.deliveryPhoto = photoUrl;
            shipment.deliveryPhotoUploadedAt = new Date();
            shipment.deliveryPhotoUploadedBy = req.user.name || 'Customer';
            await shipment.save();

            if (shipment.assignedDriver) {
                await createNotification(
                    shipment.assignedDriver,
                    '📸 Delivery Photo Uploaded',
                    `Customer has uploaded a delivery photo for shipment ${shipment.trackingNumber}`,
                    'info',
                    shipment.trackingNumber
                );
            }

            res.json({
                success: true,
                message: 'Photo uploaded successfully',
                photoUrl: photoUrl
            });

        } catch (error) {
            console.error('Upload delivery photo error:', error);
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    });
});

// ============================================================
// 📊 DRIVER: Update status
// ============================================================
router.put('/driver/status', auth, async (req, res) => {
    try {
        const { driverStatus } = req.body;
        const user = await User.findById(req.user.id);

        if (user.role !== 'driver') {
            return res.status(403).json({ message: 'Driver access only' });
        }

        user.driverStatus = driverStatus;
        await user.save();

        res.json({ success: true, driverStatus: user.driverStatus });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;