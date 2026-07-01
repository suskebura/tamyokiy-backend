const mongoose = require('mongoose');

const RatingSchema = new mongoose.Schema({
    shipmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shipment',
        required: true
    },
    trackingNumber: {
        type: String,
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    driverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    driverName: {
        type: String,
        required: true
    },
    // Rating 1-5 stars for the driver
    driverRating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    // Rating 1-5 stars for the service
    serviceRating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    // Overall rating (average of driver and service)
    overallRating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    // Optional feedback comment
    comment: {
        type: String,
        default: null,
        trim: true,
        maxlength: 500
    },
    // Delivery experience feedback
    deliveryOnTime: {
        type: Boolean,
        default: null
    },
    packageCondition: {
        type: String,
        enum: ['excellent', 'good', 'fair', 'poor'],
        default: null
    },
    // Would recommend to others
    wouldRecommend: {
        type: Boolean,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Indexes for faster queries
RatingSchema.index({ driverId: 1, createdAt: -1 });
RatingSchema.index({ shipmentId: 1 }, { unique: true });
RatingSchema.index({ userId: 1, createdAt: -1 });

// Static method to calculate driver average rating
RatingSchema.statics.getDriverAverageRating = async function(driverId) {
    const result = await this.aggregate([
        { $match: { driverId: driverId } },
        { $group: {
            _id: '$driverId',
            averageRating: { $avg: '$overallRating' },
            totalRatings: { $sum: 1 },
            averageDriverRating: { $avg: '$driverRating' },
            averageServiceRating: { $avg: '$serviceRating' }
        }}
    ]);
    
    if (result.length === 0) {
        return {
            averageRating: 0,
            totalRatings: 0,
            averageDriverRating: 0,
            averageServiceRating: 0
        };
    }
    
    return {
        averageRating: Math.round(result[0].averageRating * 10) / 10,
        totalRatings: result[0].totalRatings,
        averageDriverRating: Math.round(result[0].averageDriverRating * 10) / 10,
        averageServiceRating: Math.round(result[0].averageServiceRating * 10) / 10
    };
};

module.exports = mongoose.model('Rating', RatingSchema);