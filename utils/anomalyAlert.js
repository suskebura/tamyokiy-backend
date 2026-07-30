// backend/utils/anomalyAlert.js
// 🚨 Anomaly Email Alert System

const sendEmail = require('./email');

/**
 * Send anomaly alert email to admins
 * @param {Object} anomaly - The anomaly object from AnomalyLog
 * @param {Array} adminEmails - Array of admin email addresses
 */
async function sendAnomalyAlertEmail(anomaly, adminEmails) {
    if (!adminEmails || adminEmails.length === 0) {
        console.log('⚠️ No admin emails configured for anomaly alerts');
        return;
    }

    const severityEmoji = {
        'critical': '🚨',
        'high': '🔴',
        'medium': '🟠',
        'low': '🟡'
    };

    const severityColor = {
        'critical': '#ff0000',
        'high': '#ff6b6b',
        'medium': '#ffa500',
        'low': '#4caf50'
    };

    const subject = `${severityEmoji[anomaly.severity] || '🚨'} CRITICAL: ${anomaly.type.replace('_', ' ').toUpperCase()} Detected`;

    const statusLabels = {
        'detected': '📋 Detected',
        'investigating': '🔍 Investigating',
        'confirmed': '✅ Confirmed',
        'false_alarm': '❌ False Alarm',
        'resolved': '✔️ Resolved'
    };

    const typeLabels = {
        'too_fast_delivery': '🚗 Too Fast Delivery',
        'repeated_failed_delivery': '🔄 Repeated Failed Delivery',
        'fake_delivery_proof': '📸 Fake Delivery Proof',
        'payment_fraud': '💳 Payment Fraud',
        'unusual_route': '🗺️ Unusual Route',
        'multiple_failed_same_customer': '👤 Multiple Failures Same Customer',
        'driver_abuse': '🚫 Driver Abuse'
    };

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #050505; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #1a1a2e; border-radius: 16px; padding: 30px; border: 1px solid rgba(212,175,55,0.2); }
        .header { text-align: center; border-bottom: 1px solid rgba(212,175,55,0.1); padding-bottom: 20px; margin-bottom: 25px; }
        .header .icon { font-size: 3rem; display: block; margin-bottom: 10px; }
        .header h1 { color: ${severityColor[anomaly.severity] || '#ff6b6b'}; margin: 0; }
        .header .severity-badge { display: inline-block; padding: 4px 16px; border-radius: 30px; background: ${severityColor[anomaly.severity] || '#ff6b6b'}; color: #050505; font-weight: 700; font-size: 0.8rem; margin-top: 8px; }
        .section { background: rgba(255,255,255,0.03); border-radius: 12px; padding: 18px; margin: 15px 0; border: 1px solid rgba(255,255,255,0.05); }
        .section .label { color: #888; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; }
        .section .value { color: #fff; font-size: 1rem; margin-top: 4px; font-weight: 500; }
        .section .value.highlight { color: ${severityColor[anomaly.severity] || '#ff6b6b'}; }
        .score-bar { width: 100%; height: 6px; background: rgba(255,255,255,0.05); border-radius: 10px; overflow: hidden; margin-top: 8px; }
        .score-bar .fill { height: 100%; border-radius: 10px; background: linear-gradient(90deg, #4caf50, #ffa500, #ff6b6b); transition: width 1.5s ease; }
        .btn { display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #D4AF37, #FFD700); color: #050505; text-decoration: none; border-radius: 40px; font-weight: 700; margin-top: 15px; }
        .footer { text-align: center; color: #666; font-size: 0.75rem; margin-top: 25px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.05); }
        .evidence { background: rgba(0,0,0,0.2); padding: 10px; border-radius: 8px; font-family: monospace; font-size: 0.8rem; color: #888; overflow-x: auto; margin-top: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <span class="icon">${severityEmoji[anomaly.severity] || '🚨'}</span>
            <h1>Security Alert: Anomaly Detected</h1>
            <span class="severity-badge">${anomaly.severity.toUpperCase()} SEVERITY</span>
        </div>

        <div class="section">
            <div class="label">📋 Anomaly Type</div>
            <div class="value highlight">${typeLabels[anomaly.type] || anomaly.type}</div>
        </div>

        <div class="section">
            <div class="label">📊 Risk Score</div>
            <div class="value highlight">${anomaly.score}/100</div>
            <div class="score-bar"><div class="fill" style="width: ${anomaly.score}%;"></div></div>
        </div>

        <div class="section">
            <div class="label">📝 Description</div>
            <div class="value">${anomaly.description}</div>
        </div>

        ${anomaly.driverName ? `
        <div class="section">
            <div class="label">🚚 Driver</div>
            <div class="value">${anomaly.driverName}${anomaly.driverId ? ` (ID: ${anomaly.driverId})` : ''}</div>
        </div>
        ` : ''}

        ${anomaly.trackingNumber ? `
        <div class="section">
            <div class="label">📦 Shipment</div>
            <div class="value">${anomaly.trackingNumber}</div>
        </div>
        ` : ''}

        ${anomaly.userEmail ? `
        <div class="section">
            <div class="label">👤 Customer</div>
            <div class="value">${anomaly.userEmail}</div>
        </div>
        ` : ''}

        <div class="section">
            <div class="label">📌 Status</div>
            <div class="value">${statusLabels[anomaly.status] || anomaly.status}</div>
        </div>

        ${anomaly.evidence ? `
        <div class="section">
            <div class="label">🔍 Evidence</div>
            <div class="evidence">${typeof anomaly.evidence === 'object' ? JSON.stringify(anomaly.evidence, null, 2) : anomaly.evidence}</div>
        </div>
        ` : ''}

        <div style="text-align: center;">
            <a href="http://localhost:5500/anomaly-dashboard.html" class="btn">
                <i class="fas fa-shield-alt"></i> View Anomaly Dashboard
            </a>
        </div>

        <div class="footer">
            <p>This is an automated alert from TAMYOKIY Logistics Security System.</p>
            <p>© ${new Date().getFullYear()} TAMYOKIY Logistics Inc.</p>
        </div>
    </div>
</body>
</html>
    `;

    // Send to all admin emails
    let sentCount = 0;
    for (const email of adminEmails) {
        try {
            const result = await sendEmail(email, subject, html);
            if (result) sentCount++;
        } catch (err) {
            console.error(`❌ Failed to send email to ${email}:`, err.message);
        }
    }

    console.log(`📧 Anomaly alert email sent to ${sentCount}/${adminEmails.length} admins`);
    return sentCount;
}

module.exports = { sendAnomalyAlertEmail };