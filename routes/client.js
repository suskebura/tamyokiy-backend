const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const jwt = require('jsonwebtoken');
const Shipment = require('../models/Shipment');
const Payment = require('../models/Payment');
const Invoice = require('../models/Invoice');
const User = require('../models/User');

// ===== GENERATE INVOICE HTML =====
function generateInvoiceHTML(invoice, shipment, user) {
    // ✅ FIX: Handle null user
    if (!user) {
        user = { name: 'Guest User', email: 'guest@tamyokiy.com' };
    }
    
    const statusMap = {
        'pending': 'Pending',
        'picked_up': 'Picked Up',
        'in_transit': 'In Transit',
        'out_for_delivery': 'Out for Delivery',
        'delivered': 'Delivered'
    };
    
    const methodNames = {
        'credit_card': '💳 Credit Card',
        'apple_pay': '🍎 Apple Pay',
        'google_pay': '🔵 Google Pay',
        'paypal': '💙 PayPal'
    };

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Invoice ${invoice.invoiceNumber}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #f5f5f5;
            padding: 40px;
        }
        .invoice-container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .invoice-header {
            background: linear-gradient(135deg, #D4AF37, #FFD700);
            padding: 30px;
            text-align: center;
        }
        .invoice-header h1 {
            color: #050505;
            font-size: 28px;
            margin-bottom: 5px;
        }
        .invoice-header p {
            color: #333;
            font-size: 14px;
        }
        .invoice-body {
            padding: 30px;
        }
        .company-info {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #D4AF37;
        }
        .company-info h2 {
            color: #D4AF37;
            font-size: 24px;
        }
        .company-info p {
            color: #666;
            font-size: 12px;
        }
        .details-grid {
            display: flex;
            justify-content: space-between;
            margin-bottom: 30px;
            gap: 20px;
            flex-wrap: wrap;
        }
        .details-box {
            background: #f8f8f8;
            padding: 15px;
            border-radius: 10px;
            flex: 1;
            min-width: 200px;
        }
        .details-box h4 {
            color: #D4AF37;
            margin-bottom: 10px;
            font-size: 14px;
        }
        .details-box p {
            color: #333;
            font-size: 13px;
            margin: 5px 0;
        }
        .details-box strong {
            color: #050505;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        th {
            background: #D4AF37;
            color: #050505;
            padding: 12px;
            text-align: left;
            font-weight: 600;
        }
        td {
            padding: 12px;
            border-bottom: 1px solid #ddd;
            color: #333;
        }
        .totals {
            text-align: right;
            margin-top: 20px;
            padding-top: 20px;
            border-top: 2px solid #D4AF37;
        }
        .totals p {
            margin: 5px 0;
            font-size: 14px;
        }
        .totals .grand-total {
            font-size: 18px;
            font-weight: bold;
            color: #D4AF37;
        }
        .footer {
            text-align: center;
            padding: 20px;
            background: #f8f8f8;
            font-size: 11px;
            color: #666;
        }
        .status-paid {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            background: #4caf50;
            color: white;
        }
        .status-unpaid {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            background: #ff9800;
            color: white;
        }
        .payment-method-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            background: #e8e8e8;
            color: #333;
        }
        .print-btn {
            background: #D4AF37;
            border: none;
            color: #050505;
            padding: 10px 20px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            margin-top: 20px;
            width: 100%;
        }
        .print-btn:hover {
            background: #FFD700;
        }
        @media print {
            body { background: white; padding: 0; }
            .invoice-container { box-shadow: none; }
            .print-btn { display: none; }
        }
    </style>
