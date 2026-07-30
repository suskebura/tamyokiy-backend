const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');

// ============================================================
// 📝 REGISTER CLIENT - WITH PHONE NUMBER (FIXED)
// ============================================================

router.post('/register', [
    body('name')
        .notEmpty().withMessage('Name is required')
        .trim()
        .isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
    body('email')
        .isEmail().withMessage('Please provide a valid email')
        .normalizeEmail(),
    body('password')
        .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('phone')
        .notEmpty().withMessage('Phone number is required')
        .trim()
], async (req, res) => {
    console.log('🔵 ========================================');
    console.log('🔵 REGISTER ENDPOINT HIT');
    console.log('🔵 ========================================');
    console.log('📥 Request body:', req.body);

    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        console.log('❌ Validation errors:', errors.array());
        return res.status(400).json({ 
            success: false,
            errors: errors.array() 
        });
    }

    try {
        const { name, email, password, phone, role } = req.body;
        
        console.log('📧 Email:', email);
        console.log('📱 Phone:', phone);
        console.log('👤 Name:', name);
        
        // Clean phone number (remove spaces)
        const cleanPhone = phone.replace(/\s/g, '');
        console.log('📱 Clean phone:', cleanPhone);
        
        // Check if user exists by email
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            console.log('❌ Email already exists:', email);
            return res.status(400).json({ 
                success: false,
                message: 'User already exists' 
            });
        }
        
        // Check if phone already exists
        const existingPhone = await User.findOne({ phone: cleanPhone });
        if (existingPhone) {
            console.log('❌ Phone already exists:', cleanPhone);
            return res.status(400).json({
                success: false,
                message: 'Phone number already registered'
            });
        }
        
        console.log('✅ Creating user...');
        
        // Create new user
        const user = new User({ 
            name, 
            email, 
            password, 
            phone: cleanPhone,
            role: role || 'client' 
        });
        await user.save();
        
        console.log('✅ User created:', user._id);
        
        // ===== SEND WELCOME SMS =====
        try {
            const smsService = require('../services/smsService');
            await smsService.sendWelcomeSMS(cleanPhone, name, user.role);
            console.log('📱 Welcome SMS sent to:', cleanPhone);
        } catch (smsErr) {
            console.log('⚠️ SMS error:', smsErr.message);
        }
        
        // ===== SEND WELCOME EMAIL =====
        try {
            const emailService = require('../services/emailService');
            await emailService.sendEmail(
                email,
                '🎉 Welcome to TAMYOKIY Logistics',
                `
                    <div style="font-family: Arial; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
                        <div style="background: #1a1a2e; padding: 20px; border-radius: 10px; color: #D4AF37; text-align: center;">
                            <h1>🚚 TAMYOKIY Logistics</h1>
                        </div>
                        <div style="background: white; padding: 30px; border-radius: 10px; margin-top: 20px;">
                            <h2 style="color: #D4AF37;">🎉 Welcome, ${name}!</h2>
                            <p>Thank you for joining TAMYOKIY Logistics.</p>
                            <p>You will receive SMS and email notifications for your shipments.</p>
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="http://localhost:5500/dashboard.html" 
                                   style="background: linear-gradient(135deg, #D4AF37, #FFD700); color: #050505; padding: 14px 28px; border-radius: 40px; text-decoration: none; font-weight: 700;">
                                    🚀 Go to Dashboard
                                </a>
                            </div>
                            <hr style="border: 1px solid #eee; margin: 20px 0;">
                            <p style="color: #888; font-size: 0.8rem;">We Move Freight. You Move Forward.</p>
                        </div>
                        <div style="text-align: center; padding: 20px; color: #888; font-size: 0.8rem;">
                            <p>© 2026 TAMYOKIY Logistics Inc.</p>
                        </div>
                    </div>
                `
            );
            console.log('📧 Welcome email sent to:', email);
        } catch (emailErr) {
            console.log('⚠️ Email error:', emailErr.message);
        }
        
        // Create token
        const token = jwt.sign(
            { id: user._id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.status(201).json({
            success: true,
            message: 'User created successfully',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role
            }
        });
    } catch (err) {
        console.error('❌ Registration error:', err);
        res.status(500).json({ 
            success: false,
            message: err.message 
        });
    }
});

