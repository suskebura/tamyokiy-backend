// models/SentimentLog.js
// 📊 Track sentiment analysis results

const mongoose = require('mongoose');

const SentimentLogSchema = new mongoose.Schema({
    // Entity being analyzed
    entityType: {
        type: String,
        enum: ['ticket', 'rating', 'contact', 'review'],
        required: true
    },
    entityId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'entityType'
    },
    
    // Text analyzed
    text: {
        type: String,
        required: true
    },
    
    // Sentiment results
    sentiment: {
        type: String,
        enum: ['positive', 'negative', 'neutral', 'urgent'],
        default: 'neutral'
    },
    confidence: {
        type: Number,
        default: 50,
        min: 0,
        max: 100
    },
    scores: {
        urgency: { type: Number, default: 0 },
        anger: { type: Number, default: 0 },
        frustration: { type: Number, default: 0 },
        negative: { type: Number, default: 0 },
        positive: { type: Number, default: 0 },
        satisfaction: { type: Number, default: 0 },
        overall: { type: Number, default: 50 }
    },
    
    // Flags
    isUrgent: {
        type: Boolean,
        default: false
    },
    isAngry: {
        type: Boolean,
        default: false
    },
    escalationLevel: {
        type: String,
        enum: ['normal', 'medium', 'high', 'critical'],
        default: 'normal'
    },
    
    // Evidence
    matchedKeywords: {
        urgent: [String],
        angry: [String],
        frustrated: [String],
        negative: [String],
        positive: [String],
        satisfied: [String]
    },
    
    // Metadata
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Indexes for faster queries
SentimentLogSchema.index({ entityType: 1, entityId: 1 });
SentimentLogSchema.index({ sentiment: 1, createdAt: -1 });
SentimentLogSchema.index({ isUrgent: 1, isAngry: 1 });
SentimentLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('SentimentLog', SentimentLogSchema);