</head>
<body>
    <div class="invoice-container">
        <div class="invoice-header">
            <h1>TAX INVOICE</h1>
            <p>Official Shipping Invoice</p>
        </div>
        
        <div class="invoice-body">
            <div class="company-info">
                <h2>TAMYOKIY LOGISTICS INC.</h2>
                <p>Global Operations Center | hello@tamyokiy.com | +1 (800) 555-8899</p>
            </div>
            
            <div class="details-grid">
                <div class="details-box">
                    <h4>📄 INVOICE DETAILS</h4>
                    <p><strong>Invoice #:</strong> ${invoice.invoiceNumber}</p>
                    <p><strong>Date:</strong> ${new Date(invoice.createdAt).toLocaleDateString()}</p>
                    <p><strong>Tracking #:</strong> ${invoice.trackingNumber}</p>
                    <p><strong>Status:</strong> <span class="status-${invoice.status}">${invoice.status.toUpperCase()}</span></p>
                    <p><strong>Payment Method:</strong> <span class="payment-method-badge">${methodNames[invoice.paymentMethod] || 'Credit Card'}</span></p>
                </div>
                <div class="details-box">
                    <h4>👤 BILL TO</h4>
                    <p><strong>${user.name}</strong></p>
                    <p>${user.email}</p>
                </div>
            </div>
            
            <div class="details-grid">
                <div class="details-box">
                    <h4>📦 SHIPMENT DETAILS</h4>
                    <p><strong>From:</strong> ${shipment.senderName}</p>
                    <p>${shipment.senderAddress}</p>
                    <p><strong>To:</strong> ${shipment.receiverName}</p>
                    <p>${shipment.receiverAddress}</p>
                </div>
                <div class="details-box">
                    <h4>⚡ SERVICE INFO</h4>
                    <p><strong>Weight:</strong> ${shipment.weight} kg</p>
                    <p><strong>Service Type:</strong> ${shipment.serviceType || 'Standard'}</p>
                    <p><strong>Status:</strong> ${statusMap[shipment.status] || shipment.status}</p>
                </div>
            </div>
            
            <table>
                <thead>
                    <tr><th>Description</th><th>Quantity</th><th>Unit Price</th><th>Total</th></tr>
                </thead>
                <tbody>
                    <tr>
                        <td>
                            Logistics Service - ${shipment.serviceType || 'Standard'} Shipping<br>
                            <small>Tracking: ${shipment.trackingNumber}</small>
                        </td>
                        <td>1</td>
                        <td>$${invoice.amount.toFixed(2)}</td>
                        <td>$${invoice.amount.toFixed(2)}</td>
                    </tr>
                </tbody>
            </table>
            
            <div class="totals">
                <p>Subtotal: $${invoice.amount.toFixed(2)}</p>
                <p>Tax (10%): $${invoice.tax.toFixed(2)}</p>
                <p class="grand-total">Total: $${invoice.total.toFixed(2)}</p>
            </div>
            
            <button class="print-btn" onclick="window.print()">
                🖨️ Print / Save as PDF
            </button>
            
            <div style="margin-top: 20px; text-align: center; font-size: 12px; color: #888;">
                <p>Thank you for choosing TAMYOKIY Logistics!</p>
                <p>We Move Freight. You Move Forward.</p>
            </div>
        </div>
        
        <div class="footer">
            <p>TAMYOKIY Logistics Inc. © ${new Date().getFullYear()} | Built on Trust. Powered by Precision. Driven by Excellence.</p>
            <p>This is a computer-generated invoice and requires no signature.</p>
        </div>
    </div>
