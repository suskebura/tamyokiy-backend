// utils/slackAlert.js
// 🔔 Slack Integration for Alerts

async function sendSlackEscalation(ticket, sentiment) {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
        console.log('⚠️ Slack webhook not configured');
        return;
    }
    
    const colors = {
        'critical': '#ff0000',
        'high': '#ff6b6b',
        'medium': '#ffa500',
        'normal': '#2196F3'
    };
    
    const message = {
        text: `🚨 *TICKET AUTO-ESCALATED*`,
        attachments: [{
            color: colors[sentiment.escalationLevel] || '#ff6b6b',
            fields: [
                { title: '📝 Ticket', value: ticket.ticketNumber, short: true },
                { title: '📊 Priority', value: ticket.priority, short: true },
                { title: '😠 Sentiment', value: sentiment.sentiment, short: true },
                { title: '🚨 Escalation', value: sentiment.escalationLevel, short: true },
                { title: '👤 Customer', value: ticket.userEmail, short: false },
                { title: '📌 Title', value: ticket.title, short: false },
                { title: '📝 Description', value: ticket.description.substring(0, 100) + '...', short: false }
            ],
            actions: [{
                type: 'button',
                text: 'View Ticket',
                url: `http://localhost:5500/admin-tickets.html?id=${ticket._id}`
            }],
            footer: 'TAMYOKIY Sentiment System',
            ts: Math.floor(Date.now() / 1000)
        }]
    };
    
    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message)
        });
        if (response.ok) {
            console.log('✅ Slack alert sent');
        }
    } catch (err) {
        console.error('Slack error:', err.message);
    }
}

module.exports = { sendSlackEscalation };