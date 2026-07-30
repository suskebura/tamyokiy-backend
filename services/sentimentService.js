// services/sentimentService.js
// 🤖 Complete NLP Sentiment Analysis Service

const natural = require('natural');
const { SentimentAnalyzer, PorterStemmer } = natural;
const SentimentLog = require('../models/SentimentLog');
const Ticket = require('../models/Ticket');
const Rating = require('../models/Rating');
const User = require('../models/User');

class SentimentService {

    /**
     * 🔍 Analyze sentiment of a text using NLP
     * UPDATED: Prioritizes anger and urgency detection
     */
    analyzeSentiment(text) {
        if (!text) return this.getDefaultSentiment();
        
        const lowerText = text.toLowerCase();
        
        // ============================================================
        // 1. CHECK FOR ANGER KEYWORDS FIRST
        // ============================================================
        const angerKeywords = [
            'angry', 'furious', 'frustrated', 'mad', 'horrible', 
            'terrible', 'unacceptable', 'worst', 'disgusting', 
            'outraged', 'livid', 'irate', 'infuriated', 'enraged',
            'upset', 'annoyed', 'irritated', 'aggravated', 'exasperated'
        ];
        const angerMatches = angerKeywords.filter(k => lowerText.includes(k));
        const hasAnger = angerMatches.length > 0;
        
        // ============================================================
        // 2. CHECK FOR URGENCY KEYWORDS
        // ============================================================
        const urgentKeywords = [
            'urgent', 'asap', 'immediately', 'emergency', 'critical',
            'hurry', 'now', 'today', 'deadline', 'rush',
            'time sensitive', 'expedite', 'priority', 'soon',
            'right away', 'without delay', 'immediate'
        ];
        const urgentMatches = urgentKeywords.filter(k => lowerText.includes(k));
        const hasUrgency = urgentMatches.length > 0;
        
        // ============================================================
        // 3. CHECK FOR FRUSTRATION KEYWORDS
        // ============================================================
        const frustrationKeywords = [
            'still waiting', 'no response', 'not resolved', 'escalate',
            'waste of time', 'runaround', 'going in circles',
            "can't believe", 'not helpful', 'ignored', 'ignoring',
            'repeatedly', 'again', 'still', 'never', 'always',
            'tired of', 'done with', 'fed up', 'sick of',
            'third time', 'fourth time', 'waiting', 'delay'
        ];
        const frustrationMatches = frustrationKeywords.filter(k => lowerText.includes(k));
        const hasFrustration = frustrationMatches.length > 0;
        
        // ============================================================
        // 4. USE NLP FOR BASE SENTIMENT
        // ============================================================
        let analyzer;
        try {
            analyzer = new SentimentAnalyzer('English', PorterStemmer, 'afinn');
        } catch (err) {
            // Fallback if natural library fails
            console.log('⚠️ NLP analyzer fallback:', err.message);
            analyzer = { getSentiment: (words) => 0 };
        }
        
        const words = lowerText.split(/\s+/);
        let score = analyzer.getSentiment(words);
        
        // ============================================================
        // 5. BOOST SCORE BASED ON KEYWORD DETECTION
        // ============================================================
        // Anger boost - makes score more negative
        if (hasAnger) {
            score -= angerMatches.length * 0.6;
        }
        
        // Urgency boost
        if (hasUrgency) {
            score -= urgentMatches.length * 0.4;
        }
        
        // Frustration boost
        if (hasFrustration) {
            score -= frustrationMatches.length * 0.3;
        }
        
        // ============================================================
        // 6. DETERMINE SENTIMENT WITH PRIORITY TO ANGER
        // ============================================================
        let sentiment = 'neutral';
        let confidence = 50;
        
        // Anger has highest priority
        if (hasAnger || score < -2.5) {
            sentiment = 'angry';
            confidence = Math.min(95, 65 + Math.abs(score) * 5 + angerMatches.length * 5);
        }
        // Urgency has second priority
        else if (hasUrgency || score < -0.8) {
            sentiment = 'urgent';
            confidence = Math.min(90, 55 + Math.abs(score) * 5 + urgentMatches.length * 3);
        }
        // Negative sentiment
        else if (score < -0.5) {
            sentiment = 'negative';
            confidence = Math.min(85, 50 + Math.abs(score) * 5);
        }
        // Positive sentiment
        else if (score > 2) {
            sentiment = 'positive';
            confidence = Math.min(95, 50 + score * 5);
        }
        
        // If anger detected but score is not low enough, still mark as angry
        if (hasAnger && sentiment !== 'angry') {
            sentiment = 'angry';
            confidence = Math.min(90, confidence + 20);
        }
        
        // If urgency detected but score is not low enough, still mark as urgent
        if (hasUrgency && sentiment === 'neutral' && !hasAnger) {
            sentiment = 'urgent';
            confidence = Math.min(85, confidence + 15);
        }
        
        // ============================================================
        // 7. CALCULATE BOOLEAN FLAGS
        // ============================================================
        const isUrgent = hasUrgency || urgentMatches.length > 0 || score < -1;
        const isAngry = hasAnger || angerMatches.length > 0 || score < -2;
        
        // ============================================================
        // 8. DETERMINE ESCALATION LEVEL
        // ============================================================
        let escalationLevel = 'normal';
        if (isUrgent && isAngry) escalationLevel = 'critical';
        else if (isUrgent) escalationLevel = 'high';
        else if (isAngry) escalationLevel = 'medium';
        else if (hasFrustration) escalationLevel = 'medium';
        
        // ============================================================
        // 9. EXTRACT MATCHED KEYWORDS
        // ============================================================
        const urgentRegex = /urgent|asap|immediately|emergency|critical|hurry|now|today|deadline|rush|time sensitive|expedite|priority/gi;
        const angryRegex = /angry|furious|frustrated|mad|horrible|terrible|unacceptable|worst|disgusting|outraged|livid|irate|infuriated|enraged/gi;
        const frustratedRegex = /frustrated|annoyed|irritated|upset|aggravated|exasperated/gi;
        const negativeRegex = /bad|poor|terrible|awful|horrible|disappointed|dissatisfied/gi;
        const positiveRegex = /great|excellent|amazing|wonderful|fantastic|good|happy|satisfied/gi;
        const satisfiedRegex = /solved|resolved|fixed|works|working|finally|thank you/gi;
        
        return {
            sentiment,
            confidence: Math.round(confidence),
            scores: {
                urgency: isUrgent ? Math.min(100, 60 + urgentMatches.length * 10) : 20,
                anger: isAngry ? Math.min(100, 60 + angerMatches.length * 10) : 20,
                frustration: hasFrustration ? Math.min(100, 50 + frustrationMatches.length * 8) : 20,
                negative: score < 0 ? Math.min(100, Math.abs(score) * 20 + (hasAnger ? 20 : 0)) : 20,
                positive: score > 0 ? Math.min(100, score * 20) : 20,
                satisfaction: score > 1 ? Math.min(100, score * 20) : 20,
                overall: Math.min(100, Math.max(0, 50 + score * 10))
            },
            isUrgent,
            isAngry,
            escalationLevel,
            matchedKeywords: {
                urgent: lowerText.match(urgentRegex) || [],
                angry: lowerText.match(angryRegex) || [],
                frustrated: lowerText.match(frustratedRegex) || [],
                negative: lowerText.match(negativeRegex) || [],
                positive: lowerText.match(positiveRegex) || [],
                satisfied: lowerText.match(satisfiedRegex) || []
            },
            text: text.substring(0, 200),
            nlpScore: Math.round(score * 100) / 100,
            keywordCounts: {
                anger: angerMatches.length,
                urgency: urgentMatches.length,
                frustration: frustrationMatches.length
            }
        };
    }

