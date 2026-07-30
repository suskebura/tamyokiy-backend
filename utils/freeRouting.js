// utils/freeRouting.js
// FREE - No API key needed! Uses OSRM public instance + Haversine fallback

/**
 * Get distance and duration between two coordinates
 * Uses OSRM (free) with Haversine formula as fallback
 * 
 * @param {number} originLat - Origin latitude
 * @param {number} originLng - Origin longitude
 * @param {number} destLat - Destination latitude
 * @param {number} destLng - Destination longitude
 * @returns {Promise<{distance: number, duration: number}>}
 *          distance in km, duration in minutes
 */

async function getFreeDistance(originLat, originLng, destLat, destLng) {
    try {
        // Try OSRM public instance first (FREE, no API key)
        const url = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=false`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            const distance = data.routes[0].distance / 1000; // meters to km
            const duration = data.routes[0].duration / 60;   // seconds to minutes
            return { 
                distance: Math.round(distance * 10) / 10, 
                duration: Math.round(duration) 
            };
        }
    } catch (error) {
        console.log('⚠️ OSRM failed, using Haversine fallback');
    }
    
    // Fallback: Haversine formula (no API, completely free)
    const distance = haversine(originLat, originLng, destLat, destLng);
    const duration = (distance / 45) * 60; // assume 45 km/h average speed
    
    return { 
        distance: Math.round(distance * 10) / 10, 
        duration: Math.round(duration) 
    };
}

/**
 * Haversine formula - calculates distance between two points on Earth
 * @returns {number} distance in kilometers
 */
function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

module.exports = { getFreeDistance };