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
  // ✅ PHONE FIELD - REQUIRED, UNIQUE, WITH TRIM
  phone: { 
    type: String, 
    required: true,
    unique: true,
    sparse: true,  // Allows multiple null values but maintains uniqueness for non-null
    trim: true     // Removes whitespace from both ends
  },
  role: { 
    type: String, 
    enum: ['admin', 'client', 'driver'],
    default: 'client' 
  },
  // ===== DRIVER SPECIFIC FIELDS =====
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
  // ===== DRIVER PREFERENCES =====
  preferredAreas: { 
    type: [String], 
    default: [] 
  },
  maxDistance: { 
    type: Number, 
    default: 20 
  },
  shiftStart: { 
    type: String, 
    default: '08:00' 
  },
  shiftEnd: { 
    type: String, 
    default: '20:00' 
  },
  workingDays: { 
    type: [Number], 
    default: [1, 2, 3, 4, 5, 6] 
  },
  // ===== DEVICE TOKENS =====
  deviceToken: { 
    type: String, 
    default: null 
  },
  fcmToken: { 
    type: String, 
    default: null 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// ============================================================
// 🔐 HASH PASSWORD BEFORE SAVING
// ============================================================
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// ============================================================
// 🔑 COMPARE PASSWORD METHOD
// ============================================================
UserSchema.methods.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

// ============================================================
// 🔒 ACCOUNT LOCK METHODS
// ============================================================

// Check if account is locked
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

// Record failed login attempt
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

// Reset failed attempts on successful login
UserSchema.methods.resetFailedAttempts = async function() {
  this.failedLoginAttempts = 0;
  this.lastFailedLoginAt = null;
  this.isLocked = false;
  this.lockReason = null;
  this.lockedAt = null;
  this.lockExpiresAt = null;
  await this.save();
};

// ============================================================
// 📊 VIRTUAL FIELDS
// ============================================================

// Get full name with role badge
UserSchema.virtual('displayName').get(function() {
  const roleEmoji = {
    admin: '👑',
    driver: '🚚',
    client: '👤'
  };
  return `${roleEmoji[this.role] || ''} ${this.name}`;
});

// Get driver availability status
UserSchema.virtual('availabilityStatus').get(function() {
  if (this.role !== 'driver') return null;
  const statusMap = {
    available: '✅ Available',
    on_delivery: '📦 On Delivery',
    offline: '⭕ Offline',
    busy: '🔴 Busy'
  };
  return statusMap[this.driverStatus] || this.driverStatus;
});

// ============================================================
// 📊 STATIC METHODS
// ============================================================

// Find available drivers
UserSchema.statics.findAvailableDrivers = function() {
  return this.find({
    role: 'driver',
    driverStatus: 'available'
  }).select('name email phone rating vehicleType driverStatus');
};

// Find drivers by location proximity (requires geospatial index)
UserSchema.statics.findNearbyDrivers = function(lat, lng, maxDistance = 10) {
  // This requires a geospatial index on location field
  // Add location field if needed
  return this.find({
    role: 'driver',
    driverStatus: 'available'
  }).select('name email phone rating vehicleType driverStatus');
};

// ============================================================
// 🔍 INDEXES
// ============================================================

// Create indexes for better query performance
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ phone: 1 }, { unique: true, sparse: true });
UserSchema.index({ role: 1 });
UserSchema.index({ driverStatus: 1 });
UserSchema.index({ isLocked: 1 });
UserSchema.index({ createdAt: -1 });

// Compound index for driver queries
UserSchema.index({ role: 1, driverStatus: 1 });

module.exports = mongoose.model('User', UserSchema);