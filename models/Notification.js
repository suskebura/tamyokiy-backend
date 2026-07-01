const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true,
        index: true
    },
    title: { 
        type: String, 
        required: true 
    },
    message: { 
        type: String, 
        required: true 
    },
    type: { 
        type: String, 
        enum: ['info', 'success', 'warning', 'error'],
        default: 'info' 
    },
    relatedId: { 
        type: String,  // tracking number or shipment id
        default: null 
    },
    isRead: { 
        type: Boolean, 
        default: false,
        index: true
    },
    createdAt: { 
        type: Date, 
        default: Date.now,
        index: true
    }
});

// Compound index for faster queries
NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);