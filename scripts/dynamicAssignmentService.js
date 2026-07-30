// backend/services/dynamicAssignmentService.js

const Shipment = require('../models/Shipment');
const User = require('../models/User');
const DriverLocation = require('../models/DriverLocation');
const Rating = require('../models/Rating');

/**
 * 🧠 Dynamic Driver-Shipment Auto-Assignment Algorithm
 * 
 * Factors:
 * 1. Proximity (distance from driver to pickup) - 30%
 * 2. Current Load (active shipments) - 25%
 * 3. Driver Rating - 20%
 * 4. On-Time Delivery Rate - 15%
 * 5. Vehicle Type Match - 10%
 * 
 * + Bonus: Driver at warehouse location (+15)
 * + Bonus: Driver has 0 current load (+10)
 */

class DynamicAssignmentService {
    
    /**
     * 🎯 MAIN METHOD: Assign all pending shipments
     */
    async autoAssignAllShipments() {
        console.log('🧠 Starting Dynamic Assignment Engine...');
        
        const startTime = Date.now();

        // Get all pending unassigned shipments (FIFO)
        const pendingShipments = await Shipment.find({
            status: 'pending',
            assignedDriver: null
        }).sort({ createdAt: 1 });

        if (pendingShipments.length === 0) {
            console.log('📦 No pending shipments to assign');
            return { 
                success: true,
                assigned: 0, 
                unassigned: 0, 
                message: 'No pending shipments' 
            };
        }

        console.log(`📦 Found ${pendingShipments.length} pending shipments`);

        // Get all drivers
        const allDrivers = await User.find({
            role: 'driver'
        });

        if (allDrivers.length === 0) {
            console.log('⚠️ No drivers found');
            return { 
                success: true,
                assigned: 0, 
                unassigned: pendingShipments.length, 
                message: 'No drivers available' 
            };
        }

        // Get driver performance data
        const driverData = await this.getDriverData(allDrivers);
        
        console.log(`👤 Found ${driverData.length} drivers with data`);

        // Assign shipments
        const assignments = [];
        const unassigned = [];

        for (const shipment of pendingShipments) {
            const bestDriver = await this.findBestDriver(shipment, driverData);
            
            if (bestDriver) {
                const result = await this.assignShipment(shipment, bestDriver);
                if (result.success) {
                    assignments.push({
                        trackingNumber: shipment.trackingNumber,
                        driverName: bestDriver.driver.name,
                        score: bestDriver.score
                    });
                    // Update driver data after assignment
                    await this.updateDriverLoad(bestDriver.driver._id, driverData);
                } else {
                    unassigned.push(shipment.trackingNumber);
                }
            } else {
                unassigned.push(shipment.trackingNumber);
            }
        }

        const elapsed = Date.now() - startTime;
        console.log(`✅ Assigned ${assignments.length} shipments in ${elapsed}ms`);
        console.log(`📊 ${unassigned.length} shipments remain unassigned`);

        return {
            success: true,
            assigned: assignments.length,
            unassigned: unassigned.length,
            assignments: assignments,
            unassignedList: unassigned,
            timeElapsed: elapsed,
            message: `Assigned ${assignments.length} shipments to ${new Set(assignments.map(a => a.driverName)).size} drivers`
        };
    }

    /**
     * 📊 Get driver data with performance metrics
     */
    async getDriverData(drivers) {
        const driverData = [];

        for (const driver of drivers) {
            // Get current location (GPS)
            const location = await DriverLocation.findOne({ 
                driverId: driver._id 
            });

            // Count current active shipments
            const currentLoad = await Shipment.countDocuments({
                assignedDriver: driver._id,
                status: { $ne: 'delivered' }
            });

            // Get completed deliveries
            const completedDeliveries = await Shipment.countDocuments({
                assignedDriver: driver._id,
                status: 'delivered'
            });

            // Get delivery proof (deliveredAt vs estimatedDelivery)
            const completedShipments = await Shipment.find({
                assignedDriver: driver._id,
                status: 'delivered'
            });

            let onTimeCount = 0;
            let totalDays = 0;

            completedShipments.forEach(s => {
                if (s.deliveryProof?.deliveredAt && s.estimatedDelivery) {
                    const delivered = new Date(s.deliveryProof.deliveredAt);
                    const estimated = new Date(s.estimatedDelivery);
                    
                    const days = (delivered - estimated) / (1000 * 60 * 60 * 24);
                    totalDays += days;
                    
                    if (days <= 0) {
                        onTimeCount++;
                    }
                }
            });

            const onTimeRate = completedDeliveries > 0 
                ? (onTimeCount / completedDeliveries) * 100 
                : 50;

            // Get driver rating
            const ratingStats = await Rating.getDriverAverageRating(driver._id);
            const avgRating = ratingStats.averageRating || 5;

            // Vehicle capacity (max shipments)
            const maxCapacity = this.getVehicleCapacity(driver.vehicleType);

            driverData.push({
                driver: {
                    _id: driver._id,
                    name: driver.name,
                    email: driver.email,
                    phone: driver.phone,
                    vehicleType: driver.vehicleType || 'car',
                    rating: avgRating,
                    driverStatus: driver.driverStatus || 'offline'
                },
                location: location,
                currentLoad: currentLoad,
                completedDeliveries: completedDeliveries,
                onTimeRate: onTimeRate,
                maxCapacity: maxCapacity,
                avgDeliveryTime: completedDeliveries > 0 
                    ? (totalDays / completedDeliveries) 
                    : 0
            });
        }

        return driverData;
    }

