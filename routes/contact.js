const express = require('express');
const router = express.Router();
const Contact = require('../models/contact'); // ✅ FIXED: lowercase 'contact'
const User = require('../models/user'); // ✅ FIXED: lowercase 'user'
const { createNotification } = require('./notification');
const nodemailer = require('nodemailer');

// Configure email transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Submit contact form
router.post('/', async (req, res) => {
    try {
        console.log('📨 Contact request received:', req.body);
        
        const { name, email, subject, message } = req.body;
        
        if (!name || !email || !subject || !message) {
            return res.status(400).json({ 
                success: false, 
                message: 'All fields are required' 
            });
        }
        
        const newContact = new Contact({ name, email, subject, message });
        await newContact.save();
        
        console.log('✅ Contact saved successfully');
        
        // Send email notification to admin
        try {
            const adminEmail = process.env.ADMIN_EMAIL || 'admin@tamyokiy.com';
            
            await transporter.sendMail({
                from: `"TAMYOKIY Contact" <${process.env.EMAIL_USER}>`,
                to: adminEmail,
                subject: `📬 New Contact Message: ${subject}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #D4AF37; border-radius: 10px;">
                        <h2 style="color: #D4AF37; text-align: center;">New Contact Message</h2>
                        <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 15px 0;">
                            <p><strong>From:</strong> ${name} (${email})</p>
                            <p><strong>Subject:</strong> ${subject}</p>
                            <p><strong>Message:</strong></p>
                            <p style="background: white; padding: 10px; border-radius: 5px;">${message}</p>
                        </div>
                        <p style="text-align: center; color: #666; font-size: 12px;">
                            <a href="http://localhost:5500/admin.html" style="color: #D4AF37;">Go to Admin Panel</a>
                        </p>
                    </div>
                `
            });
            console.log('📧 Admin notification email sent');
        } catch (emailError) {
            console.error('Email error:', emailError.message);
        }
        
        // Send auto-reply to user
        try {
            await transporter.sendMail({
                from: `"TAMYOKIY Logistics" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: `Thank you for contacting TAMYOKIY Logistics`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #D4AF37; border-radius: 10px;">
                        <h2 style="color: #D4AF37; text-align: center;">Thank You, ${name}!</h2>
                        <p>We have received your message and will get back to you within 24 hours.</p>
                        <div style="background: #f5f5f5; padding: 10px; border-radius: 5px; margin: 15px 0;">
                            <p><strong>Your message:</strong></p>
                            <p>${message}</p>
                        </div>
                        <p style="color: #666; font-size: 12px;">Reference: #${newContact._id.toString().slice(-6)}</p>
                        <hr style="border-color: #D4AF37;">
                        <p style="text-align: center; font-size: 12px;">TAMYOKIY Logistics - We Move Freight. You Move Forward.</p>
                    </div>
                `
            });
            console.log('📧 Auto-reply sent to user');
        } catch (autoReplyError) {
            console.error('Auto-reply error:', autoReplyError.message);
        }
        
        res.status(201).json({ success: true, message: 'Message sent successfully' });
        
    } catch (err) {
        console.error('❌ Contact error:', err);
        res.status(500).json({ 
            success: false, 
            message: err.message 
        });
    }
});

