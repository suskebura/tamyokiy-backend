// routes/insurance.js - FINAL FIXED VERSION
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// ============================================================
// HELPER: Get user from token
// ============================================================
const getUserFromToken = async (token) => {
    try {
        if (!token) return null;
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const User = mongoose.model('User');
        const user = await User.findById(decoded.id);
        return user;
    } catch (err) {
        console.error('❌ Token error:', err.message);
        return null;
    }
};

// ============================================================
// HELPER: Check Admin
// ============================================================
const checkAdmin = async (userId) => {
    try {
        if (!userId) return false;
        const User = mongoose.model('User');
        const user = await User.findById(userId);
        return user && user.role === 'admin';
    } catch (err) {
        console.error('❌ Admin check error:', err.message);
        return false;
    }
};

// ============================================================
// MIDDLEWARE: Extract user from token
// ============================================================
const extractUser = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No token provided'
            });
        }
        
        const user = await getUserFromToken(token);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }
        
        req.user = user;
        next();
    } catch (err) {
        console.error('❌ Auth middleware error:', err.message);
        res.status(401).json({
            success: false,
            message: 'Authentication failed'
        });
    }
};

// ============================================================
// 🔐 ADMIN - GET ALL CLAIMS
// ============================================================
router.get('/admin/claims', extractUser, async (req, res) => {
    try {
        const isAdminUser = await checkAdmin(req.user._id);
        if (!isAdminUser) {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }

        const Insurance = mongoose.model('Insurance');
        const claims = await Insurance.find()
            .sort({ createdAt: -1 })
            .populate('customerId', 'name email');

        res.json({
            success: true,
            claims: claims || []
        });
    } catch (err) {
        console.error('❌ Error fetching claims:', err.message);
        res.status(500).json({
            success: false,
            message: err.message || 'Server error'
        });
    }
});

// ============================================================
// 🛡️ CLIENT - SUBMIT INSURANCE CLAIM - ✅ FINAL FIX
// ============================================================
router.post('/claim', extractUser, async (req, res) => {
    try {
        const { trackingNumber, reason, description, amount, declaredValue } = req.body;

        if (!trackingNumber || !reason || !amount) {
            return res.status(400).json({
                success: false,
                message: 'Tracking number, reason, and amount are required'
            });
        }

        console.log('🔍 Looking for shipment:', trackingNumber);
        console.log('👤 User ID:', req.user._id);

        // Check if shipment exists and belongs to user
        const Shipment = mongoose.model('Shipment');
        const shipment = await Shipment.findOne({
            trackingNumber,
            $or: [
                { userId: req.user._id },
                { senderId: req.user._id },
                { client: req.user._id },  // ✅ This is the key fix!
                { receiverEmail: req.user.email },
                { senderEmail: req.user.email }
            ]
        });

        if (!shipment) {
            console.log('❌ Shipment NOT found for tracking:', trackingNumber);
            return res.status(404).json({
                success: false,
                message: 'Shipment not found or you don\'t have permission'
            });
        }

        console.log('✅ Shipment found:', shipment.trackingNumber);
        console.log('📦 Shipment fields:', {
            userId: shipment.userId,
            senderId: shipment.senderId,
            client: shipment.client,
            receiverEmail: shipment.receiverEmail
        });

        // Check if claim already exists
        const Insurance = mongoose.model('Insurance');
        const existingClaim = await Insurance.findOne({ trackingNumber });
        if (existingClaim) {
            return res.status(400).json({
                success: false,
                message: 'A claim for this shipment already exists'
            });
        }

        // Create claim
        const claim = new Insurance({
            trackingNumber,
            customerId: req.user._id,
            customerName: req.user.name,
            customerEmail: req.user.email,
            reason,
            description: description || '',
            amount: parseFloat(amount),
            declaredValue: declaredValue || shipment.declaredValue || 0,
            status: 'pending'
        });

        await claim.save();

        // Update shipment with insurance reference
        shipment.insuranceClaimId = claim._id;
        shipment.insured = true;
        await shipment.save();

        console.log('✅ Claim created:', claim.claimNumber);

        res.json({
            success: true,
            message: 'Insurance claim submitted successfully',
            claim: {
                claimNumber: claim.claimNumber,
                trackingNumber: claim.trackingNumber,
                status: claim.status,
                amount: claim.amount
            }
        });
    } catch (err) {
        console.error('❌ Error submitting claim:', err.message);
        res.status(500).json({
            success: false,
            message: err.message || 'Server error'
        });
    }
});

// ============================================================
// ✅ ADMIN - APPROVE CLAIM
// ============================================================
router.put('/admin/:claimId/approve', extractUser, async (req, res) => {
    try {
        const isAdminUser = await checkAdmin(req.user._id);
        if (!isAdminUser) {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }

        const { note } = req.body;
        const Insurance = mongoose.model('Insurance');
        const claim = await Insurance.findById(req.params.claimId);

        if (!claim) {
            return res.status(404).json({
                success: false,
                message: 'Claim not found'
            });
        }

        if (claim.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: `Claim is already ${claim.status}`
            });
        }

        claim.status = 'approved';
        claim.adminNote = note || claim.adminNote;
        claim.reviewedBy = req.user._id;
        claim.reviewedAt = new Date();
        await claim.save();

        res.json({
            success: true,
            message: 'Claim approved successfully',
            claim
        });
    } catch (err) {
        console.error('❌ Error approving claim:', err.message);
        res.status(500).json({
            success: false,
            message: err.message || 'Server error'
        });
    }
});

