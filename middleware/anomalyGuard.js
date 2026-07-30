// middleware/anomalyGuard.js
// 🛡️ Prevent suspicious actions

const AnomalyLog = require('../models/AnomalyLog');
const Shipment = require('../models/Shipment');

async function anomalyGuard(req, res, next) {
    const action = req.path.split('/').pop();
    const user = req.user;
    
    try {
        const shouldBlock = await checkAction(action, req.body, user);
        
        if (shouldBlock.block) {
            return res.status(403).json({
                success: false,
                message: shouldBlock.reason,
                code: 'ACTION_BLOCKED'
            });
        }
        next();
    } catch (err) {
        console.error('Anomaly guard error:', err);
        next();
    }
}

async function checkAction(action, data, user) {
    const rules = {
        'complete': async (data, user) => {
            // Check if driver has too many fast deliveries today
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const fastDeliveries = await AnomalyLog.countDocuments({
                driverId: user.id,
                type: 'too_fast_delivery',
                createdAt: { $gte: today }
            });
            
            if (fastDeliveries >= 3) {
                return {
                    block: true,
                    reason: 'Driver has 3+ too-fast deliveries today. Please investigate first.'
                };
            }
            return { block: false };
        },
        
        'create': async (data, user) => {
            // Check if customer has too many failed deliveries
            const failedCount = await Shipment.countDocuments({
                userId: user.id,
                status: 'failed',
                createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
            });
            
            if (failedCount >= 5) {
                return {
                    block: true,
                    reason: 'Customer has 5+ failed deliveries in 7 days. Please contact support.'
                };
            }
            return { block: false };
        }
    };
    
    const rule = rules[action];
    if (rule) {
        return await rule(data, user);
    }
    return { block: false };
}

module.exports = { anomalyGuard };