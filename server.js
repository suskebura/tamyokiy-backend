require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');

const app = express();

// ===== CORS - MUST BE FIRST =====
app.use(cors({
    origin: ['http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:5000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Handle preflight requests
app.options('*', cors());

// ===== FIX CORS FOR IMAGES =====
app.use((req, res, next) => {
    res.header('Cross-Origin-Resource-Policy', 'cross-origin');
    res.header('Cross-Origin-Embedder-Policy', 'unsafe-none');
    next();
});

// ===== SECURITY MIDDLEWARES =====
app.use(helmet({
    crossOriginResourcePolicy: false,
}));

// ===== RATE LIMITER =====
const limiter = rateLimit({
    max: 100,
    windowMs: 60 * 60 * 1000,
    message: 'Too many requests from this IP, please try again in an hour.'
});

// ===== ROUTES WITH RATE LIMITING (Public) =====
app.use('/api/contact', limiter);
app.use('/api/careers', limiter);
app.use('/api/tracking', limiter);
app.use('/api/auth', limiter);

// ===== ROUTES WITHOUT RATE LIMITING =====
app.use('/api/admin', (req, res, next) => next());
app.use('/api/user', (req, res, next) => next());
app.use('/api/audit', (req, res, next) => next());
app.use('/api/payment', (req, res, next) => next());
app.use('/api/notifications', (req, res, next) => next());
app.use('/api/login-history', (req, res, next) => next());
app.use('/api/driver', (req, res, next) => next());
app.use('/api/client', (req, res, next) => next());
app.use('/api/messages', (req, res, next) => next());
app.use('/api/public', (req, res, next) => next());
app.use('/api/rating', (req, res, next) => next());
app.use('/api/warehouse', (req, res, next) => next());
app.use('/api/routes', (req, res, next) => next());
app.use('/api/driver-location', (req, res, next) => next()); // ✅ ADDED

app.use(mongoSanitize());
app.use(xss());

// ===== REGULAR MIDDLEWARES =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ===== MONGODB CONNECTION =====
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.log('❌ MongoDB error:', err));

// ============================================================
// 🔥 ROUTES
// ============================================================
app.use('/api/contact', require('./routes/contact'));
app.use('/api/careers', require('./routes/careers'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tracking', require('./routes/tracking'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/user', require('./routes/user'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/payment', require('./routes/payment'));
app.use('/api/messages', require('./routes/messages'));

// ===== NOTIFICATION ROUTE =====
const notificationRoutes = require('./routes/notification');
app.use('/api/notifications', notificationRoutes.router);

// ===== LOGIN HISTORY ROUTE =====
app.use('/api/login-history', require('./routes/loginhistory'));

// ===== DRIVER ROUTE =====
app.use('/api/driver', require('./routes/driver'));

// ===== CLIENT ROUTE =====
app.use('/api/client', require('./routes/client'));

// ============================================================
// 🔓 PUBLIC ROUTES (NO AUTH REQUIRED)
// ============================================================
app.use('/api/public', require('./routes/public'));

// ============================================================
// ⭐ RATING ROUTE
// ============================================================
app.use('/api/rating', require('./routes/rating'));

// ============================================================
// 📦 WAREHOUSE MANAGEMENT ROUTE (ADMIN ONLY)
// ============================================================
app.use('/api/warehouse', require('./routes/warehouse'));

// ============================================================
// 🆕 WAREHOUSE SERVICE ROUTE (CLIENT - View stored items)
// ============================================================
app.use('/api/warehouse-client', require('./routes/warehouse-client'));

// ============================================================
// 🆕 WAREHOUSE DRIVER ROUTE (DRIVER - View pickups)
// ============================================================
app.use('/api/warehouse-driver', require('./routes/warehouse-driver'));

// ============================================================
// 🗺️ ROUTE MANAGEMENT ROUTE
// ============================================================
app.use('/api/routes', require('./routes/routes'));

// ============================================================
// 🆕 WAREHOUSE INVENTORY ROUTE (ADMIN ONLY - Full inventory management)
// ============================================================
app.use('/api/warehouse-inventory', require('./routes/warehouse-inventory'));

// ============================================================
// 🚛 FLEET MANAGEMENT ROUTE
// ============================================================
app.use('/api/fleet', require('./routes/fleet'));

// ============================================================
// 🎫 SUPPORT TICKETS ROUTE - NEW
// ============================================================
app.use('/api/tickets', require('./routes/tickets'));

// ============================================================
// 📡 DRIVER LOCATION ROUTE - NEW (STEP 3)
// ============================================================
app.use('/api/driver-location', require('./routes/driverLocation'));

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'TAMYOKIY Backend Running',
        timestamp: new Date().toISOString()
    });
});

// ===== 404 HANDLER =====
app.use('*', (req, res) => {
    res.status(404).json({ message: `Cannot ${req.method} ${req.originalUrl}` });
});

// ===== GLOBAL ERROR HANDLER =====
const errorHandler = (err, req, res, next) => {
    console.error('Error:', err.message);

    if (err.code === 11000) {
        return res.status(400).json({ 
            message: 'Duplicate field value entered',
            field: Object.keys(err.keyPattern)[0]
        });
    }

    if (err.name === 'ValidationError') {
        const errors = Object.values(err.errors).map(e => e.message);
        return res.status(400).json({ message: 'Validation error', errors });
    }

    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({ message: 'Invalid token' });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Token expired' });
    }

    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode).json({
        message: err.message || 'Internal Server Error',
        stack: process.env.NODE_ENV === 'production' ? '🥞' : err.stack
    });
};

app.use(errorHandler);

// ===== START SERVER =====
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