// Get all contacts (admin only)
router.get('/', async (req, res) => {
    try {
        const messages = await Contact.find().sort({ createdAt: -1 });
        res.json(messages);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Delete contact
router.delete('/:id', async (req, res) => {
    try {
        await Contact.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ===== APPROVE CONTACT =====
router.put('/:id/approve', async (req, res) => {
    try {
        const { adminResponse } = req.body;
        const contact = await Contact.findByIdAndUpdate(
            req.params.id,
            { 
                status: 'approved', 
                adminResponse: adminResponse || 'Your inquiry has been approved.',
                respondedBy: 'Admin',
                respondedAt: new Date()
            },
            { new: true }
        );
        
        // Send notification to user
        const user = await User.findOne({ email: contact.email });
        if (user) {
            await createNotification(
                user._id,
                '✅ Contact Inquiry Approved',
                `Your inquiry "${contact.subject}" has been approved. Response: ${contact.adminResponse}`,
                'success',
                null
            );
        }
        
        // Send approval email
        try {
            await transporter.sendMail({
                from: `"TAMYOKIY Logistics" <${process.env.EMAIL_USER}>`,
                to: contact.email,
                subject: `Your inquiry has been approved - TAMYOKIY Logistics`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #4caf50; border-radius: 10px;">
                        <h2 style="color: #4caf50; text-align: center;">✅ Inquiry Approved</h2>
                        <p>Dear ${contact.name},</p>
                        <p>Your inquiry has been reviewed and approved by our team.</p>
                        <div style="background: #f5f5f5; padding: 10px; border-radius: 5px; margin: 15px 0;">
                            <p><strong>Admin Response:</strong></p>
                            <p>${contact.adminResponse}</p>
                        </div>
                        <p>We will contact you shortly with further details.</p>
                        <hr style="border-color: #4caf50;">
                        <p style="text-align: center; font-size: 12px;">TAMYOKIY Logistics</p>
                    </div>
                `
            });
        } catch (emailError) {
            console.error('Approval email error:', emailError.message);
        }
        
        res.json({ success: true, contact });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ===== REJECT CONTACT =====
router.put('/:id/reject', async (req, res) => {
    try {
        const { adminResponse } = req.body;
        const contact = await Contact.findByIdAndUpdate(
            req.params.id,
            { 
                status: 'rejected', 
                adminResponse: adminResponse || 'We regret to inform you that your inquiry cannot be processed at this time.',
                respondedBy: 'Admin',
                respondedAt: new Date()
            },
            { new: true }
        );
        
        // Send notification to user
        const user = await User.findOne({ email: contact.email });
        if (user) {
            await createNotification(
                user._id,
                '❌ Contact Inquiry Update',
                `Your inquiry "${contact.subject}" has been reviewed. Response: ${contact.adminResponse}`,
                'error',
                null
            );
        }
        
        // Send rejection email
        try {
            await transporter.sendMail({
                from: `"TAMYOKIY Logistics" <${process.env.EMAIL_USER}>`,
                to: contact.email,
                subject: `Update on your inquiry - TAMYOKIY Logistics`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ff6b6b; border-radius: 10px;">
                        <h2 style="color: #ff6b6b; text-align: center;">❌ Inquiry Update</h2>
                        <p>Dear ${contact.name},</p>
                        <p>Thank you for contacting TAMYOKIY Logistics.</p>
                        <div style="background: #f5f5f5; padding: 10px; border-radius: 5px; margin: 15px 0;">
                            <p><strong>Our Response:</strong></p>
                            <p>${contact.adminResponse}</p>
                        </div>
                        <p>If you have any questions, please feel free to contact us again.</p>
                        <hr style="border-color: #ff6b6b;">
                        <p style="text-align: center; font-size: 12px;">TAMYOKIY Logistics</p>
                    </div>
                `
            });
        } catch (emailError) {
            console.error('Rejection email error:', emailError.message);
        }
        
        res.json({ success: true, contact });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ===== REPLY TO CONTACT =====
router.put('/:id/reply', async (req, res) => {
    try {
        const { adminResponse } = req.body;
        const contact = await Contact.findByIdAndUpdate(
            req.params.id,
            { 
                status: 'replied', 
                adminResponse: adminResponse,
                respondedBy: 'Admin',
                respondedAt: new Date(),
                isReplied: true,
                repliedAt: new Date()
            },
            { new: true }
        );
        
        // Send notification to user
        const user = await User.findOne({ email: contact.email });
        if (user) {
            await createNotification(
                user._id,
                '📧 Reply to Your Inquiry',
                `Admin replied to your inquiry "${contact.subject}": ${contact.adminResponse.substring(0, 100)}...`,
                'info',
                null
            );
        }
        
        // Send reply email
        try {
            await transporter.sendMail({
                from: `"TAMYOKIY Logistics" <${process.env.EMAIL_USER}>`,
                to: contact.email,
                subject: `Re: ${contact.subject} - TAMYOKIY Logistics`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #D4AF37; border-radius: 10px;">
                        <h2 style="color: #D4AF37; text-align: center;">📧 Reply to Your Inquiry</h2>
                        <p>Dear ${contact.name},</p>
                        <p>Thank you for reaching out to TAMYOKIY Logistics.</p>
                        <div style="background: #f5f5f5; padding: 10px; border-radius: 5px; margin: 15px 0;">
                            <p><strong>Your original message:</strong></p>
                            <p>${contact.message}</p>
                        </div>
                        <div style="background: #e8f4fd; padding: 10px; border-radius: 5px; margin: 15px 0;">
                            <p><strong>Our Response:</strong></p>
                            <p>${contact.adminResponse}</p>
                        </div>
                        <p>If you need further assistance, please don't hesitate to contact us again.</p>
                        <hr style="border-color: #D4AF37;">
                        <p style="text-align: center; font-size: 12px;">TAMYOKIY Logistics - We Move Freight. You Move Forward.</p>
                    </div>
                `
            });
        } catch (emailError) {
            console.error('Reply email error:', emailError.message);
        }
        
        res.json({ success: true, contact });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Get user's own inquiries
router.get('/my-inquiries', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: 'No token provided' });
        }
        
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        
        const inquiries = await Contact.find({ email: user.email }).sort({ createdAt: -1 });
        res.json(inquiries);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;