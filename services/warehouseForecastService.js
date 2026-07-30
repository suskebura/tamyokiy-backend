// ============================================================
// 📊 WAREHOUSE FORECAST ENGINE
// ============================================================

const Warehouse = require('../models/Warehouse');
const WarehouseInventory = require('../models/WarehouseInventory');
const Shipment = require('../models/Shipment');
const WarehouseForecast = require('../models/WarehouseForecast');
const { createNotification } = require('../routes/notification');

class WarehouseForecastService {
    
    /**
     * 📈 Generate forecast for all warehouses
     */
    async generateAllForecasts(period = 'daily') {
        console.log('📊 Generating warehouse forecasts...');
        
        const warehouses = await Warehouse.find({ status: 'active' });
        const results = [];
        
        for (const warehouse of warehouses) {
            const forecast = await this.generateWarehouseForecast(warehouse._id, period);
            if (forecast) {
                results.push(forecast);
            }
        }
        
        console.log(`✅ Generated ${results.length} forecasts`);
        return results;
    }
    
    /**
     * 📈 Generate forecast for a specific warehouse
     */
    async generateWarehouseForecast(warehouseId, period = 'daily') {
        try {
            const warehouse = await Warehouse.findById(warehouseId);
            if (!warehouse) return null;
            
            // Get historical data
            const historicalData = await this.getHistoricalData(warehouseId, period);
            
            // Calculate predictions
            const predictions = this.calculatePredictions(historicalData);
            
            // Calculate capacity
            const capacity = await this.calculateCapacity(warehouseId, predictions);
            
            // Calculate trends
            const trends = this.calculateTrends(historicalData);
            
            // Generate alert level
            const alertLevel = this.calculateAlertLevel(capacity, predictions);
            
            // Save forecast
            const forecast = new WarehouseForecast({
                warehouseId: warehouse._id,
                warehouseCode: warehouse.code,
                forecastDate: new Date(),
                predictedIncoming: predictions.incoming,
                predictedOutgoing: predictions.outgoing,
                predictedStorage: predictions.storage,
                confidence: predictions.confidence,
                trendDirection: trends.direction,
                trendPercentage: trends.percentage,
                capacityAlert: alertLevel !== 'green',
                alertLevel: alertLevel,
                factors: predictions.factors || [],
                period: period
            });
            
            await forecast.save();
            
            // Send alert if capacity is critical
            if (alertLevel === 'red' || alertLevel === 'orange') {
                await this.sendCapacityAlert(warehouse, forecast);
            }
            
            return forecast;
            
        } catch (error) {
            console.error('❌ Forecast error:', error);
            return null;
        }
    }
    
    /**
     * 📊 Get historical data
     */
    async getHistoricalData(warehouseId, period = 'daily') {
        const days = period === 'daily' ? 30 : period === 'weekly' ? 12 : 6;
        const data = [];
        
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            date.setHours(0, 0, 0, 0);
            
            const endDate = new Date(date);
            endDate.setDate(endDate.getDate() + 1);
            
            // Count incoming shipments (received at warehouse)
            const incoming = await WarehouseInventory.countDocuments({
                warehouseId: warehouseId,
                receivedAt: { $gte: date, $lt: endDate }
            });
            
            // Count outgoing shipments (dispatched from warehouse)
            const outgoing = await WarehouseInventory.countDocuments({
                warehouseId: warehouseId,
                dispatchedAt: { $gte: date, $lt: endDate }
            });
            
            // Count current storage
            const storage = await WarehouseInventory.countDocuments({
                warehouseId: warehouseId,
                status: { $in: ['received', 'sorted', 'packed', 'loaded'] }
            });
            
            data.push({
                date: date,
                incoming,
                outgoing,
                storage,
                total: incoming + outgoing
            });
        }
        
