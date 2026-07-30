// middleware/rateLimiter.js
// ⏱️ Rate Limiting for API

const ApiKey = require('../models/ApiKey');

// Store for rate limiting
const rateLimitStore = new Map();

async function rateLimiter(req, res, next) {
    try {
        const apiKey = req.apiKey;
        const key = apiKey.key;
        const now = Date.now();
        
        // Get or create store entry
        if (!rateLimitStore.has(key)) {
            rateLimitStore.set(key, {
                minute: { count: 0, resetAt: now + 60000 },
                day: { count: 0, resetAt: now + 86400000 }
            });
        }
        
        const store = rateLimitStore.get(key);
        
        // Reset minute counter if expired
        if (now > store.minute.resetAt) {
            store.minute.count = 0;
            store.minute.resetAt = now + 60000;
        }
        
        // Reset day counter if expired
        if (now > store.day.resetAt) {
            store.day.count = 0;
            store.day.resetAt = now + 86400000;
        }
        
        // Check minute limit
        if (store.minute.count >= apiKey.rateLimit.requestsPerMinute) {
            return res.status(429).json({
                error: 'RATE_LIMIT_EXCEEDED',
                message: `Rate limit exceeded. Maximum ${apiKey.rateLimit.requestsPerMinute} requests per minute.`,
                resetAt: new Date(store.minute.resetAt).toISOString()
            });
        }
        
        // Check day limit
        if (store.day.count >= apiKey.rateLimit.requestsPerDay) {
            return res.status(429).json({
                error: 'DAILY_LIMIT_EXCEEDED',
                message: `Daily limit exceeded. Maximum ${apiKey.rateLimit.requestsPerDay} requests per day.`,
                resetAt: new Date(store.day.resetAt).toISOString()
            });
        }
        
        // Increment counters
        store.minute.count++;
        store.day.count++;
        
        // Add rate limit headers
        res.setHeader('X-RateLimit-Limit', apiKey.rateLimit.requestsPerMinute);
        res.setHeader('X-RateLimit-Remaining', apiKey.rateLimit.requestsPerMinute - store.minute.count);
        res.setHeader('X-RateLimit-Reset', new Date(store.minute.resetAt).toISOString());
        
        next();
        
    } catch (err) {
        console.error('Rate limiter error:', err);
        next();
    }
}

// Cleanup old entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, store] of rateLimitStore) {
        if (now > store.day.resetAt) {
            rateLimitStore.delete(key);
        }
    }
}, 3600000); // Clean every hour

module.exports = { rateLimiter };