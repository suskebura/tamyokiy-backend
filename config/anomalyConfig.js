// config/anomalyConfig.js - NEW FILE

module.exports = {
    // Thresholds
    thresholds: {
        tooFastDeliveryMinutes: 10,
        failedDeliveryThreshold: 3,
        suspiciousHourStart: 22,
        suspiciousHourEnd: 6,
        maxFailedAttempts: 5,
        driverFailureRateThreshold: 30, // percentage
        paymentFraudCount: 5,
        rapidPaymentMinutes: 5,
        unusualRouteDistanceThreshold: 1, // km
    },
    
    // Severity scoring
    severity: {
        critical: { minScore: 80, color: '#ff0000' },
        high: { minScore: 60, color: '#ff6b6b' },
        medium: { minScore: 40, color: '#ffa500' },
        low: { minScore: 0, color: '#4caf50' }
    },
    
    // Weight factors
    weights: {
        proximity: 0.30,
        load: 0.25,
        rating: 0.20,
        onTime: 0.15,
        vehicle: 0.10
    },
    
    // Alert recipients
    alertEmails: process.env.ANOMALY_ALERT_EMAILS?.split(',') || ['admin@tamyokiy.com'],
    
    // Enable/disable specific detectors
    detectors: {
        tooFastDeliveries: true,
        repeatedFailedDeliveries: true,
        fakeDeliveryProofs: true,
        paymentFraud: true,
        unusualRoutes: true,
        multipleFailuresSameCustomer: true,
        driverAbusePatterns: true
    }
};