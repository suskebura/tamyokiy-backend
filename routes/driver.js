const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Shipment = require('../models/shipment');
const User = require('../models/user');
const { createNotification } = require('./notification');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ===== GET DRIVER DASHBOARD DATA =====
router.get('/dashboard', auth, async (req, res) => {
    try {
        const driver = await User.findById(req.user.id);
        
        if (driver.role !== 'driver') {
            return res.status(403).json({ success: false, message: 'Driver access only' });
        }

        // Get assigned shipments
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

// ===== UPDATE DRIVER STATUS =====
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
        
        res.json({ success: true, driverStatus: driver.driverStatus });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== GET ASSIGNED SHIPMENTS =====
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

// ===== UPDATE SHIPMENT STATUS (DRIVER) =====
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
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== COMPLETE DELIVERY WITH PROOF (UPDATED WITH SIGNATURE) =====
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

// ===== UPDATED: Handle both photo and signature =====
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
                // Clean up uploaded files if shipment not found
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
            
            // ===== UPDATED: Handle both files =====
            if (req.files) {
                if (req.files.deliveryPhoto) {
                    photoUrl = `/uploads/delivery-proofs/${req.files.deliveryPhoto[0].filename}`;
                }
                if (req.files.signature) {
                    signatureUrl = `/uploads/delivery-proofs/${req.files.signature[0].filename}`;
                }
            }
            
            // ===== UPDATED: Save proof with signature =====
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
            // Clean up uploaded files if error occurs
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

module.exports = router;