// ============================================================
// ❌ ADMIN - REJECT CLAIM
// ============================================================
router.put('/admin/:claimId/reject', extractUser, async (req, res) => {
    try {
        const isAdminUser = await checkAdmin(req.user._id);
        if (!isAdminUser) {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }

        const { rejectionReason } = req.body;
        if (!rejectionReason) {
            return res.status(400).json({
                success: false,
                message: 'Rejection reason is required'
            });
        }

        const Insurance = mongoose.model('Insurance');
        const claim = await Insurance.findById(req.params.claimId);

        if (!claim) {
            return res.status(404).json({
                success: false,
                message: 'Claim not found'
            });
        }

        if (claim.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: `Claim is already ${claim.status}`
            });
        }

        claim.status = 'rejected';
        claim.rejectionReason = rejectionReason;
        claim.reviewedBy = req.user._id;
        claim.reviewedAt = new Date();
        await claim.save();

        res.json({
            success: true,
            message: 'Claim rejected',
            claim
        });
    } catch (err) {
        console.error('❌ Error rejecting claim:', err.message);
        res.status(500).json({
            success: false,
            message: err.message || 'Server error'
        });
    }
});

// ============================================================
// 💰 ADMIN - MARK CLAIM AS PAID
// ============================================================
router.put('/admin/:claimId/paid', extractUser, async (req, res) => {
    try {
        const isAdminUser = await checkAdmin(req.user._id);
        if (!isAdminUser) {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }

        const Insurance = mongoose.model('Insurance');
        const claim = await Insurance.findById(req.params.claimId);

        if (!claim) {
            return res.status(404).json({
                success: false,
                message: 'Claim not found'
            });
        }

        if (claim.status !== 'approved') {
            return res.status(400).json({
                success: false,
                message: `Claim must be approved before marking paid. Current status: ${claim.status}`
            });
        }

        claim.status = 'paid';
        claim.paidAt = new Date();
        await claim.save();

        res.json({
            success: true,
            message: 'Claim marked as paid',
            claim
        });
    } catch (err) {
        console.error('❌ Error marking claim as paid:', err.message);
        res.status(500).json({
            success: false,
            message: err.message || 'Server error'
        });
    }
});

// ============================================================
// 🗑️ ADMIN - DELETE CLAIM
// ============================================================
router.delete('/admin/:claimId', extractUser, async (req, res) => {
    try {
        const isAdminUser = await checkAdmin(req.user._id);
        if (!isAdminUser) {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }

        const Insurance = mongoose.model('Insurance');
        const claim = await Insurance.findByIdAndDelete(req.params.claimId);

        if (!claim) {
            return res.status(404).json({
                success: false,
                message: 'Claim not found'
            });
        }

        // Remove reference from shipment
        try {
            const Shipment = mongoose.model('Shipment');
            await Shipment.updateOne(
                { insuranceClaimId: claim._id },
                { $unset: { insuranceClaimId: 1 }, $set: { insured: false } }
            );
        } catch (e) {
            console.log('⚠️ Could not update shipment reference:', e.message);
        }

        res.json({
            success: true,
            message: 'Claim deleted successfully'
        });
    } catch (err) {
        console.error('❌ Error deleting claim:', err.message);
        res.status(500).json({
            success: false,
            message: err.message || 'Server error'
        });
    }
});

// ============================================================
// 📊 ADMIN - GET INSURANCE STATS
// ============================================================
router.get('/admin/stats', extractUser, async (req, res) => {
    try {
        const isAdminUser = await checkAdmin(req.user._id);
        if (!isAdminUser) {
            return res.status(403).json({
                success: false,
                message: 'Admin access required'
            });
        }

        const Insurance = mongoose.model('Insurance');

        const total = await Insurance.countDocuments();
        const pending = await Insurance.countDocuments({ status: 'pending' });
        const approved = await Insurance.countDocuments({ status: 'approved' });
        const rejected = await Insurance.countDocuments({ status: 'rejected' });
        const paid = await Insurance.countDocuments({ status: 'paid' });

        const result = await Insurance.aggregate([
            { $group: {
                _id: null,
                totalAmount: { $sum: '$amount' },
                paidAmount: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] } },
                pendingAmount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] } }
            }}
        ]);

        res.json({
            success: true,
            stats: {
                total,
                pending,
                approved,
                rejected,
                paid,
                totalAmount: result[0]?.totalAmount || 0,
                paidAmount: result[0]?.paidAmount || 0,
                pendingAmount: result[0]?.pendingAmount || 0
            }
        });
    } catch (err) {
        console.error('❌ Error getting stats:', err.message);
        res.status(500).json({
            success: false,
            message: err.message || 'Server error'
        });
    }
});

// ============================================================
// 🛡️ CLIENT - GET MY CLAIMS
// ============================================================
router.get('/my-claims', extractUser, async (req, res) => {
    try {
        const Insurance = mongoose.model('Insurance');
        const claims = await Insurance.find({ customerId: req.user._id })
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            claims
        });
    } catch (err) {
        console.error('❌ Error getting my claims:', err.message);
        res.status(500).json({
            success: false,
            message: err.message || 'Server error'
        });
    }
});

module.exports = router;