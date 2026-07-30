const express = require('express');
const router = express.Router();
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const Shipment = require('../models/Shipment');
const User = require('../models/User');
const auth = require('../middleware/auth');

// Configure multer for CSV upload
const upload = multer({
    dest: 'uploads/csv/',
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'));
        }
    },
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// ============================================================
// 📤 UPLOAD CSV AND PROCESS BULK SHIPMENTS
// ============================================================

router.post('/upload', auth, upload.single('csvFile'), async (req, res) => {
    try {
        const filePath = req.file.path;
        const results = [];
        const errors = [];
        const trackingNumbers = [];

        // Read CSV file
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', async () => {
                // Process each row
                for (const row of results) {
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
                            declaredValue
                        } = row;

                        // Validate required fields
                        if (!senderName || !receiverName || !weight) {
                            errors.push({
                                row: row,
                                error: 'Missing required fields'
                            });
                            continue;
                        }

                        // Generate tracking number
                        const trackingNumber = 'TAM' + Date.now().toString(36).toUpperCase() +
                            Math.random().toString(36).substring(2, 6).toUpperCase();

                        // Calculate amount
                        const amount = 10 + (parseFloat(weight) * 5);

                        // Calculate ETA
                        const daysToAdd = serviceType === 'overnight' ? 1 :
                            serviceType === 'express' ? 3 : 7;
                        const estimatedDelivery = new Date();
                        estimatedDelivery.setDate(estimatedDelivery.getDate() + daysToAdd);

                        // Create shipment
                        const shipment = new Shipment({
                            trackingNumber,
                            client: req.user.id,
                            senderName,
                            senderAddress,
                            senderPhone: senderPhone || '',
                            receiverName,
                            receiverAddress,
                            receiverPhone: receiverPhone || '',
                            weight: parseFloat(weight),
                            serviceType: serviceType || 'standard',
                            amount: amount,
                            declaredValue: parseFloat(declaredValue) || 0,
                            status: 'pending',
                            estimatedDelivery,
                            isPaid: false,
                            createdAt: new Date(),
                            statusHistory: [{
                                status: 'pending',
                                timestamp: new Date(),
                                note: 'Bulk shipment created'
                            }]
                        });

                        await shipment.save();
                        trackingNumbers.push({
                            trackingNumber,
                            receiverName,
                            receiverAddress
                        });

                    } catch (err) {
                        errors.push({
                            row: row,
                            error: err.message
                        });
                    }
                }

                // Clean up uploaded file
                fs.unlinkSync(filePath);

                // Send notification to client
                try {
                    const notificationService = require('../services/notificationService');
                    const user = await User.findById(req.user.id);
                    
                    await notificationService.sendEmail(
                        user.email,
                        `📦 Bulk Shipments Created - ${trackingNumbers.length} shipments`,
                        `
                            <div style="font-family: Arial; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
                                <div style="background: #1a1a2e; padding: 20px; border-radius: 10px; color: #D4AF37; text-align: center;">
                                    <h1>📦 Bulk Shipments Created</h1>
                                </div>
                                <div style="background: white; padding: 30px; border-radius: 10px; margin-top: 20px;">
                                    <h2 style="color: #D4AF37;">✅ ${trackingNumbers.length} Shipments Created!</h2>
                                    <p>Your bulk upload has been processed successfully.</p>
                                    <div style="background: #f0f0f0; padding: 15px; border-radius: 8px; margin: 20px 0; max-height: 300px; overflow-y: auto;">
                                        <table style="width:100%; border-collapse: collapse;">
                                            <tr style="border-bottom: 1px solid #ddd;">
                                                <th style="padding: 8px; text-align: left;">Tracking</th>
                                                <th style="padding: 8px; text-align: left;">Receiver</th>
                                            </tr>
                                            ${trackingNumbers.map(t => `
                                                <tr style="border-bottom: 1px solid #eee;">
                                                    <td style="padding: 8px;"><a href="https://tamyokiy.com/track/${t.trackingNumber}" style="color: #D4AF37;">${t.trackingNumber}</a></td>
                                                    <td style="padding: 8px;">${t.receiverName}</td>
                                                </tr>
                                            `).join('')}
                                        </table>
                                    </div>
                                    ${errors.length > 0 ? `
                                        <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 15px 0;">
                                            <p style="color: #856404;">⚠️ ${errors.length} rows had errors and were skipped.</p>
                                        </div>
                                    ` : ''}
                                    <hr style="border: 1px solid #eee; margin: 20px 0;">
                                    <p style="color: #888; font-size: 0.8rem;">Thank you for choosing TAMYOKIY Logistics</p>
                                </div>
                            </div>
                        `
                    );
                } catch (emailErr) {
                    console.log('Email error:', emailErr.message);
                }

                res.json({
                    success: true,
                    message: 'Bulk shipments created successfully',
                    totalProcessed: trackingNumbers.length,
                    totalErrors: errors.length,
                    trackingNumbers: trackingNumbers,
                    errors: errors
                });
            });
    } catch (err) {
        console.error('Bulk upload error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 📥 DOWNLOAD CSV TEMPLATE
// ============================================================

router.get('/template', (req, res) => {
    const template = `senderName,senderAddress,senderPhone,receiverName,receiverAddress,receiverPhone,weight,serviceType,declaredValue
John Doe,123 Main St,1234567890,Jane Smith,456 Oak Ave,0987654321,10,standard,100
Bob Johnson,789 Pine St,5555555555,Alice Brown,321 Elm St,4444444444,15,express,200`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=shipment_template.csv');
    res.send(template);
});

module.exports = router;