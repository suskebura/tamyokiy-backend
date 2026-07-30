// backend/services/dynamicAssignmentService.js

const Shipment = require('../models/Shipment');
const User = require('../models/User');
const DriverLocation = require('../models/DriverLocation');
const Rating = require('../models/Rating');
const AssignmentLog = require('../models/AssignmentLog');

class DynamicAssignmentService {
    
    // ============================================================
    // 🎯 MAIN ASSIGNMENT ENGINE
    // ============================================================
    
    async autoAssignAllShipments() {
        console.log('🧠 Starting Dynamic Assignment Engine...');
        const startTime = Date.now();

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

        const allDrivers = await User.find({ 
            role: 'driver',
            isLocked: { $ne: true }
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

        const driverData = await this.getDriverData(allDrivers);
        console.log(`👤 Found ${driverData.length} drivers with data`);

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
                    
                    // Log assignment
                    await this.logAssignment(shipment, bestDriver.driver, bestDriver.scores);
                    
                    // Send notification
                    await this.notifyDriver(bestDriver.driver._id, shipment);
                    
                    // Update driver data
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

    // ============================================================
    // 📊 GET DRIVER DATA
    // ============================================================
    
    async getDriverData(drivers) {
        const driverData = [];

        for (const driver of drivers) {
            const location = await DriverLocation.findOne({ driverId: driver._id });
            const currentLoad = await Shipment.countDocuments({
                assignedDriver: driver._id,
                status: { $ne: 'delivered' }
            });
            const completedDeliveries = await Shipment.countDocuments({
                assignedDriver: driver._id,
                status: 'delivered'
            });

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
                    if (days <= 0) onTimeCount++;
                }
            });

            const onTimeRate = completedDeliveries > 0 ? (onTimeCount / completedDeliveries) * 100 : 50;
            const ratingStats = await Rating.getDriverAverageRating(driver._id);
            const avgRating = ratingStats.averageRating || 5;
            const maxCapacity = this.getVehicleCapacity(driver.vehicleType);

            // Check if driver is available based on schedule
            const isAvailable = this.isDriverAvailable(driver);

            driverData.push({
                driver: {
                    _id: driver._id,
                    name: driver.name,
                    email: driver.email,
                    phone: driver.phone,
                    vehicleType: driver.vehicleType || 'car',
                    rating: avgRating,
                    driverStatus: driver.driverStatus || 'offline',
                    preferredAreas: driver.preferredAreas || [],
                    maxDistance: driver.maxDistance || 20
                },
                location: location,
                currentLoad: currentLoad,
                completedDeliveries: completedDeliveries,
                onTimeRate: onTimeRate,
                maxCapacity: maxCapacity,
                avgDeliveryTime: completedDeliveries > 0 ? (totalDays / completedDeliveries) : 0,
                isAvailable: isAvailable
            });
        }

        return driverData;
    }

    // ============================================================
    // ⏰ TIME WINDOW CHECKS
    // ============================================================
    
    isWithinTimeWindow(shipment) {
        if (!shipment.pickupWindow) return true;
        
        const now = new Date();
        const start = shipment.pickupWindow.start;
        const end = shipment.pickupWindow.end;
        
        if (start && end) {
            return now >= start && now <= end;
        }
        return true;
    }

    isDriverAvailable(driver) {
        // Check if driver is online
        if (driver.driverStatus === 'offline') return false;
        if (driver.driverStatus === 'busy') return false;
        
        // Check schedule
        const now = new Date();
        const currentHour = now.getHours();
        
        const shiftStart = parseInt(driver.shiftStart?.split(':')[0]) || 8;
        const shiftEnd = parseInt(driver.shiftEnd?.split(':')[0]) || 20;
        
        if (currentHour < shiftStart || currentHour > shiftEnd) return false;
        
        // Check working days
        const currentDay = now.getDay();
        if (driver.workingDays && !driver.workingDays.includes(currentDay)) {
            return false;
        }
        
        return true;
    }

    // ============================================================
    // 🚗 VEHICLE CAPACITY
    // ============================================================
    
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

    // ============================================================
    // 🏆 FIND BEST DRIVER
    // ============================================================
    
