const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const Contact = require('../models/Contact');
const Application = require('../models/Application');
const Shipment = require('../models/Shipment');
const User = require('../models/User');
const Rating = require('../models/Rating'); // ADDED
const mongoose = require('mongoose'); // ADDED
const { createAuditLog } = require('../middleware/audit');
const { createNotification } = require('./notification');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

// ===== DASHBOARD STATISTICS =====
router.get('/stats', adminAuth, async (req, res, next) => {
    try {
        const contacts = await Contact.countDocuments();
        const applications = await Application.countDocuments();
        const shipments = await Shipment.countDocuments();
        const users = await User.countDocuments();
        res.json({ contacts, applications, shipments, users });
    } catch (err) {
        next(err);
    }
});

// ===== CONTACTS =====
router.get('/contacts', adminAuth, async (req, res, next) => {
    try {
        const contacts = await Contact.find().sort({ createdAt: -1 });
        res.json(contacts);
    } catch (err) {
        next(err);
    }
});

router.delete('/contacts/:id', adminAuth, async (req, res, next) => {
    try {
        const contact = await Contact.findByIdAndDelete(req.params.id);
        if (contact) {
            await createAuditLog(req, 'DELETE_CONTACT', 'Contact', req.params.id, `Deleted contact from ${contact.name}`);
        }
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// ===== APPLICATIONS =====
router.get('/applications', adminAuth, async (req, res, next) => {
    try {
        const apps = await Application.find().sort({ createdAt: -1 });
        res.json(apps);
    } catch (err) {
        next(err);
    }
});

router.delete('/applications/:id', adminAuth, async (req, res, next) => {
    try {
        const app = await Application.findByIdAndDelete(req.params.id);
        if (app) {
            await createAuditLog(req, 'DELETE_APPLICATION', 'Application', req.params.id, `Deleted application from ${app.name}`);
        }
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// ===== GET SINGLE APPLICATION =====
router.get('/applications/:id', adminAuth, async (req, res, next) => {
    try {
        const application = await Application.findById(req.params.id);
        if (!application) {
            return res.status(404).json({ success: false, message: 'Application not found' });
        }
        res.json(application);
    } catch (err) {
        next(err);
    }
});

// ===== DOWNLOAD CV =====
router.get('/applications/:id/download-cv', async (req, res, next) => {
    try {
        const token = req.query.token;
        
        if (!token) {
            return res.status(401).json({ success: false, message: 'No token provided' });
        }
        
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            return res.status(401).json({ success: false, message: 'Invalid or expired token' });
        }
        
        const user = await User.findById(decoded.id);
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }
        
        const application = await Application.findById(req.params.id);
        if (!application) {
            return res.status(404).json({ success: false, message: 'Application not found' });
        }
        
        if (!application.cvUrl) {
            return res.status(404).json({ success: false, message: 'No CV file found' });
        }
        
        const filePath = path.join(__dirname, '..', application.cvUrl);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: 'CV file not found on server' });
        }
        
        const fileName = path.basename(application.cvUrl);
        
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        
        res.sendFile(filePath);
    } catch (error) {
        console.error('Download CV error:', error);
        next(error);
    }
});

// ===== APPROVE APPLICATION =====
router.put('/applications/:id/approve', adminAuth, async (req, res, next) => {
    try {
        const { reviewNote } = req.body;
        const application = await Application.findById(req.params.id);
        
        if (!application) {
            return res.status(404).json({ success: false, message: 'Application not found' });
        }
        
        application.status = 'approved';
        application.reviewedBy = req.user.name || req.user.email;
        application.reviewedAt = new Date();
        application.reviewNote = reviewNote || 'Your application has been approved. We will contact you soon.';
        
        await application.save();
        
        await createAuditLog(req, 'APPROVE_APPLICATION', 'Application', req.params.id, `Approved application from ${application.name}`);
        
        res.json({ success: true, message: 'Application approved', application });
    } catch (err) {
        next(err);
    }
});

// ===== REJECT APPLICATION =====
router.put('/applications/:id/reject', adminAuth, async (req, res, next) => {
    try {
        const { reviewNote } = req.body;
        const application = await Application.findById(req.params.id);
        
        if (!application) {
            return res.status(404).json({ success: false, message: 'Application not found' });
        }
        
        application.status = 'rejected';
        application.reviewedBy = req.user.name || req.user.email;
        application.reviewedAt = new Date();
        application.reviewNote = reviewNote || 'Thank you for your interest, but we have moved forward with other candidates.';
        
        await application.save();
        
        await createAuditLog(req, 'REJECT_APPLICATION', 'Application', req.params.id, `Rejected application from ${application.name}`);
        
        res.json({ success: true, message: 'Application rejected', application });
    } catch (err) {
        next(err);
    }
});

// ===== CV PREVIEW =====
router.get('/applications/:id/cv', async (req, res, next) => {
    try {
        const token = req.query.token || req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ success: false, message: 'No token provided' });
        }
        
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            return res.status(401).json({ success: false, message: 'Invalid or expired token' });
        }
        
        const user = await User.findById(decoded.id);
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Admin access required' });
        }
        
        const application = await Application.findById(req.params.id);
        if (!application) {
            return res.status(404).json({ success: false, message: 'Application not found' });
        }
        
        if (!application.cvUrl) {
            return res.status(404).json({ success: false, message: 'No CV file found' });
        }
        
        const filePath = path.join(__dirname, '..', application.cvUrl);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: 'CV file not found on server' });
        }
        
        const ext = path.extname(application.cvUrl).toLowerCase();
        const fileName = path.basename(application.cvUrl);
        
        if (ext === '.pdf') {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
        } else {
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        }
        
        res.sendFile(filePath);
    } catch (error) {
        console.error('CV Preview error:', error);
        next(error);
    }
});

// ===== SHIPMENTS =====
router.get('/shipments', adminAuth, async (req, res, next) => {
    try {
        const shipments = await Shipment.find().sort({ createdAt: -1 }).populate('userId', 'name email');
        res.json(shipments);
    } catch (err) {
        next(err);
    }
});

router.put('/shipments/:trackingNumber/status', adminAuth, async (req, res, next) => {
    try {
        const { status, note, failureReason, failureNote } = req.body;
        
        const shipment = await Shipment.findOne({ trackingNumber: req.params.trackingNumber });
        if (!shipment) {
            return res.status(404).json({ message: 'Shipment not found' });
        }
        
        const oldStatus = shipment.status;
        
        const statusNotes = {
            'pending': 'Shipment created and pending pickup',
            'picked_up': 'Shipment has been picked up by carrier',
            'in_transit': 'Shipment is in transit to destination',
            'out_for_delivery': 'Shipment is out for delivery',
            'delivered': 'Shipment has been delivered successfully',
            'failed': 'Shipment delivery failed',
            'cancelled': 'Shipment was cancelled'
        };
        
        const statusMessages = {
            'pending': '📋 Your shipment is pending pickup',
            'picked_up': '📦 Your shipment has been picked up',
            'in_transit': '🚚 Your shipment is in transit',
            'out_for_delivery': '🚛 Your shipment is out for delivery',
            'delivered': '✅ Your shipment has been delivered!',
            'failed': '❌ Your shipment delivery failed',
            'cancelled': '🚫 Your shipment was cancelled'
        };
        
        shipment.trackingHistory.push({
            status: status,
            note: note || statusNotes[status] || `Status changed to ${status}`,
            updatedAt: new Date()
        });
        
        shipment.status = status;
        
        if (status === 'failed' || status === 'cancelled') {
            shipment.failureReason = failureReason || 'other';
            shipment.failureNote = failureNote || note || 'No reason provided';
            shipment.failedAt = new Date();
            shipment.failedBy = req.user.name || req.user.email || 'Admin';
        }
        
        await shipment.save();
        
        await createNotification(
            shipment.userId,
            `🚚 Shipment Update: ${status.toUpperCase().replace('_', ' ')}`,
            statusMessages[status] || `Your shipment status changed to ${status}`,
            status === 'delivered' ? 'success' : status === 'failed' ? 'error' : 'info',
            shipment.trackingNumber
        );
        
        await createAuditLog(req, 'UPDATE_STATUS', 'Shipment', req.params.trackingNumber, `Changed status from ${oldStatus} to ${status}${failureReason ? ' (Reason: ' + failureReason + ')' : ''}`);
        
        res.json({ success: true, shipment });
    } catch (err) {
        next(err);
    }
});

