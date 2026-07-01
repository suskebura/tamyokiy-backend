const requestIp = require('request-ip');

// Parse user agent to get device info
function parseUserAgent(userAgent) {
    if (!userAgent) return { deviceInfo: 'Unknown', browser: 'Unknown', os: 'Unknown' };
    
    let deviceInfo = 'Unknown';
    let browser = 'Unknown';
    let os = 'Unknown';
    
    const ua = userAgent.toLowerCase();
    
    // Detect OS
    if (ua.includes('windows')) os = 'Windows';
    else if (ua.includes('mac')) os = 'MacOS';
    else if (ua.includes('linux')) os = 'Linux';
    else if (ua.includes('android')) os = 'Android';
    else if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';
    else if (ua.includes('iphone')) os = 'iPhone';
    else if (ua.includes('ipad')) os = 'iPad';
    
    // Detect Browser
    if (ua.includes('chrome') && !ua.includes('edg')) browser = 'Chrome';
    else if (ua.includes('firefox')) browser = 'Firefox';
    else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
    else if (ua.includes('edg')) browser = 'Edge';
    else if (ua.includes('opera')) browser = 'Opera';
    
    // Detect Device
    if (ua.includes('mobile')) deviceInfo = 'Mobile';
    else if (ua.includes('tablet')) deviceInfo = 'Tablet';
    else deviceInfo = 'Desktop';
    
    return { deviceInfo, browser, os };
}

// Get client IP address
function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] || 
           req.connection?.remoteAddress || 
           req.socket?.remoteAddress || 
           'unknown';
}

// Simple IP to location (can be enhanced with external API)
async function getLocationFromIp(ip) {
    // You can integrate with ipapi.co or ip-api.com for real location
    // For now, return basic info
    if (ip === '::1' || ip === '127.0.0.1' || ip === 'localhost') {
        return { city: 'Local', country: 'Local', region: 'Local' };
    }
    return { city: null, country: null, region: null };
}

// Record login attempt
async function recordLogin(user, status, req, failedReason = null) {
    try {
        const LoginHistory = require('../models/LoginHistory');
        const ip = getClientIp(req);
        const userAgent = req.get('User-Agent') || 'Unknown';
        const { deviceInfo, browser, os } = parseUserAgent(userAgent);
        const location = await getLocationFromIp(ip);
        
        const loginRecord = new LoginHistory({
            userId: user._id,
            userEmail: user.email,
            userName: user.name,
            status: status,
            ipAddress: ip,
            userAgent: userAgent,
            deviceInfo: deviceInfo,
            browser: browser,
            os: os,
            location: location,
            failedReason: failedReason
        });
        
        await loginRecord.save();
        console.log(`📝 Login recorded: ${user.email} - ${status} - ${deviceInfo} - ${browser}`);
        return loginRecord;
    } catch (error) {
        console.error('Login history error:', error.message);
        return null;
    }
}

module.exports = { recordLogin, getClientIp, parseUserAgent };