    /**
     * 📊 Analyze ticket sentiment
     */
    async analyzeTicket(ticketId) {
        try {
            const ticket = await Ticket.findById(ticketId);
            if (!ticket) return null;
            
            const textToAnalyze = (ticket.description || '') + ' ' + (ticket.title || '');
            const result = this.analyzeSentiment(textToAnalyze);
            
            // Save sentiment log
            const sentimentLog = new SentimentLog({
                entityType: 'ticket',
                entityId: ticket._id,
                text: textToAnalyze.substring(0, 500),
                sentiment: result.sentiment,
                confidence: result.confidence,
                scores: result.scores,
                isUrgent: result.isUrgent,
                isAngry: result.isAngry,
                escalationLevel: result.escalationLevel,
                matchedKeywords: result.matchedKeywords,
                nlpScore: result.nlpScore,
                keywordCounts: result.keywordCounts,
                metadata: {
                    ticketNumber: ticket.ticketNumber,
                    userId: ticket.userId,
                    userEmail: ticket.userEmail,
                    category: ticket.category,
                    priority: ticket.priority,
                    status: ticket.status
                }
            });
            
            await sentimentLog.save();
            
            // Store sentiment on ticket
            ticket.sentiment = {
                label: result.sentiment,
                score: result.scores.overall,
                confidence: result.confidence,
                isUrgent: result.isUrgent,
                isAngry: result.isAngry,
                escalationLevel: result.escalationLevel,
                analyzedAt: new Date()
            };
            await ticket.save();
            
            // Auto-escalate if urgent or angry
            if (result.isUrgent || result.isAngry) {
                await this.autoEscalateTicket(ticket, result);
            }
            
            return { ticket, sentiment: result, sentimentLog };
            
        } catch (err) {
            console.error('Analyze ticket error:', err);
            return null;
        }
    }

