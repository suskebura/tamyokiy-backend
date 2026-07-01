const mongoose = require('mongoose');

const ContactSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    status: { 
        type: String, 
        enum: ['pending', 'approved', 'rejected', 'replied'],
        default: 'pending'
    },
    adminResponse: { 
        type: String, 
        default: null 
    },
    respondedBy: { 
        type: String, 
        default: null 
    },
    respondedAt: { 
        type: Date, 
        default: null 
    },
    isRead: { 
        type: Boolean, 
        default: false 
    },
    readAt: { 
        type: Date, 
        default: null 
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

module.exports = mongoose.model('Contact', ContactSchema);