// ============================================================
// 🔐 LOGIN - FIXED
// ============================================================

router.post('/login', [
    body('email')
        .isEmail().withMessage('Please provide a valid email')
        .normalizeEmail(),
    body('password')
        .notEmpty().withMessage('Password is required')
], async (req, res) => {
    console.log('🔵 ========================================');
    console.log('🔵 LOGIN ENDPOINT HIT');
    console.log('🔵 ========================================');
    console.log('📥 Request body:', req.body);

    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            success: false,
            errors: errors.array() 
        });
    }

    try {
        const { email, password } = req.body;
        
        // Find user by email
        const user = await User.findOne({ email });
        if (!user) {
            console.log('❌ User not found:', email);
            return res.status(400).json({ 
                success: false,
                message: 'Invalid credentials' 
            });
        }
        
        console.log('👤 User found:', user.email);
        
        // Check password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            console.log('❌ Invalid password for:', email);
            return res.status(400).json({ 
                success: false,
                message: 'Invalid credentials' 
            });
        }
        
        console.log('✅ Password matched for:', email);
        
        // Create token
        const token = jwt.sign(
            { id: user._id, email: user.email, role: user.role || 'client' },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role || 'client'
            }
        });
    } catch (err) {
        console.error('❌ Login error:', err);
        res.status(500).json({ 
            success: false,
            message: err.message 
        });
    }
});

// ============================================================
// 🚚 REGISTER DRIVER - FIXED
// ============================================================

router.post('/register-driver', [
    body('name').notEmpty().withMessage('Name is required').trim(),
    body('email').isEmail().withMessage('Please provide a valid email').normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('phone').notEmpty().withMessage('Phone number is required').trim(),
    body('licenseNumber').notEmpty().withMessage('License number is required'),
    body('vehicleType').isIn(['bike', 'car', 'van', 'truck', 'heavy_truck']).withMessage('Invalid vehicle type')
], async (req, res) => {
    console.log('🔵 ========================================');
    console.log('🔵 REGISTER DRIVER ENDPOINT HIT');
    console.log('🔵 ========================================');
    console.log('📥 Request body:', req.body);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            success: false,
            errors: errors.array() 
        });
    }

    try {
        const { name, email, password, phone, licenseNumber, vehicleType } = req.body;
        
        // Clean phone number
        const cleanPhone = phone.replace(/\s/g, '');
        
        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ 
                success: false,
                message: 'User already exists' 
            });
        }
        
        // Check if phone already exists
        const existingPhone = await User.findOne({ phone: cleanPhone });
        if (existingPhone) {
            return res.status(400).json({
                success: false,
                message: 'Phone number already registered'
            });
        }
        
        // Create new driver
        const user = new User({ 
            name, 
            email, 
            password, 
            phone: cleanPhone,
            role: 'driver',
            licenseNumber: licenseNumber || null,
            vehicleType: vehicleType || null,
            driverStatus: 'offline'
        });
        await user.save();
        
        console.log('✅ Driver created:', user._id);
        
        res.status(201).json({
            success: true,
            message: 'Driver registered successfully',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                licenseNumber: user.licenseNumber,
                vehicleType: user.vehicleType,
                driverStatus: user.driverStatus
            }
        });
    } catch (err) {
        console.error('❌ Driver registration error:', err);
        res.status(500).json({ 
            success: false,
            message: err.message 
        });
    }
});

// ============================================================
// ✅ GET CURRENT USER
// ============================================================

router.get('/me', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ success: false, message: 'No token provided' });
        }
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        res.json({ success: true, user });
    } catch (err) {
        console.error('Get user error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;