    /**
     * 🚨 Auto-escalate ticket
     */
    async autoEscalateTicket(ticket, sentiment) {
        try {
            const oldPriority = ticket.priority;
            let newPriority = ticket.priority;
            let escalationNote = '';
            
            if (sentiment.escalationLevel === 'critical') {
                newPriority = 'urgent';
                escalationNote = '🚨 Auto-escalated to URGENT due to critical sentiment (anger + urgency)';
            } else if (sentiment.escalationLevel === 'high') {
                if (ticket.priority !== 'urgent') {
                    newPriority = 'high';
                    escalationNote = '🔴 Auto-escalated to HIGH priority due to urgent sentiment';
                }
            } else if (sentiment.escalationLevel === 'medium') {
                if (ticket.priority === 'low') {
                    newPriority = 'medium';
                    escalationNote = '🟠 Auto-escalated to MEDIUM priority due to frustrated sentiment';
                }
            }
            
            if (newPriority !== oldPriority) {
                ticket.priority = newPriority;
                ticket.escalationNote = escalationNote;
                ticket.autoEscalated = true;
                ticket.escalatedAt = new Date();
                await ticket.save();
                
                // Send email notifications to admins
                try {
                    const sendEmail = require('../utils/email');
                    const User = require('../models/User');
                    const admins = await User.find({ role: 'admin' });
                    
                    for (const admin of admins) {
                        await sendEmail(
                            admin.email,
                            `🚨 URGENT: Ticket ${ticket.ticketNumber} Auto-Escalated`,
                            `
                            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #1a1a2e; color: #e0e0e0; border-radius: 12px; border: 1px solid #ff6b6b;">
                                <h2 style="color: #ff6b6b; text-align: center;">🚨 Ticket Auto-Escalated</h2>
                                
                                <div style="background: rgba(255,107,107,0.1); padding: 15px; border-radius: 8px; border-left: 4px solid #ff6b6b; margin-bottom: 15px;">
                                    <p><strong>Ticket:</strong> #${ticket.ticketNumber}</p>
                                    <p><strong>Priority:</strong> <span style="color: #ff6b6b; font-weight: 700;">${newPriority}</span> (was ${oldPriority})</p>
                                    <p><strong>Reason:</strong> ${escalationNote}</p>
                                    <p><strong>NLP Score:</strong> ${sentiment.nlpScore || 'N/A'}</p>
                                    <p><strong>Keyword Counts:</strong> Anger: ${sentiment.keywordCounts?.anger || 0}, Urgency: ${sentiment.keywordCounts?.urgency || 0}</p>
                                </div>
                                
                                <div style="background: rgba(255,255,255,0.03); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                                    <p><strong>Customer:</strong> ${ticket.userEmail}</p>
                                    <p><strong>Title:</strong> ${ticket.title}</p>
                                    <p><strong>Description:</strong> ${ticket.description.substring(0, 300)}${ticket.description.length > 300 ? '...' : ''}</p>
                                    <p><strong>Category:</strong> ${ticket.category}</p>
                                    <p><strong>Status:</strong> ${ticket.status}</p>
                                    ${sentiment.matchedKeywords?.urgent?.length > 0 ? `<p><strong>🚨 Urgent Keywords:</strong> ${sentiment.matchedKeywords.urgent.join(', ')}</p>` : ''}
                                    ${sentiment.matchedKeywords?.angry?.length > 0 ? `<p><strong>😤 Angry Keywords:</strong> ${sentiment.matchedKeywords.angry.join(', ')}</p>` : ''}
                                </div>
                                
                                <div style="text-align: center; margin-top: 20px;">
                                    <a href="http://localhost:5500/admin-tickets.html?id=${ticket._id}" 
                                       style="display: inline-block; background: linear-gradient(135deg, #D4AF37, #FFD700); color: #050505; padding: 10px 24px; text-decoration: none; border-radius: 30px; font-weight: 600;">
                                        View Ticket
                                    </a>
                                </div>
                                
                                <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.05); text-align: center; color: #555; font-size: 0.7rem;">
                                    This is an automated alert from TAMYOKIY Sentiment Analysis System.
                                    <br>Time: ${new Date().toISOString()}
                                </div>
                            </div>
                            `
                        );
                    }
                    console.log(`📧 Email alert sent to ${admins.length} admins`);
                } catch (emailErr) {
                    console.error('Email error:', emailErr.message);
                }
                
                // Send in-app notifications
                try {
                    const { createNotification } = require('../routes/notification');
                    const admins = await User.find({ role: 'admin' });
                    
                    for (const admin of admins) {
                        await createNotification(
                            admin._id,
                            `🚨 Ticket Auto-Escalated: ${ticket.ticketNumber}`,
                            `Ticket "${ticket.title}" was auto-escalated to ${newPriority}. ${escalationNote}`,
                            'error',
                            ticket._id
                        );
                    }
                } catch (notifErr) {
                    console.error('Notification error:', notifErr.message);
                }
                
                console.log(`🚨 Ticket ${ticket.ticketNumber} auto-escalated to ${newPriority}`);
                return true;
            }
            
            return false;
            
        } catch (err) {
            console.error('Auto-escalate error:', err);
            return false;
        }
    }

