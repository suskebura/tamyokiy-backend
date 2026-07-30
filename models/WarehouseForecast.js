// backend/models/WarehouseForecast.js
const mongoose = require('mongoose');

const WarehouseForecastSchema = new mongoose.Schema({
    warehouseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Warehouse',
        required: true,
        index: true
    },
    warehouseCode: {
        type: String,
        required: true,
        uppercase: true,
        trim: true
    },
    forecastDate: {
        type: Date,
        required: true,
        default: Date.now,
        index: true
    },
    
    // ===== FORECAST METRICS =====
    predictedIncoming: {
        type: Number,
        default: 0,
        min: 0,
        description: 'Number of items expected to arrive'
    },
    predictedOutgoing: {
        type: Number,
        default: 0,
        min: 0,
        description: 'Number of items expected to leave'
    },
    predictedStorage: {
        type: Number,
        default: 0,
        min: 0,
        description: 'Predicted storage level'
    },
    
    // ===== CONFIDENCE & TRENDS =====
    confidence: {
        type: Number,
        default: 70,
        min: 0,
        max: 100,
        description: 'Confidence level of the forecast (0-100%)'
    },
    trendDirection: {
        type: String,
        enum: ['up', 'down', 'stable'],
        default: 'stable',
        description: 'Direction of the trend'
    },
    trendPercentage: {
        type: Number,
        default: 0,
        description: 'Trend percentage change'
    },
    
    // ===== ALERTS =====
    capacityAlert: {
        type: Boolean,
        default: false,
        description: 'Whether this forecast triggers a capacity alert'
    },
    alertLevel: {
        type: String,
        enum: ['green', 'yellow', 'orange', 'red'],
        default: 'green',
        description: 'Alert severity level'
    },
    
    // ===== FACTORS AFFECTING FORECAST =====
    factors: [{
        name: {
            type: String,
            required: true,
            trim: true
        },
        impact: {
            type: Number,
            default: 0,
            description: 'Impact percentage on the forecast'
        },
        description: {
            type: String,
            trim: true,
            default: null
        }
    }],
    
    // ===== PERIOD =====
    period: {
        type: String,
        enum: ['daily', 'weekly', 'monthly'],
        default: 'daily',
        description: 'Forecast time period'
    },
    
    // ===== TIMESTAMPS =====
    generatedAt: {
        type: Date,
        default: Date.now,
        description: 'When this forecast was generated'
    },
    expiresAt: {
        type: Date,
        default: function() {
            const date = new Date();
            date.setDate(date.getDate() + 7); // Expires after 7 days
            return date;
        },
        description: 'When this forecast expires'
    },
    
    // ===== METADATA =====
    metadata: {
        generatedBy: {
            type: String,
            default: 'system',
            description: 'Who or what generated the forecast'
        },
        version: {
            type: String,
            default: '1.0',
            description: 'Forecast engine version'
        },
        notes: {
            type: String,
            trim: true,
            default: null
        }
    }
}, {
    timestamps: true // Adds createdAt and updatedAt automatically
});

// ============================================================
// 🔍 INDEXES FOR FASTER QUERIES
// ============================================================
WarehouseForecastSchema.index({ warehouseId: 1, forecastDate: -1 });
WarehouseForecastSchema.index({ capacityAlert: 1, alertLevel: 1 });
WarehouseForecastSchema.index({ warehouseCode: 1, period: 1 });
WarehouseForecastSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // Auto-delete expired forecasts

// ============================================================
// 📊 VIRTUAL PROPERTIES
// ============================================================
WarehouseForecastSchema.virtual('isExpired').get(function() {
    return this.expiresAt && new Date() > this.expiresAt;
});

WarehouseForecastSchema.virtual('status').get(function() {
    if (this.capacityAlert) {
        return this.alertLevel === 'red' ? '⚠️ Critical' :
               this.alertLevel === 'orange' ? '⚠️ Warning' :
               this.alertLevel === 'yellow' ? '📊 Moderate' : '✅ Healthy';
    }
    return '✅ Healthy';
});

WarehouseForecastSchema.virtual('utilizationPercentage').get(function() {
    if (this.predictedStorage === 0) return 0;
    // This would need the warehouse capacity - use a method instead
    return 0;
});

// ============================================================
// 📊 METHODS
// ============================================================

/**
 * Get alert color based on alert level
 */
WarehouseForecastSchema.methods.getAlertColor = function() {
    const colors = {
        'green': '#4caf50',
        'yellow': '#ffc107',
        'orange': '#ff9800',
        'red': '#ff6b6b'
    };
    return colors[this.alertLevel] || '#4caf50';
};

