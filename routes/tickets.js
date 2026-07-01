const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const Ticket = require('../models/Ticket');
const TicketReply = require('../models/TicketReply');
const User = require('../models/user');
const { createNotification } = require('./notification');
const { createAuditLog } = require('../middleware/audit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ============================================================
// 📁 ATTACHMENT UPLOAD SETUP
// ============================================================

const uploadDir = path.join(__dirname, '../uploads/tickets');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        cb(null, `ticket_${timestamp}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'application/pdf'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only JPEG, PNG, JPG, WEBP, and PDF files are allowed'), false);
        }
    }
});

// ============================================================
// 🎫 TICKET ROUTES
// ============================================================

// ===== CREATE TICKET (Client/User) =====
router.post('/', auth, upload.array('attachments', 5), async (req, res) => {
    try {
        const { title, description, category, priority } = req.body;

        if (!title || !description) {
            return res.status(400).json({
                success: false,
                message: 'Title and description are required'
            });
        }

        const user = await User.findById(req.user.id);

        const ticket = new Ticket({
            title,
            description,
            category: category || 'general',
            priority: priority || 'medium',
            userId: req.user.id,
            userName: user.name,
            userEmail: user.email,
            createdBy: req.user.id
        });

        // Handle attachments
        if (req.files && req.files.length > 0) {
            ticket.attachments = req.files.map(file => ({
                filename: file.originalname,
                url: `/uploads/tickets/${file.filename}`
            }));
        }

        await ticket.save();

        // Notify admins
        const admins = await User.find({ role: 'admin' });
        for (const admin of admins) {
            await createNotification(
                admin._id,
                '🎫 New Support Ticket',
                `New ticket #${ticket.ticketNumber} from ${user.name}: ${title}`,
                'info',
                ticket._id
            );
        }

        // Notify user
        await createNotification(
            req.user.id,
            '✅ Ticket Created',
            `Ticket #${ticket.ticketNumber} has been created successfully. We will get back to you soon.`,
            'success',
            ticket._id
        );

        await createAuditLog(
            req,
            'CREATE_TICKET',
            'Ticket',
            ticket._id,
            `Created ticket #${ticket.ticketNumber}: ${title}`
        );

        res.status(201).json({
            success: true,
            message: 'Ticket created successfully',
            ticket
        });

    } catch (err) {
        console.error('Create ticket error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== GET MY TICKETS (Client) =====
router.get('/my-tickets', auth, async (req, res) => {
    try {
        const { status, limit = 50, page = 1 } = req.query;

        let query = { userId: req.user.id };
        if (status) query.status = status;

        const tickets = await Ticket.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .populate('assignedTo', 'name email');

        const total = await Ticket.countDocuments(query);

        res.json({
            success: true,
            tickets,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit))
        });

    } catch (err) {
        console.error('Get my tickets error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== GET TICKET DETAILS =====
router.get('/:id', auth, async (req, res) => {
    try {
        const ticket = await Ticket.findById(req.params.id)
            .populate('userId', 'name email')
            .populate('assignedTo', 'name email');

        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }

        // Check permission
        if (req.user.role !== 'admin' && ticket.userId._id.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        // Get replies
        const replies = await TicketReply.find({ ticketId: ticket._id })
            .sort({ createdAt: 1 })
            .populate('userId', 'name email role');

        res.json({
            success: true,
            ticket,
            replies
        });

    } catch (err) {
        console.error('Get ticket error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== ADD REPLY TO TICKET =====
router.post('/:id/reply', auth, upload.array('attachments', 5), async (req, res) => {
    try {
        const { message, isInternal } = req.body;

        if (!message) {
            return res.status(400).json({
                success: false,
                message: 'Message is required'
            });
        }

        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }

        // Check permission
        if (req.user.role !== 'admin' && ticket.userId.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const user = await User.findById(req.user.id);

        const reply = new TicketReply({
            ticketId: ticket._id,
            userId: req.user.id,
            userName: user.name,
            userRole: req.user.role,
            message: message,
            isInternal: isInternal === 'true' && req.user.role === 'admin'
        });

        // Handle attachments
        if (req.files && req.files.length > 0) {
            reply.attachments = req.files.map(file => ({
                filename: file.originalname,
                url: `/uploads/tickets/${file.filename}`
            }));
        }

        await reply.save();

        // Update ticket
        ticket.lastReplyAt = new Date();
        if (ticket.status === 'new' && req.user.role === 'admin') {
            ticket.status = 'in_progress';
        }
        if (ticket.status === 'on_hold' && req.user.role === 'admin') {
            ticket.status = 'in_progress';
        }
        await ticket.save();

        // Notify
        const notifyUserId = req.user.role === 'admin' ? ticket.userId : (ticket.assignedTo || (await User.findOne({ role: 'admin' }))._id);
        if (notifyUserId && notifyUserId.toString() !== req.user.id) {
            await createNotification(
                notifyUserId,
                '💬 New Reply on Ticket',
                `${user.name} replied to ticket #${ticket.ticketNumber}`,
                'info',
                ticket._id
            );
        }

        res.json({
            success: true,
            message: 'Reply added successfully',
            reply
        });

    } catch (err) {
        console.error('Add reply error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 🔧 ADMIN TICKET MANAGEMENT
// ============================================================

// ===== GET ALL TICKETS (Admin) =====
router.get('/admin/all', adminAuth, async (req, res) => {
    try {
        const { status, priority, category, assignedTo, search, limit = 50, page = 1 } = req.query;

        let query = {};
        if (status) query.status = status;
        if (priority) query.priority = priority;
        if (category) query.category = category;
        if (assignedTo) query.assignedTo = assignedTo;
        if (search) {
            query.$or = [
                { ticketNumber: { $regex: search, $options: 'i' } },
                { title: { $regex: search, $options: 'i' } },
                { userName: { $regex: search, $options: 'i' } },
                { userEmail: { $regex: search, $options: 'i' } }
            ];
        }

        const tickets = await Ticket.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .populate('userId', 'name email')
            .populate('assignedTo', 'name email');

        const total = await Ticket.countDocuments(query);

        res.json({
            success: true,
            tickets,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit))
        });

    } catch (err) {
        console.error('Get all tickets error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== UPDATE TICKET STATUS (Admin) =====
router.put('/admin/:id/status', adminAuth, async (req, res) => {
    try {
        const { status } = req.body;

        const validStatuses = ['new', 'in_progress', 'on_hold', 'resolved', 'closed'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status'
            });
        }

        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }

        ticket.status = status;
        if (status === 'resolved') {
            ticket.resolvedAt = new Date();
        }
        if (status === 'closed') {
            ticket.closedAt = new Date();
        }
        await ticket.save();

        await createNotification(
            ticket.userId,
            `📌 Ticket #${ticket.ticketNumber} Status Updated`,
            `Your ticket status has been changed to: ${status.replace('_', ' ').toUpperCase()}`,
            status === 'resolved' ? 'success' : 'info',
            ticket._id
        );

        await createAuditLog(
            req,
            'UPDATE_TICKET_STATUS',
            'Ticket',
            ticket._id,
            `Updated ticket #${ticket.ticketNumber} status to ${status}`
        );

        res.json({
            success: true,
            message: 'Ticket status updated',
            ticket
        });

    } catch (err) {
        console.error('Update ticket status error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== ASSIGN TICKET TO AGENT (Admin) =====
router.put('/admin/:id/assign', adminAuth, async (req, res) => {
    try {
        const { agentId } = req.body;

        if (!agentId) {
            return res.status(400).json({
                success: false,
                message: 'Agent ID is required'
            });
        }

        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) {
            return res.status(404).json({ success: false, message: 'Ticket not found' });
        }

        const agent = await User.findById(agentId);
        if (!agent) {
            return res.status(404).json({ success: false, message: 'Agent not found' });
        }

        ticket.assignedTo = agent._id;
        ticket.assignedToName = agent.name;
        await ticket.save();

        await createNotification(
            agent._id,
            '📋 Ticket Assigned',
            `You have been assigned to ticket #${ticket.ticketNumber}: ${ticket.title}`,
            'info',
            ticket._id
        );

        await createNotification(
            ticket.userId,
            '📋 Ticket Assigned',
            `Ticket #${ticket.ticketNumber} has been assigned to ${agent.name}`,
            'info',
            ticket._id
        );

        await createAuditLog(
            req,
            'ASSIGN_TICKET',
            'Ticket',
            ticket._id,
            `Assigned ticket #${ticket.ticketNumber} to ${agent.name}`
        );

        res.json({
            success: true,
            message: `Ticket assigned to ${agent.name}`,
            ticket
        });

    } catch (err) {
        console.error('Assign ticket error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== GET TICKET STATS (Admin) =====
router.get('/admin/stats', adminAuth, async (req, res) => {
    try {
        const total = await Ticket.countDocuments();
        const newTickets = await Ticket.countDocuments({ status: 'new' });
        const inProgress = await Ticket.countDocuments({ status: 'in_progress' });
        const onHold = await Ticket.countDocuments({ status: 'on_hold' });
        const resolved = await Ticket.countDocuments({ status: 'resolved' });
        const closed = await Ticket.countDocuments({ status: 'closed' });

        const byCategory = await Ticket.aggregate([
            { $group: { _id: '$category', count: { $sum: 1 } } }
        ]);

        const byPriority = await Ticket.aggregate([
            { $group: { _id: '$priority', count: { $sum: 1 } } }
        ]);

        res.json({
            success: true,
            stats: {
                total,
                new: newTickets,
                inProgress,
                onHold,
                resolved,
                closed,
                byCategory,
                byPriority
            }
        });

    } catch (err) {
        console.error('Get ticket stats error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
