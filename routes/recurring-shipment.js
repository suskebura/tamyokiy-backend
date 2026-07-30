const express = require('express');
const router = express.Router();
const RecurringShipment = require('../models/RecurringShipment');
const Shipment = require('../models/Shipment');
const auth = require('../middleware/auth');

// ============================================================
// 📅 CREATE RECURRING SHIPMENT
// ============================================================

router.post('/', auth, async (req, res) => {
    try {
        const {
            senderName,
            senderAddress,
            senderPhone,
            receiverName,
            receiverAddress,
            receiverPhone,
            weight,
            serviceType,
            declaredValue,
            frequency,
            startDate,
            endDate,
            notes
        } = req.body;

        const recurring = new RecurringShipment({
            client: req.user.id,
            senderName,
            senderAddress,
            senderPhone: senderPhone || '',
            receiverName,
            receiverAddress,
            receiverPhone: receiverPhone || '',
            weight,
            serviceType: serviceType || 'standard',
            declaredValue: declaredValue || 0,
            frequency,
            startDate: new Date(startDate),
            endDate: endDate ? new Date(endDate) : null,
            nextRunDate: new Date(startDate),
            notes: notes || '',
            isActive: true
        });

        await recurring.save();

        res.json({
            success: true,
            message: 'Recurring shipment created successfully',
            recurring
        });

    } catch (err) {
        console.error('Create recurring error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 🔄 PROCESS RECURRING SHIPMENTS (Cron Job)
// ============================================================

router.post('/process', async (req, res) => {
    try {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const recurring = await RecurringShipment.find({
            isActive: true,
            nextRunDate: { $lte: today }
        }).populate('client', 'name email phone');

        const results = [];
        const errors = [];

        for (const item of recurring) {
            try {
                // Create shipment
                const trackingNumber = 'TAM' + Date.now().toString(36).toUpperCase() +
                    Math.random().toString(36).substring(2, 6).toUpperCase();

                const amount = 10 + (item.weight * 5);
                const daysToAdd = item.serviceType === 'overnight' ? 1 :
                    item.serviceType === 'express' ? 3 : 7;
                const estimatedDelivery = new Date();
                estimatedDelivery.setDate(estimatedDelivery.getDate() + daysToAdd);

                const shipment = new Shipment({
                    trackingNumber,
                    client: item.client._id,
                    senderName: item.senderName,
                    senderAddress: item.senderAddress,
                    senderPhone: item.senderPhone,
                    receiverName: item.receiverName,
                    receiverAddress: item.receiverAddress,
                    receiverPhone: item.receiverPhone,
                    weight: item.weight,
                    serviceType: item.serviceType,
                    amount: amount,
                    declaredValue: item.declaredValue,
                    status: 'pending',
                    estimatedDelivery,
                    isPaid: false,
                    createdAt: new Date(),
                    isRecurring: true,
                    recurringId: item._id,
                    statusHistory: [{
                        status: 'pending',
                        timestamp: new Date(),
                        note: `Recurring shipment (${item.frequency})`
                    }]
                });

                await shipment.save();

                // Update recurring
                item.lastRunDate = new Date();
                item.totalShipments += 1;

                // Calculate next run date
                const nextDate = new Date(item.nextRunDate);
                switch (item.frequency) {
                    case 'daily':
                        nextDate.setDate(nextDate.getDate() + 1);
                        break;
                    case 'weekly':
                        nextDate.setDate(nextDate.getDate() + 7);
                        break;
                    case 'bi-weekly':
                        nextDate.setDate(nextDate.getDate() + 14);
                        break;
                    case 'monthly':
                        nextDate.setMonth(nextDate.getMonth() + 1);
                        break;
                }
                item.nextRunDate = nextDate;

                // Check if end date passed
                if (item.endDate && new Date() > item.endDate) {
                    item.isActive = false;
                }

                await item.save();

                results.push({
                    trackingNumber,
                    receiverName: item.receiverName,
                    frequency: item.frequency
                });

            } catch (err) {
                errors.push({
                    recurringId: item._id,
                    error: err.message
                });
            }
        }

        res.json({
            success: true,
            message: 'Recurring shipments processed',
            processed: results.length,
            errors: errors.length,
            results,
            errors
        });

    } catch (err) {
        console.error('Process recurring error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;