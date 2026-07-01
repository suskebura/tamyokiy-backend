const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const auth = require('../middleware/auth');
const User = require('../models/user');
const Shipment = require('../models/shipment');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ===== PROFILE PICTURE UPLOAD SETUP =====
// Ensure profiles directory exists
const profileUploadDir = path.join(__dirname, '../uploads/profiles');
if (!fs.existsSync(profileUploadDir)) {
    fs.mkdirSync(profileUploadDir, { recursive: true });
    console.log('📁 Created profiles directory:', profileUploadDir);
}

// Configure multer for profile picture upload
const profileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, profileUploadDir);
    },
    filename: (req, file, cb) => {
        const userId = req.user.id;
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        cb(null, `profile_${userId}_${timestamp}${ext}`);
    }
});

const profileFileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only JPEG, PNG, JPG, GIF, and WEBP images are allowed'), false);
    }
};

const uploadProfilePic = multer({
    storage: profileStorage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
    fileFilter: profileFileFilter
}).single('profilePicture');

// ===== GET USER PROFILE =====
router.get('/profile', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        res.json(user);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ===== UPDATE USER PROFILE (name AND email) =====
router.put('/profile', auth, async (req, res) => {
    try {
        const { name, email } = req.body;
        
        // Check if email is already taken by another user
        if (email) {
            const existingUser = await User.findOne({ email, _id: { $ne: req.user.id } });
            if (existingUser) {
                return res.status(400).json({ message: 'Email already in use by another account' });
            }
        }
        
        const user = await User.findByIdAndUpdate(
            req.user.id,
            { name, email },
            { new: true }
        ).select('-password');
        
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ===== UPLOAD PROFILE PICTURE =====
router.post('/upload-profile-pic', auth, (req, res) => {
    uploadProfilePic(req, res, async (err) => {
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

        try {
            // Delete old profile picture if exists
            const user = await User.findById(req.user.id);
            if (user.profilePicture) {
                const oldFilePath = path.join(__dirname, '..', user.profilePicture);
                if (fs.existsSync(oldFilePath)) {
                    fs.unlinkSync(oldFilePath);
                }
            }

            // Save new profile picture path
            const profilePicUrl = `/uploads/profiles/${req.file.filename}`;
            user.profilePicture = profilePicUrl;
            await user.save();

            res.json({
                success: true,
                message: 'Profile picture uploaded successfully',
                profilePicture: profilePicUrl
            });
        } catch (error) {
            console.error('Save error:', error);
            // Delete uploaded file if error occurs
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

// ===== REMOVE PROFILE PICTURE =====
router.delete('/remove-profile-pic', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (user.profilePicture) {
            const filePath = path.join(__dirname, '..', user.profilePicture);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            user.profilePicture = null;
            await user.save();
        }
        res.json({
            success: true,
            message: 'Profile picture removed successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ===== CHANGE PASSWORD =====
router.put('/change-password', auth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await User.findById(req.user.id);
        
        // Check current password
        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(400).json({ message: 'Current password is incorrect' });
        }
        
        // Update password
        user.password = newPassword;
        await user.save();
        
        res.json({ success: true, message: 'Password updated successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ===== DELETE ACCOUNT =====
router.delete('/account', auth, async (req, res) => {
    try {
        // Delete profile picture if exists
        const user = await User.findById(req.user.id);
        if (user.profilePicture) {
            const filePath = path.join(__dirname, '..', user.profilePicture);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
        await User.findByIdAndDelete(req.user.id);
        res.json({ success: true, message: 'Account deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ===== GENERATE INVOICE FOR SHIPMENT (ADD THIS) =====
router.get('/invoice/:trackingNumber', auth, async (req, res) => {
    try {
        const shipment = await Shipment.findOne({ 
            trackingNumber: req.params.trackingNumber,
            userId: req.user.id
        });
        
        if (!shipment) {
            return res.status(404).json({ success: false, message: 'Shipment not found' });
        }
        
        const user = await User.findById(req.user.id);
        const { generateInvoice } = require('../utils/invoiceGenerator');
        
        generateInvoice(shipment, user, res);
    } catch (err) {
        console.error('Invoice error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