router.delete('/shipments/:trackingNumber', adminAuth, async (req, res, next) => {
    try {
        const shipment = await Shipment.findOneAndDelete({ trackingNumber: req.params.trackingNumber });
        if (shipment) {
            await createAuditLog(req, 'DELETE_SHIPMENT', 'Shipment', req.params.trackingNumber, `Deleted shipment`);
        }
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// ===== 🔥 UPDATE SHIPMENT COST =====
router.put('/shipments/:trackingNumber/update-cost', adminAuth, async (req, res, next) => {
    try {
        const { cost } = req.body;
        
        if (cost === undefined || cost === null) {
            return res.status(400).json({ success: false, message: 'Cost is required' });
        }
        
        if (isNaN(cost) || cost < 0) {
            return res.status(400).json({ success: false, message: 'Cost must be a positive number' });
        }
        
        const shipment = await Shipment.findOne({ trackingNumber: req.params.trackingNumber });
        if (!shipment) {
            return res.status(404).json({ success: false, message: 'Shipment not found' });
        }
        
        const oldCost = shipment.cost || 0;
        shipment.cost = cost;
        await shipment.save();
        
        await createAuditLog(
            req, 
            'UPDATE_COST', 
            'Shipment', 
            req.params.trackingNumber, 
            `Updated cost from $${oldCost.toFixed(2)} to $${cost.toFixed(2)}`
        );
        
        res.json({ 
            success: true, 
            message: `Cost updated from $${oldCost.toFixed(2)} to $${cost.toFixed(2)} for shipment ${shipment.trackingNumber}`,
            shipment: {
                trackingNumber: shipment.trackingNumber,
                amount: shipment.amount,
                cost: shipment.cost,
                oldCost: oldCost
            }
        });
    } catch (err) {
        console.error('Update cost error:', err);
        next(err);
    }
});

// ===== SHIPMENT NOTES =====
router.post('/shipments/:trackingNumber/notes', adminAuth, async (req, res, next) => {
    try {
        const { text } = req.body;
        if (!text || text.trim() === '') {
            return res.status(400).json({ message: 'Note text is required' });
        }
        
        const shipment = await Shipment.findOne({ trackingNumber: req.params.trackingNumber });
        if (!shipment) {
            return res.status(404).json({ message: 'Shipment not found' });
        }
        
        if (!shipment.notes) shipment.notes = [];
        
        shipment.notes.push({
            text: text,
            createdBy: req.user.name || req.user.email || 'Admin',
            createdAt: new Date()
        });
        
        await shipment.save();
        await createAuditLog(req, 'ADD_NOTE', 'Shipment', req.params.trackingNumber, `Added note: ${text.substring(0, 50)}`);
        
        res.json({ success: true, notes: shipment.notes });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/shipments/:trackingNumber/notes', adminAuth, async (req, res, next) => {
    try {
        const shipment = await Shipment.findOne({ trackingNumber: req.params.trackingNumber });
        if (!shipment) {
            return res.status(404).json({ message: 'Shipment not found' });
        }
        res.json(shipment.notes || []);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ===== DELIVERY PROOF PHOTO =====
const uploadDir = path.join(__dirname, '../uploads/delivery-proofs');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('📁 Created uploads directory:', uploadDir);
}

const photoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const trackingNumber = req.params.trackingNumber;
        const photoSlot = req.body.photoSlot || '1';
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        cb(null, `${trackingNumber}_photo${photoSlot}_${timestamp}${ext}`);
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

router.post('/shipments/:trackingNumber/upload-photo', adminAuth, (req, res, next) => {
    uploadPhoto(req, res, async (err) => {
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
                message: 'Please select a photo to upload' 
            });
        }
        
        const photoSlot = req.body.photoSlot || '1';
        
        try {
            const shipment = await Shipment.findOne({ trackingNumber: req.params.trackingNumber });
            if (!shipment) {
                if (fs.existsSync(req.file.path)) {
                    fs.unlinkSync(req.file.path);
                }
                return res.status(404).json({ success: false, message: 'Shipment not found' });
            }
            
            const photoUrl = `/uploads/delivery-proofs/${req.file.filename}`;
            
            if (photoSlot === '1') {
                shipment.deliveryPhoto = photoUrl;
            } else if (photoSlot === '2') {
                shipment.deliveryPhoto2 = photoUrl;
            } else if (photoSlot === '3') {
                shipment.deliveryPhoto3 = photoUrl;
            } else {
                shipment.deliveryPhoto = photoUrl;
            }
            
            shipment.deliveryPhotoUploadedAt = new Date();
            shipment.deliveryPhotoUploadedBy = req.user.name || req.user.email || 'Admin';
            
            await shipment.save();
            
            let photoCount = 0;
            if (shipment.deliveryPhoto) photoCount++;
            if (shipment.deliveryPhoto2) photoCount++;
            if (shipment.deliveryPhoto3) photoCount++;
            
            await createNotification(
                shipment.userId,
                '📸 Delivery Proof Photo Added',
                `Delivery proof photo ${photoSlot} has been added for shipment ${shipment.trackingNumber}. Total photos: ${photoCount}`,
                'info',
                shipment.trackingNumber
            );
            
            await createAuditLog(req, 'UPLOAD_PHOTO', 'Shipment', req.params.trackingNumber, `Uploaded delivery proof photo (slot ${photoSlot}): ${req.file.filename}`);
            
            res.json({ 
                success: true, 
                message: `Delivery proof photo ${photoSlot} uploaded successfully`,
                photoUrl: photoUrl,
                photoSlot: photoSlot,
                photoCount: photoCount
            });
        } catch (error) {
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            next(error);
        }
    });
});

router.get('/shipments/:trackingNumber/delivery-photos', adminAuth, async (req, res, next) => {
    try {
        const shipment = await Shipment.findOne({ trackingNumber: req.params.trackingNumber });
        if (!shipment) {
            return res.status(404).json({ success: false, message: 'Shipment not found' });
        }
        
        const photos = [];
        if (shipment.deliveryPhoto) photos.push({ slot: 1, url: shipment.deliveryPhoto });
        if (shipment.deliveryPhoto2) photos.push({ slot: 2, url: shipment.deliveryPhoto2 });
        if (shipment.deliveryPhoto3) photos.push({ slot: 3, url: shipment.deliveryPhoto3 });
        
        res.json({ success: true, photos: photos, count: photos.length });
    } catch (error) {
        next(error);
    }
});

router.get('/shipments/:trackingNumber/delivery-photo', adminAuth, async (req, res, next) => {
    try {
        const shipment = await Shipment.findOne({ trackingNumber: req.params.trackingNumber });
        if (!shipment) {
            return res.status(404).json({ success: false, message: 'Shipment not found' });
        }
        
        res.json({ 
            success: true, 
            hasPhoto: !!shipment.deliveryPhoto,
            photoUrl: shipment.deliveryPhoto,
            photo2Url: shipment.deliveryPhoto2,
            photo3Url: shipment.deliveryPhoto3
        });
    } catch (error) {
        next(error);
    }
});

// ===== USERS =====
router.get('/users', adminAuth, async (req, res, next) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (err) {
        next(err);
    }
});

router.delete('/users/:id', adminAuth, async (req, res, next) => {
    try {
        if (req.user.id === req.params.id) {
            return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
        }
        
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        
        await createAuditLog(req, 'DELETE_USER', 'User', req.params.id, `Deleted user: ${user.name}`);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

router.put('/users/:id/make-admin', adminAuth, async (req, res, next) => {
    try {
        const user = await User.findByIdAndUpdate(req.params.id, { role: 'admin' }, { new: true }).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });
        
        await createAuditLog(req, 'MAKE_ADMIN', 'User', req.params.id, `Promoted ${user.name} to admin`);
        
        await createNotification(
            user._id,
            '👑 Admin Access Granted',
            `You have been promoted to Administrator. You now have access to the Admin Panel.`,
            'success',
            null
        );
        
        res.json({ success: true, user });
    } catch (err) {
        next(err);
    }
});

// ===== ACCOUNT LOCK ROUTES =====
router.put('/users/:id/unlock', adminAuth, async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        
        user.isLocked = false;
        user.lockReason = null;
        user.lockedAt = null;
        user.lockExpiresAt = null;
        user.failedLoginAttempts = 0;
        user.lastFailedLoginAt = null;
        
        await user.save();
        
        await createNotification(
            user._id,
            '🔓 Account Unlocked',
            `Your account has been unlocked by an administrator. You can now login again.`,
            'success',
            null
        );
        
        await createAuditLog(req, 'UNLOCK_USER', 'User', req.params.id, `Unlocked account for ${user.name} (${user.email})`);
        
        res.json({ success: true, message: `Account for ${user.name} has been unlocked successfully` });
    } catch (err) {
        next(err);
    }
});

router.get('/users/locked', adminAuth, async (req, res, next) => {
    try {
        const lockedUsers = await User.find({ isLocked: true }).select('-password');
        res.json({ success: true, count: lockedUsers.length, users: lockedUsers });
    } catch (err) {
        next(err);
    }
});

router.get('/users/:id/lock-status', adminAuth, async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        
        const isCurrentlyLocked = user.isAccountLocked();
        let remainingMinutes = null;
        
        if (isCurrentlyLocked && user.lockExpiresAt) {
            remainingMinutes = Math.ceil((user.lockExpiresAt - new Date()) / 60000);
        }
        
        res.json({ 
            success: true,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                isLocked: isCurrentlyLocked,
                lockReason: user.lockReason,
                remainingMinutes: remainingMinutes,
                failedLoginAttempts: user.failedLoginAttempts
            }
        });
    } catch (err) {
        next(err);
    }
});

// ==================== DRIVER MANAGEMENT ====================
router.get('/drivers', adminAuth, async (req, res, next) => {
    try {
        const drivers = await User.find({ role: 'driver' })
            .select('-password')
            .sort({ createdAt: -1 });
        res.json({ success: true, drivers });
    } catch (err) {
        next(err);
    }
});

