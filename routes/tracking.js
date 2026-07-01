const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Shipment = require('../models/shipment');
const User = require('../models/user');
const auth = require('../middleware/auth');
const { createNotification } = require('./notification');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const calculateETA = require('../utils/etaCalculator');
const { generateTrackingCodes } = require('../utils/qrCode'); // 👈 UPDATED

// Configure multer for delivery photo upload
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

// Generate unique tracking number
function generateTracking() {
    return 'TAM' + Date.now() + Math.floor(Math.random() * 1000);
}

// ===== CREATE SHIPMENT (UPDATED WITH AUTO ETA + QR CODE + BARCODE) =====
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
        const { senderName, senderAddress, receiverName, receiverAddress, weight, distance, serviceType } = req.body;
        const trackingNumber = generateTracking();
        const amount = 10 + (weight * 5);
        
        // ===== AUTO CALCULATE ETA USING THE NEW CALCULATOR =====
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
            trackingHistory: [{
                status: 'pending',
                note: `Shipment created. Estimated delivery: ${estimatedDelivery.toLocaleDateString()}`,
                updatedAt: new Date()
            }]
        });
        
        await shipment.save();
        
        // ============================================================
        // 🆕 GENERATE QR CODE AND BARCODE FOR SHIPMENT
        // ============================================================
        const baseUrl = process.env.BASE_URL || 'http://localhost:5500';
        const codes = await generateTrackingCodes(trackingNumber, baseUrl);
        
        if (codes.qrCode) {
            shipment.qrCode = codes.qrCode;
            shipment.barcode = codes.barcode;
            shipment.qrCodeGeneratedAt = new Date();
            await shipment.save();
            console.log(`✅ QR Code and Barcode generated for ${trackingNumber}`);
        } else {
            console.log(`⚠️ QR Code/Barcode generation failed for ${trackingNumber}`);
        }
        // ============================================================
        
        // 🔔 CREATE NOTIFICATION FOR USER
        await createNotification(
            req.user.id,
            '📦 Shipment Created',
            `Your shipment ${trackingNumber} has been created. Amount: $${amount}. Estimated delivery: ${estimatedDelivery.toLocaleDateString()}`,
            'success',
            trackingNumber
        );
        
        console.log(`✅ Shipment created: ${trackingNumber} | Weight: ${weight}kg | Service: ${serviceType || 'standard'} | ETA: ${estimatedDelivery.toLocaleDateString()}`);
        
        res.status(201).json({ 
            success: true, 
            trackingNumber, 
            amount,
            estimatedDelivery: estimatedDelivery,
            serviceType: serviceType || 'standard',
            daysToAdd: etaResult.daysToAdd,
            qrCode: codes.qrCode,      // 👈 QR CODE IN RESPONSE
            barcode: codes.barcode     // 👈 BARCODE IN RESPONSE
        });
    } catch (err) {
        console.error('Create shipment error:', err);
        res.status(500).json({ message: err.message });
    }
});

// ===== TRACK SHIPMENT (PUBLIC) =====
router.get('/:trackingNumber', async (req, res) => {
    try {
        const shipment = await Shipment.findOne({ trackingNumber: req.params.trackingNumber });
        if (!shipment) return res.status(404).json({ message: 'Shipment not found' });
        res.json(shipment);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ===== GET SHIPMENT WITH PROGRESS PERCENTAGE =====
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

// ===== GET USER'S SHIPMENTS =====
router.get('/my/shipments', auth, async (req, res) => {
    try {
        const shipments = await Shipment.find({ userId: req.user.id }).sort({ createdAt: -1 });
        res.json(shipments);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ===== DRIVER: Get assigned shipments =====
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

// ===== DRIVER: Update shipment status =====
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
        
        // Notify customer
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

// ===== DRIVER: Complete delivery with proof =====
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
            
            // Update driver stats
            const driver = await User.findById(req.user.id);
            driver.completedDeliveries = (driver.completedDeliveries || 0) + 1;
            driver.totalEarnings = (driver.totalEarnings || 0) + (shipment.amount || 0);
            await driver.save();
            
            // Notify customer
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
            // Delete uploaded file if error occurs
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            res.status(500).json({ message: err.message });
        }
    });
});

// ===== DRIVER: Update status =====
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
