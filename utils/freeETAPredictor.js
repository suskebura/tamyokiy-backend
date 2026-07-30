// utils/freeETAPredictor.js
// FREE - Combines all utilities to predict ETA

const { getFreeDistance } = require('./freeRouting');
const { getFreeWeather } = require('./freeWeather');
const { getDriverPerformance } = require('./driverPerformance');
const { getTimeFactors } = require('./timeFactors');

/**
 * Predict ETA for a shipment using all free utilities
 * 
 * @param {Object} shipmentData - Shipment data
 * @param {number} shipmentData.originLat - Sender latitude
 * @param {number} shipmentData.originLng - Sender longitude
 * @param {number} shipmentData.destLat - Receiver latitude
 * @param {number} shipmentData.destLng - Receiver longitude
 * @param {number} shipmentData.weight - Package weight in kg
 * @param {string} shipmentData.serviceType - 'standard', 'express', or 'overnight'
 * @param {string} shipmentData.driverId - Optional driver ID
 * @param {Date} shipmentData.createdAt - Shipment creation time
 * @returns {Promise<Object>} ETA prediction result
 */

async function predictFreeETA(shipmentData) {
    const {
        originLat,
        originLng,
        destLat,
        destLng,
        weight = 5,
        serviceType = 'standard',
        driverId = null,
        createdAt = new Date()
    } = shipmentData;

    // Default fallback (2 hours)
    const fallback = {
        eta: new Date(Date.now() + 2 * 60 * 60 * 1000),
        minutes: 120,
        confidence: 60,
        isDelayed: false,
        distance: 0,
        factors: { fallback: true },
        breakdown: { drivingTime: 0, handlingTime: 0, totalMinutes: 0 }
    };

    try {
        // 1. Get distance and duration (FREE)
        let distance, duration;
        try {
            const route = await getFreeDistance(originLat, originLng, destLat, destLng);
            distance = route.distance;
            duration = route.duration;
        } catch {
            // Fallback: straight-line distance
            distance = getHaversineDistance(originLat, originLng, destLat, destLng);
            duration = (distance / 45) * 60;
        }

        // 2. Get weather (FREE - OpenWeatherMap)
        let weatherFactor = 1.0;
        let weatherSummary = 'Clear';
        try {
            const weather = await getFreeWeather(destLat, destLng);
            weatherFactor = weather.weatherFactor;
            weatherSummary = weather.weatherSummary;
        } catch {
            // Use defaults
        }

        // 3. Get driver performance (FREE - your database)
        let driverSpeed = 45;
        let reliabilityScore = 0.85;
        try {
            if (driverId) {
                const driverPerf = await getDriverPerformance(driverId);
                driverSpeed = driverPerf.averageSpeed || 45;
                reliabilityScore = driverPerf.reliabilityScore || 0.85;
            }
        } catch {
            // Use defaults
        }

        // 4. Get time factors (FREE)
        const { timeFactor, timeLabel, hour, isRushHour } = getTimeFactors();

        // 5. Service type factors
        const serviceFactors = {
            'standard': 1.0,
            'express': 0.7,
            'overnight': 0.5
        };
        const serviceFactor = serviceFactors[serviceType] || 1.0;

        // 6. Weight factor (heavier = slightly slower)
        const weightFactor = 1 + (weight / 50) * 0.05;

        // 7. Calculate base driving time in minutes
        let baseMinutes = (distance / driverSpeed) * 60;
        baseMinutes *= weatherFactor;
        baseMinutes *= timeFactor;
        baseMinutes *= serviceFactor;
        baseMinutes *= weightFactor;

        // 8. Add handling time (loading/unloading)
        const handlingTime = 5 + (weight * 0.5);

        // 9. Total minutes
        const totalMinutes = Math.round(baseMinutes + handlingTime);

        // 10. Calculate confidence score
        let confidence = 70 + (reliabilityScore * 20);
        if (weatherFactor > 1.3) confidence -= 10;
        if (isRushHour) confidence -= 5;
        confidence = Math.min(99, Math.max(50, Math.round(confidence)));

        // 11. Determine if delayed
        const idealTime = (distance / 60) * 60; // 60 km/h ideal
        const isDelayed = totalMinutes > (idealTime + 30);

        // 12. Build factors list
        const factors = [];
        if (weatherFactor > 1.0) factors.push(`Weather: ${weatherSummary}`);
        if (isRushHour) factors.push(`Rush hour: ${timeLabel}`);
        if (reliabilityScore < 0.8) factors.push('Driver performance below average');
        if (serviceType === 'standard') factors.push('Standard service');
        if (weight > 20) factors.push(`Heavy package: ${weight}kg`);

        // 13. Calculate ETA date
        const etaDate = new Date(createdAt);
        etaDate.setMinutes(etaDate.getMinutes() + totalMinutes);

        return {
            eta: etaDate,
            minutes: totalMinutes,
            hours: Math.floor(totalMinutes / 60),
            formatted: `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`,
            confidence: confidence,
            isDelayed: isDelayed,
            distance: Math.round(distance * 10) / 10,
            factors: {
                distance: `${Math.round(distance)} km`,
                weather: weatherSummary,
                timeOfDay: timeLabel,
                serviceType: serviceType,
                weight: `${weight} kg`,
                driverSpeed: `${Math.round(driverSpeed)} km/h`
            },
            breakdown: {
                drivingTime: Math.round(baseMinutes),
                handlingTime: Math.round(handlingTime),
                totalMinutes: totalMinutes
            },
            delayRisk: {
                score: 100 - confidence,
                level: confidence < 70 ? 'high' : confidence < 85 ? 'medium' : 'low',
                factors: factors
            }
        };

    } catch (error) {
        console.error('❌ ETA prediction error:', error.message);
        return fallback;
    }
}

/**
 * Haversine formula - calculates straight-line distance
 */
function getHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

module.exports = { predictFreeETA };