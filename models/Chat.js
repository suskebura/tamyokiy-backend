const mongoose = require('mongoose');

const ChatSchema = new mongoose.Schema({
    // Who sent the message
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    senderName: {
        type: String,
        required: true
    },
    senderRole: {
        type: String,
        enum: ['admin', 'client', 'driver'],
        required: true
    },
    
    // Who receives the message
    receiver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    receiverName: {
        type: String,
        required: true
    },
    receiverRole: {
        type: String,
        enum: ['admin', 'client', 'driver'],
        required: true
    },
    
    // Message content
    message: {
        type: String,
        required: true
    },
    subject: {
        type: String,
        default: 'General Inquiry'
    },
    
    // Status
    isRead: {
        type: Boolean,
        default: false
    },
    readAt: {
        type: Date
    },
    
    // For admin reply tracking
    parentMessageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chat',
        default: null
    },
    isReply: {
        type: Boolean,
        default: false
    },
    
    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Indexes for faster queries
ChatSchema.index({ sender: 1, receiver: 1 });
ChatSchema.index({ createdAt: -1 });
ChatSchema.index({ isRead: 1 });

module.exports = mongoose.model('Chat', ChatSchema);