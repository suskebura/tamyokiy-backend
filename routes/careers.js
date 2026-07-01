const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Application = require('../models/Application');

// Configure multer for file upload with security
const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// File filter for security
const fileFilter = (req, file, cb) => {
    // Allowed extensions
    const allowedExtensions = ['.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    // Allowed MIME types
    const allowedMimeTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (allowedExtensions.includes(ext) && allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only PDF, DOC, and DOCX files are allowed'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: fileFilter
});

// Submit job application with secure CV upload
router.post('/', (req, res, next) => {
    upload.single('cv')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'FILE_TOO_LARGE') {
                return res.status(400).json({ success: false, message: 'File too large. Maximum size is 5MB.' });
            }
            return res.status(400).json({ success: false, message: err.message });
        } else if (err) {
            return res.status(400).json({ success: false, message: err.message });
        }
        next();
    });
}, async (req, res, next) => {
    try {
        const { name, email, position } = req.body;
        const cvUrl = req.file ? `/uploads/${req.file.filename}` : null;
        
        if (!cvUrl) {
            return res.status(400).json({ success: false, message: 'CV file is required' });
        }
        
        const application = new Application({ name, email, position, cvUrl });
        await application.save();
        res.status(201).json({ success: true, message: 'Application submitted successfully' });
    } catch (err) {
        next(err);
    }
});

// Get all applications (admin only)
router.get('/', async (req, res, next) => {
    try {
        const apps = await Application.find().sort({ createdAt: -1 });
        res.json(apps);
    } catch (err) {
        next(err);
    }
});

module.exports = router;