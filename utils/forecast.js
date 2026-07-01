// utils/forecast.js

/**
 * 📊 REVENUE & DELIVERY FORECASTING ENGINE
 * 
 * This module predicts future revenue and delivery volumes
 * based on historical data using:
 * 1. Simple Moving Average (SMA)
 * 2. Linear Regression (Trend Line)
 * 3. Seasonal Adjustment
 */

/**
 * Calculate Simple Moving Average
 * @param {Array} data - Array of numbers
 * @param {number} period - Number of periods to average (default: 3)
 * @returns {number} - Moving average
 */
function calculateSMA(data, period = 3) {
    if (data.length < period) {
        return data.reduce((a, b) => a + b, 0) / data.length;
    }
    const recent = data.slice(-period);
    return recent.reduce((a, b) => a + b, 0) / recent.length;
}

/**
 * Calculate Linear Regression (Trend Line)
 * @param {Array} data - Array of { x: number, y: number }
 * @returns {Object} - { slope, intercept, rSquared }
 */
function calculateLinearRegression(data) {
    const n = data.length;
    if (n < 2) return { slope: 0, intercept: 0, rSquared: 0 };

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    
    for (let i = 0; i < n; i++) {
        const x = data[i].x;
        const y = data[i].y;
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
        sumY2 += y * y;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // R-squared (goodness of fit)
    const meanY = sumY / n;
    let ssTotal = 0, ssResidual = 0;
    for (let i = 0; i < n; i++) {
        const y = data[i].y;
        const yPred = slope * data[i].x + intercept;
        ssTotal += Math.pow(y - meanY, 2);
        ssResidual += Math.pow(y - yPred, 2);
    }
    const rSquared = ssTotal > 0 ? 1 - (ssResidual / ssTotal) : 0;

    return { slope, intercept, rSquared };
}

/**
 * Calculate Growth Rate between two values
 * @param {number} current - Current value
 * @param {number} previous - Previous value
 * @returns {number} - Growth percentage
 */
function calculateGrowthRate(current, previous) {
    if (previous === 0) return 0;
    return ((current - previous) / previous) * 100;
}

/**
 * Calculate Confidence Level based on data consistency
 * @param {Array} data - Array of values
 * @param {number} rSquared - R-squared value from regression
 * @returns {number} - Confidence percentage (0-100)
 */
function calculateConfidence(data, rSquared) {
    if (data.length < 3) return 0;
    
    // Calculate variance (how spread out the data is)
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const variance = data.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / data.length;
    const stdDev = Math.sqrt(variance);
    
    // Coefficient of Variation (lower = more consistent = higher confidence)
    const cv = mean !== 0 ? stdDev / mean : 1;
    
    // Confidence based on:
    // 1. R-squared (trend strength) - 40% weight
    // 2. CV (consistency) - 40% weight
    // 3. Data points (sample size) - 20% weight
    
    const rScore = Math.min(rSquared * 100, 100); // R-squared as percentage
    const cvScore = Math.max(0, 100 - (cv * 100)); // Lower CV = higher score
    const dataScore = Math.min(data.length / 12 * 100, 100); // 12 months = 100%
    
    const confidence = (rScore * 0.4) + (cvScore * 0.4) + (dataScore * 0.2);
    return Math.round(Math.min(confidence, 100));
}

/**
 * Predict next value using Linear Regression
 * @param {Array} data - Array of values
 * @param {number} nextIndex - Index to predict (e.g., data.length)
 * @returns {Object} - { predicted, slope, intercept, rSquared }
 */
function predictNextValue(data, nextIndex) {
    const n = data.length;
    if (n < 2) {
        // If not enough data, use simple average
        const avg = data.reduce((a, b) => a + b, 0) / data.length || 0;
        return { predicted: avg, slope: 0, intercept: avg, rSquared: 0 };
    }
    
    const indexedData = data.map((value, index) => ({
        x: index + 1,
        y: value
    }));
    
    const regression = calculateLinearRegression(indexedData);
    const predicted = regression.slope * nextIndex + regression.intercept;
    
    return {
        predicted: Math.max(0, predicted), // No negative values
        slope: regression.slope,
        intercept: regression.intercept,
        rSquared: regression.rSquared
    };
}

/**
 * Apply seasonal adjustment based on month of year
 * @param {number} value - Raw predicted value
 * @param {number} monthIndex - Month to predict (0-11)
 * @returns {number} - Seasonally adjusted value
 */
function applySeasonalAdjustment(value, monthIndex) {
    // Seasonal factors based on historical logistics patterns
    // (higher during holiday season, lower in January)
    const seasonalFactors = {
        0: 0.85,  // January - Low
        1: 0.80,  // February - Low
        2: 0.90,  // March - Average
        3: 0.95,  // April - Average
        4: 1.00,  // May - Average
        5: 1.05,  // June - Average High
        6: 1.00,  // July - Average
        7: 0.95,  // August - Average
        8: 0.90,  // September - Average
        9: 1.00,  // October - Average
        10: 1.10, // November - High (Black Friday prep)
        11: 1.25  // December - Highest (Holiday season)
    };
    
    const factor = seasonalFactors[monthIndex] || 1.0;
    return value * factor;
}

/**
 * MAIN FUNCTION: Generate forecast
 * @param {Array} historicalData - Array of { month, revenue, deliveries }
 * @param {number} forecastMonths - Number of months to forecast (default: 1)
 * @returns {Object} - Complete forecast results
 */
function generateForecast(historicalData, forecastMonths = 1) {
    // Validate input
    if (!historicalData || historicalData.length < 3) {
        return {
            success: false,
            message: 'Need at least 3 months of data for reliable forecasting'
        };
    }

    // Extract data
    const revenues = historicalData.map(d => d.revenue || 0);
    const deliveries = historicalData.map(d => d.deliveries || 0);
    
    // Calculate growth rates
    let revenueGrowthRates = [];
    let deliveryGrowthRates = [];
    
    for (let i = 1; i < historicalData.length; i++) {
        const revGrowth = calculateGrowthRate(
            historicalData[i].revenue,
            historicalData[i-1].revenue
        );
        const delGrowth = calculateGrowthRate(
            historicalData[i].deliveries,
            historicalData[i-1].deliveries
        );
        if (isFinite(revGrowth)) revenueGrowthRates.push(revGrowth);
        if (isFinite(delGrowth)) deliveryGrowthRates.push(delGrowth);
    }
    
    const avgRevenueGrowth = revenueGrowthRates.length > 0 
        ? revenueGrowthRates.reduce((a, b) => a + b, 0) / revenueGrowthRates.length 
        : 0;
    const avgDeliveryGrowth = deliveryGrowthRates.length > 0 
        ? deliveryGrowthRates.reduce((a, b) => a + b, 0) / deliveryGrowthRates.length 
        : 0;
    
    // Predict next values using Linear Regression
    const nextIndex = historicalData.length + forecastMonths;
    const revenuePrediction = predictNextValue(revenues, nextIndex);
    const deliveryPrediction = predictNextValue(deliveries, nextIndex);
    
    // Apply seasonal adjustment
    const currentMonth = new Date().getMonth();
    const nextMonthIndex = (currentMonth + forecastMonths) % 12;
    
    const seasonallyAdjustedRevenue = applySeasonalAdjustment(
        revenuePrediction.predicted,
        nextMonthIndex
    );
    const seasonallyAdjustedDeliveries = Math.round(
        applySeasonalAdjustment(deliveryPrediction.predicted, nextMonthIndex)
    );
    
    // Calculate confidence
    const revenueConfidence = calculateConfidence(revenues, revenuePrediction.rSquared);
    const deliveryConfidence = calculateConfidence(deliveries, deliveryPrediction.rSquared);
    const overallConfidence = Math.round((revenueConfidence + deliveryConfidence) / 2);
    
    // Determine trend
    let trend = 'Stable';
    if (avgRevenueGrowth > 5) trend = '📈 Strong Growth';
    else if (avgRevenueGrowth > 1) trend = '📈 Moderate Growth';
    else if (avgRevenueGrowth > -1) trend = '➡️ Stable';
    else if (avgRevenueGrowth > -5) trend = '📉 Slight Decline';
    else trend = '📉 Strong Decline';
    
    // Get month names
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonthName = monthNames[currentMonth];
    const nextMonthName = monthNames[nextMonthIndex];
    
    // Calculate total revenue and deliveries
    const totalRevenue = revenues.reduce((a, b) => a + b, 0);
    const totalDeliveries = deliveries.reduce((a, b) => a + b, 0);
    const avgRevenue = totalRevenue / revenues.length || 0;
    const avgDeliveries = Math.round(totalDeliveries / deliveries.length || 0);
    
    // Find best and worst months
    let bestMonth = historicalData[0] || { month: 'N/A', revenue: 0 };
    let worstMonth = historicalData[0] || { month: 'N/A', revenue: 0 };
    
    for (const d of historicalData) {
        if (d.revenue > bestMonth.revenue) bestMonth = d;
        if (d.revenue < worstMonth.revenue) worstMonth = d;
    }
    
    // Generate forecast data for chart (last 6 months + next month)
    const chartData = [];
    const startIndex = Math.max(0, historicalData.length - 6);
    
    for (let i = startIndex; i < historicalData.length; i++) {
        chartData.push({
            month: historicalData[i].month,
            revenue: historicalData[i].revenue,
            deliveries: historicalData[i].deliveries,
            isForecast: false
        });
    }
    
    // Add forecast point
    chartData.push({
        month: nextMonthName,
        revenue: Math.round(seasonallyAdjustedRevenue * 100) / 100,
        deliveries: seasonallyAdjustedDeliveries,
        isForecast: true
    });
    
    // Return complete forecast result
    return {
        success: true,
        
        // Forecast results
        forecast: {
            nextMonth: nextMonthName,
            predictedRevenue: Math.round(seasonallyAdjustedRevenue * 100) / 100,
            predictedDeliveries: Math.max(0, seasonallyAdjustedDeliveries),
            confidence: overallConfidence,
            trend: trend,
            avgRevenueGrowth: Math.round(avgRevenueGrowth * 100) / 100,
            avgDeliveryGrowth: Math.round(avgDeliveryGrowth * 100) / 100,
            seasonalFactor: (seasonallyAdjustedRevenue / revenuePrediction.predicted)
        },
        
        // Historical summary
        summary: {
            totalRevenue: Math.round(totalRevenue * 100) / 100,
            totalDeliveries: totalDeliveries,
            averageRevenue: Math.round(avgRevenue * 100) / 100,
            averageDeliveries: avgDeliveries,
            bestMonth: bestMonth,
            worstMonth: worstMonth,
            dataPoints: historicalData.length
        },
        
        // For chart rendering
        chartData: chartData,
        
        // Raw data for debugging
        raw: {
            revenueGrowthRates: revenueGrowthRates,
            deliveryGrowthRates: deliveryGrowthRates,
            revenueConfidence: revenueConfidence,
            deliveryConfidence: deliveryConfidence,
            rSquared: {
                revenue: revenuePrediction.rSquared,
                delivery: deliveryPrediction.rSquared
            }
        }
    };
}

/**
 * Generate sample historical data (for testing)
 * @param {number} months - Number of months of data
 * @returns {Array} - Sample historical data
 */
function generateSampleData(months = 6) {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonth = new Date().getMonth();
    const data = [];
    
    // Base values
    let baseRevenue = 5000 + Math.random() * 2000;
    let baseDeliveries = 50 + Math.floor(Math.random() * 30);
    
    for (let i = months - 1; i >= 0; i--) {
        const monthIndex = (currentMonth - i + 12) % 12;
        // Add some random growth
        const growthFactor = 1 + (Math.random() * 0.1 - 0.02);
        baseRevenue = baseRevenue * growthFactor;
        baseDeliveries = Math.round(baseDeliveries * growthFactor);
        
        data.push({
            month: monthNames[monthIndex],
            revenue: Math.round(baseRevenue * 100) / 100,
            deliveries: Math.round(baseDeliveries)
        });
    }
    
    return data;
}

// Export all functions
module.exports = {
    calculateSMA,
    calculateLinearRegression,
    calculateGrowthRate,
    calculateConfidence,
    predictNextValue,
    applySeasonalAdjustment,
    generateForecast,
    generateSampleData
};