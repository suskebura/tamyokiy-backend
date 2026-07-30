// scripts/create-admin.js
const mongoose = require('mongoose');
const User = require('../models/User');
const path = require('path');

// Load .env from the root folder
require('dotenv').config({ path: path.join(__dirname, '../.env') });

console.log('🔍 Looking for .env at:', path.join(__dirname, '../.env'));
console.log('📦 MONGODB_URI:', process.env.MONGODB_URI ? '✅ Found' : '❌ Not found');

async function createAdmin() {
  try {
    if (!process.env.MONGODB_URI) {
      console.error('❌ MONGODB_URI not found in .env file!');
      console.log('💡 Make sure .env file exists in the root folder.');
      process.exit(1);
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const existingAdmin = await User.findOne({ email: 'admin@tamyokiy.com' });
    if (existingAdmin) {
      console.log('⚠️ Admin already exists:', existingAdmin.email);
      process.exit(0);
    }

    const admin = new User({
      name: 'TAMYOKIY Admin',
      email: 'admin@tamyokiy.com',
      password: 'admin123456',
      role: 'admin'
    });

    await admin.save();
    console.log('✅ Admin created successfully!');
    console.log('   Email: admin@tamyokiy.com');
    console.log('   Password: admin123456');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

createAdmin();