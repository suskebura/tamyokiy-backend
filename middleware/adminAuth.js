const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * ADMIN AUTHENTICATION MIDDLEWARE
 * Verifies JWT token and checks if user has admin role
 */
module.exports = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.header('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    // Debug logging (remove in production)
    console.log('🔐 Admin Auth Check:');
    console.log('  - Authorization header:', authHeader ? 'Present' : 'Missing');
    console.log('  - Token:', token ? `${token.substring(0, 20)}...` : 'None');
    
    // Check if token exists
    if (!token) {
      console.log('❌ No token provided');
      return res.status(401).json({ 
        success: false,
        message: 'No token, authorization denied' 
      });
    }
    
    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('✅ Token verified for user ID:', decoded.id);
    } catch (err) {
      console.log('❌ Token verification failed:', err.message);
      return res.status(401).json({ 
        success: false,
        message: 'Token is not valid or expired' 
      });
    }
    
    // Find user in database
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      console.log('❌ User not found for ID:', decoded.id);
      return res.status(401).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    // Check if user is admin
    if (user.role !== 'admin') {
      console.log('❌ User is not admin. Role:', user.role);
      return res.status(403).json({ 
        success: false,
        message: 'Admin access required. Your role: ' + user.role 
      });
    }
    
    // Attach user to request
    req.user = user;
    console.log('✅ Admin access granted for:', user.email);
    
    next();
    
  } catch (err) {
    console.error('❌ Admin auth error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error during authentication' 
    });
  }
};