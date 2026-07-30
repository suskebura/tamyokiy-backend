const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Simple health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Test server is running!',
        timestamp: new Date().toISOString()
    });
});

// Simple webhook test endpoint
app.get('/api/v1/webhooks', (req, res) => {
    res.json({ 
        success: true, 
        data: [],
        count: 0,
        message: 'Webhook endpoint is working!'
    });
});

app.get('/api/v1/webhooks/logs', (req, res) => {
    res.json({ 
        success: true, 
        data: [],
        stats: { total: 0, success: 0, failed: 0, successRate: 0 }
    });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`✅ Test server running on http://localhost:${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
    console.log(`📍 Webhooks: http://localhost:${PORT}/api/v1/webhooks`);
});