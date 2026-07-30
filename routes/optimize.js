// routes/optimize.js
const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const axios = require('axios');

// ============================================================
// 🗺️ OPTIMIZE ROUTE - Calls Python Optimizer Service
// ============================================================
router.post('/', adminAuth, async (req, res) => {
    try {
        const { 
            stops, 
            depotIndex = 0, 
            numVehicles = 1,
            includeTraffic = true,
            includeWeather = true,
            timeWindows = null,
            maxStopsPerVehicle = null
        } = req.body;
        
        if (!stops || stops.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Need at least 2 stops to optimize'
            });
        }
        
        console.log(`🗺️ Optimizing route with ${stops.length} stops, ${numVehicles} vehicles...`);
        
        // Call Python optimizer service
        const response = await axios.post('http://localhost:5001/optimize', {
            stops,
            num_vehicles: numVehicles,
            depot_index: depotIndex,
            include_traffic: includeTraffic,
            include_weather: includeWeather,
            time_windows: timeWindows,
            max_stops_per_vehicle: maxStopsPerVehicle
        }, {
            timeout: 35000 // 35 second timeout
        });
        
        const data = response.data;
        
        if (data.success) {
            console.log(`✅ Optimization complete: ${data.savings_percent}% savings (${data.time_saved} min saved)`);
            console.log(`⏱️ Took ${data.optimization_time}s`);
        }
        
        res.json(data);
        
    } catch (err) {
        console.error('❌ Optimization error:', err);
        res.status(500).json({
            success: false,
            message: err.message || 'Optimization failed'
        });
    }
});

// ============================================================
// 📊 GET OPTIMIZER STATUS
// ============================================================
router.get('/status', adminAuth, async (req, res) => {
    try {
        const response = await axios.get('http://localhost:5001/health', {
            timeout: 3000
        });
        res.json({
            success: true,
            status: 'online',
            service: response.data
        });
    } catch (err) {
        res.json({
            success: false,
            status: 'offline',
            message: 'Python optimizer service is not running'
        });
    }
});

module.exports = router;