    /**
     * 📊 Analyze rating sentiment
     */
    async analyzeRating(ratingId) {
        try {
            const rating = await Rating.findById(ratingId);
            if (!rating) return null;
            
            const textToAnalyze = rating.comment || '';
            const result = this.analyzeSentiment(textToAnalyze);
            
            // Save sentiment log
            const sentimentLog = new SentimentLog({
                entityType: 'rating',
                entityId: rating._id,
                text: textToAnalyze.substring(0, 500),
                sentiment: result.sentiment,
                confidence: result.confidence,
                scores: result.scores,
                isUrgent: result.isUrgent,
                isAngry: result.isAngry,
                escalationLevel: result.escalationLevel,
                matchedKeywords: result.matchedKeywords,
                nlpScore: result.nlpScore,
                keywordCounts: result.keywordCounts,
                metadata: {
                    trackingNumber: rating.trackingNumber,
                    userId: rating.userId,
                    driverId: rating.driverId,
                    driverName: rating.driverName,
                    rating: rating.overallRating,
                    driverRating: rating.driverRating,
                    serviceRating: rating.serviceRating
                }
            });
            
            await sentimentLog.save();
            
            // Store sentiment on rating
            rating.sentiment = {
                label: result.sentiment,
                score: result.scores.overall,
                confidence: result.confidence,
                isUrgent: result.isUrgent,
                isAngry: result.isAngry,
                analyzedAt: new Date()
            };
            await rating.save();
            
            return { rating, sentiment: result, sentimentLog };
            
        } catch (err) {
            console.error('Analyze rating error:', err);
            return null;
        }
    }

