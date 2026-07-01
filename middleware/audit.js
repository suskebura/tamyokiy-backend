const AuditLog = require('../models/auditlog');

const auditLog = async (req, res, next) => {
    // Store original json method
    const originalJson = res.json;
    
    // Capture the response data
    res.json = function(data) {
        res.locals.responseData = data;
        return originalJson.call(this, data);
    };
    
    next();
};

// Function to create audit log entry
const createAuditLog = async (req, action, entityType, entityId, details) => {
    try {
        const user = req.user;
        if (!user) return;
        
        const auditEntry = new AuditLog({
            userId: user.id,
            userEmail: user.email,
            userName: user.name,
            userRole: user.role || 'admin',
            action: action,
            entityType: entityType,
            entityId: entityId,
            details: details,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent')
        });
        
        await auditEntry.save();
        console.log(`✅ Audit log created: ${action} on ${entityType}`);
    } catch (err) {
        console.error('Audit log error:', err.message);
    }
};

module.exports = { auditLog, createAuditLog };
