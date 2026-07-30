const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const fs = require('fs');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

// ============================================================
// 📦 LOAD ENV
// ============================================================
dotenv.config();

const app = express();

// ============================================================
// 🍪 COOKIE PARSER
// ============================================================
app.use(cookieParser());

// ============================================================
// 📁 CREATE UPLOAD DIRECTORIES
// ============================================================
const uploadDirs = [
    './uploads',
    './uploads/delivery-proofs',
    './uploads/profiles',
    './uploads/qr-codes',
    './uploads/barcodes',
    './uploads/tickets',
    './uploads/insurance'
];

uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Created directory: ${dir}`);
    }
});

// ============================================================
// 🔧 CORS - MUST BE FIRST
// ============================================================
app.use(cors({
    origin: [
        'http://localhost:5500',
        'http://127.0.0.1:5500',
        'http://localhost:5000',
        'https://tamyokiy-frontend.onrender.com'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
}));

app.options('*', cors());

// ============================================================
// 🔧 FIX CORS FOR IMAGES
// ============================================================
app.use((req, res, next) => {
    res.header('Cross-Origin-Resource-Policy', 'cross-origin');
    res.header('Cross-Origin-Embedder-Policy', 'unsafe-none');
    next();
});

// ============================================================
// 🔧 SECURITY MIDDLEWARES
// ============================================================
app.use(helmet({
    crossOriginResourcePolicy: false,
}));

// ============================================================
// 🔧 RATE LIMITER
// ============================================================
const limiter = rateLimit({
    max: 100,
    windowMs: 60 * 60 * 1000,
    message: 'Too many requests from this IP, please try again in an hour.'
});

app.use('/api/contact', limiter);
app.use('/api/careers', limiter);
app.use('/api/tracking', limiter);
app.use('/api/auth', limiter);
app.use('/api/v1', limiter);

app.use(mongoSanitize());
app.use(xss());

// ============================================================
// 🔧 REGULAR MIDDLEWARES
// ============================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================================================
// 📦 LOAD ALL MODELS
// ============================================================
console.log('📦 Loading models...');

try {
    require('./models/User');
    require('./models/Shipment');
    require('./models/Vehicle');
    require('./models/DriverLocation');
    require('./models/Route');
    require('./models/Warehouse');
    require('./models/WarehouseInventory');
    require('./models/WarehouseForecast');
    require('./models/AnomalyLog');
    require('./models/SentimentLog');
    require('./models/AssignmentLog');
    require('./models/AuditLog');
    require('./models/Ticket');
    require('./models/TicketReply');
    require('./models/Message');
    require('./models/Notification');
    require('./models/Contact');
    require('./models/Payment');
    require('./models/Invoice');
    require('./models/Rating');
    require('./models/ApiKey');
    require('./models/WebhookSubscription');
    require('./models/WebhookLog');
    require('./models/Application');
    require('./models/Maintenance');
    require('./models/LoginHistory');
    require('./models/CarbonFootprint');
    require('./models/Chat');
    require('./models/Insurance');
    console.log('✅ All models loaded successfully');
} catch (err) {
    console.error('❌ Error loading models:', err.message);
}

console.log(`📊 Total Models: ${Object.keys(mongoose.models).length}`);
console.log('📦 Registered Models:', Object.keys(mongoose.models).join(', '));

// ============================================================
// 📱 OTP STORAGE (In-memory for development)
// ============================================================

const otpStorage = {
    email: {},
    phone: {}
};

// ============================================================
// 🔐 HELPER: Get User From Token
// ============================================================

async function getUserFromToken(token) {
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const User = mongoose.model('User');
        const user = await User.findById(decoded.id);
        return user;
    } catch (err) {
        console.error('❌ Error getting user from token:', err.message);
        return null;
    }
}

// ============================================================
// 📦 REFUND REQUEST MODEL (Create if doesn't exist)
// ============================================================

if (!mongoose.models.RefundRequest) {
    const RefundRequestSchema = new mongoose.Schema({
        shipmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shipment', required: true },
        trackingNumber: { type: String, required: true, index: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        userEmail: { type: String, required: true },
        reason: { 
            type: String, 
            enum: ['damaged', 'wrong_delivery', 'cancelled', 'delayed', 'lost', 'incorrect_item', 'other'],
            required: true 
        },
        description: { type: String, default: '' },
        photos: [{ type: String }],
        status: { 
            type: String, 
            enum: ['pending', 'under_review', 'approved', 'processed', 'rejected'],
            default: 'pending' 
        },
        adminNotes: { type: String, default: '' },
        refundAmount: { type: Number, default: 0 },
        processedAt: { type: Date },
        requestedAt: { type: Date, default: Date.now }
    }, { timestamps: true });
    
    mongoose.model('RefundRequest', RefundRequestSchema);
    console.log('✅ RefundRequest model created dynamically');
}

// ============================================================
// 🌐 LANGUAGE & NOTIFICATION SERVICES - MUST BE BEFORE ROUTES
// ============================================================

const { i18n, detectLanguage } = require('./middleware/language');

// Initialize i18n
app.use(i18n.init);
app.use(detectLanguage);

// ============================================================
// 📧 SEND EMAIL OTP
// ============================================================

app.post('/api/auth/send-email-otp', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email required' });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const token = Math.random().toString(36).substring(2, 15);

        otpStorage.email[token] = {
            email: email,
            otp: otp,
            expiresAt: Date.now() + 5 * 60 * 1000
        };

        console.log(`📧 Email OTP for ${email}: ${otp}`);

        try {
            const emailService = require('./services/emailService');
            await emailService.sendEmail(
                email,
                '🔐 Verify Your Email - TAMYOKIY Logistics',
                `
                    <div style="font-family: Arial; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
                        <div style="background: #1a1a2e; padding: 20px; border-radius: 10px; color: #D4AF37; text-align: center;">
                            <h1>🔐 TAMYOKIY Verification</h1>
                        </div>
                        <div style="background: white; padding: 30px; border-radius: 10px; margin-top: 20px;">
                            <h2 style="color: #2196F3;">Verify Your Email</h2>
                            <p>Enter this code to verify your email address:</p>
                            <div style="background: #f0f0f0; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
                                <span style="font-size: 2rem; font-weight: 800; color: #D4AF37; letter-spacing: 8px;">${otp}</span>
                            </div>
                            <p style="color: #888; font-size: 0.85rem;">This code expires in 5 minutes.</p>
                            <hr style="border: 1px solid #eee; margin: 20px 0;">
                            <p style="color: #888; font-size: 0.8rem;">If you didn't request this, please ignore this email.</p>
                        </div>
                        <div style="text-align: center; padding: 20px; color: #888; font-size: 0.8rem;">
                            <p>© 2026 TAMYOKIY Logistics Inc.</p>
                        </div>
                    </div>
                `
            );
            console.log('✅ Email OTP sent');
        } catch (emailErr) {
            console.log('⚠️ Email error:', emailErr.message);
        }

        res.json({
            success: true,
            message: 'OTP sent to your email (check console)',
            token: token,
            otp: otp
        });

    } catch (err) {
        console.error('Send Email OTP error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// ✅ VERIFY EMAIL OTP
// ============================================================

app.post('/api/auth/verify-email-otp', async (req, res) => {
    try {
        const { email, code, token } = req.body;
        
        console.log('📥 Verify Email Request:', { email, code, token });

        if (!email || !code || !token) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required fields' 
            });
        }

        const stored = otpStorage.email[token];

        if (!stored) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid or expired session. Please request a new OTP.' 
            });
        }

        if (stored.email !== email) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email mismatch' 
            });
        }

        if (Date.now() > stored.expiresAt) {
            delete otpStorage.email[token];
            return res.status(400).json({ 
                success: false, 
                message: 'OTP expired. Please request a new one.' 
            });
        }

        if (stored.otp !== code) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid code. Please try again.' 
            });
        }

        delete otpStorage.email[token];

        res.json({
            success: true,
            message: 'Email verified successfully',
            verified: true
        });

    } catch (err) {
        console.error('Verify Email OTP error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 📱 SEND PHONE OTP
// ============================================================

app.post('/api/auth/send-phone-otp', async (req, res) => {
    try {
        const { phone } = req.body;
        
        if (!phone) {
            return res.status(400).json({ success: false, message: 'Phone number required' });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const token = Math.random().toString(36).substring(2, 15);

        otpStorage.phone[token] = {
            phone: phone,
            otp: otp,
            expiresAt: Date.now() + 5 * 60 * 1000
        };

        console.log(`📱 Phone OTP for ${phone}: ${otp}`);

        try {
            const smsService = require('./services/smsService');
            await smsService.sendVerificationCode(phone, otp);
            console.log('✅ OTP logged (no real SMS sent)');
        } catch (smsErr) {
            console.log('⚠️ SMS error:', smsErr.message);
        }

        res.json({
            success: true,
            message: 'OTP sent to your phone (check console)',
            token: token,
            otp: otp
        });

    } catch (err) {
        console.error('Send Phone OTP error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// ✅ VERIFY PHONE OTP
// ============================================================

app.post('/api/auth/verify-phone-otp', async (req, res) => {
    try {
        const { phone, code, token } = req.body;
        
        console.log('📥 Verify Phone Request:', { phone, code, token });

        if (!phone || !code || !token) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required fields' 
            });
        }

        const stored = otpStorage.phone[token];

        if (!stored) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid or expired session. Please request a new OTP.' 
            });
        }

        if (stored.phone !== phone) {
            return res.status(400).json({ 
                success: false, 
                message: 'Phone number mismatch' 
            });
        }

        if (Date.now() > stored.expiresAt) {
            delete otpStorage.phone[token];
            return res.status(400).json({ 
                success: false, 
                message: 'OTP expired. Please request a new one.' 
            });
        }

        if (stored.otp !== code) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid code. Please try again.' 
            });
        }

        delete otpStorage.phone[token];

        res.json({
            success: true,
            message: 'Phone verified successfully',
            verified: true
        });

    } catch (err) {
        console.error('Verify Phone OTP error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 📦 CREATE PENDING SHIPMENT
// ============================================================

app.post('/api/tracking/create-pending', async (req, res) => {
    console.log('🔵 ========================================');
    console.log('🔵 CREATE PENDING SHIPMENT ENDPOINT HIT');
    console.log('🔵 ========================================');
    
    const token = req.headers.authorization?.split(' ')[1];
    console.log('🔵 Token received:', token ? '✅ Yes' : '❌ No');
    
    if (!token) {
        console.log('🔴 ERROR: No token provided');
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    try {
        const user = await getUserFromToken(token);
        console.log('🔵 User found:', user ? user.email : '❌ No user');
        
        if (!user) {
            console.log('🔴 ERROR: User not found');
            return res.status(401).json({ success: false, message: 'User not found' });
        }
        
        const {
            senderName, senderAddress,
            receiverName, receiverAddress,
            weight, serviceType, amount
        } = req.body;
        
        console.log('🔵 Request body:', { senderName, senderAddress, receiverName, receiverAddress, weight, serviceType, amount });
        
        const trackingNumber = 'TAM' + Date.now().toString(36).toUpperCase() + 
                              Math.random().toString(36).substring(2, 6).toUpperCase();
        console.log('🔵 Generated tracking number:', trackingNumber);
        
        const daysToAdd = serviceType === 'overnight' ? 1 :
                         serviceType === 'express' ? 3 : 7;
        const estimatedDelivery = new Date();
        estimatedDelivery.setDate(estimatedDelivery.getDate() + daysToAdd);
        console.log('🔵 Estimated delivery:', estimatedDelivery);
        
        console.log('🔵 Creating shipment object...');
        const Shipment = mongoose.model('Shipment');
        const shipment = new Shipment({
            trackingNumber,
            client: user._id,
            senderName,
            senderAddress,
            receiverName,
            receiverAddress,
            weight,
            serviceType: serviceType || 'standard',
            amount: amount || 50,
            status: 'pending',
            estimatedDelivery,
            isPaid: false,
            createdAt: new Date(),
            statusHistory: [{
                status: 'pending',
                timestamp: new Date(),
                note: 'Shipment created, awaiting payment'
            }]
        });
        
        console.log('🔵 Saving shipment to database...');
        await shipment.save();
        console.log('🟢 Shipment saved successfully!');
        console.log('🟢 Shipment ID:', shipment._id);
        console.log('🟢 Status:', shipment.status);
        console.log('🟢 isPaid:', shipment.isPaid);
        
        res.json({
            success: true,
            message: 'Shipment created, pending payment',
            trackingNumber: trackingNumber,
            amount: amount,
            estimatedDelivery: estimatedDelivery,
            status: shipment.status,
            isPaid: shipment.isPaid
        });
        
    } catch (err) {
        console.log('🔴 ERROR in create-pending:', err);
        console.log('🔴 Error stack:', err.stack);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 📦 CREATE SHIPMENT WITH USER ID - FIXED (NEW ENDPOINT)
// ============================================================
app.post('/api/tracking/create-with-user', async (req, res) => {
    console.log('🔵 ========================================');
    console.log('🔵 CREATE SHIPMENT WITH USER ID');
    console.log('🔵 ========================================');
    
    const token = req.headers.authorization?.split(' ')[1];
    console.log('🔵 Token received:', token ? '✅ Yes' : '❌ No');
    
    if (!token) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    try {
        const user = await getUserFromToken(token);
        console.log('🔵 User found:', user ? user.email : '❌ No user');
        
        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }
        
        const {
            senderName, senderAddress, senderPhone, senderEmail,
            receiverName, receiverAddress, receiverPhone, receiverEmail,
            weight, serviceType, amount, description
        } = req.body;
        
        console.log('🔵 Creating shipment for user:', user._id);
        console.log('🔵 User email:', user.email);
        console.log('🔵 User name:', user.name);
        
        const trackingNumber = 'TAM' + Date.now().toString(36).toUpperCase() + 
                              Math.random().toString(36).substring(2, 6).toUpperCase();
        console.log('🔵 Generated tracking number:', trackingNumber);
        
        const daysToAdd = serviceType === 'overnight' ? 1 :
                         serviceType === 'express' ? 3 : 7;
        const estimatedDelivery = new Date();
        estimatedDelivery.setDate(estimatedDelivery.getDate() + daysToAdd);
        
        const Shipment = mongoose.model('Shipment');
        const shipment = new Shipment({
            trackingNumber,
            userId: user._id,
            senderId: user._id,
            client: user._id,
            senderName: senderName || user.name,
            senderAddress: senderAddress || 'N/A',
            senderPhone: senderPhone || user.phone || '',
            senderEmail: senderEmail || user.email,
            receiverName: receiverName,
            receiverAddress: receiverAddress,
            receiverPhone: receiverPhone || '',
            receiverEmail: receiverEmail || '',
            weight: weight || 10,
            serviceType: serviceType || 'standard',
            amount: amount || 50,
            description: description || '',
            status: 'pending',
            estimatedDelivery,
            isPaid: false,
            createdAt: new Date(),
            statusHistory: [{
                status: 'pending',
                timestamp: new Date(),
                note: 'Shipment created with user ID'
            }]
        });
        
        console.log('🔵 Saving shipment to database...');
        await shipment.save();
        console.log('🟢 Shipment saved successfully!');
        console.log('🟢 Shipment ID:', shipment._id);
        console.log('🟢 userId:', shipment.userId);
        console.log('🟢 senderId:', shipment.senderId);
        console.log('🟢 client:', shipment.client);
        
        res.json({
            success: true,
            message: 'Shipment created successfully',
            trackingNumber: trackingNumber,
            shipment: {
                trackingNumber: shipment.trackingNumber,
                userId: shipment.userId,
                senderId: shipment.senderId,
                client: shipment.client,
                status: shipment.status,
                isPaid: shipment.isPaid
            }
        });
        
    } catch (err) {
        console.log('🔴 ERROR in create-with-user:', err);
        console.log('🔴 Error stack:', err.stack);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// ✅ CONFIRM PAYMENT
// ============================================================

app.put('/api/tracking/confirm-payment', async (req, res) => {
    console.log('🔵 ========================================');
    console.log('🔵 CONFIRM PAYMENT ENDPOINT HIT');
    console.log('🔵 ========================================');
    
    const token = req.headers.authorization?.split(' ')[1];
    console.log('🔵 Token received:', token ? '✅ Yes' : '❌ No');
    
    if (!token) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    try {
        const user = await getUserFromToken(token);
        console.log('🔵 User found:', user ? user.email : '❌ No user');
        
        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }
        
        const { trackingNumber } = req.body;
        console.log('🔵 Tracking number:', trackingNumber);
        
        const Shipment = mongoose.model('Shipment');
        const shipment = await Shipment.findOne({ 
            trackingNumber, 
            client: user._id 
        });
        
        if (!shipment) {
            console.log('🔴 ERROR: Shipment not found');
            return res.status(404).json({ success: false, message: 'Shipment not found' });
        }
        
        console.log('🔵 Current shipment status:', shipment.status);
        console.log('🔵 Current isPaid:', shipment.isPaid);
        
        if (shipment.isPaid === true) {
            console.log('⚠️ Shipment already paid');
            return res.json({
                success: true,
                message: 'Shipment already paid',
                trackingNumber: trackingNumber,
                status: shipment.status,
                isPaid: shipment.isPaid
            });
        }
        
        shipment.isPaid = true;
        shipment.paidAt = new Date();
        shipment.statusHistory = shipment.statusHistory || [];
        shipment.statusHistory.push({
            status: shipment.status,
            timestamp: new Date(),
            note: 'Payment confirmed - Shipment activated'
        });
        
        await shipment.save();
        console.log('🟢 Shipment updated successfully!');
        console.log('🟢 isPaid:', shipment.isPaid);
        
        res.json({
            success: true,
            message: 'Payment confirmed, shipment activated',
            trackingNumber: trackingNumber,
            status: shipment.status,
            isPaid: shipment.isPaid
        });
        
    } catch (err) {
        console.log('🔴 ERROR in confirm-payment:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 💳 CREATE CHECKOUT SESSION
// ============================================================

app.post('/api/payment/create-checkout-session', async (req, res) => {
    console.log('🔵 ========================================');
    console.log('🔵 CREATE CHECKOUT SESSION HIT');
    console.log('🔵 ========================================');
    
    const token = req.headers.authorization?.split(' ')[1];
    console.log('🔵 Token received:', token ? '✅ Yes' : '❌ No');
    
    if (!token) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    try {
        const user = await getUserFromToken(token);
        console.log('🔵 User found:', user ? user.email : '❌ No user');
        
        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }
        
        const { trackingNumber, amount, paymentMethod, shippingType, offsetCarbon } = req.body;
        console.log('🔵 Tracking:', trackingNumber);
        console.log('🔵 Amount:', amount);
        console.log('🔵 Payment Method:', paymentMethod);
        console.log('🔵 Shipping Type:', shippingType);
        console.log('🔵 Offset Carbon:', offsetCarbon);
        
        const Shipment = mongoose.model('Shipment');
        const shipment = await Shipment.findOne({ 
            trackingNumber, 
            client: user._id 
        });
        
        if (!shipment) {
            console.log('🔴 ERROR: Shipment not found');
            return res.status(404).json({ success: false, message: 'Shipment not found' });
        }
        
        console.log('🔵 Shipment found:', shipment.trackingNumber);
        console.log('🔵 Current isPaid:', shipment.isPaid);
        
        if (shipment.isPaid === true) {
            console.log('⚠️ Shipment already paid');
            return res.json({
                success: true,
                message: 'Shipment already paid',
                redirectTo: 'dashboard.html',
                trackingNumber: trackingNumber
            });
        }
        
        const Payment = mongoose.model('Payment');
        const payment = new Payment({
            userId: user._id,
            trackingNumber: trackingNumber,
            amount: amount || 100,
            paymentMethod: paymentMethod || 'credit_card',
            status: 'succeeded',
            shippingType: shippingType || 'standard',
            offsetCarbon: offsetCarbon || false,
            paidAt: new Date()
        });
        
        await payment.save();
        console.log('🟢 Payment record created:', payment._id);
        
        shipment.isPaid = true;
        shipment.paidAt = new Date();
        shipment.statusHistory = shipment.statusHistory || [];
        shipment.statusHistory.push({
            status: shipment.status,
            timestamp: new Date(),
            note: `Payment confirmed via ${paymentMethod || 'credit_card'}`
        });
        
        await shipment.save();
        console.log('🟢 Shipment updated - isPaid:', shipment.isPaid);
        
        res.json({
            success: true,
            message: 'Payment processed successfully',
            trackingNumber: trackingNumber,
            paymentId: payment._id,
            redirectTo: `payment-success.html?tracking=${trackingNumber}&amount=${amount}`
        });
        
    } catch (err) {
        console.log('🔴 ERROR in create-checkout-session:', err);
        console.log('🔴 Error stack:', err.stack);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 💰 REFUND REQUEST API
// ============================================================

app.post('/api/refund/request', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });
    
    try {
        const user = await getUserFromToken(token);
        const { trackingNumber, reason, description } = req.body;
        
        const Shipment = mongoose.model('Shipment');
        const shipment = await Shipment.findOne({ 
            trackingNumber, 
            client: user._id 
        });
        
        if (!shipment) {
            return res.status(404).json({ success: false, message: 'Shipment not found' });
        }
        
        if (shipment.refundStatus === 'approved') {
            return res.status(400).json({ 
                success: false, 
                message: 'Refund already approved for this shipment' 
            });
        }
        
        if (shipment.refundStatus === 'pending') {
            return res.status(400).json({ 
                success: false, 
                message: 'Refund request already pending' 
            });
        }
        
        const RefundRequest = mongoose.model('RefundRequest');
        const refund = new RefundRequest({
            shipmentId: shipment._id,
            trackingNumber,
            userId: user._id,
            userEmail: user.email,
            reason,
            description,
            status: 'pending',
            requestedAt: new Date()
        });
        
        await refund.save();
        
        shipment.refundStatus = 'pending';
        await shipment.save();
        
        res.json({ 
            success: true, 
            message: 'Refund request submitted successfully',
            refundId: refund._id
        });
        
    } catch (err) {
        console.error('Refund request error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================================
// 📦 GET SHIPMENT BY TRACKING NUMBER
// ============================================================

app.get('/api/tracking/:trackingNumber', async (req, res) => {
    console.log('🔵 ========================================');
    console.log('🔵 GET SHIPMENT BY TRACKING NUMBER');
    console.log('🔵 ========================================');
    
    const token = req.headers.authorization?.split(' ')[1];
    console.log('🔵 Token received:', token ? '✅ Yes' : '❌ No');
    
    if (!token) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    try {
        const user = await getUserFromToken(token);
        console.log('🔵 User found:', user ? user.email : '❌ No user');
        
        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }
        
        const { trackingNumber } = req.params;
        console.log('🔵 Tracking number:', trackingNumber);
        
        const Shipment = mongoose.model('Shipment');
        const shipment = await Shipment.findOne({ 
            trackingNumber, 
            client: user._id 
        });
        
        if (!shipment) {
            console.log('🔴 ERROR: Shipment not found');
            return res.status(404).json({ success: false, message: 'Shipment not found' });
        }
        
        console.log('🟢 Shipment found:', shipment.trackingNumber);
        console.log('🟢 Status:', shipment.status);
        console.log('🟢 isPaid:', shipment.isPaid);
        
        res.json({ 
            success: true, 
            shipment: shipment 
        });
        
    } catch (err) {
        console.error('🔴 Error fetching shipment:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 🔥 ROUTES - With proper error handling
// ============================================================

// Helper function to safely require routes
const safeRequire = (routePath, fallbackMessage) => {
    try {
        const route = require(routePath);
        console.log(`✅ Loaded: ${routePath}`);
        return route;
    } catch (err) {
        console.error(`❌ Failed to load ${routePath}:`, err.message);
        return (req, res) => {
            res.status(503).json({ 
                success: false, 
                message: fallbackMessage || `Service temporarily unavailable`
            });
        };
    }
};

// ===== ROUTES =====
app.use('/api/contact', safeRequire('./routes/contact', 'Contact service unavailable'));
app.use('/api/careers', safeRequire('./routes/careers', 'Careers service unavailable'));
app.use('/api/auth', safeRequire('./routes/auth', 'Auth service unavailable'));
app.use('/api/tracking', safeRequire('./routes/tracking', 'Tracking service unavailable'));
app.use('/api/admin', safeRequire('./routes/admin', 'Admin service unavailable'));
app.use('/api/user', safeRequire('./routes/user', 'User service unavailable'));
app.use('/api/audit', safeRequire('./routes/audit', 'Audit service unavailable'));
app.use('/api/payment', safeRequire('./routes/payment', 'Payment service unavailable'));
app.use('/api/messages', safeRequire('./routes/messages', 'Messages service unavailable'));
app.use('/api/eta', safeRequire('./routes/eta', 'ETA service unavailable'));
app.use('/api/login-history', safeRequire('./routes/loginHistory', 'Login history service unavailable'));
app.use('/api/driver', safeRequire('./routes/driver', 'Driver service unavailable'));
app.use('/api/client', safeRequire('./routes/client', 'Client service unavailable'));
app.use('/api/public', safeRequire('./routes/public', 'Public service unavailable'));
app.use('/api/rating', safeRequire('./routes/rating', 'Rating service unavailable'));
app.use('/api/warehouse', safeRequire('./routes/warehouse', 'Warehouse service unavailable'));
app.use('/api/warehouse-client', safeRequire('./routes/warehouse-client', 'Warehouse client service unavailable'));
app.use('/api/warehouse-driver', safeRequire('./routes/warehouse-driver', 'Warehouse driver service unavailable'));
app.use('/api/routes', safeRequire('./routes/routes', 'Routes service unavailable'));
app.use('/api/warehouse-inventory', safeRequire('./routes/warehouse-inventory', 'Warehouse inventory service unavailable'));
app.use('/api/fleet', safeRequire('./routes/fleet', 'Fleet service unavailable'));
app.use('/api/tickets', safeRequire('./routes/tickets', 'Tickets service unavailable'));
app.use('/api/driver-location', safeRequire('./routes/driver-location', 'Driver location service unavailable'));
app.use('/api/optimize', safeRequire('./routes/optimize', 'Optimize service unavailable'));
app.use('/api/assignment', safeRequire('./routes/assignment', 'Assignment service unavailable'));
app.use('/api/warehouse-forecast', safeRequire('./routes/warehouse-forecast', 'Warehouse forecast service unavailable'));
app.use('/api/anomaly', safeRequire('./routes/anomaly', 'Anomaly service unavailable'));
app.use('/api/sentiment', safeRequire('./routes/sentiment', 'Sentiment service unavailable'));
app.use('/api/api-keys', safeRequire('./routes/apiKeys', 'API Keys service unavailable'));
app.use('/api/insurance', safeRequire('./routes/insurance', 'Insurance service unavailable'));

// ============================================================
// 🛡️ INSURANCE ROUTES - ADDED HERE
// ============================================================
app.use('/api/insurance', safeRequire('./routes/insurance', 'Insurance service unavailable'));

// ============================================================
// 💬 CHAT ROUTES
// ============================================================
app.use('/api/chat', safeRequire('./routes/chat', 'Chat service unavailable'));

// ============================================================
// 📌 NOTIFICATION ROUTE
// ============================================================
try {
    const notificationRoutes = require('./routes/notification');
    app.use('/api/notifications', notificationRoutes.router || notificationRoutes);
    console.log('✅ Loaded: ./routes/notification');
} catch (err) {
    console.error('❌ Failed to load notification routes:', err.message);
    app.use('/api/notifications', (req, res) => {
        res.status(503).json({ success: false, message: 'Notification service unavailable' });
    });
}

// ============================================================
// 🌿 CARBON FOOTPRINT ROUTES
// ============================================================
try {
    const carbonRoutes = require('./routes/carbon');
    app.use('/api/carbon', carbonRoutes);
    console.log('✅ Carbon routes loaded successfully');
} catch (err) {
    console.error('❌ Failed to load carbon routes:', err.message);
    app.use('/api/carbon', (req, res) => {
        res.status(503).json({ 
            success: false, 
            message: 'Carbon footprint service temporarily unavailable'
        });
    });
}

// ============================================================
// 🌿 ECO OPTIONS - STANDALONE ROUTE
// ============================================================
app.post('/api/carbon/eco-options', async (req, res) => {
    try {
        const { weight = 10, distance = 50 } = req.body;

        const baseCO2 = distance * 0.15 * (weight / 100);
        const basePrice = 10 + (weight * 5) + (distance * 0.5);

        const options = [
            {
                tier: 'standard',
                name: '🚛 Standard Shipping',
                description: 'Regular shipping with diesel vehicles',
                co2Emissions: { 
                    co2: parseFloat((baseCO2).toFixed(2)), 
                    co2e: parseFloat((baseCO2 * 1.1).toFixed(2)), 
                    unit: 'kg' 
                },
                estimatedDays: Math.ceil(weight / 10) + 3,
                price: parseFloat(basePrice.toFixed(2)),
                ecoFriendly: false,
                badge: null,
                savings: null,
                offsetCost: 0,
                totalCost: parseFloat(basePrice.toFixed(2)),
                equivalences: {
                    treesPlanted: parseFloat((baseCO2 * 0.045).toFixed(2)),
                    carsOffRoad: parseFloat((baseCO2 * 0.0000045).toFixed(5)),
                    flightsCanceled: parseFloat((baseCO2 * 0.00000015).toFixed(6))
                }
            },
            {
                tier: 'eco',
                name: '🌿 Eco-Friendly Shipping',
                description: 'Hybrid vehicles with reduced emissions',
                co2Emissions: { 
                    co2: parseFloat((baseCO2 * 0.53).toFixed(2)), 
                    co2e: parseFloat((baseCO2 * 0.53 * 1.1).toFixed(2)), 
                    unit: 'kg' 
                },
                estimatedDays: Math.ceil(weight / 10) + 4,
                price: parseFloat((basePrice + 20).toFixed(2)),
                ecoFriendly: true,
                badge: '🌱 47% less CO₂',
                savings: { 
                    co2Reduction: '47%', 
                    treesEquivalent: parseFloat((baseCO2 * 0.53 * 0.045).toFixed(2)) 
                },
                offsetCost: parseFloat((baseCO2 * 0.53 * 0.02).toFixed(2)),
                totalCost: parseFloat((basePrice + 20 + (baseCO2 * 0.53 * 0.02)).toFixed(2)),
                equivalences: {
                    treesPlanted: parseFloat((baseCO2 * 0.53 * 0.045).toFixed(2)),
                    carsOffRoad: parseFloat((baseCO2 * 0.53 * 0.0000045).toFixed(5)),
                    flightsCanceled: parseFloat((baseCO2 * 0.53 * 0.00000015).toFixed(6))
                }
            },
            {
                tier: 'premium-eco',
                name: '⭐ Premium Eco Shipping',
                description: 'Electric vehicles with zero tailpipe emissions',
                co2Emissions: { 
                    co2: parseFloat((baseCO2 * 0.18).toFixed(2)), 
                    co2e: parseFloat((baseCO2 * 0.18 * 1.1).toFixed(2)), 
                    unit: 'kg' 
                },
                estimatedDays: Math.ceil(weight / 10) + 5,
                price: parseFloat((basePrice + 50).toFixed(2)),
                ecoFriendly: true,
                badge: '⭐ 82% less CO₂',
                savings: { 
                    co2Reduction: '82%', 
                    treesEquivalent: parseFloat((baseCO2 * 0.18 * 0.045).toFixed(2)) 
                },
                offsetCost: parseFloat((baseCO2 * 0.18 * 0.02).toFixed(2)),
                totalCost: parseFloat((basePrice + 50 + (baseCO2 * 0.18 * 0.02)).toFixed(2)),
                equivalences: {
                    treesPlanted: parseFloat((baseCO2 * 0.18 * 0.045).toFixed(2)),
                    carsOffRoad: parseFloat((baseCO2 * 0.18 * 0.0000045).toFixed(5)),
                    flightsCanceled: parseFloat((baseCO2 * 0.18 * 0.00000015).toFixed(6))
                }
            }
        ];

        const bestEcoOption = options.filter(o => o.ecoFriendly).sort((a, b) => a.co2Emissions.co2 - b.co2Emissions.co2)[0];
        const standardOption = options.find(o => o.tier === 'standard');

        res.json({
            success: true,
            data: {
                options: options,
                comparison: {
                    standard: standardOption,
                    bestEco: bestEcoOption,
                    co2Saved: standardOption ? parseFloat((standardOption.co2Emissions.co2 - (bestEcoOption?.co2Emissions.co2 || 0)).toFixed(2)) : 0,
                    percentageReduction: standardOption && bestEcoOption ? 
                        Math.round(((standardOption.co2Emissions.co2 - bestEcoOption.co2Emissions.co2) / standardOption.co2Emissions.co2) * 100) : 0,
                    costDifference: standardOption && bestEcoOption ? 
                        parseFloat((bestEcoOption.price - standardOption.price).toFixed(2)) : 0,
                    treesDifference: standardOption && bestEcoOption ? 
                        parseFloat(((bestEcoOption.equivalences?.treesPlanted || 0) - (standardOption.equivalences?.treesPlanted || 0)).toFixed(2)) : 0
                },
                summary: {
                    weight: weight,
                    distance: distance,
                    baseCO2: parseFloat(baseCO2.toFixed(2)),
                    ecoOptionsAvailable: options.filter(o => o.ecoFriendly).length,
                    bestReduction: bestEcoOption ? bestEcoOption.savings.co2Reduction : '0%'
                }
            }
        });
    } catch (err) {
        console.error('❌ Eco options error:', err.message);
        res.status(500).json({
            success: false,
            message: 'Error fetching eco options: ' + err.message
        });
    }
});

// ============================================================
// 🌐 PUBLIC API (V1) 
// ============================================================
try {
    const apiRoutes = require('./routes/api');
    app.use('/api/v1', apiRoutes);
    console.log('✅ API Routes loaded successfully');
} catch (err) {
    console.error('❌ Failed to load API routes:', err.message);
    app.use('/api/v1', (req, res) => {
        res.status(503).json({ 
            success: false, 
            message: 'API routes temporarily unavailable'
        });
    });
}

// ============================================================
// 🔔 WEBHOOK ROUTES
// ============================================================
console.log('🚀 Loading Webhook routes...');

try {
    const webhookPath = './routes/api/v1/webhooks';
    if (fs.existsSync(path.join(__dirname, webhookPath + '.js'))) {
        const webhookRoutes = require(webhookPath);
        app.use('/api/v1/webhooks', webhookRoutes);
        app.use('/api/webhooks', webhookRoutes);
        console.log('✅ Webhook routes loaded from file');
    } else {
        console.log('⚠️ Webhook file not found, using built-in routes');
        const WebhookSubscription = mongoose.models.WebhookSubscription;
        
        app.get('/api/v1/webhooks', async (req, res) => {
            try {
                const webhooks = WebhookSubscription ? await WebhookSubscription.find().limit(10) : [];
                res.json({ success: true, data: webhooks, count: webhooks.length });
            } catch (err) {
                res.json({ success: true, data: [], count: 0 });
            }
        });
        
        app.post('/api/v1/webhooks', async (req, res) => {
            try {
                const { name, url, events, secret, enabled = true } = req.body;
                if (!name || !url || !events || events.length === 0) {
                    return res.status(400).json({ success: false, message: 'Name, URL, and events required' });
                }
                if (!WebhookSubscription) {
                    return res.status(503).json({ success: false, message: 'Webhook model not loaded' });
                }
                const webhook = new WebhookSubscription({
                    name, url, events,
                    secret: secret || require('crypto').randomBytes(32).toString('hex'),
                    enabled
                });
                await webhook.save();
                res.status(201).json({ success: true, data: webhook, message: 'Webhook created' });
            } catch (err) {
                res.status(500).json({ success: false, message: err.message });
            }
        });
        
        app.get('/api/v1/webhooks/logs', async (req, res) => {
            try {
                const WebhookLog = mongoose.models.WebhookLog;
                const logs = WebhookLog ? await WebhookLog.find().sort({ timestamp: -1 }).limit(10) : [];
                res.json({ 
                    success: true, 
                    data: logs, 
                    stats: {
                        total: logs.length,
                        success: logs.filter(l => l.status === 'delivered').length,
                        failed: logs.filter(l => l.status === 'failed').length,
                        successRate: logs.length > 0 ? Math.round((logs.filter(l => l.status === 'delivered').length / logs.length) * 100) : 0
                    }
                });
            } catch (err) {
                res.json({ success: true, data: [], stats: { total: 0, success: 0, failed: 0, successRate: 0 } });
            }
        });
        
        app.get('/api/webhooks', async (req, res) => {
            try {
                const webhooks = WebhookSubscription ? await WebhookSubscription.find().limit(10) : [];
                res.json({ success: true, data: webhooks, count: webhooks.length });
            } catch (err) {
                res.json({ success: true, data: [], count: 0 });
            }
        });
        
        console.log('✅ Built-in webhook routes loaded');
    }
} catch (err) {
    console.error('❌ Webhook error:', err.message);
    app.get('/api/v1/webhooks', (req, res) => {
        res.json({ success: true, data: [], count: 0, message: 'Webhook service available' });
    });
    app.get('/api/v1/webhooks/logs', (req, res) => {
        res.json({ success: true, data: [], stats: { total: 0, success: 0, failed: 0, successRate: 0 } });
    });
    app.get('/api/webhooks', (req, res) => {
        res.json({ success: true, data: [], count: 0 });
    });
}

// ============================================================
// 📊 API DOCUMENTATION
// ============================================================
app.get('/api/docs', (req, res) => {
    res.json({
        name: 'TAMYOKIY Logistics API',
        version: '1.0.0',
        description: 'Public API for B2B logistics integration',
        endpoints: {
            '/api/health': 'Health check',
            '/api/auth/send-email-otp': 'Send email OTP',
            '/api/auth/verify-email-otp': 'Verify email OTP',
            '/api/auth/send-phone-otp': 'Send phone OTP',
            '/api/auth/verify-phone-otp': 'Verify phone OTP',
            '/api/carbon': 'Carbon footprint tracking',
            '/api/tracking/:trackingNumber': 'Get shipment by tracking number',
            '/api/tracking/create-pending': 'Create pending shipment',
            '/api/tracking/create-with-user': 'Create shipment with user ID',
            '/api/tracking/confirm-payment': 'Confirm payment',
            '/api/tracking/:trackingNumber/status': 'Update shipment status',
            '/api/payment/create-checkout-session': 'Create checkout session',
            '/api/insurance/admin/claims': 'Admin - Get all insurance claims',
            '/api/insurance/admin/:claimId/approve': 'Admin - Approve claim',
            '/api/insurance/admin/:claimId/reject': 'Admin - Reject claim',
            '/api/insurance/admin/:claimId/paid': 'Admin - Mark claim as paid',
            '/api/insurance/admin/:claimId': 'Admin - Delete claim',
            '/api/chat/users': 'Get users for chat',
            '/api/chat/conversations': 'Get chat conversations',
            '/api/chat/conversation/:userId': 'Get conversation messages',
            '/api/chat/send': 'Send chat message'
        },
        models: Object.keys(mongoose.models),
        status: '✅ Operational'
    });
});

// ============================================================
// 🏥 HEALTH CHECK
// ============================================================
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'TAMYOKIY Backend Running',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        models: Object.keys(mongoose.models).length,
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// ============================================================
// 🌐 API - Get Translations
// ============================================================

app.get('/api/translations', (req, res) => {
    const lang = req.getLocale() || 'en';
    try {
        const translations = require(`./locales/${lang}.json`);
        res.json({ success: true, language: lang, translations });
    } catch (err) {
        const translations = require(`./locales/en.json`);
        res.json({ success: true, language: 'en', translations });
    }
});

// ============================================================
// 🌐 API - Switch Language
// ============================================================

app.post('/api/language', (req, res) => {
    const { language } = req.body;
    if (['en', 'ar'].includes(language)) {
        res.cookie('lang', language);
        res.json({ success: true, language });
    } else {
        res.status(400).json({ success: false, message: 'Invalid language' });
    }
});

// ============================================================
// ⚠️ 404 HANDLER
// ============================================================

app.use('*', (req, res) => {
    res.status(404).json({ 
        success: false,
        error: 'NOT_FOUND',
        message: `Cannot ${req.method} ${req.originalUrl}` 
    });
});

// ============================================================
// 🔥 GLOBAL ERROR HANDLER
// ============================================================

app.use((err, req, res, next) => {
    console.error('❌ Error:', err.message);
    res.status(500).json({
        success: false,
        message: err.message || 'Internal Server Error'
    });
});

// ============================================================
// 🚀 START SERVER
// ============================================================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Health: http://localhost:${PORT}/api/health`);
    console.log(`📍 Insurance Admin: http://localhost:${PORT}/api/insurance/admin/claims`);
    console.log(`📍 Create with User: http://localhost:${PORT}/api/tracking/create-with-user`);
    console.log(`📍 Chat API: http://localhost:${PORT}/api/chat`);
    console.log(`📍 API Docs: http://localhost:${PORT}/api/docs`);
    console.log(`📦 Models loaded: ${Object.keys(mongoose.models).length}`);
});

mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('✅ MongoDB connected');
    })
    .catch((err) => {
        console.error('⚠️ MongoDB connection error:', err.message);
        console.log('⚠️ Server is running but some features may not work without MongoDB');
    });