const express = require('express');
const router = express.Router();
const Shipment = require('../models/shipment');
const User = require('../models/user');

// ============================================================
// 🔓 PUBLIC TRACKING - NO LOGIN REQUIRED
// ============================================================

// ===== PUBLIC TRACKING WITH REAL DRIVER DATA + QR CODE + BARCODE =====
router.get('/track/:trackingNumber', async (req, res) => {
    try {
        const shipment = await Shipment.findOne({ 
            trackingNumber: req.params.trackingNumber 
        });
        
        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: 'Shipment not found'
            });
        }
        
        // ===== FETCH REAL DRIVER DATA =====
        let driverData = null;
        if (shipment.assignedDriver) {
            const driver = await User.findById(shipment.assignedDriver)
                .select('name email phone licenseNumber vehicleType driverStatus completedDeliveries rating totalEarnings');
            
            if (driver) {
                driverData = {
                    name: driver.name,
                    email: driver.email,
                    phone: driver.phone || 'Not set',
                    licenseNumber: driver.licenseNumber || 'Not set',
                    vehicleType: driver.vehicleType || 'Standard Delivery',
                    driverStatus: driver.driverStatus || 'offline',
                    completedDeliveries: driver.completedDeliveries || 0,
                    rating: driver.rating || 5.0,
                    totalEarnings: driver.totalEarnings || 0
                };
                console.log('✅ Driver data found:', driverData.name);
            } else {
                console.log('⚠️ Driver not found in database');
            }
        } else {
            console.log('ℹ️ No driver assigned to this shipment');
        }
        
        // ============================================================
        // 🔥 FIXED: Return BOTH QR Code AND Barcode
        // ============================================================
        const publicData = {
            trackingNumber: shipment.trackingNumber,
            status: shipment.status,
            senderName: shipment.senderName,
            receiverName: shipment.receiverName,
            weight: shipment.weight,
            estimatedDelivery: shipment.estimatedDelivery,
            serviceType: shipment.serviceType,
            trackingHistory: shipment.trackingHistory || [],
            createdAt: shipment.createdAt,
            senderCity: shipment.senderAddress?.split(',').pop()?.trim() || 'N/A',
            receiverCity: shipment.receiverAddress?.split(',').pop()?.trim() || 'N/A',
            // 👇 REAL DRIVER DATA FROM DATABASE
            driver: driverData,
            // 👇 QR CODE
            qrCode: shipment.qrCode || null,
            // 👇 BARCODE - ADDED
            barcode: shipment.barcode || null,
            // Show delivery proof (if delivered)
            deliveryStatus: shipment.status === 'delivered' ? {
                deliveredAt: shipment.deliveryProof?.deliveredAt,
                recipientName: shipment.deliveryProof?.recipientName,
                hasPhoto: !!shipment.deliveryProof?.deliveryPhoto,
                hasSignature: !!shipment.deliveryProof?.recipientSignature
            } : null
        };
        
        res.json({
            success: true,
            shipment: publicData
        });
    } catch (err) {
        console.error('Public tracking error:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// ===== GET SHIPMENT PROGRESS =====
router.get('/track/:trackingNumber/progress', async (req, res) => {
    try {
        const shipment = await Shipment.findOne({ 
            trackingNumber: req.params.trackingNumber 
        });
        
        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: 'Shipment not found'
            });
        }
        
        const statusOrder = ['pending', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered'];
        const currentIndex = statusOrder.indexOf(shipment.status);
        const progress = ((currentIndex + 1) / statusOrder.length) * 100;
        
        const statusMessages = {
            'pending': '📋 Package pending pickup',
            'picked_up': '📦 Package picked up',
            'in_transit': '🚚 Package in transit',
            'out_for_delivery': '🏠 Package out for delivery',
            'delivered': '✅ Package delivered'
        };
        
        res.json({
            success: true,
            trackingNumber: shipment.trackingNumber,
            status: shipment.status,
            statusMessage: statusMessages[shipment.status] || shipment.status,
            progress: Math.round(progress),
            estimatedDelivery: shipment.estimatedDelivery,
            lastUpdate: shipment.trackingHistory?.slice(-1)[0] || null,
            // Also return driver info in progress
            driver: shipment.assignedDriverName || null,
            // 👇 QR CODE
            qrCode: shipment.qrCode || null,
            // 👇 BARCODE - ADDED
            barcode: shipment.barcode || null
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// ===== SYSTEM STATUS (PUBLIC) =====
router.get('/status', async (req, res) => {
    try {
        const totalShipments = await Shipment.countDocuments();
        const delivered = await Shipment.countDocuments({ status: 'delivered' });
        const pending = await Shipment.countDocuments({ 
            status: { $in: ['pending', 'picked_up', 'in_transit', 'out_for_delivery'] } 
        });
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const todayDeliveries = await Shipment.countDocuments({
            estimatedDelivery: { $gte: today, $lt: tomorrow }
        });
        
        res.json({
            success: true,
            systemStatus: {
                totalShipments,
                delivered,
                pending,
                todayDeliveries,
                deliveryRate: totalShipments > 0 ? Math.round((delivered / totalShipments) * 100) : 0,
                lastUpdated: new Date().toISOString()
            }
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

module.exports = router;
