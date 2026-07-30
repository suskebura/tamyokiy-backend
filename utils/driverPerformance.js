// utils/driverPerformance.js
// FREE - Uses your own database data

const User = require('../models/User');
const Shipment = require('../models/Shipment');

/**
 * Get driver performance metrics from historical data
 * 
 * @param {string} driverId - Driver's user ID
 * @returns {Promise<{
 *   averageSpeed: number,
 *   reliabilityScore: number,
 *   rating: number,
 *   totalDeliveries: number,
 *   onTimeRate: number
 * }>}
 */

async function getDriverPerformance(driverId) {
    // Default values (used when no driver or no data)
    const defaultPerformance = {
        averageSpeed: 45,        // km/h
        reliabilityScore: 0.85,
        rating: 5,
        totalDeliveries: 0,
        onTimeRate: 0.85
    };

    if (!driverId) {
        return defaultPerformance;
    }

    try {
        // Get driver info
        const driver = await User.findById(driverId);
        if (!driver) {
            return defaultPerformance;
        }

        // Get driver's completed deliveries
        const shipments = await Shipment.find({
            assignedDriver: driverId,
            status: 'delivered'
        });

        if (shipments.length < 5) {
            // Not enough data - use defaults with driver's rating
            return {
                averageSpeed: 45,
                reliabilityScore: 0.85,
                rating: driver.rating || 5,
                totalDeliveries: shipments.length,
                onTimeRate: 0.85
            };
        }

        let totalTime = 0;
        let totalDistance = 0;
        let onTimeCount = 0;

        shipments.forEach(s => {
            // Calculate delivery time
            if (s.deliveryProof?.deliveredAt && s.createdAt) {
                const delivered = new Date(s.deliveryProof.deliveredAt);
                const created = new Date(s.createdAt);
                const hours = (delivered - created) / (1000 * 60 * 60);
                totalTime += hours;
            }

            // Total distance
            if (s.distance) {
                totalDistance += s.distance;
            }

            // On-time count
            if (s.status === 'delivered' && s.estimatedDelivery) {
                const delivered = new Date(s.deliveryProof?.deliveredAt);
                if (delivered <= new Date(s.estimatedDelivery)) {
                    onTimeCount++;
                }
            }
        });

        const avgTime = totalTime / shipments.length || 1;
        const avgDistance = totalDistance / shipments.length || 1;
        const avgSpeed = avgDistance / avgTime || 45;
        const onTimeRate = shipments.length > 0 ? onTimeCount / shipments.length : 0.85;

        return {
            averageSpeed: Math.round(avgSpeed * 10) / 10,
            reliabilityScore: Math.round(onTimeRate * 100) / 100,
            rating: driver.rating || 5,
            totalDeliveries: shipments.length,
            onTimeRate: Math.round(onTimeRate * 100) / 100
        };

    } catch (error) {
        console.log('⚠️ Driver performance error:', error.message);
        return defaultPerformance;
    }
}

module.exports = { getDriverPerformance };