const mongoose = require('mongoose');

const TicketSchema = new mongoose.Schema({
    // Ticket Information
    ticketNumber: {
        type: String,
        unique: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    category: {
        type: String,
        enum: ['shipping', 'warehouse', 'billing', 'technical', 'general', 'other'],
        default: 'general'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    status: {
        type: String,
        enum: ['new', 'in_progress', 'on_hold', 'resolved', 'closed'],
        default: 'new'
    },
    
    // User Information
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    userName: {
        type: String,
        required: true
    },
    userEmail: {
        type: String,
        required: true
    },
    
    // Assignment
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    assignedToName: {
        type: String,
        default: null
    },
    
    // Tracking
    resolvedAt: {
        type: Date,
        default: null
    },
    closedAt: {
        type: Date,
        default: null
    },
    lastReplyAt: {
        type: Date,
        default: null
    },
    
    // Attachments
    attachments: [{
        filename: String,
        url: String,
        uploadedAt: {
            type: Date,
            default: Date.now
        }
    }],
    
    // Metadata
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
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

// Generate ticket number before saving
TicketSchema.pre('save', function(next) {
    if (!this.ticketNumber) {
        const year = new Date().getFullYear();
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        this.ticketNumber = `TKT-${year}-${random}`;
    }
    this.updatedAt = new Date();
    next();
});

// Get status color
TicketSchema.methods.getStatusColor = function() {
    const colors = {
        'new': '#2196F3',
        'in_progress': '#ff9800',
        'on_hold': '#9e9e9e',
        'resolved': '#4caf50',
        'closed': '#607d8b'
    };
    return colors[this.status] || '#9e9e9e';
};

// Get priority color
TicketSchema.methods.getPriorityColor = function() {
    const colors = {
        'low': '#4caf50',
        'medium': '#ff9800',
        'high': '#ff6b6b',
        'urgent': '#ff0000'
    };
    return colors[this.priority] || '#ff9800';
};

module.exports = mongoose.model('Ticket', TicketSchema);