    async findBestDriver(shipment, driverData) {
        const scoredDrivers = [];

        for (const data of driverData) {
            // Check availability
            if (!data.isAvailable) continue;
            if (data.currentLoad >= data.maxCapacity) continue;
            
            // Check if driver is offline with low rating
            if (data.driver.driverStatus === 'offline' && data.driver.rating < 4) continue;
            
            // Check driver's preferred areas
            if (!this.isInPreferredArea(data.driver, shipment)) continue;

            // Calculate all scores
            const scores = await this.calculateAllScores(shipment, data);
            
            // Get dynamic weights
            const weights = this.getDynamicWeights(shipment, data);
            
            // Calculate total score
            const totalScore = 
                scores.proximity * weights.proximity +
                scores.load * weights.load +
                scores.rating * weights.rating +
                scores.onTime * weights.onTime +
                scores.vehicleMatch * weights.vehicle;
            
            scoredDrivers.push({
                driver: data.driver,
                score: Math.round(totalScore),
                scores: scores,
                weights: weights
            });
        }

        scoredDrivers.sort((a, b) => b.score - a.score);

        if (scoredDrivers.length > 0 && scoredDrivers[0].score > 25) {
            return scoredDrivers[0];
        }

        return null;
    }

    // ============================================================
    // 🧮 CALCULATE ALL SCORES
    // ============================================================
    
    async calculateAllScores(shipment, driverData) {
        return {
            proximity: await this.calculateProximity(shipment, driverData),
            load: this.calculateLoad(driverData),
            rating: this.calculateRating(driverData),
            onTime: this.calculateOnTime(driverData),
            vehicleMatch: this.calculateVehicleMatch(shipment, driverData)
        };
    }

    // ============================================================
    // ⚖️ DYNAMIC WEIGHTS
    // ============================================================
    
    getDynamicWeights(shipment, driverData) {
        let weights = {
            proximity: 0.30,
            load: 0.25,
            rating: 0.20,
            onTime: 0.15,
            vehicle: 0.10
        };
        
        // Adjust weights based on business rules
        
        // 1. During peak hours, prioritize proximity
        const hour = new Date().getHours();
        if (hour >= 7 && hour <= 9 || hour >= 16 && hour <= 19) {
            weights.proximity += 0.10;
            weights.load -= 0.05;
            weights.onTime -= 0.05;
        }
        
        // 2. For urgent shipments, prioritize rating and on-time
        if (shipment.serviceType === 'overnight' || shipment.serviceType === 'express') {
            weights.rating += 0.10;
            weights.onTime += 0.10;
            weights.proximity -= 0.10;
            weights.load -= 0.10;
        }
        
        // 3. For heavy shipments, prioritize vehicle match
        if (shipment.weight > 50) {
            weights.vehicle += 0.15;
            weights.load -= 0.05;
            weights.rating -= 0.05;
            weights.proximity -= 0.05;
        }
        
        // Normalize weights to sum to 1
        const total = Object.values(weights).reduce((a, b) => a + b, 0);
        Object.keys(weights).forEach(key => {
            weights[key] = weights[key] / total;
        });
        
        return weights;
    }

    // ============================================================
    // 📏 PROXIMITY SCORE
    // ============================================================
    
    async calculateProximity(shipment, driverData) {
        const location = driverData.location;
        if (!location) return 50;

        try {
            const pickupLat = shipment.senderLat || 9.0245;
            const pickupLng = shipment.senderLng || 38.7485;
            const driverLat = location.lat;
            const driverLng = location.lng;

            const distance = this.haversineDistance(driverLat, driverLng, pickupLat, pickupLng);
            
            // Check if within driver's max distance
            if (distance > driverData.driver.maxDistance) return 0;

            if (distance < 5) return 100;
            if (distance < 10) return 80;
            if (distance < 20) return 60;
            if (distance < 30) return 40;
            if (distance < 50) return 20;
            return 0;
        } catch (error) {
            return 50;
        }
    }

    // ============================================================
    // 📦 LOAD SCORE
    // ============================================================
    
    calculateLoad(driverData) {
        const loadRatio = driverData.currentLoad / driverData.maxCapacity;
        return Math.round((1 - loadRatio) * 100);
    }

    // ============================================================
    // ⭐ RATING SCORE
    // ============================================================
    
