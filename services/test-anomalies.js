// scripts/test-anomalies.js
// Run: node scripts/test-anomalies.js

const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });

async function testAnomalies() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    const anomalyService = require('../services/anomalyDetectionService');
    
    console.log('\n🔍 Running anomaly detection test...\n');
    
    const results = await anomalyService.runFullDetection();
    
    console.log('📊 Results:');
    console.log(`   Total anomalies: ${results.anomalies.length}`);
    console.log(`   By type:`);
    Object.entries(results.counts).forEach(([key, count]) => {
        console.log(`      ${key}: ${count}`);
    });
    
    if (results.anomalies.length > 0) {
        console.log('\n📋 Recent anomalies:');
        results.anomalies.slice(0, 5).forEach((a, i) => {
            console.log(`   ${i+1}. ${a.type} (${a.severity}) - ${a.description}`);
        });
    } else {
        console.log('\n✅ No anomalies detected. System is clean!');
    }
    
    process.exit(0);
}

testAnomalies().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});