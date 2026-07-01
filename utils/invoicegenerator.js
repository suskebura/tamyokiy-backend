// Simple HTML/CSS Invoice Generator (No external dependencies)
// For production PDF, you can add pdfkit later

function generateInvoiceHTML(shipment, user) {
    const invoiceNumber = `INV-${shipment.trackingNumber}-${new Date().getFullYear()}`;
    const subtotal = shipment.amount || 0;
    const tax = subtotal * 0.1; // 10% tax
    const total = subtotal + tax;
    
    const statusMap = {
        'pending': 'Pending',
        'picked_up': 'Picked Up',
        'in_transit': 'In Transit',
        'out_for_delivery': 'Out for Delivery',
        'delivered': 'Delivered'
    };
    
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Invoice ${invoiceNumber}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
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
        .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
        }
        .status-delivered { background: #4caf50; color: white; }
        .status-in_transit { background: #2196F3; color: white; }
        .status-pending { background: #ff9800; color: white; }
        .status-default { background: #9e9e9e; color: white; }
        @media print {
            body {
                background: white;
                padding: 0;
            }
            .invoice-container {
                box-shadow: none;
            }
            .no-print {
                display: none;
            }
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
                    <p><strong>Invoice #:</strong> ${invoiceNumber}</p>
                    <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
                    <p><strong>Tracking #:</strong> ${shipment.trackingNumber}</p>
                    <p><strong>Status:</strong> <span class="status-badge status-${shipment.status === 'delivered' ? 'delivered' : shipment.status === 'in_transit' ? 'in_transit' : shipment.status === 'pending' ? 'pending' : 'default'}">${statusMap[shipment.status] || shipment.status}</span></p>
                </div>
                <div class="details-box">
                    <h4>👤 BILL TO</h4>
                    <p><strong>${user.name}</strong></p>
                    <p>${user.email}</p>
                    <p>Client ID: ${user._id.toString().slice(-8)}</p>
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
                    <p><strong>Est. Delivery:</strong> ${shipment.estimatedDelivery ? new Date(shipment.estimatedDelivery).toLocaleDateString() : 'N/A'}</p>
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
                        <td>$${subtotal.toFixed(2)}</td>
                        <td>$${subtotal.toFixed(2)}</td>
                    </tr>
                </tbody>
            </table>
            
            <div class="totals">
                <p>Subtotal: $${subtotal.toFixed(2)}</p>
                <p>Tax (10%): $${tax.toFixed(2)}</p>
                <p class="grand-total">Total: $${total.toFixed(2)}</p>
            </div>
            
            <button class="print-btn no-print" onclick="window.print()">
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

// Function to generate and serve invoice
function generateInvoice(shipment, user, res) {
    const html = generateInvoiceHTML(shipment, user);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
}

module.exports = { generateInvoiceHTML, generateInvoice };