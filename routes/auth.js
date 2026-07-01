const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/user');
const { recordLogin } = require('../middleware/loginhistory');

// ===== REGISTER CLIENT (default user) =====
router.post('/register', [
    body('name')
        .notEmpty().withMessage('Name is required')
        .trim()
        .isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
    body('email')
        .isEmail().withMessage('Please provide a valid email')
        .normalizeEmail(),
    body('password')
        .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { name, email, password } = req.body;
        
        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }
        
        // Create new user
        const user = new User({ name, email, password, role: 'client' });
        await user.save();
        
        // Create token
        const token = jwt.sign(
            { id: user._id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        // Record successful login after registration
        await recordLogin(user, 'success', req);
        
        res.status(201).json({
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ===== REGISTER DRIVER (admin only - should be called from admin panel) =====
router.post('/register-driver', [
    body('name').notEmpty().withMessage('Name is required').trim(),
    body('email').isEmail().withMessage('Please provide a valid email').normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('phone').optional(),
    body('licenseNumber').optional(),
    body('vehicleType').optional().isIn(['bike', 'car', 'van', 'truck', 'heavy_truck'])
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { name, email, password, phone, licenseNumber, vehicleType } = req.body;
        
        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }
        
        // Create new driver
        const user = new User({ 
            name, 
            email, 
            password, 
            role: 'driver',
            phone: phone || null,
            licenseNumber: licenseNumber || null,
            vehicleType: vehicleType || null,
            driverStatus: 'offline'
        });
        await user.save();
        
        res.status(201).json({
            success: true,
            message: 'Driver registered successfully',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                phone: user.phone,
                licenseNumber: user.licenseNumber,
                vehicleType: user.vehicleType,
                driverStatus: user.driverStatus
            }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ===== LOGIN with validation, login history, and ACCOUNT LOCK (supports admin, client, driver) =====
router.post('/login', [
    body('email')
        .isEmail().withMessage('Please provide a valid email')
        .normalizeEmail(),
    body('password')
        .notEmpty().withMessage('Password is required')
], async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { email, password } = req.body;
        
        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            // Record failed login attempt (user not found)
            await recordLogin({ _id: null, email, name: 'Unknown' }, 'failed', req, 'User not found');
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        
        // ===== CHECK IF ACCOUNT IS LOCKED =====
        if (user.isAccountLocked()) {
            const remainingMinutes = Math.ceil((user.lockExpiresAt - new Date()) / 60000);
            await recordLogin(user, 'failed', req, `Account locked - ${user.failedLoginAttempts} failed attempts`);
            return res.status(403).json({ 
                success: false,
                message: `Account is locked. Please try again in ${remainingMinutes} minutes.`,
                isLocked: true,
                lockReason: user.lockReason,
                remainingMinutes: remainingMinutes,
                failedAttempts: user.failedLoginAttempts
            });
        }
        
        // Check password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            // Record failed login and increment attempts
            const isNowLocked = await user.recordFailedLogin();
            await recordLogin(user, 'failed', req, `Invalid password (Attempt ${user.failedLoginAttempts}/5)`);
            
            if (isNowLocked) {
                return res.status(403).json({ 
                    success: false,
                    message: `Account locked due to ${user.failedLoginAttempts} failed attempts. Please try again in 15 minutes.`,
                    isLocked: true,
                    failedAttempts: user.failedLoginAttempts,
                    maxAttempts: 5
                });
            }
            
            const remainingAttempts = 5 - user.failedLoginAttempts;
            return res.status(400).json({ 
                success: false,
                message: `Invalid credentials. ${remainingAttempts} attempt(s) remaining before account lock.`,
                remainingAttempts: remainingAttempts,
                failedAttempts: user.failedLoginAttempts
            });
        }
        
        // ===== SUCCESSFUL LOGIN - RESET FAILED ATTEMPTS =====
        await user.resetFailedAttempts();
        
        // Create token
        const token = jwt.sign(
            { id: user._id, email: user.email, role: user.role || 'client' },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        // Record successful login
        await recordLogin(user, 'success', req);
        
        // Build response based on role
        const responseData = {
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role || 'client'
            }
        };
        
        // Add driver-specific fields if role is driver
        if (user.role === 'driver') {
            responseData.user.phone = user.phone;
            responseData.user.licenseNumber = user.licenseNumber;
            responseData.user.vehicleType = user.vehicleType;
            responseData.user.driverStatus = user.driverStatus;
            responseData.user.completedDeliveries = user.completedDeliveries || 0;
            responseData.user.rating = user.rating || 5;
        }
        
        res.json(responseData);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