    calculateRating(driverData) {
        const rating = driverData.driver.rating || 5;
        return Math.round((rating / 5) * 100);
    }

    // ============================================================
    // ⏱️ ON-TIME SCORE
    // ============================================================
    
    calculateOnTime(driverData) {
        return Math.round(driverData.onTimeRate);
    }

    // ============================================================
    // 🚗 VEHICLE MATCH SCORE
    // ============================================================
    
    calculateVehicleMatch(shipment, driverData) {
        const vehicleType = driverData.driver.vehicleType;
        const weight = shipment.weight || 0;

        if (vehicleType === 'heavy_truck') return 100;
        if (vehicleType === 'truck' && weight < 500) return 100;
        if (vehicleType === 'van' && weight < 200) return 100;
        if (vehicleType === 'car' && weight < 50) return 100;
        if (vehicleType === 'bike' && weight < 20) return 100;
        return 20;
    }

    // ============================================================
    // 🗺️ HAVERSINE DISTANCE
    // ============================================================
    
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

    // ============================================================
    // ✅ ASSIGN SHIPMENT
    // ============================================================
    
    async assignShipment(shipment, bestDriver) {
        try {
            const driver = bestDriver.driver;

            shipment.assignedDriver = driver._id;
            shipment.assignedDriverName = driver.name;
            shipment.assignedAt = new Date();
            shipment.assignmentAttempts = (shipment.assignmentAttempts || 0) + 1;
            shipment.lastAssignmentAttempt = new Date();
            await shipment.save();

            await User.findByIdAndUpdate(driver._id, {
                $push: { assignedShipments: shipment._id },
                driverStatus: 'on_delivery'
            });

            console.log(`✅ Assigned ${shipment.trackingNumber} to ${driver.name}`);
            return { success: true };
        } catch (error) {
            console.error(`❌ Failed to assign ${shipment.trackingNumber}:`, error);
            return { success: false, error: error.message };
        }
    }

    // ============================================================
    // 📝 LOG ASSIGNMENT
    // ============================================================
    
    async logAssignment(shipment, driver, scores) {
        try {
            const log = new AssignmentLog({
                shipmentId: shipment._id,
                trackingNumber: shipment.trackingNumber,
                driverId: driver._id,
                driverName: driver.name,
                score: scores.total || 0,
                factors: {
                    proximity: scores.proximity || 0,
                    load: scores.load || 0,
                    rating: scores.rating || 0,
                    onTime: scores.onTime || 0,
                    vehicleMatch: scores.vehicleMatch || 0
                }
            });
            await log.save();
            return log;
        } catch (error) {
            console.error('Log assignment error:', error);
            return null;
        }
    }

    // ============================================================
    // 🔔 NOTIFY DRIVER
    // ============================================================
    
    async notifyDriver(driverId, shipment) {
        try {
            // Database notification
            try {
                const { createNotification } = require('../routes/notification');
                await createNotification(
                    driverId,
                    '📦 New Shipment Assigned',
                    `You have been assigned to shipment ${shipment.trackingNumber}. Pickup: ${shipment.senderAddress}`,
                    'info',
                    shipment.trackingNumber
                );
            } catch (e) {
                console.log('Notification skipped:', e.message);
            }
            
        } catch (error) {
            console.log('Notify driver error:', error.message);
        }
    }

    // ============================================================
    // 🔄 UPDATE DRIVER LOAD
    // ============================================================
    
    async updateDriverLoad(driverId, driverData) {
        const data = driverData.find(d => d.driver._id.toString() === driverId.toString());
        if (data) data.currentLoad += 1;
    }

    // ============================================================
    // 🎯 PREFERRED AREA CHECK
    // ============================================================
    
    isInPreferredArea(driver, shipment) {
        if (!driver.preferredAreas || driver.preferredAreas.length === 0) {
            return true;
        }
        
        const shipmentCity = shipment.senderAddress?.split(',').pop()?.trim() || '';
        return driver.preferredAreas.some(area => 
            shipmentCity.toLowerCase().includes(area.toLowerCase())
        );
    }

    // ============================================================
    // ❌ HANDLE DRIVER REJECTION
    // ============================================================
    
