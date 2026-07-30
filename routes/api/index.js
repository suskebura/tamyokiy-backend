const express = require('express');
const router = express.Router();

// ============================================================
// 📦 Import Middleware
// ============================================================
const apiAuth = require('../../middleware/apiAuth');

// ============================================================
// 📦 Import Routes - Check each one
// ============================================================
const shipments = require('./v1/shipments');
const tracking = require('./v1/tracking');
const drivers = require('./v1/drivers');
const rates = require('./v1/rates');
const webhooks = require('./v1/webhooks');
const auth = require('./v1/auth');

// ============================================================
// 🔍 DEBUG - See what each import is
// ============================================================
console.log('🔍 ROUTE IMPORTS:');
console.log('─────────────────');
console.log('shipments:', typeof shipments, shipments ? '✅' : '❌');
console.log('tracking:', typeof tracking, tracking ? '✅' : '❌');
console.log('drivers:', typeof drivers, drivers ? '✅' : '❌');
console.log('rates:', typeof rates, rates ? '✅' : '❌');
console.log('webhooks:', typeof webhooks, webhooks ? '✅' : '❌');
console.log('auth:', typeof auth, auth ? '✅' : '❌');
console.log('─────────────────');
console.log('apiAuth:', typeof apiAuth, apiAuth ? '✅' : '❌');

// ============================================================
// 🔓 Public routes (no auth required)
// ============================================================
if (tracking && typeof tracking === 'function') {
    router.use('/tracking', tracking);
} else {
    console.error('❌ tracking is NOT a valid router!');
    // Create a fallback
    const fallbackRouter = express.Router();
    fallbackRouter.get('/', (req, res) => {
        res.json({ error: 'Tracking route not configured properly' });
    });
    router.use('/tracking', fallbackRouter);
}

// ============================================================
// 🔒 Protected routes (API key required)
// ============================================================
// Check if apiAuth is valid middleware
const authMiddleware = (typeof apiAuth === 'function') ? apiAuth : (req, res, next) => next();

// Shipments
if (shipments && typeof shipments === 'function') {
    router.use('/shipments', authMiddleware, shipments);
} else {
    console.error('❌ shipments is NOT a valid router!');
    const fallbackRouter = express.Router();
    fallbackRouter.get('/', (req, res) => {
        res.json({ error: 'Shipments route not configured properly' });
    });
    router.use('/shipments', authMiddleware, fallbackRouter);
}

// Drivers
if (drivers && typeof drivers === 'function') {
    router.use('/drivers', authMiddleware, drivers);
} else {
    console.error('❌ drivers is NOT a valid router!');
    const fallbackRouter = express.Router();
    fallbackRouter.get('/', (req, res) => {
        res.json({ error: 'Drivers route not configured properly' });
    });
    router.use('/drivers', authMiddleware, fallbackRouter);
}

// Rates
if (rates && typeof rates === 'function') {
    router.use('/rates', authMiddleware, rates);
} else {
    console.error('❌ rates is NOT a valid router!');
    const fallbackRouter = express.Router();
    fallbackRouter.get('/', (req, res) => {
        res.json({ error: 'Rates route not configured properly' });
    });
    router.use('/rates', authMiddleware, fallbackRouter);
}

// Webhooks
if (webhooks && typeof webhooks === 'function') {
    router.use('/webhooks', authMiddleware, webhooks);
} else {
    console.error('❌ webhooks is NOT a valid router!');
    const fallbackRouter = express.Router();
    fallbackRouter.get('/', (req, res) => {
        res.json({ error: 'Webhooks route not configured properly' });
    });
    router.use('/webhooks', authMiddleware, fallbackRouter);
}

// Auth
if (auth && typeof auth === 'function') {
    router.use('/auth', authMiddleware, auth);
} else {
    console.error('❌ auth is NOT a valid router!');
    const fallbackRouter = express.Router();
    fallbackRouter.get('/', (req, res) => {
        res.json({ error: 'Auth route not configured properly' });
    });
    router.use('/auth', authMiddleware, fallbackRouter);
}

// ============================================================
// 🏥 Health check
// ============================================================
router.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        message: 'TAMYOKIY Logistics API is running! 🚀',
        routes: {
            '/tracking': 'Public tracking (no auth)',
            '/shipments': 'Shipment management',
            '/drivers': 'Driver management',
            '/rates': 'Rate estimation',
            '/webhooks': 'Webhook management',
            '/auth': 'API key management'
        }
    });
});

module.exports = router;