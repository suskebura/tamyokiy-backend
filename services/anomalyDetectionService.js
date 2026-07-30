// services/anomalyDetectionService.js
// ✅ CORRECTED - No duplicate User import

const Shipment = require('../models/Shipment');
const User = require('../models/User');              // ✅ Only ONE import
const AnomalyLog = require('../models/AnomalyLog');
const Payment = require('../models/Payment');
const DriverLocation = require('../models/DriverLocation');

class AnomalyDetectionService {
    
    // ============================================================
    // 🚀 MAIN DETECTION ENGINE - Run this periodically
    // ============================================================
    
    async runFullDetection() {
        console.log('🔍 Running anomaly detection...');
        const results = {
            anomalies: [],
            counts: {
                tooFast: 0,
                repeatedFailed: 0,
                fakeProofs: 0,
                paymentFraud: 0,
                unusualRoutes: 0,
                multipleFailures: 0,
                driverAbuse: 0
            }
        };
        
        try {
            // Run all detectors
            const [fastDeliveries, repeatedFailed, fakeProofs, paymentFraud, unusualRoutes, multipleFailures, driverAbuse] = await Promise.all([
                this.detectTooFastDeliveries(),
                this.detectRepeatedFailedDeliveries(),
                this.detectFakeDeliveryProofs(),
                this.detectPaymentFraud(),
                this.detectUnusualRoutes(),
                this.detectMultipleFailuresSameCustomer(),
                this.detectDriverAbusePatterns()
            ]);
            
            results.anomalies = [...fastDeliveries, ...repeatedFailed, ...fakeProofs, ...paymentFraud, ...unusualRoutes, ...multipleFailures, ...driverAbuse];
            results.counts.tooFast = fastDeliveries.length;
            results.counts.repeatedFailed = repeatedFailed.length;
            results.counts.fakeProofs = fakeProofs.length;
            results.counts.paymentFraud = paymentFraud.length;
            results.counts.unusualRoutes = unusualRoutes.length;
            results.counts.multipleFailures = multipleFailures.length;
            results.counts.driverAbuse = driverAbuse.length;
            
            console.log(`✅ Detection complete: ${results.anomalies.length} anomalies found`);
            console.log(`   📊 Too Fast: ${results.counts.tooFast}`);
            console.log(`   📊 Repeated Failed: ${results.counts.repeatedFailed}`);
            console.log(`   📊 Fake Proofs: ${results.counts.fakeProofs}`);
            console.log(`   📊 Payment Fraud: ${results.counts.paymentFraud}`);
            console.log(`   📊 Unusual Routes: ${results.counts.unusualRoutes}`);
            console.log(`   📊 Multiple Failures: ${results.counts.multipleFailures}`);
            console.log(`   📊 Driver Abuse: ${results.counts.driverAbuse}`);
            
            // 🧠 AI-Powered risk scoring for each anomaly
            for (const anomaly of results.anomalies) {
                try {
                    const aiScore = await this.calculateAIScore(anomaly);
                    anomaly.score = aiScore.score;
                    anomaly.aiFactors = aiScore.factors;
                    anomaly.aiConfidence = aiScore.confidence;
                    await anomaly.save();
                } catch (aiErr) {
                    console.log(`⚠️ AI scoring error for ${anomaly._id}:`, aiErr.message);
                }
            }
            
            // 🚫 Auto-block suspicious drivers
            const driverIds = [...new Set(results.anomalies.map(a => a.driverId).filter(Boolean))];
            for (const driverId of driverIds) {
                try {
                    const driverAnomalies = results.anomalies.filter(a => 
                        a.driverId?.toString() === driverId?.toString()
                    );
                    const criticalAnomalies = driverAnomalies.filter(a => 
                        a.severity === 'critical' || a.severity === 'high'
                    );
                    if (criticalAnomalies.length >= 2) {
                        await this.autoBlockDriver(driverId, criticalAnomalies[0]);
                    }
                } catch (blockErr) {
                    console.log(`⚠️ Auto-block error for driver ${driverId}:`, blockErr.message);
                }
            }
            
            return results;
            
        } catch (err) {
            console.error('❌ Detection error:', err);
            return { ...results, error: err.message };
        }
    }
    
    // ============================================================
    // 🧠 AI-Powered Risk Scoring
    // ============================================================
    
