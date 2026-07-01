const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true 
  },
  password: { 
    type: String, 
    required: true 
  },
  role: { 
    type: String, 
    enum: ['admin', 'client', 'driver'],
    default: 'client' 
  },
  // ===== DRIVER SPECIFIC FIELDS =====
  phone: { 
    type: String, 
    default: null 
  },
  licenseNumber: { 
    type: String, 
    default: null 
  },
  vehicleType: { 
    type: String, 
    enum: ['bike', 'car', 'van', 'truck', 'heavy_truck'],
    default: null 
  },
  driverStatus: { 
    type: String, 
    enum: ['available', 'on_delivery', 'offline', 'busy'],
    default: 'offline' 
  },
  assignedShipments: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Shipment' 
  }],
  completedDeliveries: { 
    type: Number, 
    default: 0 
  },
  rating: { 
    type: Number, 
    default: 5, 
    min: 1, 
    max: 5 
  },
  totalEarnings: { 
    type: Number, 
    default: 0 
  },
  // ===== PROFILE PICTURE FIELD =====
  profilePicture: {
    type: String,
    default: null
  },
  // ===== ACCOUNT LOCK FIELDS =====
  isLocked: {
    type: Boolean,
    default: false
  },
  lockReason: {
    type: String,
    default: null
  },
  lockedAt: {
    type: Date,
    default: null
  },
  lockExpiresAt: {
    type: Date,
    default: null
  },
  failedLoginAttempts: {
    type: Number,
    default: 0
  },
  lastFailedLoginAt: {
    type: Date,
    default: null
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Hash password before saving
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password method
UserSchema.methods.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

// Method to check if account is locked
UserSchema.methods.isAccountLocked = function() {
  if (!this.isLocked) return false;
  
  // Check if lock has expired
  if (this.lockExpiresAt && new Date() > this.lockExpiresAt) {
    // Auto unlock
    this.isLocked = false;
    this.lockReason = null;
    this.lockedAt = null;
    this.lockExpiresAt = null;
    this.failedLoginAttempts = 0;
    this.save();
    return false;
  }
  
  return true;
};

// Method to record failed login
UserSchema.methods.recordFailedLogin = async function() {
  this.failedLoginAttempts += 1;
  this.lastFailedLoginAt = new Date();
  
  // Lock after 5 failed attempts
  const MAX_FAILED_ATTEMPTS = 5;
  const LOCK_DURATION_MINUTES = 15;
  
  if (this.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
    this.isLocked = true;
    this.lockReason = `Too many failed login attempts (${this.failedLoginAttempts}). Account locked for ${LOCK_DURATION_MINUTES} minutes.`;
    this.lockedAt = new Date();
    this.lockExpiresAt = new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000);
  }
  
  await this.save();
  return this.isLocked;
};

// Method to reset failed attempts on successful login
UserSchema.methods.resetFailedAttempts = async function() {
  this.failedLoginAttempts = 0;
  this.lastFailedLoginAt = null;
  this.isLocked = false;
  this.lockReason = null;
  this.lockedAt = null;
  this.lockExpiresAt = null;
  await this.save();
};

module.exports = mongoose.model('User', UserSchema);