router.get('/drivers/:id', adminAuth, async (req, res, next) => {
    try {
        const driver = await User.findById(req.params.id)
            .select('-password')
            .populate('assignedShipments', 'trackingNumber status senderName receiverName amount');
        
        if (!driver || driver.role !== 'driver') {
            return res.status(404).json({ success: false, message: 'Driver not found' });
        }
        
        res.json({ success: true, driver });
    } catch (err) {
        next(err);
    }
});

router.post('/drivers', adminAuth, async (req, res, next) => {
    try {
        const { name, email, password, phone, licenseNumber, vehicleType } = req.body;
        
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email already exists' });
        }
        
        const driver = new User({
            name,
            email,
            password,
            role: 'driver',
            phone: phone || null,
            licenseNumber: licenseNumber || null,
            vehicleType: vehicleType || null,
            driverStatus: 'offline'
        });
        
        await driver.save();
        
        await createNotification(
            driver._id,
            '🚚 Welcome to TAMYOKIY Driver Team!',
            `You have been registered as a delivery driver. Please login to start receiving delivery assignments.`,
            'success',
            null
        );
        
        await createAuditLog(req, 'CREATE_DRIVER', 'User', driver._id, `Created driver: ${driver.name} (${driver.email})`);
        
        res.status(201).json({
            success: true,
            message: 'Driver created successfully',
            driver: {
                id: driver._id,
                name: driver.name,
                email: driver.email,
                phone: driver.phone,
                licenseNumber: driver.licenseNumber,
                vehicleType: driver.vehicleType,
                driverStatus: driver.driverStatus
            }
        });
    } catch (err) {
        next(err);
    }
});

router.put('/drivers/:id', adminAuth, async (req, res, next) => {
    try {
        const { name, email, phone, licenseNumber, vehicleType, driverStatus } = req.body;
        
        const driver = await User.findById(req.params.id);
        if (!driver || driver.role !== 'driver') {
            return res.status(404).json({ success: false, message: 'Driver not found' });
        }
        
        if (name) driver.name = name;
        if (email) driver.email = email;
        if (phone !== undefined) driver.phone = phone;
        if (licenseNumber !== undefined) driver.licenseNumber = licenseNumber;
        if (vehicleType !== undefined) driver.vehicleType = vehicleType;
        if (driverStatus !== undefined) driver.driverStatus = driverStatus;
        
        await driver.save();
        
        await createAuditLog(req, 'UPDATE_DRIVER', 'User', driver._id, `Updated driver: ${driver.name}`);
        
        res.json({
            success: true,
            message: 'Driver updated successfully',
            driver: {
                id: driver._id,
                name: driver.name,
                email: driver.email,
                phone: driver.phone,
                licenseNumber: driver.licenseNumber,
                vehicleType: driver.vehicleType,
                driverStatus: driver.driverStatus
            }
        });
    } catch (err) {
        next(err);
    }
});

router.delete('/drivers/:id', adminAuth, async (req, res, next) => {
    try {
        const driver = await User.findById(req.params.id);
        if (!driver || driver.role !== 'driver') {
            return res.status(404).json({ success: false, message: 'Driver not found' });
        }
        
        await User.findByIdAndDelete(req.params.id);
        
        await createAuditLog(req, 'DELETE_DRIVER', 'User', req.params.id, `Deleted driver: ${driver.name} (${driver.email})`);
        
        res.json({ success: true, message: 'Driver deleted successfully' });
    } catch (err) {
        next(err);
    }
});

router.get('/drivers/stats/summary', adminAuth, async (req, res, next) => {
    try {
        const totalDrivers = await User.countDocuments({ role: 'driver' });
        const availableDrivers = await User.countDocuments({ role: 'driver', driverStatus: 'available' });
        const onDeliveryDrivers = await User.countDocuments({ role: 'driver', driverStatus: 'on_delivery' });
        const offlineDrivers = await User.countDocuments({ role: 'driver', driverStatus: 'offline' });
        
        const topDrivers = await User.find({ role: 'driver' })
            .select('name completedDeliveries rating totalEarnings')
            .sort({ completedDeliveries: -1 })
            .limit(5);
        
        res.json({
            success: true,
            stats: {
                totalDrivers,
                availableDrivers,
                onDeliveryDrivers,
                offlineDrivers
            },
            topDrivers
        });
    } catch (err) {
        next(err);
    }
});

// ==================== ASSIGN DRIVER TO SHIPMENT ====================
router.put('/shipments/:trackingNumber/assign-driver', adminAuth, async (req, res, next) => {
    try {
        const { driverId } = req.body;
        
        if (!driverId) {
            return res.status(400).json({ success: false, message: 'Driver ID is required' });
        }
        
        const shipment = await Shipment.findOne({ trackingNumber: req.params.trackingNumber });
        if (!shipment) {
            return res.status(404).json({ success: false, message: 'Shipment not found' });
        }
        
        const driver = await User.findById(driverId);
        if (!driver || driver.role !== 'driver') {
            return res.status(404).json({ success: false, message: 'Driver not found' });
        }
        
        if (driver.driverStatus !== 'available' && driver.driverStatus !== 'offline') {
            return res.status(400).json({ 
                success: false, 
                message: `Driver is currently ${driver.driverStatus}. Cannot assign.` 
            });
        }
        
        if (shipment.assignedDriver) {
            const previousDriver = await User.findById(shipment.assignedDriver);
            if (previousDriver) {
                previousDriver.assignedShipments = previousDriver.assignedShipments.filter(
                    id => id.toString() !== shipment._id.toString()
                );
                await previousDriver.save();
            }
        }
        
        shipment.assignedDriver = driver._id;
        shipment.assignedDriverName = driver.name;
        shipment.assignedAt = new Date();
        
        if (!driver.assignedShipments.includes(shipment._id)) {
            driver.assignedShipments.push(shipment._id);
        }
        
        driver.driverStatus = 'available';
        
        await shipment.save();
        await driver.save();
        
        await createNotification(
            driver._id,
            '📦 New Shipment Assigned',
            `You have been assigned to shipment ${shipment.trackingNumber}. Please check your dashboard for details.`,
            'info',
            shipment.trackingNumber
        );
        
        await createNotification(
            shipment.userId,
            '🚚 Driver Assigned to Your Shipment',
            `Driver ${driver.name} has been assigned to your shipment ${shipment.trackingNumber}. You can now track your delivery.`,
            'info',
            shipment.trackingNumber
        );
        
        await createAuditLog(req, 'ASSIGN_DRIVER', 'Shipment', shipment.trackingNumber, `Assigned driver ${driver.name} (${driver.email}) to shipment`);
        
        res.json({
            success: true,
            message: `Driver ${driver.name} assigned to shipment ${shipment.trackingNumber}`,
            shipment: {
                trackingNumber: shipment.trackingNumber,
                assignedDriver: driver.name,
                assignedAt: shipment.assignedAt
            }
        });
    } catch (err) {
        next(err);
    }
});

router.get('/drivers/:driverId/shipments', adminAuth, async (req, res, next) => {
    try {
        const driver = await User.findById(req.params.driverId);
        if (!driver || driver.role !== 'driver') {
            return res.status(404).json({ success: false, message: 'Driver not found' });
        }
        
        const shipments = await Shipment.find({ assignedDriver: driver._id })
            .sort({ createdAt: -1 });
        
        res.json({
            success: true,
            driver: driver.name,
            shipments
        });
    } catch (err) {
        next(err);
    }
});

router.get('/shipments/unassigned', adminAuth, async (req, res, next) => {
    try {
        const unassignedShipments = await Shipment.find({ 
            assignedDriver: null,
            status: { $ne: 'delivered' }
        }).sort({ createdAt: 1 });
        
        res.json({
            success: true,
            count: unassignedShipments.length,
            shipments: unassignedShipments
        });
    } catch (err) {
        next(err);
    }
});

router.get('/drivers/available/list', adminAuth, async (req, res, next) => {
    try {
        const availableDrivers = await User.find({ 
            role: 'driver',
            driverStatus: { $in: ['available', 'offline'] }
        }).select('name email phone vehicleType driverStatus rating completedDeliveries');
        
        res.json({
            success: true,
            count: availableDrivers.length,
            drivers: availableDrivers
        });
    } catch (err) {
        next(err);
    }
});

router.put('/shipments/:trackingNumber/unassign-driver', adminAuth, async (req, res, next) => {
    try {
        const shipment = await Shipment.findOne({ trackingNumber: req.params.trackingNumber });
        if (!shipment) {
            return res.status(404).json({ success: false, message: 'Shipment not found' });
        }
        
        if (!shipment.assignedDriver) {
            return res.status(400).json({ success: false, message: 'No driver assigned to this shipment' });
        }
        
        const driverId = shipment.assignedDriver;
        const driverName = shipment.assignedDriverName;
        
        shipment.assignedDriver = null;
        shipment.assignedDriverName = null;
        shipment.assignedAt = null;
        await shipment.save();
        
        await User.findByIdAndUpdate(driverId, {
            $pull: { assignedShipments: shipment._id }
        });
        
        await createNotification(
            driverId,
            '📦 Shipment Unassigned',
            `Shipment ${shipment.trackingNumber} has been unassigned from you.`,
            'warning',
            shipment.trackingNumber
        );
        
        await createAuditLog(req, 'UNASSIGN_DRIVER', 'Shipment', shipment.trackingNumber, `Unassigned ${driverName} from shipment`);
        
        res.json({ 
            success: true, 
            message: 'Driver unassigned successfully'
        });
    } catch (err) {
        next(err);
    }
});