/**
 * Get alert icon based on alert level
 */
WarehouseForecastSchema.methods.getAlertIcon = function() {
    const icons = {
        'green': '✅',
        'yellow': '⚠️',
        'orange': '⚡',
        'red': '🚨'
    };
    return icons[this.alertLevel] || '✅';
};

/**
 * Get alert label based on alert level
 */
WarehouseForecastSchema.methods.getAlertLabel = function() {
    const labels = {
        'green': 'Healthy',
        'yellow': 'Moderate',
        'orange': 'High',
        'red': 'Critical'
    };
    return labels[this.alertLevel] || 'Healthy';
};

/**
 * Check if capacity is at risk
 */
WarehouseForecastSchema.methods.isAtRisk = function() {
    return this.alertLevel === 'red' || this.alertLevel === 'orange';
};

/**
 * Get trend emoji
 */
WarehouseForecastSchema.methods.getTrendEmoji = function() {
    const trends = {
        'up': '📈',
        'down': '📉',
        'stable': '➡️'
    };
    return trends[this.trendDirection] || '➡️';
};

/**
 * Get trend label
 */
WarehouseForecastSchema.methods.getTrendLabel = function() {
    const labels = {
        'up': 'Growing',
        'down': 'Declining',
        'stable': 'Stable'
    };
    return labels[this.trendDirection] || 'Stable';
};

/**
 * Calculate utilization percentage based on warehouse capacity
 * This requires the warehouse object to be passed in
 */
WarehouseForecastSchema.methods.calculateUtilization = function(warehouseCapacity) {
    if (!warehouseCapacity || warehouseCapacity === 0) return 0;
    return Math.min(100, (this.predictedStorage / warehouseCapacity) * 100);
};

// ============================================================
// 📊 STATIC METHODS
// ============================================================

/**
 * Get latest forecast for a warehouse
 */
WarehouseForecastSchema.statics.getLatestForWarehouse = async function(warehouseId) {
    return this.findOne({ warehouseId })
        .sort({ forecastDate: -1 })
        .lean();
};

/**
 * Get all active alerts (red and orange)
 */
WarehouseForecastSchema.statics.getActiveAlerts = async function() {
    return this.find({
        capacityAlert: true,
        alertLevel: { $in: ['red', 'orange'] }
    })
    .sort({ alertLevel: 1, forecastDate: -1 })
    .populate('warehouseId', 'name code location')
    .lean();
};

/**
 * Get forecast summary for all warehouses
 */
WarehouseForecastSchema.statics.getSummary = async function() {
    const total = await this.countDocuments();
    const withAlerts = await this.countDocuments({ capacityAlert: true });
    const redAlerts = await this.countDocuments({ alertLevel: 'red' });
    const orangeAlerts = await this.countDocuments({ alertLevel: 'orange' });
    const yellowAlerts = await this.countDocuments({ alertLevel: 'yellow' });
    
    const avgConfidence = await this.aggregate([
        { $group: { _id: null, avg: { $avg: '$confidence' } } }
    ]);
    
    return {
        totalForecasts: total || 0,
        withAlerts: withAlerts || 0,
        redAlerts: redAlerts || 0,
        orangeAlerts: orangeAlerts || 0,
        yellowAlerts: yellowAlerts || 0,
        averageConfidence: Math.round(avgConfidence[0]?.avg || 0)
    };
};

/**
 * Delete expired forecasts
 */
WarehouseForecastSchema.statics.cleanExpired = async function() {
    const result = await this.deleteMany({
        expiresAt: { $lt: new Date() }
    });
    console.log(`🧹 Cleaned ${result.deletedCount} expired forecasts`);
    return result;
};

// ============================================================
// 🔥 PRE-SAVE HOOK
// ============================================================
WarehouseForecastSchema.pre('save', function(next) {
    // Auto-set alert level based on predicted storage
    // (This would need warehouse capacity, so it's better handled in the service)
    
    // Ensure period is valid
    if (!this.period) {
        this.period = 'daily';
    }
    
    // Ensure forecast date is set
    if (!this.forecastDate) {
        this.forecastDate = new Date();
    }
    
    next();
});

// ============================================================
// 📊 TO JSON TRANSFORM
// ============================================================
WarehouseForecastSchema.set('toJSON', {
    virtuals: true,
    transform: function(doc, ret) {
        delete ret.__v;
        delete ret.metadata?.version;
        return ret;
    }
});

// ============================================================
// 🚀 EXPORT
// ============================================================
module.exports = mongoose.model('WarehouseForecast', WarehouseForecastSchema);