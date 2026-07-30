// utils/sentimentKeywords.js
// 📊 Sentiment keyword lists for NLP analysis

const URGENT_KEYWORDS = [
    // Urgency
    'urgent', 'asap', 'immediately', 'emergency', 'critical',
    'hurry', 'quick', 'fast', 'soon', 'today',
    'now', 'right away', 'without delay', 'priority',
    'deadline', 'time sensitive', 'expedite', 'rush'
];

const ANGRY_KEYWORDS = [
    // Anger
    'angry', 'furious', 'outraged', 'livid', 'irate',
    'frustrated', 'upset', 'annoyed', 'irritated', 'mad',
    'horrible', 'terrible', 'awful', 'worst', 'useless',
    'disgusting', 'ridiculous', 'unacceptable', 'incompetent',
    'failure', 'disappointed', 'let down', 'failing',
    'stupid', 'dumb', 'idiot', 'incompetent', 'pathetic'
];

const FRUSTRATION_KEYWORDS = [
    // Frustration
    'still waiting', 'no response', 'not resolved', 'escalate',
    'waste of time', 'runaround', 'going in circles',
    'can\'t believe', 'not helpful', 'ignored', 'ignoring',
    'repeatedly', 'again', 'still', 'never', 'always',
    'tired of', 'done with', 'fed up', 'sick of'
];

const NEGATIVE_KEYWORDS = [
    // General Negative
    'bad', 'poor', 'terrible', 'awful', 'horrible',
    'disappointed', 'disappointing', 'upset', 'unhappy',
    'dissatisfied', 'complaint', 'issue', 'problem',
    'fail', 'failed', 'failure', 'wrong', 'incorrect',
    'mistake', 'error', 'fault', 'blame', 'misunderstanding'
];

const POSITIVE_KEYWORDS = [
    // Positive
    'great', 'excellent', 'amazing', 'wonderful', 'fantastic',
    'good', 'happy', 'satisfied', 'pleased', 'grateful',
    'appreciate', 'thanks', 'thankful', 'helpful', 'supportive',
    'quick', 'efficient', 'professional', 'knowledgeable',
    'perfect', 'outstanding', 'exceptional', 'superb',
    'impressed', 'recommend', 'best', 'awesome', 'brilliant'
];

const SATISFACTION_KEYWORDS = [
    // Satisfaction
    'solved', 'resolved', 'fixed', 'works', 'working',
    'finally', 'thank you', 'appreciated', 'great job',
    'well done', 'perfect', 'exactly', 'clear', 'understand',
    'helpful', 'support', 'team', 'knowledge', 'expert'
];

const URGENCY_WEIGHTS = {
    'urgent': 10,
    'asap': 9,
    'emergency': 10,
    'critical': 9,
    'hurry': 7,
    'immediately': 10,
    'now': 8,
    'priority': 7,
    'deadline': 6,
    'rush': 8
};

const ANGER_WEIGHTS = {
    'angry': 10,
    'furious': 10,
    'horrible': 8,
    'terrible': 8,
    'unacceptable': 9,
    'disgusting': 8,
    'ridiculous': 7,
    'incompetent': 9,
    'failure': 7,
    'useless': 8,
    'worst': 9
};

module.exports = {
    URGENT_KEYWORDS,
    ANGRY_KEYWORDS,
    FRUSTRATION_KEYWORDS,
    NEGATIVE_KEYWORDS,
    POSITIVE_KEYWORDS,
    SATISFACTION_KEYWORDS,
    URGENCY_WEIGHTS,
    ANGER_WEIGHTS
};