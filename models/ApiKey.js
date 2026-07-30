// models/ApiKey.js
// 🔑 API Key Management

const mongoose = require('mongoose');
const crypto = require('crypto');

const ApiKeySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    key: {
        type: String,
        unique: true,
        index: true,
        // ✅ REMOVED 'required: true' - auto-generated in pre-save
        sparse: true // Allows multiple nulls but still enforces uniqueness
    },
    // Permissions (flat structure for easier checking)
    permissions: {
        shipments: {
            create: { type: Boolean, default: true },
            read: { type: Boolean, default: true },
            update: { type: Boolean, default: true },
            delete: { type: Boolean, default: false }
        },
        tracking: {
            read: { type: Boolean, default: true }
        },
        webhooks: {
            manage: { type: Boolean, default: true }
        },
        drivers: {
            read: { type: Boolean, default: true }
        },
        rates: {
            read: { type: Boolean, default: true }
        }
    },
    // Rate limiting
    rateLimit: {
        requestsPerMinute: { type: Number, default: 60 },
        requestsPerDay: { type: Number, default: 10000 }
    },
    // Status
    isActive: {
        type: Boolean,
        default: true
    },
    lastUsed: {
        type: Date,
        default: null
    },
    expiresAt: {
        type: Date,
        default: null
    },
    // Metadata
    ipWhitelist: [String],
    description: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// ============================================================
// 🔑 Generate API key before saving (auto-generates if missing)
// ============================================================
ApiKeySchema.pre('save', function(next) {
    // Update timestamp
    this.updatedAt = new Date();
    
    // Generate key if missing
    if (!this.key) {
        this.key = `tam_${crypto.randomBytes(32).toString('hex')}`;
        console.log('🔑 Generated new API Key for user:', this.userId);
    }
    next();
});

// ============================================================
// 🕐 Method: Check if key is expired
// ============================================================
ApiKeySchema.methods.isExpired = function() {
    if (!this.expiresAt) return false;
    return new Date() > this.expiresAt;
};

// ============================================================
// 🔒 Method: Check if key is active (not expired and enabled)
// ============================================================
ApiKeySchema.methods.isValid = function() {
    return this.isActive && !this.isExpired();
};

// ============================================================
// 🛡️ Method: Check permission
// ============================================================
ApiKeySchema.methods.hasPermission = function(resource, action) {
    if (!this.isValid()) return false;
    
    // Check if resource exists in permissions
    if (!this.permissions[resource]) return false;
    
    // Check if action exists for that resource
    if (this.permissions[resource][action] === undefined) return false;
    
    return this.permissions[resource][action] === true;
};

// ============================================================
// 🔍 Method: Get all permissions as flat object
// ============================================================
ApiKeySchema.methods.getAllPermissions = function() {
    const flat = {};
    for (const resource in this.permissions) {
        for (const action in this.permissions[resource]) {
            flat[`${resource}.${action}`] = this.permissions[resource][action];
        }
    }
    return flat;
};

// ============================================================
// 📊 Method: Update last used timestamp
// ============================================================
ApiKeySchema.methods.updateLastUsed = function() {
    this.lastUsed = new Date();
    return this.save();
};

// ============================================================
// 🔍 Static: Find by key (with validation)
// ============================================================
ApiKeySchema.statics.findByKey = async function(key) {
    const apiKey = await this.findOne({ key, isActive: true });
    if (!apiKey) return null;
    if (apiKey.isExpired()) return null;
    return apiKey;
};

// ============================================================
// 🔍 Static: Get all keys for a user
// ============================================================
ApiKeySchema.statics.getUserKeys = async function(userId) {
    return this.find({ userId })
        .select('-key') // Don't expose the actual key
        .sort({ createdAt: -1 });
};

// ============================================================
// 🔒 Static: Revoke a key
// ============================================================
ApiKeySchema.statics.revokeKey = async function(keyId, userId) {
    return this.findOneAndUpdate(
        { _id: keyId, userId },
        { isActive: false },
        { new: true }
    );
};

// ============================================================
// 🗑️ Virtual: Masked key for display
// ============================================================
ApiKeySchema.virtual('maskedKey').get(function() {
    if (!this.key) return null;
    return this.key.substring(0, 8) + '...' + this.key.substring(this.key.length - 4);
});

// ============================================================
// 📦 Indexes for performance
// ============================================================
ApiKeySchema.index({ key: 1, isActive: 1 });
ApiKeySchema.index({ userId: 1, isActive: 1 });
ApiKeySchema.index({ expiresAt: 1 });

// ============================================================
// 🔧 ToJSON options - hide sensitive data
// ============================================================
ApiKeySchema.set('toJSON', {
    virtuals: true,
    transform: function(doc, ret) {
        delete ret.key; // Never expose the full key in JSON responses
        delete ret.__v;
        return ret;
    }
});

module.exports = mongoose.model('ApiKey', ApiKeySchema);