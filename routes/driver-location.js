const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

// ✅ Import models
const DriverLocation = require('../models/DriverLocation');
const Shipment = require('../models/Shipment');
const User = require('../models/User');

// ============================================================
// 📡 UPDATE DRIVER LOCATION - ✅ FULLY FIXED WITH PROXIMITY
// ============================================================
router.post('/update', auth, async (req, res) => {
    try {
        console.log('📡 Location update request received');
        console.log('📦 Body:', req.body);
        
        const { 
            lat, 
            lng, 
            speed, 
            accuracy, 
            heading,
            status, 
            routeId,
            trackingNumber,
            address 
        } = req.body;
        
        // Validate required fields
        if (lat === undefined || lng === undefined) {
            return res.status(400).json({ 
                success: false, 
                message: 'Latitude and longitude are required' 
            });
        }

        // Validate coordinates
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid coordinates' 
            });
        }

        // Get user details
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        console.log(`👤 Driver: ${user.name} (${user.role})`);

        // Check if user is a driver
        if (user.role !== 'driver') {
            return res.status(403).json({
                success: false,
                message: 'Driver access only'
            });
        }

        // ✅ FIX: Check if DriverLocation model exists
        if (!DriverLocation) {
            console.error('❌ DriverLocation model is undefined!');
            return res.status(500).json({
                success: false,
                message: 'DriverLocation model not loaded'
            });
        }

        // ✅ FIX: Use findOneAndUpdate with upsert
        const location = await DriverLocation.findOneAndUpdate(
            { driverId: req.user.id },
            {
                $set: {
                    driverName: user.name,
                    driverEmail: user.email,
                    vehicleType: user.vehicleType || 'Standard Vehicle',
                    lat: lat,
                    lng: lng,
                    accuracy: accuracy || 0,
                    speed: speed || 0,
                    heading: heading || 0,
                    status: status || 'online',
                    routeId: routeId || null,
                    trackingNumber: trackingNumber || null,
                    address: address || null,
                    updatedAt: new Date()
                },
                $push: {
                    history: {
                        $each: [{ lat, lng, speed: speed || 0, timestamp: new Date() }],
                        $slice: -100
                    }
                },
                $setOnInsert: {
                    createdAt: new Date()
                }
            },
            {
                upsert: true,
                new: true,
                runValidators: true
            }
        );

        console.log('✅ Location updated for driver:', user.name);

        // ✅ UPDATE SHIPMENT ETA
        if (trackingNumber) {
            try {
                const shipment = await Shipment.findOne({ trackingNumber });
                if (shipment) {
                    // Update shipment with driver info
                    shipment.assignedDriver = user._id;
                    shipment.assignedDriverName = user.name;
                    shipment.assignedAt = new Date();
                    
                    // Calculate ETA if receiver coordinates exist
                    if (shipment.receiverLat && shipment.receiverLng) {
                        const distance = haversineDistance(
                            lat, lng,
                            shipment.receiverLat, shipment.receiverLng
                        );
                        const avgSpeed = Math.max(speed || 20, 10);
                        const etaMinutes = Math.round((distance / avgSpeed) * 60);
                        
                        shipment.realTimeETA = {
                            estimatedAt: new Date(),
                            minutesLeft: Math.max(1, etaMinutes),
                            confidence: 85,
                            updatedAt: new Date()
                        };
                        console.log(`📊 ETA updated for ${trackingNumber}: ${etaMinutes} min`);
                    }
                    await shipment.save();

                    // 🔔 Check proximity and send notification if driver is 5 min away
                    try {
                        await checkProximityAndNotify(trackingNumber, lat, lng);
                    } catch (err) {
                        console.log('⚠️ Proximity notification error:', err.message);
                    }
                }
            } catch (err) {
                console.log('⚠️ ETA update error:', err.message);
            }
        }

        res.json({
            success: true,
            message: 'Location updated successfully',
            location: {
                lat: location.lat,
                lng: location.lng,
                speed: location.speed,
                accuracy: location.accuracy,
                heading: location.heading,
                status: location.status,
                address: location.address,
                updatedAt: location.updatedAt
            }
        });

    } catch (err) {
        console.error('❌ Error updating location:', err);
        console.error('❌ Stack:', err.stack);
        res.status(500).json({ 
            success: false, 
            message: 'Error updating location: ' + err.message 
        });
    }
});

