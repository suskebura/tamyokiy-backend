// middleware/apiAuth.js
// 🔑 API Key Authentication

const ApiKey = require('../models/ApiKey');
const User = require('../models/User');

async function apiAuth(req, res, next) {
    try {
        // Get API key from header
        const apiKey = req.headers['x-api-key'] || req.headers['x-tamyokiy-api-key'];
        
        if (!apiKey) {
            return res.status(401).json({
                error: 'API_KEY_REQUIRED',
                message: 'Please provide an API key in the x-api-key header'
            });
        }
        
        // Find the API key
        const keyDoc = await ApiKey.findOne({ key: apiKey });
        
        if (!keyDoc) {
            return res.status(401).json({
                error: 'INVALID_API_KEY',
                message: 'Invalid API key'
            });
        }
        
        // Check if active
        if (!keyDoc.isActive) {
            return res.status(403).json({
                error: 'API_KEY_INACTIVE',
                message: 'API key has been deactivated'
            });
        }
        
        // Check if expired
        if (keyDoc.expiresAt && new Date() > keyDoc.expiresAt) {
            return res.status(403).json({
                error: 'API_KEY_EXPIRED',
                message: 'API key has expired'
            });
        }
        
        // Get user
        const user = await User.findById(keyDoc.userId);
        if (!user) {
            return res.status(401).json({
                error: 'USER_NOT_FOUND',
                message: 'User associated with API key not found'
            });
        }
        
        // Attach to request
        req.apiKey = keyDoc;
        req.apiKeyUser = user;
        
        // Update last used
        keyDoc.lastUsed = new Date();
        await keyDoc.save();
        
        next();
        
    } catch (err) {
        console.error('API Auth error:', err);
        res.status(500).json({
            error: 'AUTH_ERROR',
            message: 'Authentication error: ' + err.message
        });
    }
}

// Check specific permissions - FIXED VERSION
function requirePermission(resource, action) {
    return async (req, res, next) => {
        // Check if apiKey exists
        if (!req.apiKey) {
            return res.status(401).json({
                error: 'API_KEY_REQUIRED',
                message: 'API key is required'
            });
        }
        
        // Check if the key is active
        if (!req.apiKey.isActive) {
            return res.status(403).json({
                error: 'API_KEY_INACTIVE',
                message: 'API key has been deactivated'
            });
        }
        
        // Check if expired
        if (req.apiKey.expiresAt && new Date() > req.apiKey.expiresAt) {
            return res.status(403).json({
                error: 'API_KEY_EXPIRED',
                message: 'API key has expired'
            });
        }
        
        // Check permissions
        let hasPermission = false;
        
        // Method 1: If the model has the hasPermission method
        if (typeof req.apiKey.hasPermission === 'function') {
            hasPermission = req.apiKey.hasPermission(resource, action);
        } 
        // Method 2: Check permissions directly
        else if (req.apiKey.permissions) {
            // Check if full access is granted
            if (req.apiKey.permissions.full === true) {
                hasPermission = true;
            }
            // Check specific resource and action
            else if (req.apiKey.permissions[resource]) {
                // If action is provided, check it
                if (action) {
                    hasPermission = req.apiKey.permissions[resource][action] === true;
                } else {
                    // If no action, check if the resource has any permissions
                    hasPermission = Object.values(req.apiKey.permissions[resource]).some(v => v === true);
                }
            }
        }
        
        if (!hasPermission) {
            return res.status(403).json({
                error: 'PERMISSION_DENIED',
                message: `You don't have permission to ${action || 'access'} ${resource}`
            });
        }
        
        next();
    };
}

module.exports = { apiAuth, requirePermission };