    async calculateAIScore(anomaly, driverData = null) {
        let score = 0;
        let factors = [];
        let confidence = 'medium';
        
        try {
            // 1. Driver History (30%)
            if (anomaly.driverId) {
                const driverHistory = await this.getDriverHistory(anomaly.driverId);
                if (driverHistory.failureRate > 30) {
                    score += 30;
                    factors.push('High failure rate');
                } else if (driverHistory.failureRate > 20) {
                    score += 15;
                    factors.push('Moderate failure rate');
                }
                if (driverHistory.rating < 3) {
                    score += 10;
                    factors.push('Low driver rating');
                }
            }
            
            // 2. Time Pattern (20%)
            if (anomaly.createdAt) {
                const hour = new Date(anomaly.createdAt).getHours();
                if (hour < 6 || hour > 22) {
                    score += 20;
                    factors.push('Unusual delivery time');
                } else if (hour > 20 || hour < 8) {
                    score += 10;
                    factors.push('Late/early delivery');
                }
            }
            
            // 3. Customer History (15%)
            if (anomaly.userId) {
                const customerHistory = await this.getCustomerHistory(anomaly.userId);
                if (customerHistory.failedDeliveries > 3) {
                    score += 15;
                    factors.push('Customer has multiple failures');
                } else if (customerHistory.failedDeliveries > 1) {
                    score += 8;
                    factors.push('Customer has previous failures');
                }
            }
            
            // 4. Geographic Pattern (15%)
            if (anomaly.evidence?.distance) {
                const distance = parseFloat(anomaly.evidence.distance);
                if (distance > 50) {
                    score += 15;
                    factors.push('Very long distance delivery');
                } else if (distance > 30) {
                    score += 10;
                    factors.push('Long distance delivery');
                }
            }
            
            // 5. Recent Activity (10%)
            if (anomaly.driverId) {
                const recentActivity = await this.getRecentActivity(anomaly.driverId);
                if (recentActivity.deliveriesToday > 20) {
                    score += 10;
                    factors.push('Unusually high volume today');
                } else if (recentActivity.deliveriesToday > 15) {
                    score += 5;
                    factors.push('High volume today');
                }
            }
            
            // 6. Anomaly Type Weight (10%)
            const typeWeights = {
                'too_fast_delivery': 10,
                'repeated_failed_delivery': 15,
                'fake_delivery_proof': 20,
                'payment_fraud': 25,
                'unusual_route': 10,
                'multiple_failed_same_customer': 12,
                'driver_abuse': 20
            };
            score += (typeWeights[anomaly.type] || 10);
            
            // Determine confidence
            if (score > 70) {
                confidence = 'high';
            } else if (score > 40) {
                confidence = 'medium';
            } else {
                confidence = 'low';
            }
            
        } catch (err) {
            console.error('AI Scoring error:', err);
        }
        
        return {
            score: Math.min(100, Math.round(score)),
            factors: factors.slice(0, 5), // Limit to top 5 factors
            confidence: confidence
        };
    }
    
    // ============================================================
    // 🚫 Auto-Block Suspicious Drivers
    // ============================================================
    
    async autoBlockDriver(driverId, anomaly) {
        try {
            const driver = await User.findById(driverId);
            if (!driver) {
                console.log(`⚠️ Driver ${driverId} not found`);
                return false;
            }
            
            // Check if already locked
            if (driver.isLocked) {
                console.log(`🔒 Driver ${driver.name} is already locked`);
                return false;
            }
            
            // Get confirmed anomalies for this driver
            const anomalies = await AnomalyLog.find({
                driverId: driverId,
                status: 'confirmed',
                severity: { $in: ['high', 'critical'] }
            });
            
            // If 3 or more confirmed critical/high anomalies, auto-block
            if (anomalies.length >= 3) {
                driver.isLocked = true;
                driver.lockReason = `🔒 Auto-blocked by Anomaly Detection System - ${anomalies.length} confirmed anomalies detected. Please contact support.`;
                driver.lockedAt = new Date();
                await driver.save();
                
                console.log(`🚫 Driver ${driver.name} (${driver.email}) auto-blocked - ${anomalies.length} confirmed anomalies`);
                
                // Send alert
                await this.sendAnomalyAlert(anomaly);
                return true;
            }
            
            return false;
            
        } catch (err) {
            console.error('Auto-block error:', err);
            return false;
        }
    }
    
    // ============================================================
    // 📊 Get Driver History
    // ============================================================
    
