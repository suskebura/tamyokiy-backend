const mongoose = require('mongoose');
const { calculateEmissions, compareEmissions, OFFSET_COSTS } = require('../utils/emissionFactors');
const CarbonFootprint = mongoose.model('CarbonFootprint');

class CarbonCalculationService {
    /**
     * Calculate carbon footprint for a shipment
     */
    async calculateShipmentFootprint(shipment, vehicle, route) {
        try {
            // Determine vehicle type
            const vehicleType = vehicle ? vehicle.type : 'diesel_truck_medium';
            const distance = route ? route.distance : 50; // Default distance in km
            const weight = shipment.weight || 100;
            const loadFactor = 0.7; // Default 70% load factor

            // Calculate emissions
            const result = calculateEmissions({
                vehicleType,
                distance,
                weight,
                loadFactor,
                country: shipment.country || 'ethiopia'
            });

            if (!result) {
                throw new Error('Failed to calculate emissions');
            }

            // Calculate standard emissions (non-eco)
            const standardResult = calculateEmissions({
                vehicleType: 'diesel_truck_medium',
                distance,
                weight,
                loadFactor: 0.5,
                country: shipment.country || 'ethiopia'
            });

            // Compare eco vs standard
            const comparison = compareEmissions(result, standardResult);

            // Create carbon footprint record
            const carbonFootprint = new CarbonFootprint({
                shipmentId: shipment._id,
                routeId: route ? route._id : null,
                vehicleId: vehicle ? vehicle._id : null,
                driverId: shipment.driver || null,
                clientId: shipment.client || shipment.clientId,
                totalEmissions: result.totalEmissions,
                activity: {
                    distance: distance,
                    duration: route ? route.duration : null,
                    weight: weight,
                    fuelConsumed: vehicle ? distance / (vehicle.fuelEfficiency || 10) : null,
                    energyConsumed: vehicleType.includes('electric') ? distance * 0.2 : null
                },
                vehicle: {
                    type: vehicleType,
                    fuelEfficiency: vehicle ? vehicle.fuelEfficiency : null,
                    emissionFactor: result.totalEmissions.co2 / distance,
                    loadFactor: loadFactor
                },
                ecoFriendly: vehicleType.includes('electric') || vehicleType.includes('hybrid'),
                ecoTier: vehicleType.includes('electric') ? 'premium-eco' : 
                         vehicleType.includes('hybrid') ? 'eco' : 'standard',
                efficiency: result.efficiency,
                comparison: {
                    standardEmissions: standardResult.totalEmissions.co2e,
                    ecoSavings: comparison.savingsPercentage,
                    equivalent: result.equivalences
                },
                scope: 'scope1'
            });

            // Add offset if eco-friendly
            if (carbonFootprint.ecoFriendly) {
                const offsetAmount = result.totalEmissions.co2e * 0.1; // Offset 10%
                carbonFootprint.offset = {
                    offsetAmount,
                    offsetProvider: 'TAMYOKIY Carbon Offset Program',
                    offsetCost: offsetAmount * OFFSET_COSTS.tree_planting,
                    offsetCurrency: 'USD'
                };
            }

            await carbonFootprint.save();
            return carbonFootprint;

        } catch (error) {
            console.error('❌ Carbon calculation error:', error.message);
            throw error;
        }
    }

    /**
     * Get carbon summary for a client
     */
    async getClientCarbonSummary(clientId, startDate, endDate) {
        try {
            const summary = await CarbonFootprint.getClientSummary(clientId, startDate, endDate);
            
            if (summary.length === 0) {
                return {
                    totalCO2: 0,
                    totalCO2e: 0,
                    totalDistance: 0,
                    avgCO2PerKm: 0,
                    avgCO2PerKg: 0,
                    totalOffset: 0,
                    ecoShipments: 0,
                    totalShipments: 0,
                    ecoPercentage: 0
                };
            }

            const data = summary[0];
            data.ecoPercentage = data.totalShipments > 0 
                ? Math.round((data.ecoShipments / data.totalShipments) * 100) 
                : 0;

            return data;
        } catch (error) {
            console.error('❌ Client carbon summary error:', error.message);
            throw error;
        }
    }

    /**
     * Get carbon footprint for a specific shipment
     */
    async getShipmentCarbon(shipmentId) {
        try {
            return await CarbonFootprint.findOne({ shipmentId });
        } catch (error) {
            console.error('❌ Get shipment carbon error:', error.message);
            throw error;
        }
    }

    /**
     * Get carbon trend data
     */
    async getCarbonTrend(clientId, period = 'monthly') {
        try {
            const trend = await CarbonFootprint.getMonthlyTrend(clientId);
            return trend;
        } catch (error) {
            console.error('❌ Carbon trend error:', error.message);
            throw error;
        }
    }

    /**
     * Get eco-friendly shipping options
     */
    async getEcoOptions(shipmentData) {
        const { pickupAddress, deliveryAddress, weight, dimensions } = shipmentData;

        // Calculate distance (simplified - use actual distance calculation in production)
        const distance = 50; // Default distance in km

        const options = [
            {
                tier: 'standard',
                name: 'Standard Shipping',
                description: 'Regular shipping with diesel vehicles',
                co2Emissions: calculateEmissions({
                    vehicleType: 'diesel_truck_medium',
                    distance,
                    weight: weight || 100,
                    loadFactor: 0.5
                }),
                estimatedDays: 3,
                price: 100,
                ecoFriendly: false
            },
            {
                tier: 'eco',
                name: 'Eco-Friendly Shipping',
                description: 'Hybrid vehicles with reduced emissions',
                co2Emissions: calculateEmissions({
                    vehicleType: 'hybrid_car',
                    distance,
                    weight: weight || 100,
                    loadFactor: 0.6
                }),
                estimatedDays: 4,
                price: 120,
                ecoFriendly: true
            },
            {
                tier: 'premium-eco',
                name: 'Premium Eco Shipping',
                description: 'Electric vehicles with zero tailpipe emissions',
                co2Emissions: calculateEmissions({
                    vehicleType: 'electric_car',
                    distance,
                    weight: weight || 100,
                    loadFactor: 0.7,
                    country: 'ethiopia'
                }),
                estimatedDays: 5,
                price: 150,
                ecoFriendly: true
            }
        ];

        return options;
    }

    /**
     * Calculate carbon offset cost
     */
    calculateOffsetCost(co2e, provider = 'tree_planting') {
        const costPerKg = OFFSET_COSTS[provider] || OFFSET_COSTS.tree_planting;
        return co2e * costPerKg;
    }

    /**
     * Generate carbon report
     */
    async generateReport(clientId, startDate, endDate) {
        try {
            const summary = await this.getClientCarbonSummary(clientId, startDate, endDate);
            const trend = await this.getCarbonTrend(clientId);

            // Get top emitting shipments
            const topEmitters = await CarbonFootprint.find({ 
                clientId 
            })
            .sort({ 'totalEmissions.co2e': -1 })
            .limit(10)
            .populate('shipmentId', 'trackingNumber');

            return {
                summary,
                trend,
                topEmitters,
                generatedAt: new Date().toISOString(),
                period: { startDate, endDate }
            };
        } catch (error) {
            console.error('❌ Generate report error:', error.message);
            throw error;
        }
    }
}

module.exports = new CarbonCalculationService();