    /**
     * 🚗 Get vehicle capacity (max simultaneous shipments)
     */
    getVehicleCapacity(vehicleType) {
        const capacities = {
            'bike': 1,
            'car': 2,
            'van': 4,
            'truck': 7,
            'heavy_truck': 10
        };
        return capacities[vehicleType] || 2;
    }

    /**
     * 🏆 Find the best driver for a shipment
     */
    async findBestDriver(shipment, driverData) {
        const scoredDrivers = [];

        for (const data of driverData) {
            // Skip if driver is at max capacity
            if (data.currentLoad >= data.maxCapacity) {
                continue;
            }

            // Skip if driver is offline with low rating
            if (data.driver.driverStatus === 'offline' && data.driver.rating < 4) {
                continue;
            }

            // Calculate score
            const score = await this.calculateScore(shipment, data);
            
            scoredDrivers.push({
                driver: data.driver,
                score: score,
                data: data
            });
        }

        // Sort by score (highest first)
        scoredDrivers.sort((a, b) => b.score - a.score);

        // Debug logging
        if (scoredDrivers.length > 0) {
            console.log(`🏆 Top driver: ${scoredDrivers[0].driver.name} (${scoredDrivers[0].score})`);
            if (scoredDrivers.length > 1) {
                console.log(`   Runner-up: ${scoredDrivers[1].driver.name} (${scoredDrivers[1].score})`);
            }
        }

        // Return best driver if score is above threshold
        if (scoredDrivers.length > 0 && scoredDrivers[0].score > 25) {
            return scoredDrivers[0];
        }

        return null;
    }

    /**
     * 🧮 Calculate driver-shipment compatibility score
     */
    async calculateScore(shipment, driverData) {
        let score = 0;

        // 1. Proximity Score (30%)
        const proximityScore = await this.calculateProximity(shipment, driverData);
        score += proximityScore * 0.30;

        // 2. Load Score (25%)
        const loadScore = this.calculateLoad(driverData);
        score += loadScore * 0.25;

        // 3. Rating Score (20%)
        const ratingScore = this.calculateRating(driverData);
        score += ratingScore * 0.20;

        // 4. On-Time Score (15%)
        const onTimeScore = this.calculateOnTime(driverData);
        score += onTimeScore * 0.15;

        // 5. Vehicle Match Score (10%)
        const vehicleScore = this.calculateVehicleMatch(shipment, driverData);
        score += vehicleScore * 0.10;

        // 🎁 BONUS: Driver at warehouse location
        if (driverData.location?.address?.toLowerCase().includes('warehouse')) {
            score += 15;
        }

        // 🎁 BONUS: Driver has 0 current load
        if (driverData.currentLoad === 0) {
            score += 10;
        }

        // 🎁 BONUS: High performing driver
        if (driverData.onTimeRate > 95) {
            score += 5;
        }

        return Math.round(Math.min(100, score));
    }

    /**
     * 📏 Calculate proximity score (0-100)
     */
    async calculateProximity(shipment, driverData) {
        const location = driverData.location;
        if (!location) {
            return 50; // Default if no GPS
        }

        try {
            const pickupLat = shipment.senderLat || 9.0245;
            const pickupLng = shipment.senderLng || 38.7485;
            const driverLat = location.lat;
            const driverLng = location.lng;

            const distance = this.haversineDistance(
                driverLat, driverLng,
                pickupLat, pickupLng
            );

            // Score: 100 for < 5km, 0 for > 50km
            if (distance < 5) return 100;
            if (distance < 10) return 80;
            if (distance < 20) return 60;
            if (distance < 30) return 40;
            if (distance < 50) return 20;
            return 0;

        } catch (error) {
            console.log('⚠️ Proximity calculation error:', error.message);
            return 50;
        }
    }

    /**
     * 📦 Calculate load score (0-100)
     */
    calculateLoad(driverData) {
        const loadRatio = driverData.currentLoad / driverData.maxCapacity;
        return Math.round((1 - loadRatio) * 100);
    }

    /**
     * ⭐ Calculate rating score (0-100)
     */
    calculateRating(driverData) {
        const rating = driverData.driver.rating || 5;
        return Math.round((rating / 5) * 100);
    }

    /**
     * ⏱️ Calculate on-time score (0-100)
     */
    calculateOnTime(driverData) {
        return Math.round(driverData.onTimeRate);
    }