</body>
</html>
    `;
}

// ===== GET CLIENT SHIPMENTS =====
router.get('/shipments', auth, async (req, res) => {
    try {
        const shipments = await Shipment.find({ userId: req.user.id })
            .sort({ createdAt: -1 });
        
        res.json({
            success: true,
            count: shipments.length,
            shipments: shipments
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== GET SINGLE SHIPMENT DETAILS =====
router.get('/shipments/:trackingNumber', auth, async (req, res) => {
    try {
        const shipment = await Shipment.findOne({ 
            trackingNumber: req.params.trackingNumber,
            userId: req.user.id
        });
        
        if (!shipment) {
            return res.status(404).json({ success: false, message: 'Shipment not found' });
        }
        
        res.json({ success: true, shipment });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== GET CLIENT PAYMENTS =====
router.get('/payments', auth, async (req, res) => {
    try {
        const payments = await Payment.find({ userId: req.user.id })
            .sort({ createdAt: -1 });
        
        res.json({
            success: true,
            count: payments.length,
            payments: payments
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== GET CLIENT REPORTS / STATISTICS =====
router.get('/reports', auth, async (req, res) => {
    try {
        const shipments = await Shipment.find({ userId: req.user.id });
        
        const totalShipments = shipments.length;
        const delivered = shipments.filter(s => s.status === 'delivered').length;
        const pending = shipments.filter(s => s.status !== 'delivered').length;
        const totalSpent = shipments.reduce((sum, s) => sum + (s.amount || 0), 0);
        
        const invoices = await Invoice.find({ userId: req.user.id });
        const paidInvoices = invoices.filter(i => i.status === 'paid');
        const totalPaid = paidInvoices.reduce((sum, i) => sum + (i.total || 0), 0);
        
        res.json({
            success: true,
            stats: {
                totalShipments,
                delivered,
                pending,
                totalSpent: totalSpent.toFixed(2),
                totalPaid: totalPaid.toFixed(2),
                invoicesCount: invoices.length,
                paidInvoicesCount: paidInvoices.length
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== GET CLIENT INVOICES =====
router.get('/invoices', auth, async (req, res) => {
    try {
        const invoices = await Invoice.find({ userId: req.user.id })
            .populate('shipmentId', 'trackingNumber senderName receiverName weight')
            .sort({ createdAt: -1 });
        
        res.json({
            success: true,
            count: invoices.length,
            invoices: invoices
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== GET SINGLE INVOICE (HTML view) - WITH TOKEN SUPPORT =====
router.get('/invoices/:trackingNumber', async (req, res) => {
    try {
        let token = req.query.token || req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Unauthorized</title>
                    <style>
                        body { font-family: 'Inter', Arial, sans-serif; text-align:center; padding:50px; background:#050505; color:white; }
                        h1 { color:#ff6b6b; }
                        a { color:#D4AF37; text-decoration:none; }
                        .btn { display:inline-block; margin-top:20px; padding:12px 30px; background:linear-gradient(135deg,#D4AF37,#FFD700); color:#050505; border-radius:40px; font-weight:600; }
                    </style>
                </head>
                <body>
                    <h1>🔒 Unauthorized</h1>
                    <p>Please login to view this invoice.</p>
                    <a href="/login.html" class="btn">Go to Login</a>
                </body>
                </html>
            `);
        }
        
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            return res.status(401).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Invalid Token</title>
                    <style>
                        body { font-family: 'Inter', Arial, sans-serif; text-align:center; padding:50px; background:#050505; color:white; }
                        h1 { color:#ff6b6b; }
                        a { color:#D4AF37; text-decoration:none; }
                        .btn { display:inline-block; margin-top:20px; padding:12px 30px; background:linear-gradient(135deg,#D4AF37,#FFD700); color:#050505; border-radius:40px; font-weight:600; }
                    </style>
                </head>
                <body>
                    <h1>⛔ Invalid Token</h1>
                    <p>Your session has expired. Please login again.</p>
                    <a href="/login.html" class="btn">Go to Login</a>
                </body>
                </html>
            `);
        }
        
        const invoice = await Invoice.findOne({
            trackingNumber: req.params.trackingNumber,
            userId: decoded.id
        }).populate('shipmentId');
        
        if (!invoice) {
            return res.status(404).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Invoice Not Found</title>
                    <style>
                        body { font-family: 'Inter', Arial, sans-serif; text-align:center; padding:50px; background:#050505; color:white; }
                        h1 { color:#ff6b6b; }
                        a { color:#D4AF37; text-decoration:none; }
                        .btn { display:inline-block; margin-top:20px; padding:12px 30px; background:linear-gradient(135deg,#D4AF37,#FFD700); color:#050505; border-radius:40px; font-weight:600; }
                    </style>
                </head>
                <body>
                    <h1>📄 Invoice Not Found</h1>
                    <p>This invoice does not exist or you don't have permission to view it.</p>
                    <a href="/dashboard.html" class="btn">Go to Dashboard</a>
                </body>
                </html>
            `);
        }
        
        const user = await User.findById(decoded.id);
        const shipment = invoice.shipmentId;
        
        const html = generateInvoiceHTML(invoice, shipment, user);
        res.send(html);
    } catch (err) {
        console.error('Invoice error:', err);
        res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Error</title>
                <style>
                    body { font-family: 'Inter', Arial, sans-serif; text-align:center; padding:50px; background:#050505; color:white; }
                    h1 { color:#ff6b6b; }
                    a { color:#D4AF37; text-decoration:none; }
                    .btn { display:inline-block; margin-top:20px; padding:12px 30px; background:linear-gradient(135deg,#D4AF37,#FFD700); color:#050505; border-radius:40px; font-weight:600; }
                </style>
            </head>
            <body>
                <h1>❌ Error</h1>
                <p>${err.message}</p>
                <a href="/dashboard.html" class="btn">Go to Dashboard</a>
            </body>
            </html>
        `);
    }
});

// ===== MARK INVOICE AS PAID =====
router.put('/invoices/:trackingNumber/pay', auth, async (req, res) => {
    try {
        const invoice = await Invoice.findOne({ 
            trackingNumber: req.params.trackingNumber,
            userId: req.user.id
        });
        
        if (!invoice) {
            return res.status(404).json({ success: false, message: 'Invoice not found' });
        }
        
        invoice.status = 'paid';
        invoice.paidAt = new Date();
        await invoice.save();
        
        await Shipment.findOneAndUpdate(
            { trackingNumber: req.params.trackingNumber },
            { isPaid: true, paidAt: new Date() }
        );
        
        res.json({ success: true, message: 'Invoice marked as paid' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;