    async handleDriverRejection(trackingNumber, driverId, reason) {
        try {
            // Log rejection
            await AssignmentLog.findOneAndUpdate(
                { trackingNumber, driverId },
                { 
                    rejectedAt: new Date(), 
                    rejectionReason: reason,
                    status: 'rejected'
                }
            );
            
            // Remove from driver's assigned shipments
            await User.findByIdAndUpdate(driverId, {
                $pull: { assignedShipments: trackingNumber }
            });
            
            // Reset shipment status
            await Shipment.findOneAndUpdate(
                { trackingNumber },
                { 
                    assignedDriver: null, 
                    assignedDriverName: null
                }
            );
            
            // Re-run auto-assignment
            const result = await this.autoAssignAllShipments();
            console.log(`🔄 Re-assigned shipment ${trackingNumber} after rejection`);
            
            return result;
        } catch (error) {
            console.error('Handle rejection error:', error);
            return null;
        }
    }

    // ============================================================
    // 🎯 ASSIGN SINGLE SHIPMENT
    // ============================================================
    
    async assignSingleShipment(trackingNumber) {
        const shipment = await Shipment.findOne({ trackingNumber, assignedDriver: null });
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
            await this.logAssignment(shipment, bestDriver.driver, bestDriver.scores);
            await this.notifyDriver(bestDriver.driver._id, shipment);
            return {
                success: true,
                message: `Assigned to ${bestDriver.driver.name}`,
                driver: bestDriver.driver,
                score: bestDriver.score
            };
        }
        return result;
    }

    // ============================================================
    // 📊 GET ASSIGNMENT STATS
    // ============================================================
    
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

        // Get assignment success rate
        const totalAssignments = await AssignmentLog.countDocuments();
        const acceptedAssignments = await AssignmentLog.countDocuments({ status: 'accepted' });
        const successRate = totalAssignments > 0 ? Math.round((acceptedAssignments / totalAssignments) * 100) : 0;

        return {
            pendingShipments: totalPending,
            assignedShipments: totalAssigned,
            availableDrivers: availableDrivers,
            totalDrivers: totalDrivers,
            averageDriverLoad: avgLoad,
            utilizationRate: totalDrivers > 0 ? Math.round(((totalDrivers - availableDrivers) / totalDrivers) * 100) : 0,
            assignmentSuccessRate: successRate,
            totalAssignments: totalAssignments
        };
    }

    // ============================================================
    // 📋 GET ASSIGNMENT HISTORY
    // ============================================================
    
    async getAssignmentHistory(limit = 50, status = null) {
        let query = {};
        if (status) query.status = status;
        
        const logs = await AssignmentLog.find(query)
            .sort({ assignedAt: -1 })
            .limit(limit)
            .populate('shipmentId', 'trackingNumber senderName receiverName amount')
            .lean();

        return logs.map(log => ({
            trackingNumber: log.trackingNumber,
            driverName: log.driverName,
            score: log.score,
            status: log.status,
            assignedAt: log.assignedAt,
            acceptedAt: log.acceptedAt,
            rejectedAt: log.rejectedAt,
            rejectionReason: log.rejectionReason,
            factors: log.factors
        }));
    }

    // ============================================================
    // 📈 GET DRIVER PERFORMANCE METRICS
    // ============================================================
    
    async getDriverPerformanceMetrics(driverId) {
        const logs = await AssignmentLog.find({ driverId });
        
        const total = logs.length;
        const accepted = logs.filter(l => l.status === 'accepted').length;
        const rejected = logs.filter(l => l.status === 'rejected').length;
        const completed = logs.filter(l => l.status === 'completed').length;
        
        const avgScore = total > 0 ? logs.reduce((sum, l) => sum + l.score, 0) / total : 0;
        const acceptanceRate = total > 0 ? Math.round((accepted / total) * 100) : 0;
        const completionRate = accepted > 0 ? Math.round((completed / accepted) * 100) : 0;
        
        return {
            driverId,
            totalAssignments: total,
            accepted: accepted,
            rejected: rejected,
            completed: completed,
            averageScore: Math.round(avgScore),
            acceptanceRate: acceptanceRate,
            completionRate: completionRate
        };
    }
}

module.exports = new DynamicAssignmentService();