        return data;
    }
    
    /**
     * 🧮 Calculate predictions using simple moving average
     */
    calculatePredictions(historicalData) {
        if (historicalData.length < 7) {
            return {
                incoming: 0,
                outgoing: 0,
                storage: 0,
                confidence: 50,
                factors: [{ name: 'Insufficient data', impact: -20, description: 'Need more historical data' }]
            };
        }
        
        // Use last 7 days for prediction
        const recent = historicalData.slice(-7);
        
        // Calculate averages
        const avgIncoming = recent.reduce((sum, d) => sum + d.incoming, 0) / recent.length;
        const avgOutgoing = recent.reduce((sum, d) => sum + d.outgoing, 0) / recent.length;
        const avgStorage = recent.reduce((sum, d) => sum + d.storage, 0) / recent.length;
        
        // Calculate trend (simple linear regression)
        const trend = this.calculateTrend(recent);
        
        // Calculate confidence based on data consistency
        const confidence = this.calculateConfidence(recent);
        
        // Adjust predictions based on trend
        const predictedIncoming = Math.round(avgIncoming + trend.incoming);
        const predictedOutgoing = Math.round(avgOutgoing + trend.outgoing);
        const predictedStorage = Math.round(avgStorage + trend.storage);
        
        // Factors
        const factors = [];
        if (trend.incoming > 2) {
            factors.push({
                name: '📈 Incoming trend',
                impact: 15,
                description: `Increasing by ${trend.incoming.toFixed(1)} shipments/day`
            });
        }
        if (avgStorage > 50) {
            factors.push({
                name: '📦 Storage level',
                impact: -10,
                description: `High storage: ${Math.round(avgStorage)} items average`
            });
        }
        
        return {
            incoming: Math.max(0, predictedIncoming),
            outgoing: Math.max(0, predictedOutgoing),
            storage: Math.max(0, predictedStorage),
            confidence: confidence,
            factors: factors
        };
    }
    
    /**
     * 📈 Calculate trend using linear regression
     */
    calculateTrend(data) {
        const n = data.length;
        if (n < 2) return { incoming: 0, outgoing: 0, storage: 0 };
        
        let sumX = 0, sumY_in = 0, sumY_out = 0, sumY_storage = 0;
        let sumXY_in = 0, sumXY_out = 0, sumXY_storage = 0;
        let sumX2 = 0;
        
        for (let i = 0; i < n; i++) {
            const x = i + 1;
            sumX += x;
            sumX2 += x * x;
            sumY_in += data[i].incoming;
            sumY_out += data[i].outgoing;
            sumY_storage += data[i].storage;
            sumXY_in += x * data[i].incoming;
            sumXY_out += x * data[i].outgoing;
            sumXY_storage += x * data[i].storage;
        }
        
        const slopeIn = (n * sumXY_in - sumX * sumY_in) / (n * sumX2 - sumX * sumX);
        const slopeOut = (n * sumXY_out - sumX * sumY_out) / (n * sumX2 - sumX * sumX);
        const slopeStorage = (n * sumXY_storage - sumX * sumY_storage) / (n * sumX2 - sumX * sumX);
        
        return {
            incoming: slopeIn,
            outgoing: slopeOut,
            storage: slopeStorage
        };
    }
    
    /**
     * 🎯 Calculate confidence level
     */
    calculateConfidence(data) {
        if (data.length < 7) return 50;
        
        // Calculate variance
        const values = data.map(d => d.total);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);
        
        // Confidence based on standard deviation
        if (stdDev < 5) return 95;
        if (stdDev < 10) return 85;
        if (stdDev < 20) return 75;
        if (stdDev < 30) return 65;
        return 50;
    }
    
    /**
     * 📦 Calculate capacity
     */
    async calculateCapacity(warehouseId, predictions) {
        const warehouse = await Warehouse.findById(warehouseId);
        if (!warehouse) return { utilization: 0, available: 0 };
        
        const totalCapacity = warehouse.capacity?.total || 100;
        const currentUsed = warehouse.capacity?.used || 0;
        const predictedUsed = currentUsed + predictions.incoming - predictions.outgoing;
        
        const utilization = totalCapacity > 0 ? (predictedUsed / totalCapacity) * 100 : 0;
        
        return {
            total: totalCapacity,
            used: currentUsed,
            predictedUsed: Math.max(0, predictedUsed),
            utilization: Math.min(100, utilization),
            available: Math.max(0, totalCapacity - predictedUsed)
        };
    }
    
    /**
     * 🚨 Calculate alert level
     */
    calculateAlertLevel(capacity, predictions) {
        const { utilization, available } = capacity;
        
        if (utilization >= 90) return 'red';
        if (utilization >= 75) return 'orange';
        if (utilization >= 60) return 'yellow';
        return 'green';
    }
    
    /**
     * 🔔 Send capacity alert
     */
    async sendCapacityAlert(warehouse, forecast) {
        const alertMessages = {
            'red': `⚠️ CRITICAL: ${warehouse.name} is at ${Math.round(forecast.predictedStorage)}% capacity! Immediate action required.`,
            'orange': `⚡ ${warehouse.name} capacity at ${Math.round(forecast.predictedStorage)}%. Consider re-routing shipments.`
        };
        
        const message = alertMessages[forecast.alertLevel] || '';
        if (!message) return;
        
        // Notify admins
        const User = require('../models/User');
        const admins = await User.find({ role: 'admin' });
        
        for (const admin of admins) {
            await createNotification(
                admin._id,
                `🏢 ${forecast.alertLevel.toUpperCase()} Alert: ${warehouse.name}`,
                message,
                forecast.alertLevel === 'red' ? 'error' : 'warning',
                warehouse._id
            );
        }
        
        console.log(`🔔 Capacity alert sent for ${warehouse.name}: ${forecast.alertLevel}`);
    }
}

module.exports = new WarehouseForecastService();