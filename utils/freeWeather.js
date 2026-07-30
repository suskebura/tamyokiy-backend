// utils/freeWeather.js
// FREE - Uses OpenWeatherMap free tier (1,000 calls/day)
// Sign up at https://openweathermap.org/api to get your free API key

/**
 * Get weather data for a location
 * Returns weather factor that affects delivery time
 * 
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<{weatherFactor: number, weatherSummary: string, temperature: number, condition: string}>}
 */

async function getFreeWeather(lat, lng) {
    const API_KEY = process.env.OPENWEATHER_API_KEY;
    
    // If no API key, return default values (still works!)
    if (!API_KEY) {
        console.log('⚠️ No OpenWeather API key found. Using default weather.');
        return { 
            weatherFactor: 1.0, 
            weatherSummary: 'Unknown', 
            temperature: 20, 
            condition: 'Clear' 
        };
    }

    try {
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();

        if (!data || !data.weather) {
            return { weatherFactor: 1.0, weatherSummary: 'Unknown', temperature: 20, condition: 'Clear' };
        }

        const condition = data.weather[0]?.main || 'Clear';
        const temp = data.main?.temp - 273.15 || 20; // Kelvin to Celsius

        let weatherFactor = 1.0;
        let summary = condition;

        // Weather delay factors
        if (['Rain', 'Drizzle'].includes(condition)) {
            weatherFactor = 1.15;
            summary = 'Rainy 🌧️';
        } else if (condition === 'Snow') {
            weatherFactor = 1.3;
            summary = 'Snowy ❄️';
        } else if (condition === 'Thunderstorm') {
            weatherFactor = 1.4;
            summary = 'Stormy ⛈️';
        } else if (temp > 35) {
            weatherFactor = 1.1;
            summary = 'Extreme Heat 🔥';
        } else if (temp < 0) {
            weatherFactor = 1.1;
            summary = 'Freezing 🥶';
        } else if (condition === 'Clear') {
            summary = 'Clear ☀️';
        } else if (condition === 'Clouds') {
            summary = 'Cloudy ☁️';
        }

        return {
            weatherFactor,
            weatherSummary: summary,
            temperature: Math.round(temp),
            condition
        };

    } catch (error) {
        console.log('⚠️ Weather API error, using default:', error.message);
        return { 
            weatherFactor: 1.0, 
            weatherSummary: 'Unknown', 
            temperature: 20, 
            condition: 'Clear' 
        };
    }
}

module.exports = { getFreeWeather };