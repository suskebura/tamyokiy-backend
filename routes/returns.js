const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const ReturnRequest = require('../models/ReturnRequest');
const Shipment = require('../models/Shipment');
const User = require('../models/User');
const auth = require('../middleware/auth');

// ============================================================
// 📦 REQUEST RETURN
// ============================================================

router.post('/request', auth, async (req, res) => {
    try {
        const {
            trackingNumber,
            reason,
            description,
            returnType,
            photos
        } = req.body;

        // Find original shipment
        const shipment = await Shipment.findOne({
            trackingNumber,
            client: req.user.id
        });

        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: 'Shipment not found'
            });
        }

        // Check if return already exists
        const existingReturn = await ReturnRequest.findOne({
            originalShipmentId: shipment._id,
            status: { $ne: 'completed' }
        });

        if (existingReturn) {
            return res.status(400).json({
                success: false,
                message: 'Return request already exists for this shipment'
            });
        }

        // Generate return tracking number
        const returnTrackingNumber = 'RET' + Date.now().toString(36).toUpperCase() +
            Math.random().toString(36).substring(2, 6).toUpperCase();

        // Create return request
        const returnRequest = new ReturnRequest({
            originalShipmentId: shipment._id,
            trackingNumber: trackingNumber,
            client: req.user.id,
            reason: reason || 'other',
            description: description || '',
            returnType: returnType || 'pickup',
            returnTrackingNumber: returnTrackingNumber,
            photos: photos || [],
            status: 'pending',
            refundStatus: 'pending',
            createdAt: new Date()
        });

        await returnRequest.save();

        // Update original shipment
        shipment.returnStatus = 'pending';
        shipment.returnRequestId = returnRequest._id;
        await shipment.save();

        // Send notification to admin
        try {
            const notificationService = require('../services/notificationService');
            const user = await User.findById(req.user.id);
            
            await notificationService.sendEmail(
                process.env.ADMIN_EMAIL || 'admin@tamyokiy.com',
                `📦 Return Request - ${trackingNumber}`,
                `
                    <div style="font-family: Arial; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #D4AF37;">📦 New Return Request</h2>
                        <p><strong>Tracking:</strong> ${trackingNumber}</p>
                        <p><strong>Return Tracking:</strong> ${returnTrackingNumber}</p>
                        <p><strong>Customer:</strong> ${user.name}</p>
                        <p><strong>Email:</strong> ${user.email}</p>
                        <p><strong>Reason:</strong> ${reason}</p>
                        <p><strong>Description:</strong> ${description || 'N/A'}</p>
                        <p><strong>Return Type:</strong> ${returnType || 'pickup'}</p>
                        <p><a href="${process.env.FRONTEND_URL}/admin-returns.html">View in Admin Panel</a></p>
                    </div>
                `
            );
        } catch (emailErr) {
            console.log('Email error:', emailErr.message);
        }

        res.json({
            success: true,
            message: 'Return request submitted successfully',
            returnRequest: returnRequest
        });

    } catch (err) {
        console.error('Return request error:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// ============================================================
// 👤 GET MY RETURNS
// ============================================================

router.get('/my-returns', auth, async (req, res) => {
    try {
        const returns = await ReturnRequest.find({
            client: req.user.id
        })
        .sort({ createdAt: -1 })
        .populate('originalShipmentId', 'trackingNumber senderName receiverName amount');

        res.json({
            success: true,
            returns: returns
        });

    } catch (err) {
        console.error('Get returns error:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// ============================================================
// 👑 ADMIN: GET ALL RETURNS
// ============================================================

router.get('/admin/all', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }

        const returns = await ReturnRequest.find()
            .sort({ createdAt: -1 })
            .populate('client', 'name email phone')
            .populate('originalShipmentId', 'trackingNumber senderName receiverName amount');

        res.json({
            success: true,
            returns: returns
        });

    } catch (err) {
        console.error('Admin get returns error:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// ============================================================
// 👑 ADMIN: UPDATE RETURN STATUS
// ============================================================

router.put('/admin/:returnId', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }

        const { returnId } = req.params;
        const {
            status,
            adminNotes,
            refundAmount,
            refundStatus
        } = req.body;

        const returnRequest = await ReturnRequest.findById(returnId)
            .populate('client', 'name email phone')
            .populate('originalShipmentId', 'trackingNumber amount');

        if (!returnRequest) {
            return res.status(404).json({
                success: false,
                message: 'Return request not found'
            });
        }

        // Update return
        if (status) returnRequest.status = status;
        if (adminNotes) returnRequest.adminNotes = adminNotes;
        if (refundAmount) returnRequest.refundAmount = refundAmount;
        if (refundStatus) returnRequest.refundStatus = refundStatus;

        if (status === 'completed') {
            returnRequest.completedAt = new Date();
        }

        await returnRequest.save();

        // Update original shipment
        if (status === 'completed') {
            const shipment = await Shipment.findById(returnRequest.originalShipmentId);
            if (shipment) {
                shipment.returnStatus = 'completed';
                await shipment.save();
            }
        }

        // Send notification to customer
        try {
            const notificationService = require('../services/notificationService');
            await notificationService.sendEmail(
                returnRequest.client.email,
                `📦 Return Update - ${returnRequest.trackingNumber}`,
                `
                    <div style="font-family: Arial; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #D4AF37;">📦 Return Status Update</h2>
                        <p><strong>Tracking:</strong> ${returnRequest.trackingNumber}</p>
                        <p><strong>Status:</strong> ${status}</p>
                        ${adminNotes ? `<p><strong>Notes:</strong> ${adminNotes}</p>` : ''}
                        ${refundAmount ? `<p><strong>Refund:</strong> $${refundAmount}</p>` : ''}
                        <p><a href="${process.env.FRONTEND_URL}/dashboard.html">View in Dashboard</a></p>
                    </div>
                `
            );
        } catch (emailErr) {
            console.log('Email error:', emailErr.message);
        }

        res.json({
            success: true,
            message: 'Return updated successfully',
            returnRequest: returnRequest
        });

    } catch (err) {
        console.error('Admin update return error:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// ============================================================
// 📊 RETURN STATS (Admin)
// ============================================================

router.get('/admin/stats', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }

        const stats = {
            total: await ReturnRequest.countDocuments(),
            pending: await ReturnRequest.countDocuments({ status: 'pending' }),
            approved: await ReturnRequest.countDocuments({ status: 'approved' }),
            picked_up: await ReturnRequest.countDocuments({ status: 'picked_up' }),
            in_transit: await ReturnRequest.countDocuments({ status: 'in_transit' }),
            delivered: await ReturnRequest.countDocuments({ status: 'delivered' }),
            completed: await ReturnRequest.countDocuments({ status: 'completed' }),
            rejected: await ReturnRequest.countDocuments({ status: 'rejected' })
        };

        const refundStats = {
            pending: await ReturnRequest.countDocuments({ refundStatus: 'pending' }),
            processing: await ReturnRequest.countDocuments({ refundStatus: 'processing' }),
            completed: await ReturnRequest.countDocuments({ refundStatus: 'completed' }),
            rejected: await ReturnRequest.countDocuments({ refundStatus: 'rejected' })
        };

        const reasons = await ReturnRequest.aggregate([
            { $group: { _id: '$reason', count: { $sum: 1 } } }
        ]);

        res.json({
            success: true,
            stats: stats,
            refundStats: refundStats,
            reasons: reasons
        });

    } catch (err) {
        console.error('Return stats error:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// ============================================================
// 🗑️ DELETE RETURN (Admin only)
// ============================================================

router.delete('/admin/:returnId', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }

        const returnRequest = await ReturnRequest.findByIdAndDelete(req.params.returnId);

        if (!returnRequest) {
            return res.status(404).json({
                success: false,
                message: 'Return request not found'
            });
        }

        res.json({
            success: true,
            message: 'Return request deleted successfully'
        });

    } catch (err) {
        console.error('Delete return error:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

module.exports = router;