// ============================================================
// 📡 GET DRIVER CURRENT LOCATION
// ============================================================
router.get('/current/:driverId', async (req, res) => {
    try {
        const { driverId } = req.params;
        
        if (!DriverLocation) {
            return res.status(500).json({
                success: false,
                message: 'DriverLocation model not loaded'
            });
        }
        
        const location = await DriverLocation.findOne({ driverId })
            .populate('driverId', 'name email phone vehicleType')
            .populate('routeId', 'name routeNumber');
        
        if (!location) {
            return res.status(404).json({
                success: false,
                message: 'Driver location not found'
            });
        }

        res.json({
            success: true,
            location: {
                driverId: location.driverId,
                driverName: location.driverName,
                driverEmail: location.driverEmail,
                vehicleType: location.vehicleType,
                lat: location.lat,
                lng: location.lng,
                speed: location.speed,
                accuracy: location.accuracy,
                heading: location.heading,
                status: location.status,
                routeId: location.routeId,
                trackingNumber: location.trackingNumber,
                address: location.address,
                updatedAt: location.updatedAt,
                history: location.history.slice(-10)
            }
        });

    } catch (err) {
        console.error('❌ Error getting location:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Error getting location: ' + err.message 
        });
    }
});

// ============================================================
// 📡 GET MY CURRENT LOCATION
// ============================================================
router.get('/my-location', auth, async (req, res) => {
    try {
        const location = await DriverLocation.findOne({ driverId: req.user.id })
            .populate('routeId', 'name routeNumber')
            .populate('driverId', 'name email phone vehicleType');
        
        if (!location) {
            return res.status(404).json({
                success: false,
                message: 'Your location not found. Start GPS tracking first.'
            });
        }

        res.json({
            success: true,
            location: {
                lat: location.lat,
                lng: location.lng,
                speed: location.speed,
                accuracy: location.accuracy,
                heading: location.heading,
                status: location.status,
                routeId: location.routeId,
                trackingNumber: location.trackingNumber,
                address: location.address,
                updatedAt: location.updatedAt,
                history: location.history.slice(-20)
            }
        });

    } catch (err) {
        console.error('❌ Error getting my location:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Error getting location: ' + err.message 
        });
    }
});