    async getDriverHistory(driverId) {
        try {
            const shipments = await Shipment.find({ assignedDriver: driverId });
            const failedDeliveries = shipments.filter(s => s.status === 'failed').length;
            const totalDeliveries = shipments.length;
            const deliveredDeliveries = shipments.filter(s => s.status === 'delivered').length;
            
            // Get driver rating
            const driver = await User.findById(driverId);
            const rating = driver?.rating || 5;
            
            return {
                failedDeliveries,
                totalDeliveries,
                deliveredDeliveries,
                failureRate: totalDeliveries > 0 ? (failedDeliveries / totalDeliveries) * 100 : 0,
                rating: rating
            };
        } catch (err) {
            console.error('Get driver history error:', err);
            return {
                failedDeliveries: 0,
                totalDeliveries: 0,
                deliveredDeliveries: 0,
                failureRate: 0,
                rating: 5
            };
        }
    }
    
    // ============================================================
    // 📊 Get Customer History
    // ============================================================
    
    async getCustomerHistory(userId) {
        try {
            const shipments = await Shipment.find({ userId: userId });
            const failedDeliveries = shipments.filter(s => s.status === 'failed').length;
            const totalDeliveries = shipments.length;
            const deliveredDeliveries = shipments.filter(s => s.status === 'delivered').length;
            
            return {
                failedDeliveries,
                totalDeliveries,
                deliveredDeliveries,
                failureRate: totalDeliveries > 0 ? (failedDeliveries / totalDeliveries) * 100 : 0
            };
        } catch (err) {
            console.error('Get customer history error:', err);
            return {
                failedDeliveries: 0,
                totalDeliveries: 0,
                deliveredDeliveries: 0,
                failureRate: 0
            };
        }
    }
    
    // ============================================================
    // 📊 Get Recent Activity
    // ============================================================
    
