// utils/etaCalculator.js

/**
 * Calculate Estimated Delivery Date based on weight and service type
 * For INTERNATIONAL SHIPPING
 * 
 * @param {number} weight - Weight in kg
 * @param {string} serviceType - 'standard', 'express', or 'overnight'
 * @returns {object} { estimatedDate, daysToAdd, serviceType, weight }
 */

function calculateETA(weight, serviceType) {
    // Default to standard if not provided
    const type = serviceType || 'standard';
    let daysToAdd = 0;

    switch (type) {
        case 'overnight':
            // Overnight shipping: 1-2 days regardless of weight
            daysToAdd = 1;
            break;
            
        case 'express':
            // Express international: faster delivery
            if (weight <= 10) {
                daysToAdd = 2;      // Small packages: 2 days
            } else if (weight <= 30) {
                daysToAdd = 4;      // Medium packages: 4 days
            } else {
                daysToAdd = 6;      // Heavy packages: 6 days
            }
            break;
            
        case 'standard':
        default:
            // Standard international shipping
            if (weight <= 5) {
                daysToAdd = 6;      // Very light: 5-7 days
            } else if (weight <= 20) {
                daysToAdd = 9;      // Light: 7-10 days
            } else if (weight <= 50) {
                daysToAdd = 12;     // Medium: 10-14 days
            } else {
                daysToAdd = 18;     // Heavy: 14-21 days
            }
            break;
    }

    // Calculate estimated date
    const estimatedDate = new Date();
    estimatedDate.setDate(estimatedDate.getDate() + daysToAdd);

    // Return result with details
    return {
        estimatedDate: estimatedDate,
        daysToAdd: daysToAdd,
        serviceType: type,
        weight: weight
    };
}

module.exports = calculateETA;