// ============================================================
// 🗺️ PUBLIC CUSTOMER TRACKING
// ============================================================
router.get('/customer-track/:trackingNumber', async (req, res) => {
    try {
        const { trackingNumber } = req.params;
        console.log(`📍 [CUSTOMER TRACK] Tracking: ${trackingNumber}`);

        const shipment = await Shipment.findOne({ trackingNumber });
        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: 'Shipment not found'
            });
        }

        if (!shipment.assignedDriver) {
            return res.json({
                success: true,
                hasDriver: false,
                status: shipment.status,
                message: 'Driver not assigned yet',
                shipment: {
                    trackingNumber: shipment.trackingNumber,
                    status: shipment.status,
                    estimatedDelivery: shipment.estimatedDelivery
                }
            });
        }

        const driver = await User.findById(shipment.assignedDriver)
            .select('name phone vehicleType rating profilePicture');

        const location = await DriverLocation.findOne({
            driverId: shipment.assignedDriver
        });

        if (!location) {
            return res.json({
                success: true,
                hasDriver: true,
                hasLocation: false,
                driver: driver ? {
                    name: driver.name,
                    phone: driver.phone,
                    vehicleType: driver.vehicleType,
                    rating: driver.rating
                } : null,
                message: 'Driver location not available yet',
                shipment: {
                    trackingNumber: shipment.trackingNumber,
                    status: shipment.status,
                    estimatedDelivery: shipment.estimatedDelivery
                }
            });
        }

        const isStale = Date.now() - new Date(location.updatedAt).getTime() > 30000;
        let etaMinutes = null;
        let distance = null;
        let progress = 0;

        if (shipment.receiverLat && shipment.receiverLng && !isStale) {
            distance = haversineDistance(
                location.lat, location.lng,
                shipment.receiverLat, shipment.receiverLng
            );
            const avgSpeed = Math.max(location.speed || 20, 10);
            etaMinutes = Math.round((distance / avgSpeed) * 60);
            etaMinutes = Math.max(1, etaMinutes);

            if (shipment.senderLat && shipment.senderLng) {
                const totalDistance = haversineDistance(
                    shipment.senderLat, shipment.senderLng,
                    shipment.receiverLat, shipment.receiverLng
                );
                progress = totalDistance > 0 
                    ? Math.min(100, Math.round(((totalDistance - distance) / totalDistance) * 100))
                    : 0;
            }
        }

        const path = location.history
            ? location.history.slice(-30).map(h => ({
                lat: h.lat,
                lng: h.lng,
                speed: h.speed || 0,
                timestamp: h.timestamp
            }))
            : [];

        res.json({
            success: true,
            hasDriver: true,
            hasLocation: true,
            isStale: isStale,
            driver: {
                id: driver._id,
                name: driver.name || 'Driver',
                phone: driver.phone || null,
                vehicleType: driver.vehicleType || 'Standard Vehicle',
                rating: driver.rating || 5,
                profilePicture: driver.profilePicture || null,
                status: location.status || 'online'
            },
            location: {
                lat: location.lat,
                lng: location.lng,
                speed: location.speed || 0,
                accuracy: location.accuracy || 0,
                heading: location.heading || 0,
                updatedAt: location.updatedAt,
                address: location.address || null
            },
            destination: {
                lat: shipment.receiverLat,
                lng: shipment.receiverLng,
                address: shipment.receiverAddress,
                name: shipment.receiverName
            },
            origin: {
                lat: shipment.senderLat,
                lng: shipment.senderLng,
                address: shipment.senderAddress,
                name: shipment.senderName
            },
            shipment: {
                trackingNumber: shipment.trackingNumber,
                status: shipment.status,
                estimatedDelivery: shipment.estimatedDelivery,
                serviceType: shipment.serviceType,
                weight: shipment.weight
            },
            eta: etaMinutes,
            distance: distance ? Math.round(distance * 10) / 10 : null,
            progress: progress,
            path: path,
            lastUpdate: location.updatedAt
        });

    } catch (err) {
        console.error('❌ Customer track error:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// ============================================================
// 🔔 CHECK PROXIMITY & SEND NOTIFICATION
// ============================================================

async function checkProximityAndNotify(trackingNumber, driverLat, driverLng) {
    try {
        const shipment = await Shipment.findOne({ trackingNumber });
        if (!shipment) return;

        // Check if already notified
        const lastNotified = shipment.lastProximityNotified;
        const now = new Date();
        if (lastNotified && (now - lastNotified) < 60000) {
            return; // Don't spam - wait 1 minute between notifications
        }

        // Check if destination exists
        if (!shipment.receiverLat || !shipment.receiverLng) return;

        // Calculate distance
        const distance = haversineDistance(
            driverLat, driverLng,
            shipment.receiverLat, shipment.receiverLng
        );

        // Calculate ETA in minutes (assuming 30 km/h average)
        const etaMinutes = Math.round((distance / 30) * 60);

        // If within 5 minutes and not delivered
        if (etaMinutes <= 5 && etaMinutes > 0 && shipment.status !== 'delivered') {
            // Send notification to customer
            await createNotification(
                shipment.userId,
                '🚚 Your Driver is Almost Here!',
                `Your driver ${shipment.assignedDriverName || 'is'} approximately ${etaMinutes} minutes away from your location.`,
                'success',
                trackingNumber
            );

            // Send notification to driver (optional)
            if (shipment.assignedDriver) {
                await createNotification(
                    shipment.assignedDriver,
                    '📍 You\'re Almost at Destination!',
                    `You are approximately ${etaMinutes} minutes away from ${shipment.receiverName || 'the destination'}.`,
                    'info',
                    trackingNumber
                );
            }

            // Update last notified time
            shipment.lastProximityNotified = now;
            await shipment.save();

            console.log(`🔔 Proximity notification sent for ${trackingNumber} - ${etaMinutes} min away`);
            return { notified: true, etaMinutes };
        }

        return { notified: false, etaMinutes };

    } catch (err) {
        console.error('❌ Proximity check error:', err);
        return { notified: false, error: err.message };
    }
}

// ============================================================
// 📬 CREATE NOTIFICATION HELPER
// ============================================================

async function createNotification(userId, title, message, type = 'info', trackingNumber = null) {
    try {
        const Notification = require('../models/Notification');
        const notification = new Notification({
            userId: userId,
            title: title,
            message: message,
            type: type,
            trackingNumber: trackingNumber,
            isRead: false
        });
        await notification.save();
        console.log(`📬 Notification created for user ${userId}: ${title}`);
        return notification;
    } catch (err) {
        console.error('❌ Notification creation error:', err);
        return null;
    }
}

// ============================================================
// 🌍 HAVERSINE DISTANCE HELPER
// ============================================================
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

module.exports = router;