    /**
     * 🚗 Calculate vehicle match score (0-100)
     */
    calculateVehicleMatch(shipment, driverData) {
        const vehicleType = driverData.driver.vehicleType;
        const weight = shipment.weight || 0;

        // Heavy truck can carry anything
        if (vehicleType === 'heavy_truck') return 100;
        if (vehicleType === 'truck' && weight < 500) return 100;
        if (vehicleType === 'van' && weight < 200) return 100;
        if (vehicleType === 'car' && weight < 50) return 100;
        if (vehicleType === 'bike' && weight < 20) return 100;

        // Not matching
        return 20;
    }

    /**
     * 🌍 Haversine distance calculation
     */
    haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    /**
     * ✅ Assign shipment to driver
     */
    async assignShipment(shipment, bestDriver) {
        try {
            const driver = bestDriver.driver;

            // Update shipment
            shipment.assignedDriver = driver._id;
            shipment.assignedDriverName = driver.name;
            shipment.assignedAt = new Date();
            await shipment.save();

            // Update driver
            await User.findByIdAndUpdate(driver._id, {
                $push: { assignedShipments: shipment._id }
            });

            // Update driver status
            await User.findByIdAndUpdate(driver._id, {
                driverStatus: 'on_delivery'
            });

            // 🔔 Create notification for driver
            try {
                const { createNotification } = require('../routes/notification');
                await createNotification(
                    driver._id,
                    '📦 New Shipment Assigned',
                    `You have been automatically assigned to shipment ${shipment.trackingNumber}. Pickup: ${shipment.senderAddress}`,
                    'info',
                    shipment.trackingNumber
                );

                // 🔔 Notify customer
                await createNotification(
                    shipment.userId,
                    '🚚 Driver Assigned',
                    `Driver ${driver.name} has been assigned to your shipment ${shipment.trackingNumber}.`,
                    'success',
                    shipment.trackingNumber
                );
            } catch (notifError) {
                console.log('⚠️ Notification error:', notifError.message);
            }

            console.log(`✅ Assigned ${shipment.trackingNumber} to ${driver.name}`);

            return { success: true };

        } catch (error) {
            console.error(`❌ Failed to assign ${shipment.trackingNumber}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 🔄 Update driver load after assignment
     */
    async updateDriverLoad(driverId, driverData) {
        const data = driverData.find(d => 
            d.driver._id.toString() === driverId.toString()
        );
        if (data) {
            data.currentLoad += 1;
        }
    }

    /**
     * 🎯 Assign a single shipment
     */
    async assignSingleShipment(trackingNumber) {
        const shipment = await Shipment.findOne({ 
            trackingNumber, 
            assignedDriver: null 
        });

        if (!shipment) {
            return { success: false, message: 'Shipment not found or already assigned' };
        }

        const drivers = await User.find({ role: 'driver' });
        if (drivers.length === 0) {
            return { success: false, message: 'No drivers available' };
        }

        const driverData = await this.getDriverData(drivers);
        const bestDriver = await this.findBestDriver(shipment, driverData);

        if (!bestDriver) {
            return { success: false, message: 'No suitable driver found' };
        }

        const result = await this.assignShipment(shipment, bestDriver);
        
        if (result.success) {
            return {
                success: true,
                message: `Assigned to ${bestDriver.driver.name}`,
                driver: bestDriver.driver,
                score: bestDriver.score
            };
        }

        return result;
    }

    /**
     * 📊 Get assignment statistics
     */
    async getAssignmentStats() {
        const totalPending = await Shipment.countDocuments({
            status: 'pending',
            assignedDriver: null
        });

        const totalAssigned = await Shipment.countDocuments({
            status: { $ne: 'delivered' },
            assignedDriver: { $ne: null }
        });

        const totalDrivers = await User.countDocuments({ role: 'driver' });
        const availableDrivers = await User.countDocuments({
            role: 'driver',
            driverStatus: 'available'
        });

        // Average load per driver
        const drivers = await User.find({ role: 'driver' });
        let totalLoad = 0;
        for (const driver of drivers) {
            const load = await Shipment.countDocuments({
                assignedDriver: driver._id,
                status: { $ne: 'delivered' }
            });
            totalLoad += load;
        }

        const avgLoad = drivers.length > 0 ? (totalLoad / drivers.length).toFixed(1) : 0;

        return {
            pendingShipments: totalPending,
            assignedShipments: totalAssigned,
            availableDrivers: availableDrivers,
            totalDrivers: totalDrivers,
            averageDriverLoad: avgLoad,
            utilizationRate: totalDrivers > 0 
                ? Math.round(((totalDrivers - availableDrivers) / totalDrivers) * 100) 
                : 0
        };
    }

    /**
     * 📋 Get assignment history (last 50)
     */
    async getAssignmentHistory(limit = 50) {
        const shipments = await Shipment.find({
            assignedAt: { $ne: null }
        })
        .sort({ assignedAt: -1 })
        .limit(limit)
        .select('trackingNumber assignedDriverName assignedAt')
        .lean();

        return shipments.map(s => ({
            trackingNumber: s.trackingNumber,
            driverName: s.assignedDriverName || 'Unknown',
            assignedAt: s.assignedAt
        }));
    }
}

module.exports = new DynamicAssignmentService();