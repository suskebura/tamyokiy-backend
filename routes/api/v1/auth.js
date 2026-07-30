const express = require('express');
const router = express.Router();
const ApiKey = require('../../../models/ApiKey');
const User = require('../../../models/User');
// ✅ Use this
const catchAsync = require('../../../utils/catchAsync');
const crypto = require('crypto');

// ============================================================
// 🔑 GET /api/v1/auth/keys - List API keys
// ============================================================
router.get('/keys', catchAsync(async (req, res) => {
    const { clientId } = req.apiKey;
    const keys = await ApiKey.find({ userId: clientId })
        .select('-key');

    res.json({
        success: true,
        data: keys
    });
}));

// ============================================================
// 🔑 POST /api/v1/auth/keys - Generate new API key
// ============================================================
router.post('/keys', catchAsync(async (req, res) => {
    const { clientId } = req.apiKey;
    const { name, permissions = ['read'] } = req.body;

    // Generate API key
    const key = crypto.randomBytes(32).toString('hex');
    const apiKey = new ApiKey({
        userId: clientId,
        key,
        name,
        permissions,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
    });

    await apiKey.save();

    res.status(201).json({
        success: true,
        message: 'API key generated successfully',
        data: {
            _id: apiKey._id,
            name: apiKey.name,
            key: apiKey.key, // Only shown once
            permissions: apiKey.permissions,
            expiresAt: apiKey.expiresAt
        }
    });
}));

// ============================================================
// 🔑 DELETE /api/v1/auth/keys/:id - Revoke API key
// ============================================================
router.delete('/keys/:id', catchAsync(async (req, res) => {
    const { clientId } = req.apiKey;
    const apiKey = await ApiKey.findOneAndDelete({
        _id: req.params.id,
        userId: clientId
    });

    if (!apiKey) {
        return res.status(404).json({
            success: false,
            message: 'API key not found'
        });
    }

    res.json({
        success: true,
        message: 'API key revoked successfully'
    });
}));

// ============================================================
// 🔑 PUT /api/v1/auth/keys/:id - Update API key
// ============================================================
router.put('/keys/:id', catchAsync(async (req, res) => {
    const { clientId } = req.apiKey;
    const { name, permissions, enabled } = req.body;

    const apiKey = await ApiKey.findOne({
        _id: req.params.id,
        userId: clientId
    });

    if (!apiKey) {
        return res.status(404).json({
            success: false,
            message: 'API key not found'
        });
    }

    if (name) apiKey.name = name;
    if (permissions) apiKey.permissions = permissions;
    if (enabled !== undefined) apiKey.enabled = enabled;

    await apiKey.save();

    res.json({
        success: true,
        message: 'API key updated successfully',
        data: {
            _id: apiKey._id,
            name: apiKey.name,
            permissions: apiKey.permissions,
            enabled: apiKey.enabled
        }
    });
}));

// ✅ CORRECT - At the very end
module.exports = router;