    /**
     * 📊 Get sentiment stats
     */
    async getSentimentStats() {
        try {
            const total = await SentimentLog.countDocuments();
            const urgent = await SentimentLog.countDocuments({ isUrgent: true });
            const angry = await SentimentLog.countDocuments({ isAngry: true });
            
            const bySentiment = await SentimentLog.aggregate([
                { $group: { _id: '$sentiment', count: { $sum: 1 } } }
            ]);
            
            const byEscalation = await SentimentLog.aggregate([
                { $group: { _id: '$escalationLevel', count: { $sum: 1 } } }
            ]);
            
            const avgConfidence = await SentimentLog.aggregate([
                { $group: { _id: null, avg: { $avg: '$confidence' } } }
            ]);
            
            // Get average scores
            const avgScores = await SentimentLog.aggregate([
                {
                    $group: {
                        _id: null,
                        avgUrgency: { $avg: '$scores.urgency' },
                        avgAnger: { $avg: '$scores.anger' },
                        avgFrustration: { $avg: '$scores.frustration' },
                        avgOverall: { $avg: '$scores.overall' }
                    }
                }
            ]);
            
            return {
                total,
                urgent,
                angry,
                bySentiment,
                byEscalation,
                avgConfidence: Math.round(avgConfidence[0]?.avg || 0),
                avgScores: avgScores[0] || {
                    avgUrgency: 0,
                    avgAnger: 0,
                    avgFrustration: 0,
                    avgOverall: 50
                }
            };
        } catch (err) {
            console.error('Get stats error:', err);
            return {
                total: 0,
                urgent: 0,
                angry: 0,
                bySentiment: [],
                byEscalation: [],
                avgConfidence: 0,
                avgScores: { avgUrgency: 0, avgAnger: 0, avgFrustration: 0, avgOverall: 50 }
            };
        }
    }

    /**
     * 📊 Get sentiment trends over time
     */
    async getSentimentTrends(days = 30) {
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            
            const trends = await SentimentLog.aggregate([
                { $match: { createdAt: { $gte: startDate } } },
                {
                    $group: {
                        _id: {
                            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                            sentiment: '$sentiment'
                        },
                        count: { $sum: 1 },
                        avgScore: { $avg: '$scores.overall' }
                    }
                },
                { $sort: { '_id.date': 1 } }
            ]);
            
            // Format for chart
            const result = {};
            trends.forEach(t => {
                if (!result[t._id.date]) {
                    result[t._id.date] = {
                        positive: 0,
                        negative: 0,
                        neutral: 0,
                        angry: 0,
                        urgent: 0,
                        total: 0,
                        avgScore: 0
                    };
                }
                result[t._id.date][t._id.sentiment] = t.count;
                result[t._id.date].total += t.count;
                result[t._id.date].avgScore = t.avgScore;
            });
            
            const chartData = Object.keys(result).map(date => ({
                date,
                ...result[date]
            }));
            
            return {
                data: chartData,
                summary: {
                    totalDays: chartData.length,
                    totalEntries: chartData.reduce((sum, d) => sum + d.total, 0),
                    avgDaily: chartData.length > 0 ? 
                        Math.round(chartData.reduce((sum, d) => sum + d.total, 0) / chartData.length) : 0
                }
            };
            
        } catch (err) {
            console.error('Get sentiment trends error:', err);
            return { data: [], summary: { totalDays: 0, totalEntries: 0, avgDaily: 0 } };
        }
    }

    /**
     * 🔄 Get default sentiment
     */
    getDefaultSentiment() {
        return {
            sentiment: 'neutral',
            confidence: 50,
            scores: {
                urgency: 20,
                anger: 20,
                frustration: 20,
                negative: 20,
                positive: 20,
                satisfaction: 20,
                overall: 50
            },
            isUrgent: false,
            isAngry: false,
            escalationLevel: 'normal',
            matchedKeywords: {
                urgent: [],
                angry: [],
                frustrated: [],
                negative: [],
                positive: [],
                satisfied: []
            },
            text: '',
            nlpScore: 0,
            keywordCounts: {
                anger: 0,
                urgency: 0,
                frustration: 0
            }
        };
    }
}

module.exports = new SentimentService();