    async getRecentActivity(driverId) {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const deliveriesToday = await Shipment.countDocuments({
                assignedDriver: driverId,
                createdAt: { $gte: today }
            });
            
            const deliveriesThisWeek = await Shipment.countDocuments({
                assignedDriver: driverId,
                createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
            });
            
            return {
                deliveriesToday,
                deliveriesThisWeek,
                averageDaily: Math.round(deliveriesThisWeek / 7)
            };
        } catch (err) {
            console.error('Get recent activity error:', err);
            return {
                deliveriesToday: 0,
                deliveriesThisWeek: 0,
                averageDaily: 0
            };
        }
    }
    
    // ============================================================
    // 1. 🚗 DETECT TOO FAST DELIVERIES
    // ============================================================
    
    async detectTooFastDeliveries() {
        console.log('🚗 Checking for too-fast deliveries...');
        const anomalies = [];
        
        // Get deliveries from last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const deliveries = await Shipment.find({
            status: 'delivered',
            'deliveryProof.deliveredAt': { $gte: sevenDaysAgo }
        }).populate('assignedDriver', 'name email');
        
        for (const delivery of deliveries) {
            if (!delivery.deliveryProof?.deliveredAt || !delivery.createdAt) continue;
            
            const createdAt = new Date(delivery.createdAt);
            const deliveredAt = new Date(delivery.deliveryProof.deliveredAt);
            const minutes = (deliveredAt - createdAt) / (1000 * 60);
            
            // Flag if delivered too fast (less than 10 minutes)
            if (minutes < 10 && delivery.distance && delivery.distance > 5) {
                const driver = delivery.assignedDriver;
                
                // Check if this driver has multiple too-fast deliveries
                const driverFastCount = await Shipment.countDocuments({
                    assignedDriver: delivery.assignedDriver,
                    status: 'delivered',
                    'deliveryProof.deliveredAt': { $gte: sevenDaysAgo },
                    $expr: {
                        $lt: [
                            { $subtract: ['$deliveryProof.deliveredAt', '$createdAt'] },
                            10 * 60 * 1000 // 10 minutes in milliseconds
                        ]
                    }
                });
                
                const severity = driverFastCount > 3 ? 'high' : driverFastCount > 1 ? 'medium' : 'low';
                const score = Math.min(100, 20 + (driverFastCount * 15));
                
                const anomaly = await this.saveAnomaly({
                    type: 'too_fast_delivery',
                    driverId: delivery.assignedDriver,
                    driverName: driver?.name || 'Unknown',
                    trackingNumber: delivery.trackingNumber,
                    shipmentId: delivery._id,
                    severity: severity,
                    score: score,
                    description: `Shipment delivered in ${Math.round(minutes)} minutes (distance: ${delivery.distance}km)`,
                    evidence: {
                        minutes: Math.round(minutes),
                        distance: delivery.distance,
                        driverFastCount: driverFastCount,
                        createdAt: delivery.createdAt,
                        deliveredAt: delivery.deliveryProof.deliveredAt
                    }
                });
                
                if (anomaly) anomalies.push(anomaly);
            }
        }
        
        console.log(`   Found ${anomalies.length} too-fast deliveries`);
        return anomalies;
    }
    
    // ============================================================
    // 2. 🔄 DETECT REPEATED FAILED DELIVERIES
    // ============================================================
    
    async detectRepeatedFailedDeliveries() {
        console.log('🔄 Checking for repeated failed deliveries...');
        const anomalies = [];
        
        // Get drivers with multiple failed deliveries
        const drivers = await User.find({ role: 'driver' });
        
        for (const driver of drivers) {
            const failedCount = await Shipment.countDocuments({
                assignedDriver: driver._id,
                status: 'failed',
                createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
            });
            
            if (failedCount >= 3) {
                // Check if same reasons are being used repeatedly
                const shipments = await Shipment.find({
                    assignedDriver: driver._id,
                    status: 'failed'
                }).sort({ createdAt: -1 }).limit(10);
                
                const reasons = shipments.map(s => s.failureReason).filter(Boolean);
                const reasonCount = {};
                reasons.forEach(r => { reasonCount[r] = (reasonCount[r] || 0) + 1; });
                
                const topReason = Object.entries(reasonCount).sort((a, b) => b[1] - a[1])[0];
                
                const severity = failedCount > 5 ? 'high' : 'medium';
                const score = Math.min(100, 30 + (failedCount * 10));
                
                const anomaly = await this.saveAnomaly({
                    type: 'repeated_failed_delivery',
                    driverId: driver._id,
                    driverName: driver.name,
                    severity: severity,
                    score: score,
                    description: `Driver has ${failedCount} failed deliveries in 7 days. Most common reason: ${topReason?.[0] || 'Unknown'}`,
                    evidence: {
                        failedCount: failedCount,
                        reasons: reasonCount,
                        shipments: shipments.map(s => ({
                            trackingNumber: s.trackingNumber,
                            reason: s.failureReason,
                            date: s.createdAt
                        }))
                    }
                });
                
                if (anomaly) anomalies.push(anomaly);
            }
        }
        
        console.log(`   Found ${anomalies.length} drivers with repeated failures`);
        return anomalies;
    }
    
    // ============================================================
    // 3. 📸 DETECT FAKE DELIVERY PROOFS
    // ============================================================
    
    async detectFakeDeliveryProofs() {
        console.log('📸 Checking for fake delivery proofs...');
        const anomalies = [];
        
        // Check for deliveries with suspicious patterns
        const deliveries = await Shipment.find({
            status: 'delivered',
            'deliveryProof.deliveredAt': { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        });
        
        for (const delivery of deliveries) {
            if (!delivery.deliveryProof) continue;
            
            const proof = delivery.deliveryProof;
            let suspicious = false;
            let reasons = [];
            
            // Check for missing signature
            if (!proof.recipientSignature) {
                suspicious = true;
                reasons.push('No signature');
            }
            
            // Check for missing photo
            if (!proof.deliveryPhoto) {
                suspicious = true;
                reasons.push('No photo');
            }
            
            // Check delivery time (late night deliveries)
            const deliveredAt = new Date(proof.deliveredAt);
            const hour = deliveredAt.getHours();
            if (hour < 6 || hour > 22) {
                suspicious = true;
                reasons.push(`Delivered at ${hour}:00 (unusual hour)`);
            }
            
            // Check if driver has multiple suspicious deliveries
            if (suspicious) {
                const driverSuspiciousCount = await Shipment.countDocuments({
                    assignedDriver: delivery.assignedDriver,
                    status: 'delivered',
                    $or: [
                        { 'deliveryProof.recipientSignature': null },
                        { 'deliveryProof.deliveryPhoto': null },
                        { $expr: {
                            $or: [
                                { $lt: [{ $hour: '$deliveryProof.deliveredAt' }, 6] },
                                { $gt: [{ $hour: '$deliveryProof.deliveredAt' }, 22] }
                            ]
                        }}
                    ]
                });
                
                const severity = driverSuspiciousCount > 3 ? 'high' : 'medium';
                const score = Math.min(100, 20 + (driverSuspiciousCount * 10));
                
                const anomaly = await this.saveAnomaly({
                    type: 'fake_delivery_proof',
                    driverId: delivery.assignedDriver,
                    driverName: delivery.assignedDriverName || 'Unknown',
                    trackingNumber: delivery.trackingNumber,
                    shipmentId: delivery._id,
                    severity: severity,
                    score: score,
                    description: `Suspicious delivery proof: ${reasons.join(', ')}`,
                    evidence: {
                        reasons: reasons,
                        hasSignature: !!proof.recipientSignature,
                        hasPhoto: !!proof.deliveryPhoto,
                        deliveredAt: proof.deliveredAt,
                        driverSuspiciousCount: driverSuspiciousCount
                    }
                });
                
                if (anomaly) anomalies.push(anomaly);
            }
        }
        
        console.log(`   Found ${anomalies.length} suspicious proofs`);
        return anomalies;
    }
    
    // ============================================================
    // 4. 💳 DETECT PAYMENT FRAUD
    // ============================================================
    
    async detectPaymentFraud() {
        console.log('💳 Checking for payment fraud...');
        const anomalies = [];
        
        // Check payments in last 7 days
        const payments = await Payment.find({
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        }).populate('userId', 'name email');
        
        // Group by user
        const userPayments = {};
        payments.forEach(p => {
            const userId = p.userId?._id?.toString() || p.userId;
            if (!userPayments[userId]) {
                userPayments[userId] = {
                    user: p.userId,
                    payments: [],
                    totalAmount: 0,
                    count: 0
                };
            }
            userPayments[userId].payments.push(p);
            userPayments[userId].totalAmount += p.amount || 0;
            userPayments[userId].count += 1;
        });
        
        // Check for suspicious patterns
        for (const [userId, data] of Object.entries(userPayments)) {
            // Multiple payments in short time
            if (data.count > 5) {
                const times = data.payments.map(p => new Date(p.createdAt).getTime());
                const sorted = times.sort((a, b) => a - b);
                let clusters = 0;
                for (let i = 1; i < sorted.length; i++) {
                    if (sorted[i] - sorted[i-1] < 5 * 60 * 1000) { // 5 minutes
                        clusters++;
                    }
                }
                
                if (clusters > 2) {
                    const anomaly = await this.saveAnomaly({
                        type: 'payment_fraud',
                        userId: userId,
                        userEmail: data.user?.email || 'Unknown',
                        severity: 'high',
                        score: 70,
                        description: `User made ${data.count} payments in 7 days (${data.totalAmount.toFixed(2)} total) with ${clusters} rapid payments`,
                        evidence: {
                            paymentCount: data.count,
                            totalAmount: data.totalAmount,
                            clusters: clusters,
                            payments: data.payments.map(p => ({
                                trackingNumber: p.trackingNumber,
                                amount: p.amount,
                                date: p.createdAt,
                                status: p.status
                            }))
                        }
                    });
                    if (anomaly) anomalies.push(anomaly);
                }
            }
        }
        
        console.log(`   Found ${anomalies.length} potential payment fraud cases`);
        return anomalies;
    }
    
    // ============================================================
    // 5. 🗺️ DETECT UNUSUAL ROUTES
    // ============================================================
    
    async detectUnusualRoutes() {
        console.log('🗺️ Checking for unusual routes...');
        const anomalies = [];
        
        // Get deliveries with location data
        const deliveries = await Shipment.find({
            status: 'delivered',
            'deliveryProof.deliveredAt': { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
            senderLat: { $ne: null },
            receiverLat: { $ne: null }
        });
        
        for (const delivery of deliveries) {
            if (!delivery.assignedDriver) continue;
            
            // Get driver location history
            const locations = await DriverLocation.findOne({
                driverId: delivery.assignedDriver
            });
            
            if (!locations || !locations.history || locations.history.length < 3) continue;
            
            // Check if driver was near the delivery location
            const deliveredAt = new Date(delivery.deliveryProof?.deliveredAt || delivery.createdAt);
            const nearby = locations.history.filter(h => {
                const timeDiff = Math.abs(new Date(h.timestamp) - deliveredAt);
                if (timeDiff > 30 * 60 * 1000) return false; // Within 30 minutes
                
                const distance = this.haversineDistance(
                    h.lat, h.lng,
                    delivery.receiverLat, delivery.receiverLng
                );
                return distance < 1; // Within 1km
            });
            
            if (nearby.length === 0 && delivery.status === 'delivered') {
                const anomaly = await this.saveAnomaly({
                    type: 'unusual_route',
                    driverId: delivery.assignedDriver,
                    driverName: delivery.assignedDriverName || 'Unknown',
                    trackingNumber: delivery.trackingNumber,
                    shipmentId: delivery._id,
                    severity: 'medium',
                    score: 60,
                    description: `Driver not near delivery location at delivery time`,
                    evidence: {
                        driverLat: locations.history[locations.history.length - 1]?.lat,
                        driverLng: locations.history[locations.history.length - 1]?.lng,
                        receiverLat: delivery.receiverLat,
                        receiverLng: delivery.receiverLng,
                        deliveredAt: deliveredAt
                    }
                });
                if (anomaly) anomalies.push(anomaly);
            }
        }
        
        console.log(`   Found ${anomalies.length} unusual routes`);
        return anomalies;
    }
    
    // ============================================================
    // 6. 👤 DETECT MULTIPLE FAILURES SAME CUSTOMER
    // ============================================================
    
    async detectMultipleFailuresSameCustomer() {
        console.log('👤 Checking for multiple failures same customer...');
        const anomalies = [];
        
        // Get failed deliveries in last 14 days
        const failedDeliveries = await Shipment.find({
            status: 'failed',
            createdAt: { $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) }
        }).populate('userId', 'name email');
        
        const customerFailures = {};
        failedDeliveries.forEach(d => {
            const userId = d.userId?._id?.toString() || d.userId;
            if (!customerFailures[userId]) {
                customerFailures[userId] = {
                    user: d.userId,
                    shipments: [],
                    count: 0
                };
            }
            customerFailures[userId].shipments.push(d);
            customerFailures[userId].count += 1;
        });
        
        for (const [userId, data] of Object.entries(customerFailures)) {
            if (data.count >= 3) {
                const anomaly = await this.saveAnomaly({
                    type: 'multiple_failed_same_customer',
                    userId: userId,
                    userEmail: data.user?.email || 'Unknown',
                    severity: 'medium',
                    score: 40 + (data.count * 10),
                    description: `Customer had ${data.count} failed deliveries in 14 days`,
                    evidence: {
                        failedCount: data.count,
                        shipments: data.shipments.map(s => ({
                            trackingNumber: s.trackingNumber,
                            reason: s.failureReason,
                            date: s.createdAt,
                            driver: s.assignedDriverName
                        }))
                    }
                });
                if (anomaly) anomalies.push(anomaly);
            }
        }
        
        console.log(`   Found ${anomalies.length} customers with multiple failures`);
        return anomalies;
    }
    
    // ============================================================
    // 7. 🚫 DETECT DRIVER ABUSE PATTERNS
    // ============================================================
    
    async detectDriverAbusePatterns() {
        console.log('🚫 Checking for driver abuse patterns...');
        const anomalies = [];
        
        // Get drivers with high failure rates
        const drivers = await User.find({ role: 'driver' });
        
        for (const driver of drivers) {
            const totalDeliveries = await Shipment.countDocuments({
                assignedDriver: driver._id,
                status: { $in: ['delivered', 'failed'] },
                createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
            });
            
            if (totalDeliveries < 10) continue;
            
            const failedDeliveries = await Shipment.countDocuments({
                assignedDriver: driver._id,
                status: 'failed',
                createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
            });
            
            const failureRate = (failedDeliveries / totalDeliveries) * 100;
            
            if (failureRate > 30) {
                // Check if driver has changed behavior recently
                const recentFailures = await Shipment.countDocuments({
                    assignedDriver: driver._id,
                    status: 'failed',
                    createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
                });
                const recentTotal = await Shipment.countDocuments({
                    assignedDriver: driver._id,
                    status: { $in: ['delivered', 'failed'] },
                    createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
                });
                const recentFailureRate = recentTotal > 0 ? (recentFailures / recentTotal) * 100 : 0;
                
                const severity = failureRate > 50 ? 'critical' : failureRate > 40 ? 'high' : 'medium';
                const score = Math.min(100, 40 + (failureRate / 2));
                
                const anomaly = await this.saveAnomaly({
                    type: 'driver_abuse',
                    driverId: driver._id,
                    driverName: driver.name,
                    severity: severity,
                    score: Math.round(score),
                    description: `Driver has ${failureRate.toFixed(1)}% failure rate (${failedDeliveries}/${totalDeliveries})`,
                    evidence: {
                        totalDeliveries: totalDeliveries,
                        failedDeliveries: failedDeliveries,
                        failureRate: Math.round(failureRate * 10) / 10,
                        recentFailureRate: Math.round(recentFailureRate * 10) / 10,
                        rating: driver.rating,
                        completedDeliveries: driver.completedDeliveries
                    }
                });
                if (anomaly) anomalies.push(anomaly);
            }
        }
        
        console.log(`   Found ${anomalies.length} drivers with abuse patterns`);
        return anomalies;
    }
    
    // ============================================================
    // 💾 SAVE ANOMALY
    // ============================================================
    
    async saveAnomaly(data) {
        try {
            // Check if similar anomaly already exists
            const existing = await AnomalyLog.findOne({
                type: data.type,
                trackingNumber: data.trackingNumber,
                status: { $in: ['detected', 'investigating'] }
            });
            
            if (existing) {
                // Update existing
                existing.score = data.score;
                existing.severity = data.severity;
                existing.evidence = data.evidence;
                existing.updatedAt = new Date();
                await existing.save();
                return existing;
            }
            
            const anomaly = new AnomalyLog({
                ...data,
                createdAt: new Date(),
                updatedAt: new Date()
            });
            
            await anomaly.save();
            return anomaly;
            
        } catch (err) {
            console.error('Error saving anomaly:', err);
            return null;
        }
    }
    
    // ============================================================
    // 🗺️ HELPER: Haversine Distance
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
    // 📊 GET ANOMALY STATS
    // ============================================================
    
    async getStats() {
        const total = await AnomalyLog.countDocuments();
        const detected = await AnomalyLog.countDocuments({ status: 'detected' });
        const investigating = await AnomalyLog.countDocuments({ status: 'investigating' });
        const confirmed = await AnomalyLog.countDocuments({ status: 'confirmed' });
        const falseAlarm = await AnomalyLog.countDocuments({ status: 'false_alarm' });
        const resolved = await AnomalyLog.countDocuments({ status: 'resolved' });
        
        const byType = await AnomalyLog.aggregate([
            { $group: { _id: '$type', count: { $sum: 1 } } }
        ]);
        
        const bySeverity = await AnomalyLog.aggregate([
            { $group: { _id: '$severity', count: { $sum: 1 } } }
        ]);
        
        const recent = await AnomalyLog.find()
            .sort({ createdAt: -1 })
            .limit(10)
            .populate('driverId', 'name email')
            .populate('userId', 'name email');
        
        return {
            total,
            detected,
            investigating,
            confirmed,
            falseAlarm,
            resolved,
            byType,
            bySeverity,
            recent
        };
    }
    
    // ============================================================
    // 📊 CALCULATE RISK SCORE FOR A DRIVER
    // ============================================================
    
    async getDriverRiskScore(driverId) {
        const anomalies = await AnomalyLog.find({
            driverId: driverId,
            status: { $in: ['detected', 'investigating', 'confirmed'] }
        });
        
        if (anomalies.length === 0) {
            return 0;
        }
        
        let score = 0;
        const weight = {
            'low': 1,
            'medium': 2,
            'high': 3,
            'critical': 5
        };
        
        anomalies.forEach(a => {
            const severityWeight = weight[a.severity] || 1;
            const anomalyScore = a.score || 50;
            score += severityWeight * (anomalyScore / 100);
        });
        
        // Normalize to 0-100
        const maxPossibleScore = anomalies.length * 5; // Max weight 5 per anomaly
        const normalizedScore = maxPossibleScore > 0 ? (score / maxPossibleScore) * 100 : 0;
        
        return Math.min(100, Math.round(normalizedScore));
    }
    
    // ============================================================
    // 📊 GET ANOMALY TRENDS OVER TIME
    // ============================================================
    
    async getAnomalyTrends(days = 30) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        const trends = await AnomalyLog.aggregate([
            { $match: { createdAt: { $gte: startDate } } },
            { $group: {
                _id: { 
                    date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    type: '$type',
                    severity: '$severity'
                },
                count: { $sum: 1 }
            }},
            { $sort: { '_id.date': 1 } }
        ]);
        
        // Format for chart - daily totals
        const dailyTotals = {};
        const typeBreakdown = {};
        const severityBreakdown = {};
        
        trends.forEach(t => {
            const date = t._id.date;
            const type = t._id.type || 'unknown';
            const severity = t._id.severity || 'medium';
            
            // Daily totals
            if (!dailyTotals[date]) {
                dailyTotals[date] = {
                    total: 0,
                    byType: {},
                    bySeverity: { low: 0, medium: 0, high: 0, critical: 0 }
                };
            }
            dailyTotals[date].total += t.count;
            
            // By type
            if (!dailyTotals[date].byType[type]) {
                dailyTotals[date].byType[type] = 0;
            }
            dailyTotals[date].byType[type] += t.count;
            
            // By severity
            if (dailyTotals[date].bySeverity[severity] !== undefined) {
                dailyTotals[date].bySeverity[severity] += t.count;
            }
            
            // Overall type breakdown
            if (!typeBreakdown[type]) {
                typeBreakdown[type] = 0;
            }
            typeBreakdown[type] += t.count;
            
            // Overall severity breakdown
            if (!severityBreakdown[severity]) {
                severityBreakdown[severity] = 0;
            }
            severityBreakdown[severity] += t.count;
        });
        
        // Convert to arrays for charting
        const dates = Object.keys(dailyTotals).sort();
        const chartData = dates.map(date => ({
            date: date,
            total: dailyTotals[date].total,
            byType: dailyTotals[date].byType,
            bySeverity: dailyTotals[date].bySeverity
        }));
        
        return {
            daily: chartData,
            summary: {
                totalAnomalies: trends.reduce((sum, t) => sum + t.count, 0),
                byType: typeBreakdown,
                bySeverity: severityBreakdown,
                daysAnalyzed: days,
                averagePerDay: dates.length > 0 ? 
                    Math.round((trends.reduce((sum, t) => sum + t.count, 0) / dates.length) * 10) / 10 : 0
            },
            raw: trends
        };
    }
    
    // ============================================================
    // 🔔 REAL-TIME ANOMALY CHECK on shipment status change
    // ============================================================
    
    async checkShipmentAnomaly(shipment, driverId) {
        try {
            // 1. Check if this driver has been marking too fast
            if (shipment.status === 'delivered') {
                const fastDeliveries = await this.detectTooFastDeliveries();
                // Check if this shipment is in the list
                const found = fastDeliveries.find(a => 
                    a.trackingNumber === shipment.trackingNumber
                );
                if (found) {
                    console.log(`🚨 Real-time anomaly: Too fast delivery ${shipment.trackingNumber}`);
                    // Send real-time alert to admin
                    await this.sendAnomalyAlert(found);
                }
            }
            
            // 2. Check for repeated failed deliveries by same driver
            if (shipment.status === 'failed') {
                const repeatedFailed = await this.detectRepeatedFailedDeliveries();
                const found = repeatedFailed.find(a => 
                    a.driverId?.toString() === driverId?.toString()
                );
                if (found) {
                    console.log(`🚨 Real-time anomaly: Repeated failures by driver ${driverId}`);
                    await this.sendAnomalyAlert(found);
                }
            }
        } catch (err) {
            console.error('Real-time anomaly check error:', err);
        }
    }
    
    // ============================================================
    // 🔔 Send anomaly alert to admins
    // ============================================================
    
    async sendAnomalyAlert(anomaly) {
        try {
            const { createNotification } = require('../routes/notification');
            
            const admins = await User.find({ role: 'admin' });
            for (const admin of admins) {
                await createNotification(
                    admin._id,
                    `🚨 Anomaly Detected: ${anomaly.type.replace('_', ' ').toUpperCase()}`,
                    `Alert: ${anomaly.description}. Severity: ${anomaly.severity}`,
                    anomaly.severity === 'high' || anomaly.severity === 'critical' ? 'error' : 'warning',
                    anomaly._id
                );
            }
            console.log(`🔔 Sent anomaly alert to ${admins.length} admins`);
            
            // Send email alerts for critical anomalies
            if (anomaly.severity === 'critical' || anomaly.severity === 'high') {
                try {
                    const { sendAnomalyAlert: sendAnomalyEmail } = require('../utils/email');
                    for (const admin of admins) {
                        await sendAnomalyEmail(admin.email, anomaly);
                    }
                    console.log(`📧 Email alert sent to ${admins.length} admins`);
                } catch (emailErr) {
                    console.error('Email alert error:', emailErr.message);
                }
            }
            
        } catch (err) {
            console.error('Alert error:', err);
        }
    }
}

module.exports = new AnomalyDetectionService();