// utils/replySuggestions.js
// 💬 Auto-Reply Suggestions for Admins

function getReplySuggestion(sentiment, ticket) {
    const suggestions = {
        'urgent': {
            subject: '🚨 We understand your urgency',
            template: `We apologize for the inconvenience. We are prioritizing your issue and will get back to you within 30 minutes.
            
📌 Ticket: ${ticket?.ticketNumber || 'N/A'}
🔍 We are investigating this matter urgently.`
        },
        'angry': {
            subject: '😊 We hear your frustration',
            template: `We sincerely apologize for the frustration this has caused. This is not the experience we want you to have.
            
✅ We have escalated your ticket to our senior team.
📞 We will contact you within 1 hour to resolve this.`
        },
        'critical': {
            subject: '🚨 CRITICAL: Immediate attention needed',
            template: `⚠️ This ticket has been marked as critical.
            
📋 We are taking immediate action.
👤 A senior agent will contact you within 15 minutes.
📧 Please check your email for updates.`
        },
        'negative': {
            subject: '📋 We\'re here to help',
            template: `Thank you for reaching out. We understand your concern and are looking into this matter.
            
🔍 Our team is reviewing your case.
📅 We will update you within 2 hours.`
        },
        'normal': {
            subject: '📬 Thank you for contacting us',
            template: `Thank you for your message. We have received your ticket and will review it shortly.
            
🕐 Expected response time: 4-6 hours.
📧 You will receive updates via email.`
        }
    };
    
    let key = 'normal';
    if (sentiment === 'critical') key = 'critical';
    else if (sentiment === 'urgent') key = 'urgent';
    else if (sentiment === 'angry') key = 'angry';
    else if (sentiment === 'negative') key = 'negative';
    
    return suggestions[key] || suggestions.normal;
}

function getQuickReplies(sentiment) {
    const replies = {
        'critical': [
            '🚨 Investigating urgently, will update within 15 min',
            '✅ Escalated to senior team, they will contact you',
            '📞 Please check your email for urgent update'
        ],
        'urgent': [
            '⏳ Working on this now, update within 30 min',
            '📋 Ticket prioritized, assigned to senior agent',
            '📧 Sending detailed update via email'
        ],
        'angry': [
            '😊 We apologize, escalating to senior team',
            '✅ Your issue is our top priority',
            '📞 A manager will contact you shortly'
        ],
        'negative': [
            '📋 Investigating your issue',
            '🔍 Looking into this, will update soon',
            '📧 Sending you detailed information'
        ],
        'normal': [
            '📬 Thank you, we will review this',
            '🕐 We will get back to you within 4-6 hours',
            '📧 Check your email for updates'
        ]
    };
    
    return replies[sentiment] || replies.normal;
}

module.exports = { getReplySuggestion, getQuickReplies };