// ================================================================
// REVENUE GROWTH ANALYSIS - October 2026 to December 2030
// ================================================================
router.get('/reports/revenue-growth', adminAuth, async (req, res, next) => {
    try {
        const { months = 6 } = req.query;
        const limit = parseInt(months) || 6;
        
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const allMonthKeys = [];
        
        for (let year = 2026; year <= 2030; year++) {
            const startMonth = (year === 2026) ? 10 : 1;
            const endMonth = (year === 2030) ? 12 : 12;
            for (let month = startMonth; month <= endMonth; month++) {
                allMonthKeys.push({
                    year: year,
                    month: month,
                    label: monthNames[month - 1] + ' ' + year
                });
            }
        }
        
        let monthsToShow = allMonthKeys;
        if (limit < 51) {
            monthsToShow = allMonthKeys.slice(-limit);
        }
        
        const monthlyData = [];
        let previousRevenue = null;
        let totalGrowth = 0;
        
        for (const monthInfo of monthsToShow) {
            const startDate = new Date(monthInfo.year, monthInfo.month - 1, 1);
            const endDate = new Date(monthInfo.year, monthInfo.month, 0);
            
            const shipments = await Shipment.find({
                createdAt: { $gte: startDate, $lte: endDate }
            });
            
            const revenue = shipments.reduce((sum, s) => sum + (s.amount || 0), 0);
            const count = shipments.length;
            const delivered = shipments.filter(s => s.status === 'delivered').length;
            
            let growth = null;
            if (previousRevenue !== null && previousRevenue > 0) {
                growth = ((revenue - previousRevenue) / previousRevenue) * 100;
                totalGrowth = growth;
            }
            
            const serviceBreakdown = {
                standard: shipments.filter(s => s.serviceType === 'standard').reduce((sum, s) => sum + (s.amount || 0), 0),
                express: shipments.filter(s => s.serviceType === 'express').reduce((sum, s) => sum + (s.amount || 0), 0),
                overnight: shipments.filter(s => s.serviceType === 'overnight').reduce((sum, s) => sum + (s.amount || 0), 0)
            };
            
            monthlyData.push({
                month: monthInfo.label,
                revenue: revenue,
                count: count,
                delivered: delivered,
                deliveryRate: count > 0 ? Math.round((delivered / count) * 100) : 0,
                growth: growth,
                serviceBreakdown: serviceBreakdown
            });
            
            previousRevenue = revenue;
        }
        
        const totalRevenue = monthlyData.reduce((sum, m) => sum + m.revenue, 0);
        const averageRevenue = monthlyData.length > 0 ? Math.round(totalRevenue / monthlyData.length) : 0;
        const bestMonth = monthlyData.reduce((a, b) => a.revenue > b.revenue ? a : b, monthlyData[0] || {});
        
        res.json({
            success: true,
            data: monthlyData,
            summary: {
                totalRevenue: totalRevenue,
                averageRevenue: averageRevenue,
                bestMonth: bestMonth,
                growthTrend: totalGrowth
            }
        });
    } catch (err) {
        console.error('Revenue growth error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==================== DRIVER PERFORMANCE RANKING ====================
router.get('/reports/driver-performance', adminAuth, async (req, res, next) => {
    try {
        const { period = 'month' } = req.query;
        
        const now = new Date();
        let startDate = new Date();
        if (period === 'month') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        } else if (period === 'quarter') {
            const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
            startDate = new Date(now.getFullYear(), quarterMonth, 1);
        } else if (period === 'year') {
            startDate = new Date(now.getFullYear(), 0, 1);
        }
        
        const drivers = await User.find({ role: 'driver' });
        
        if (drivers.length === 0) {
            return res.json({
                success: true,
                drivers: [],
                summary: {
                    totalDrivers: 0,
                    totalDeliveries: 0,
                    totalRevenue: 0,
                    averageSuccessRate: 0,
                    averageDeliveryTime: 0,
                    bestDriver: null
                }
            });
        }
        
        const performance = await Promise.all(drivers.map(async (driver) => {
            const shipments = await Shipment.find({
                assignedDriver: driver._id,
                createdAt: { $gte: startDate }
            });
            
            const total = shipments.length;
            const completed = shipments.filter(s => s.status === 'delivered').length;
            const revenue = shipments.reduce((sum, s) => sum + (s.amount || 0), 0);
            
            let totalDays = 0;
            let fastest = null;
            let slowest = null;
            let failed = 0;
            
            shipments.forEach(s => {
                if (s.status === 'delivered' && s.deliveryProof?.deliveredAt) {
                    const deliveredAt = new Date(s.deliveryProof.deliveredAt);
                    const createdAt = new Date(s.createdAt);
                    const days = (deliveredAt - createdAt) / (1000 * 60 * 60 * 24);
                    totalDays += days;
                    
                    if (fastest === null || days < fastest) fastest = days;
                    if (slowest === null || days > slowest) slowest = days;
                }
                if (s.status === 'failed') {
                    failed++;
                }
            });
            
            const avgDeliveryTime = completed > 0 ? totalDays / completed : 0;
            const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
            
            let rating = 5;
            if (successRate < 80) rating -= 1;
            if (successRate < 60) rating -= 1;
            if (avgDeliveryTime > 3) rating -= 0.5;
            if (avgDeliveryTime > 5) rating -= 0.5;
            rating = Math.max(1, Math.min(5, rating));
            
            return {
                id: driver._id,
                name: driver.name,
                email: driver.email,
                phone: driver.phone,
                totalDeliveries: total,
                completedDeliveries: completed,
                successRate: successRate,
                revenue: revenue,
                avgDeliveryTime: Math.round(avgDeliveryTime * 10) / 10,
                fastestDelivery: fastest ? Math.round(fastest * 10) / 10 : null,
                slowestDelivery: slowest ? Math.round(slowest * 10) / 10 : null,
                failedDeliveries: failed,
                rating: Math.round(rating * 10) / 10,
                status: driver.driverStatus || 'offline',
                vehicleType: driver.vehicleType || 'N/A'
            };
        }));
        
        const sorted = performance.sort((a, b) => b.completedDeliveries - a.completedDeliveries);
        
        const ranked = sorted.map((driver, index) => ({
            ...driver,
            rank: index + 1,
            medal: index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`
        }));
        
        const totalDrivers = ranked.length;
        const totalDeliveries = ranked.reduce((sum, d) => sum + d.totalDeliveries, 0);
        const totalRevenue = ranked.reduce((sum, d) => sum + d.revenue, 0);
        const avgSuccessRate = totalDrivers > 0 ? Math.round(ranked.reduce((sum, d) => sum + d.successRate, 0) / totalDrivers) : 0;
        const avgDeliveryTime = totalDrivers > 0 ? Math.round((ranked.reduce((sum, d) => sum + d.avgDeliveryTime, 0) / totalDrivers) * 10) / 10 : 0;
        
        res.json({
            success: true,
            drivers: ranked,
            summary: {
                totalDrivers: totalDrivers,
                totalDeliveries: totalDeliveries,
                totalRevenue: totalRevenue,
                averageSuccessRate: avgSuccessRate,
                averageDeliveryTime: avgDeliveryTime,
                bestDriver: ranked.length > 0 ? ranked[0].name : null,
                topPerformers: ranked.slice(0, 3).map(d => d.name)
            }
        });
    } catch (err) {
        console.error('Driver performance error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ==================== REVENUE & DELIVERY FORECASTING ====================
router.get('/reports/forecast', adminAuth, async (req, res, next) => {
    try {
        const { months = 6 } = req.query;
        const lookback = parseInt(months) || 6;
        
        const today = new Date();
        const historicalData = [];
        
        for (let i = lookback - 1; i >= 0; i--) {
            const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const startDate = new Date(date.getFullYear(), date.getMonth(), 1);
            const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);
            
            const shipments = await Shipment.find({
                createdAt: { $gte: startDate, $lte: endDate }
            });
            
            const monthName = date.toLocaleString('default', { month: 'short' }) + ' ' + date.getFullYear();
            const revenue = shipments.reduce((sum, s) => sum + (s.amount || 0), 0);
            const count = shipments.length;
            const delivered = shipments.filter(s => s.status === 'delivered').length;
            
            historicalData.push({
                month: monthName,
                revenue: revenue,
                deliveries: count,
                delivered: delivered,
                deliveryRate: count > 0 ? Math.round((delivered / count) * 100) : 0
            });
        }
        
        let revenueGrowthRates = [];
        let deliveryGrowthRates = [];
        let totalRevenueGrowth = 0;
        let totalDeliveryGrowth = 0;
        
        for (let i = 1; i < historicalData.length; i++) {
            const prevRevenue = historicalData[i - 1].revenue;
            const currRevenue = historicalData[i].revenue;
            const prevDeliveries = historicalData[i - 1].deliveries;
            const currDeliveries = historicalData[i].deliveries;
            
            if (prevRevenue > 0) {
                const revGrowth = ((currRevenue - prevRevenue) / prevRevenue) * 100;
                revenueGrowthRates.push(revGrowth);
                totalRevenueGrowth += revGrowth;
            }
            
            if (prevDeliveries > 0) {
                const delGrowth = ((currDeliveries - prevDeliveries) / prevDeliveries) * 100;
                deliveryGrowthRates.push(delGrowth);
                totalDeliveryGrowth += delGrowth;
            }
        }
        
        const avgRevenueGrowth = revenueGrowthRates.length > 0 
            ? totalRevenueGrowth / revenueGrowthRates.length 
            : 0;
        const avgDeliveryGrowth = deliveryGrowthRates.length > 0 
            ? totalDeliveryGrowth / deliveryGrowthRates.length 
            : 0;
        
        const revenueVariance = revenueGrowthRates.reduce((sum, rate) => sum + Math.pow(rate - avgRevenueGrowth, 2), 0) / (revenueGrowthRates.length || 1);
        const revenueStdDev = Math.sqrt(revenueVariance);
        const deliveryVariance = deliveryGrowthRates.reduce((sum, rate) => sum + Math.pow(rate - avgDeliveryGrowth, 2), 0) / (deliveryGrowthRates.length || 1);
        const deliveryStdDev = Math.sqrt(deliveryVariance);
        
        const maxStdDev = 50;
        const revenueConfidence = Math.max(0, Math.min(100, 100 - (revenueStdDev / maxStdDev) * 100));
        const deliveryConfidence = Math.max(0, Math.min(100, 100 - (deliveryStdDev / maxStdDev) * 100));
        const overallConfidence = Math.round((revenueConfidence + deliveryConfidence) / 2);
        
        const lastMonth = historicalData[historicalData.length - 1];
        const predictedRevenue = lastMonth.revenue * (1 + (avgRevenueGrowth / 100));
        const predictedDeliveries = Math.round(lastMonth.deliveries * (1 + (avgDeliveryGrowth / 100)));
        
        const trend = avgRevenueGrowth > 5 ? '📈 Strong Growth' :
                     avgRevenueGrowth > 0 ? '📈 Moderate Growth' :
                     avgRevenueGrowth > -5 ? '📉 Slight Decline' :
                     '📉 Strong Decline';
        
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const currentMonth = today.getMonth();
        const seasonality = {
            'Jan': 0.9, 'Feb': 0.85, 'Mar': 0.95, 'Apr': 1.0,
            'May': 1.05, 'Jun': 1.1, 'Jul': 1.0, 'Aug': 0.95,
            'Sep': 0.9, 'Oct': 0.95, 'Nov': 1.0, 'Dec': 1.2
        };
        const seasonalFactor = seasonality[monthNames[currentMonth]] || 1.0;
        
        const adjustedRevenue = predictedRevenue * seasonalFactor;
        const adjustedDeliveries = Math.round(predictedDeliveries * seasonalFactor);
        
        const chartData = [];
        const startIndex = Math.max(0, historicalData.length - 6);
        
        for (let i = startIndex; i < historicalData.length; i++) {
            chartData.push({
                month: historicalData[i].month,
                revenue: historicalData[i].revenue,
                deliveries: historicalData[i].deliveries,
                isForecast: false
            });
        }
        
        chartData.push({
            month: monthNames[(currentMonth + 1) % 12] + ' ' + (currentMonth === 11 ? today.getFullYear() + 1 : today.getFullYear()),
            revenue: Math.round(adjustedRevenue * 100) / 100,
            deliveries: Math.max(0, adjustedDeliveries),
            isForecast: true
        });
        
        res.json({
            success: true,
            forecast: {
                nextMonth: monthNames[(currentMonth + 1) % 12] + ' ' + (currentMonth === 11 ? today.getFullYear() + 1 : today.getFullYear()),
                predictedRevenue: Math.round(adjustedRevenue * 100) / 100,
                predictedDeliveries: Math.max(0, adjustedDeliveries),
                confidence: overallConfidence,
                trend: trend,
                avgRevenueGrowth: Math.round(avgRevenueGrowth * 100) / 100,
                avgDeliveryGrowth: Math.round(avgDeliveryGrowth * 100) / 100,
                seasonalFactor: seasonalFactor
            },
            historical: historicalData,
            summary: {
                totalRevenue: historicalData.reduce((sum, d) => sum + d.revenue, 0),
                totalDeliveries: historicalData.reduce((sum, d) => sum + d.deliveries, 0),
                averageRevenue: Math.round(historicalData.reduce((sum, d) => sum + d.revenue, 0) / historicalData.length),
                averageDeliveries: Math.round(historicalData.reduce((sum, d) => sum + d.deliveries, 0) / historicalData.length),
                bestMonth: historicalData.reduce((a, b) => a.revenue > b.revenue ? a : b),
                worstMonth: historicalData.reduce((a, b) => a.revenue < b.revenue ? a : b)
            },
            chartData: chartData,
            raw: {
                revenueGrowthRates: revenueGrowthRates,
                deliveryGrowthRates: deliveryGrowthRates,
                revenueConfidence: revenueConfidence,
                deliveryConfidence: deliveryConfidence
            }
        });
    } catch (err) {
        console.error('Forecast error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================================================================
// SLA / ON-TIME DELIVERY PERFORMANCE - FIXED
// ================================================================
router.get('/reports/sla-performance', adminAuth, async (req, res, next) => {
    try {
        const { period = 'month' } = req.query;
        
        const now = new Date();
        let startDate = new Date();
        
        if (period === 'month') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        } else if (period === 'quarter') {
            const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
            startDate = new Date(now.getFullYear(), quarterMonth, 1);
        } else if (period === 'year') {
            startDate = new Date(now.getFullYear(), 0, 1);
        }
        
        const shipments = await Shipment.find({
            createdAt: { $gte: startDate }
        });
        
        const totalShipments = shipments.length;
        const deliveredShipments = shipments.filter(s => s.status === 'delivered');
        const totalDelivered = deliveredShipments.length;
        
        const onTimeDeliveries = deliveredShipments.filter(s => {
            if (!s.estimatedDelivery) return false;
            const deliveredAt = s.deliveryProof?.deliveredAt || s.updatedAt || s.createdAt;
            return new Date(deliveredAt) <= new Date(s.estimatedDelivery);
        });
        const onTimeCount = onTimeDeliveries.length;
        const lateCount = totalDelivered - onTimeCount;
        
        const deliveryRate = totalShipments > 0 ? (totalDelivered / totalShipments) * 100 : 0;
        const onTimeRate = totalDelivered > 0 ? (onTimeCount / totalDelivered) * 100 : 0;
        const lateRate = totalDelivered > 0 ? (lateCount / totalDelivered) * 100 : 0;
        
        const serviceTypes = ['standard', 'express', 'overnight'];
        const serviceBreakdown = serviceTypes.map(type => {
            const typeShipments = shipments.filter(s => s.serviceType === type);
            const typeDelivered = typeShipments.filter(s => s.status === 'delivered');
            const typeOnTime = typeDelivered.filter(s => {
                if (!s.estimatedDelivery) return false;
                const deliveredAt = s.deliveryProof?.deliveredAt || s.updatedAt || s.createdAt;
                return new Date(deliveredAt) <= new Date(s.estimatedDelivery);
            });
            
            return {
                serviceType: type,
                total: typeShipments.length,
                delivered: typeDelivered.length,
                onTime: typeOnTime.length,
                onTimeRate: typeDelivered.length > 0 ? (typeOnTime.length / typeDelivered.length) * 100 : 0
            };
        });
        
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthlyTrend = [];
        
        for (let year = 2026; year <= 2030; year++) {
            const startMonth = (year === 2026) ? 10 : 1;
            const endMonth = (year === 2030) ? 12 : 12;
            for (let month = startMonth; month <= endMonth; month++) {
                const monthStart = new Date(year, month - 1, 1);
                const monthEnd = new Date(year, month, 0);
                
                const monthShipments = await Shipment.find({
                    createdAt: { $gte: monthStart, $lte: monthEnd }
                });
                
                const monthDelivered = monthShipments.filter(s => s.status === 'delivered');
                const monthOnTime = monthDelivered.filter(s => {
                    if (!s.estimatedDelivery) return false;
                    const deliveredAt = s.deliveryProof?.deliveredAt || s.updatedAt || s.createdAt;
                    return new Date(deliveredAt) <= new Date(s.estimatedDelivery);
                });
                
                monthlyTrend.push({
                    month: monthNames[month - 1] + ' ' + year,
                    total: monthShipments.length,
                    delivered: monthDelivered.length,
                    onTime: monthOnTime.length,
                    onTimeRate: monthDelivered.length > 0 ? (monthOnTime.length / monthDelivered.length) * 100 : 0
                });
            }
        }
        
        let totalDeliveryDays = 0;
        let deliveryCount = 0;
        
        deliveredShipments.forEach(s => {
            if (s.deliveryProof?.deliveredAt) {
                const deliveredAt = new Date(s.deliveryProof.deliveredAt);
                const createdAt = new Date(s.createdAt);
                const days = (deliveredAt - createdAt) / (1000 * 60 * 60 * 24);
                totalDeliveryDays += days;
                deliveryCount++;
            }
        });
        
        const avgDeliveryTime = deliveryCount > 0 ? totalDeliveryDays / deliveryCount : 0;
        
        let slaGrade = 'A';
        let slaColor = '#4caf50';
        let slaMessage = 'Excellent performance!';
        
        if (onTimeRate >= 95) {
            slaGrade = 'A+';
            slaColor = '#4caf50';
            slaMessage = 'Outstanding! You\'re exceeding expectations.';
        } else if (onTimeRate >= 90) {
            slaGrade = 'A';
            slaColor = '#4caf50';
            slaMessage = 'Great job! Keep up the excellent work.';
        } else if (onTimeRate >= 80) {
            slaGrade = 'B';
            slaColor = '#ffa500';
            slaMessage = 'Good performance. Room for improvement.';
        } else if (onTimeRate >= 70) {
            slaGrade = 'C';
            slaColor = '#ff6b6b';
            slaMessage = 'Needs attention. Review your delivery processes.';
        } else {
            slaGrade = 'F';
            slaColor = '#ff0000';
            slaMessage = 'Urgent action required. Immediate process review needed.';
        }
        
        await createAuditLog(
            req,
            'GENERATE_SLA_REPORT',
            'Report',
            null,
            `Generated SLA performance report for ${period} period. On-time rate: ${onTimeRate.toFixed(1)}%`
        );
        
        res.json({
            success: true,
            summary: {
                totalShipments,
                totalDelivered,
                onTimeCount,
                lateCount,
                deliveryRate: Math.round(deliveryRate * 10) / 10,
                onTimeRate: Math.round(onTimeRate * 10) / 10,
                lateRate: Math.round(lateRate * 10) / 10,
                avgDeliveryTime: Math.round(avgDeliveryTime * 10) / 10,
                slaGrade,
                slaColor,
                slaMessage
            },
            serviceBreakdown,
            monthlyTrend
        });
        
    } catch (err) {
        console.error('SLA Performance error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================================================================
// CUSTOMER ANALYTICS - FIXED
// ================================================================
router.get('/reports/customer-analytics', adminAuth, async (req, res, next) => {
    try {
        const { period = 'month' } = req.query;
        
        const now = new Date();
        let startDate = new Date();
        
        if (period === 'month') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        } else if (period === 'quarter') {
            const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
            startDate = new Date(now.getFullYear(), quarterMonth, 1);
        } else if (period === 'year') {
            startDate = new Date(now.getFullYear(), 0, 1);
        }
        
        const allCustomers = await User.find({ 
            role: 'client' 
        }).select('_id name email createdAt');
        
        const totalCustomers = allCustomers.length;
        const allShipments = await Shipment.find({});
        
        const customerOrders = {};
        allShipments.forEach(s => {
            const userId = s.userId?.toString();
            if (userId) {
                customerOrders[userId] = (customerOrders[userId] || 0) + 1;
            }
        });
        
        const totalOrders = allShipments.length;
        const avgOrdersPerCustomer = totalCustomers > 0 ? totalOrders / totalCustomers : 0;
        
        const customerRevenue = {};
        allShipments.forEach(s => {
            const userId = s.userId?.toString();
            if (userId) {
                customerRevenue[userId] = (customerRevenue[userId] || 0) + (s.amount || 0);
            }
        });
        
        const totalRevenue = allShipments.reduce((sum, s) => sum + (s.amount || 0), 0);
        const avgRevenuePerCustomer = totalCustomers > 0 ? totalRevenue / totalCustomers : 0;
        
        const topCustomers = Object.entries(customerRevenue)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([userId, revenue]) => {
                const user = allCustomers.find(c => c._id.toString() === userId);
                return {
                    id: userId,
                    name: user?.name || 'Unknown',
                    email: user?.email || 'Unknown',
                    orders: customerOrders[userId] || 0,
                    revenue: revenue,
                    joined: user?.createdAt || null
                };
            });
        
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const customerGrowth = [];
        
        for (let year = 2026; year <= 2030; year++) {
            const startMonth = (year === 2026) ? 10 : 1;
            const endMonth = (year === 2030) ? 12 : 12;
            for (let month = startMonth; month <= endMonth; month++) {
                const monthStart = new Date(year, month - 1, 1);
                const monthEnd = new Date(year, month, 0);
                
                const newCustomers = await User.countDocuments({
                    role: 'client',
                    createdAt: { $gte: monthStart, $lte: monthEnd }
                });
                
                const totalAtMonthEnd = await User.countDocuments({
                    role: 'client',
                    createdAt: { $lte: monthEnd }
                });
                
                customerGrowth.push({
                    month: monthNames[month - 1] + ' ' + year,
                    newCustomers: newCustomers,
                    totalCustomers: totalAtMonthEnd
                });
            }
        }
        
        const returningCustomers = Object.values(customerOrders).filter(orders => orders > 1).length;
        const retentionRate = totalCustomers > 0 ? (returningCustomers / totalCustomers) * 100 : 0;
        
        const activeCustomers = Object.keys(customerOrders).length;
        const inactiveCustomers = totalCustomers - activeCustomers;
        
        const segments = {
            oneTime: 0,
            occasional: 0,
            frequent: 0,
            vip: 0
        };
        
        Object.values(customerOrders).forEach(orders => {
            if (orders === 1) segments.oneTime++;
            else if (orders <= 5) segments.occasional++;
            else if (orders <= 10) segments.frequent++;
            else segments.vip++;
        });
        
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recentCustomers = await User.countDocuments({
            role: 'client',
            createdAt: { $gte: thirtyDaysAgo }
        });
        
        await createAuditLog(
            req,
            'GENERATE_CUSTOMER_ANALYTICS',
            'Report',
            null,
            `Generated customer analytics report for ${period} period`
        );
        
        res.json({
            success: true,
            summary: {
                totalCustomers,
                activeCustomers,
                inactiveCustomers,
                recentCustomers,
                totalOrders,
                avgOrdersPerCustomer: Math.round(avgOrdersPerCustomer * 10) / 10,
                totalRevenue: Math.round(totalRevenue * 100) / 100,
                avgRevenuePerCustomer: Math.round(avgRevenuePerCustomer * 100) / 100,
                retentionRate: Math.round(retentionRate * 10) / 10,
                returningCustomers
            },
            segments,
            topCustomers,
            customerGrowth,
            period: period
        });
        
    } catch (err) {
        console.error('Customer Analytics error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================================================================
// FAILED DELIVERY ANALYSIS - FIXED
// ================================================================

const failureReasonLabels = {
    'wrong_address': '📍 Wrong Address',
    'customer_not_home': '🏠 Customer Not Home',
    'damaged': '💔 Damaged',
    'lost': '🔍 Lost',
    'refused': '🚫 Refused Delivery',
    'failed_attempt': '🔄 Failed Attempt',
    'weather': '🌧️ Weather',
    'vehicle_issue': '🔧 Vehicle Issue',
    'delayed': '⏰ Delayed',
    'other': '❓ Other'
};

const failureReasonColors = {
    'wrong_address': '#ff6b6b',
    'customer_not_home': '#ffa500',
    'damaged': '#ff0000',
    'lost': '#ff00ff',
    'refused': '#ff1493',
    'failed_attempt': '#ff8c00',
    'weather': '#00bfff',
    'vehicle_issue': '#ff4500',
    'delayed': '#9370db',
    'other': '#808080'
};

router.get('/reports/failed-delivery-analysis', adminAuth, async (req, res, next) => {
    try {
        const { period = 'month' } = req.query;
        
        const now = new Date();
        let startDate = new Date();
        
        if (period === 'month') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        } else if (period === 'quarter') {
            const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
            startDate = new Date(now.getFullYear(), quarterMonth, 1);
        } else if (period === 'year') {
            startDate = new Date(now.getFullYear(), 0, 1);
        }
        
        const allShipments = await Shipment.find({
            createdAt: { $gte: startDate }
        });
        
        const failedShipments = allShipments.filter(s => 
            s.status === 'failed' || s.status === 'cancelled'
        );
        
        const totalShipments = allShipments.length;
        const totalFailed = failedShipments.length;
        const failureRate = totalShipments > 0 ? (totalFailed / totalShipments) * 100 : 0;
        
        const allTimeShipments = await Shipment.find({});
        const allTimeFailed = allTimeShipments.filter(s => 
            s.status === 'failed' || s.status === 'cancelled'
        );
        const overallFailureRate = allTimeShipments.length > 0 ? (allTimeFailed.length / allTimeShipments.length) * 100 : 0;
        
        const deliveredCount = allShipments.filter(s => s.status === 'delivered').length;
        const deliverySuccessRate = totalShipments > 0 ? (deliveredCount / totalShipments) * 100 : 0;
        
        const reasonBreakdown = {};
        let unknownReasonCount = 0;
        
        failedShipments.forEach(s => {
            const reason = s.failureReason || 'other';
            if (!reasonBreakdown[reason]) {
                reasonBreakdown[reason] = 0;
            }
            reasonBreakdown[reason]++;
            if (!s.failureReason) {
                unknownReasonCount++;
            }
        });
        
        const reasonData = Object.entries(reasonBreakdown).map(([reason, count]) => ({
            reason: reason,
            label: failureReasonLabels[reason] || 'Unknown',
            color: failureReasonColors[reason] || '#808080',
            count: count,
            percentage: totalFailed > 0 ? (count / totalFailed) * 100 : 0
        }));
        
        reasonData.sort((a, b) => b.count - a.count);
        
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthlyTrend = [];
        
        for (let year = 2026; year <= 2030; year++) {
            const startMonth = (year === 2026) ? 10 : 1;
            const endMonth = (year === 2030) ? 12 : 12;
            for (let month = startMonth; month <= endMonth; month++) {
                const monthStart = new Date(year, month - 1, 1);
                const monthEnd = new Date(year, month, 0);
                
                const monthShipments = await Shipment.find({
                    createdAt: { $gte: monthStart, $lte: monthEnd }
                });
                
                const monthTotal = monthShipments.length;
                const monthFailed = monthShipments.filter(s => 
                    s.status === 'failed' || s.status === 'cancelled'
                ).length;
                const monthDelivered = monthShipments.filter(s => s.status === 'delivered').length;
                
                monthlyTrend.push({
                    month: monthNames[month - 1] + ' ' + year,
                    total: monthTotal,
                    failed: monthFailed,
                    delivered: monthDelivered,
                    failureRate: monthTotal > 0 ? (monthFailed / monthTotal) * 100 : 0,
                    successRate: monthTotal > 0 ? (monthDelivered / monthTotal) * 100 : 0
                });
            }
        }
        
        const drivers = await User.find({ role: 'driver' });
        
        const driverFailureStats = [];
        
        for (const driver of drivers) {
            const driverShipments = await Shipment.find({
                assignedDriver: driver._id,
                createdAt: { $gte: startDate }
            });
            
            const total = driverShipments.length;
            if (total === 0) continue;
            
            const failed = driverShipments.filter(s => 
                s.status === 'failed' || s.status === 'cancelled'
            ).length;
            const delivered = driverShipments.filter(s => s.status === 'delivered').length;
            
            const driverReasons = {};
            driverShipments.filter(s => s.status === 'failed' || s.status === 'cancelled').forEach(s => {
                const reason = s.failureReason || 'other';
                if (!driverReasons[reason]) driverReasons[reason] = 0;
                driverReasons[reason]++;
            });
            
            const topReason = Object.entries(driverReasons)
                .sort((a, b) => b[1] - a[1])
                .map(([reason]) => failureReasonLabels[reason] || 'Unknown')
                .slice(0, 1)[0] || 'None';
            
            driverFailureStats.push({
                id: driver._id,
                name: driver.name,
                vehicleType: driver.vehicleType || 'N/A',
                total: total,
                delivered: delivered,
                failed: failed,
                failureRate: total > 0 ? (failed / total) * 100 : 0,
                successRate: total > 0 ? (delivered / total) * 100 : 0,
                topFailureReason: topReason,
                rating: driver.rating || 5
            });
        }
        
        driverFailureStats.sort((a, b) => b.failureRate - a.failureRate);
        
        const topReasons = reasonData.slice(0, 5);
        
        const recentFailed = failedShipments
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 50)
            .map(s => ({
                trackingNumber: s.trackingNumber,
                receiverName: s.receiverName,
                receiverAddress: s.receiverAddress,
                status: s.status,
                amount: s.amount || 0,
                assignedDriverName: s.assignedDriverName || 'Not Assigned',
                failureReason: s.failureReason || 'other',
                failureReasonLabel: failureReasonLabels[s.failureReason] || 'Unknown',
                failureNote: s.failureNote || 'No note',
                failedAt: s.failedAt || s.updatedAt || s.createdAt,
                createdAt: s.createdAt,
                serviceType: s.serviceType || 'standard'
            }));
        
        await createAuditLog(
            req,
            'GENERATE_FAILED_DELIVERY_REPORT',
            'Report',
            null,
            `Generated failed delivery analysis report for ${period} period. Failure rate: ${failureRate.toFixed(1)}%`
        );
        
        res.json({
            success: true,
            summary: {
                totalShipments,
                totalFailed,
                deliveredCount,
                failureRate: Math.round(failureRate * 10) / 10,
                successRate: Math.round(deliverySuccessRate * 10) / 10,
                overallFailureRate: Math.round(overallFailureRate * 10) / 10,
                unknownReasonCount
            },
            reasonBreakdown: reasonData,
            topReasons: topReasons,
            monthlyTrend: monthlyTrend,
            driverPerformance: driverFailureStats,
            recentFailed: recentFailed,
            period: period
        });
        
    } catch (err) {
        console.error('Failed Delivery Analysis error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================================================================
// 🆕 GEOGRAPHIC DELIVERY ANALYTICS
// ================================================================

/**
 * GET /api/admin/reports/geographic-analytics
 * Returns delivery analytics by location
 */
router.get('/reports/geographic-analytics', adminAuth, async (req, res, next) => {
    try {
        const { period = 'month' } = req.query;
        
        const now = new Date();
        let startDate = new Date();
        
        if (period === 'month') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        } else if (period === 'quarter') {
            const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
            startDate = new Date(now.getFullYear(), quarterMonth, 1);
        } else if (period === 'year') {
            startDate = new Date(now.getFullYear(), 0, 1);
        } else if (period === 'all') {
            startDate = new Date(2026, 0, 1);
        }
        
        // Get all shipments in period
        const shipments = await Shipment.find({
            createdAt: { $gte: startDate }
        });
        
        // ===== EXTRACT LOCATION DATA =====
        const cityData = {};
        const countryData = {};
        const regionData = {};
        
        shipments.forEach(s => {
            // Parse receiver address to extract city and country
            const address = s.receiverAddress || '';
            const parts = address.split(',').map(p => p.trim());
            
            let city = 'Unknown';
            let country = 'Unknown';
            let region = 'Unknown';
            
            if (parts.length >= 2) {
                city = parts[0] || 'Unknown';
                country = parts[parts.length - 1] || 'Unknown';
                if (parts.length >= 3) {
                    region = parts[1] || 'Unknown';
                }
            } else if (parts.length === 1) {
                city = parts[0] || 'Unknown';
            }
            
            // City data
            if (!cityData[city]) {
                cityData[city] = {
                    city: city,
                    country: country,
                    region: region,
                    count: 0,
                    onTime: 0,
                    delayed: 0,
                    totalDays: 0,
                    revenue: 0
                };
            }
            cityData[city].count++;
            cityData[city].revenue += (s.amount || 0);
            
            // Country data
            if (!countryData[country]) {
                countryData[country] = {
                    country: country,
                    count: 0,
                    onTime: 0,
                    delayed: 0,
                    totalDays: 0,
                    revenue: 0
                };
            }
            countryData[country].count++;
            countryData[country].revenue += (s.amount || 0);
            
            // Region data
            if (!regionData[region]) {
                regionData[region] = {
                    region: region,
                    country: country,
                    count: 0,
                    onTime: 0,
                    delayed: 0,
                    totalDays: 0,
                    revenue: 0
                };
            }
            regionData[region].count++;
            regionData[region].revenue += (s.amount || 0);
            
            // Calculate delivery time and on-time status
            if (s.status === 'delivered' && s.deliveryProof?.deliveredAt && s.estimatedDelivery) {
                const deliveredAt = new Date(s.deliveryProof.deliveredAt);
                const estDate = new Date(s.estimatedDelivery);
                const days = (deliveredAt - estDate) / (1000 * 60 * 60 * 24);
                
                cityData[city].totalDays += days;
                countryData[country].totalDays += days;
                regionData[region].totalDays += days;
                
                if (days <= 0) {
                    cityData[city].onTime++;
                    countryData[country].onTime++;
                    regionData[region].onTime++;
                } else {
                    cityData[city].delayed++;
                    countryData[country].delayed++;
                    regionData[region].delayed++;
                }
            }
        });
        
        // ===== CALCULATE STATISTICS =====
        const cityStats = Object.values(cityData).map(c => ({
            ...c,
            avgDeliveryTime: c.count > 0 ? (c.totalDays / c.count).toFixed(1) : 0,
            onTimeRate: c.count > 0 ? Math.round((c.onTime / c.count) * 100) : 0,
            avgRevenue: c.count > 0 ? Math.round(c.revenue / c.count) : 0
        })).sort((a, b) => b.count - a.count);
        
        const countryStats = Object.values(countryData).map(c => ({
            ...c,
            avgDeliveryTime: c.count > 0 ? (c.totalDays / c.count).toFixed(1) : 0,
            onTimeRate: c.count > 0 ? Math.round((c.onTime / c.count) * 100) : 0,
            avgRevenue: c.count > 0 ? Math.round(c.revenue / c.count) : 0
        })).sort((a, b) => b.count - a.count);
        
        const regionStats = Object.values(regionData).map(r => ({
            ...r,
            avgDeliveryTime: r.count > 0 ? (r.totalDays / r.count).toFixed(1) : 0,
            onTimeRate: r.count > 0 ? Math.round((r.onTime / r.count) * 100) : 0,
            avgRevenue: r.count > 0 ? Math.round(r.revenue / r.count) : 0
        })).sort((a, b) => b.count - a.count);
        
        // ===== TOP CITIES =====
        const topCities = cityStats.slice(0, 10);
        
        // ===== TOTAL STATS =====
        const totalShipments = shipments.length;
        const totalDelivered = shipments.filter(s => s.status === 'delivered').length;
        const totalRevenue = shipments.reduce((sum, s) => sum + (s.amount || 0), 0);
        const uniqueCities = Object.keys(cityData).filter(c => c !== 'Unknown').length;
        const uniqueCountries = Object.keys(countryData).filter(c => c !== 'Unknown').length;
        
        await createAuditLog(
            req,
            'GENERATE_GEOGRAPHIC_REPORT',
            'Report',
            null,
            `Generated geographic analytics report for ${period} period. ${totalShipments} shipments across ${uniqueCities} cities`
        );
        
        res.json({
            success: true,
            summary: {
                totalShipments,
                totalDelivered,
                totalRevenue: Math.round(totalRevenue * 100) / 100,
                uniqueCities,
                uniqueCountries,
                deliveryRate: totalShipments > 0 ? Math.round((totalDelivered / totalShipments) * 100) : 0
            },
            topCities: topCities,
            cityStats: cityStats,
            countryStats: countryStats,
            regionStats: regionStats,
            period: period
        });
        
    } catch (err) {
        console.error('Geographic Analytics error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================================================================
// 🔥 PROFIT & COST ANALYSIS - FIXED (Starts from January 2026)
// ================================================================
router.get('/reports/profit-analysis', adminAuth, async (req, res, next) => {
    try {
        const { period = 'all' } = req.query;
        
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const allMonths = [];
        
        // ===== 🔥 FIXED: Start from JANUARY 2026 instead of October =====
        for (let year = 2026; year <= 2030; year++) {
            const startMonth = (year === 2026) ? 1 : 1;  // <-- CHANGED FROM 10 TO 1
            const endMonth = (year === 2030) ? 12 : 12;
            for (let month = startMonth; month <= endMonth; month++) {
                allMonths.push({
                    year: year,
                    month: month,
                    label: monthNames[month - 1] + ' ' + year
                });
            }
        }
        
        const monthlyTrend = [];
        let totalRevenue = 0;
        let totalCost = 0;
        let totalDeliveries = 0;
        let totalShipments = 0;
        
        // Service type breakdown
        const serviceStats = {
            standard: { count: 0, revenue: 0, cost: 0 },
            express: { count: 0, revenue: 0, cost: 0 },
            overnight: { count: 0, revenue: 0, cost: 0 }
        };
        
        // Customer profit tracking
        const customerStats = {};
        
        for (const monthInfo of allMonths) {
            const startDate = new Date(monthInfo.year, monthInfo.month - 1, 1);
            const endDate = new Date(monthInfo.year, monthInfo.month, 0);
            
            const shipments = await Shipment.find({
                createdAt: { $gte: startDate, $lte: endDate }
            });
            
            const monthRevenue = shipments.reduce((sum, s) => sum + (s.amount || 0), 0);
            const monthCost = shipments.reduce((sum, s) => sum + (s.cost || 0), 0);
            const monthProfit = monthRevenue - monthCost;
            const monthDeliveries = shipments.filter(s => s.status === 'delivered').length;
            
            totalRevenue += monthRevenue;
            totalCost += monthCost;
            totalDeliveries += monthDeliveries;
            totalShipments += shipments.length;
            
            monthlyTrend.push({
                month: monthInfo.label,
                revenue: Math.round(monthRevenue * 100) / 100,
                cost: Math.round(monthCost * 100) / 100,
                profit: Math.round(monthProfit * 100) / 100,
                deliveries: monthDeliveries,
                count: shipments.length
            });
            
            // Calculate service type breakdown
            shipments.forEach(s => {
                const serviceType = s.serviceType || 'standard';
                if (serviceStats[serviceType]) {
                    serviceStats[serviceType].count += 1;
                    serviceStats[serviceType].revenue += (s.amount || 0);
                    serviceStats[serviceType].cost += (s.cost || 0);
                }
                
                // Track customer profit
                if (s.userId) {
                    const userId = s.userId.toString();
                    if (!customerStats[userId]) {
                        customerStats[userId] = {
                            name: 'Unknown',
                            count: 0,
                            revenue: 0,
                            cost: 0,
                            profit: 0
                        };
                    }
                    customerStats[userId].count += 1;
                    customerStats[userId].revenue += (s.amount || 0);
                    customerStats[userId].cost += (s.cost || 0);
                    customerStats[userId].profit += ((s.amount || 0) - (s.cost || 0));
                }
            });
        }
        
        // Get customer names
        const userIds = Object.keys(customerStats);
        if (userIds.length > 0) {
            const users = await User.find({ _id: { $in: userIds } }).select('name');
            users.forEach(user => {
                if (customerStats[user._id.toString()]) {
                    customerStats[user._id.toString()].name = user.name;
                }
            });
        }
        
        // Calculate service type profit
        const serviceTypeProfit = Object.entries(serviceStats).map(([serviceType, stats]) => ({
            serviceType: serviceType,
            count: stats.count,
            revenue: Math.round(stats.revenue * 100) / 100,
            cost: Math.round(stats.cost * 100) / 100,
            profit: Math.round((stats.revenue - stats.cost) * 100) / 100,
            margin: stats.revenue > 0 ? Math.round(((stats.revenue - stats.cost) / stats.revenue) * 1000) / 10 : 0
        }));
        
        // Get top customers by profit
        const topCustomers = Object.entries(customerStats)
            .sort((a, b) => b[1].profit - a[1].profit)
            .slice(0, 10)
            .map(([userId, stats]) => ({
                id: userId,
                name: stats.name || 'Unknown',
                count: stats.count,
                revenue: Math.round(stats.revenue * 100) / 100,
                cost: Math.round(stats.cost * 100) / 100,
                profit: Math.round(stats.profit * 100) / 100,
                margin: stats.revenue > 0 ? Math.round((stats.profit / stats.revenue) * 1000) / 10 : 0
            }));
        
        const profit = totalRevenue - totalCost;
        const profitMargin = totalRevenue > 0 ? Math.round((profit / totalRevenue) * 1000) / 10 : 0;
        const avgCostPerDelivery = totalDeliveries > 0 ? Math.round((totalCost / totalDeliveries) * 100) / 100 : 0;
        
        await createAuditLog(
            req,
            'GENERATE_PROFIT_ANALYSIS',
            'Report',
            null,
            `Generated profit analysis. Revenue: $${totalRevenue.toFixed(2)}, Costs: $${totalCost.toFixed(2)}, Profit: $${profit.toFixed(2)}, Margin: ${profitMargin}%`
        );
        
        res.json({
            success: true,
            summary: {
                totalRevenue: Math.round(totalRevenue * 100) / 100,
                totalCost: Math.round(totalCost * 100) / 100,
                profit: Math.round(profit * 100) / 100,
                profitMargin: profitMargin,
                totalDeliveries: totalDeliveries,
                totalShipments: totalShipments,
                avgCostPerDelivery: avgCostPerDelivery,
                monthsAnalyzed: allMonths.length
            },
            monthlyTrend: monthlyTrend,
            serviceTypeProfit: serviceTypeProfit,
            topCustomers: topCustomers
        });
        
    } catch (err) {
        console.error('Profit Analysis error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================================================================
// ⭐ ADMIN RATING ROUTES
// ================================================================

// Get all ratings
router.get('/ratings', adminAuth, async (req, res, next) => {
    try {
        const { limit = 100, page = 1, driverId } = req.query;
        
        let query = {};
        if (driverId) query.driverId = driverId;
        
        const ratings = await Rating.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .populate('userId', 'name email')
            .populate('driverId', 'name email');
        
        const total = await Rating.countDocuments(query);
        const stats = await Rating.aggregate([
            { $match: query },
            { $group: {
                _id: null,
                averageRating: { $avg: '$overallRating' },
                totalRatings: { $sum: 1 },
                averageDriverRating: { $avg: '$driverRating' },
                averageServiceRating: { $avg: '$serviceRating' }
            }}
        ]);
        
        res.json({
            success: true,
            ratings,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
            stats: stats[0] || { averageRating: 0, totalRatings: 0, averageDriverRating: 0, averageServiceRating: 0 }
        });
    } catch (err) {
        console.error('Get ratings error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// Delete rating
router.delete('/ratings/:id', adminAuth, async (req, res, next) => {
    try {
        const rating = await Rating.findByIdAndDelete(req.params.id);
        if (!rating) {
            return res.status(404).json({ success: false, message: 'Rating not found' });
        }
        
        await createAuditLog(req, 'DELETE_RATING', 'Rating', req.params.id, `Deleted rating for shipment ${rating.trackingNumber}`);
        
        res.json({ success: true, message: 'Rating deleted' });
    } catch (err) {
        console.error('Delete rating error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// Get driver rating stats
router.get('/ratings/driver/:driverId/stats', adminAuth, async (req, res, next) => {
    try {
        const stats = await Rating.getDriverAverageRating(req.params.driverId);
        const distribution = await Rating.aggregate([
            { $match: { driverId: new mongoose.Types.ObjectId(req.params.driverId) } },
            { $group: {
                _id: '$driverRating',
                count: { $sum: 1 }
            }},
            { $sort: { _id: -1 } }
        ]);
        
        res.json({
            success: true,
            stats,
            distribution: distribution.map(d => ({
                stars: d._id,
                count: d.count
            }))
        });
    } catch (err) {
        console.error('Driver rating stats error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;