// utils/qrCode.js
const QRCode = require('qrcode');
const JsBarcode = require('jsbarcode');
const { createCanvas } = require('canvas');
const path = require('path');
const fs = require('fs');

// Make sure QR code directory exists
const qrDir = path.join(__dirname, '../uploads/qr-codes');
if (!fs.existsSync(qrDir)) {
    fs.mkdirSync(qrDir, { recursive: true });
}

// Make sure Barcode directory exists
const barcodeDir = path.join(__dirname, '../uploads/barcodes');
if (!fs.existsSync(barcodeDir)) {
    fs.mkdirSync(barcodeDir, { recursive: true });
}

/**
 * Generate QR Code for a tracking number
 * @param {string} trackingNumber - The tracking number
 * @param {string} baseUrl - Base URL for tracking
 * @returns {Promise<string>} - Path to QR code image
 */
async function generateQRCode(trackingNumber, baseUrl) {
    try {
        const trackingUrl = `${baseUrl}/tracking-public.html?track=${trackingNumber}`;
        
        // Generate QR code as data URL with gold color
        const qrDataUrl = await QRCode.toDataURL(trackingUrl, {
            errorCorrectionLevel: 'H',
            margin: 2,
            width: 300,
            color: {
                dark: '#D4AF37',
                light: '#FFFFFF'
            }
        });
        
        // Save to file
        const fileName = `qr_${trackingNumber}.png`;
        const filePath = path.join(qrDir, fileName);
        
        const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, '');
        fs.writeFileSync(filePath, base64Data, 'base64');
        
        return `/uploads/qr-codes/${fileName}`;
    } catch (error) {
        console.error('QR Code generation error:', error);
        return null;
    }
}

/**
 * Generate Barcode for a tracking number
 * @param {string} trackingNumber - The tracking number
 * @returns {Promise<string>} - Path to barcode image
 */
async function generateBarcode(trackingNumber) {
    try {
        const canvas = createCanvas(400, 120);
        const ctx = canvas.getContext('2d');
        
        // White background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, 400, 120);
        
        // Generate barcode
        JsBarcode(canvas, trackingNumber, {
            format: 'CODE128',
            width: 2,
            height: 80,
            displayValue: true,
            fontSize: 20,
            font: 'monospace',
            textMargin: 10,
            margin: 10,
            background: '#FFFFFF',
            lineColor: '#000000'
        });
        
        const fileName = `barcode_${trackingNumber}.png`;
        const filePath = path.join(barcodeDir, fileName);
        
        const buffer = canvas.toBuffer('image/png');
        fs.writeFileSync(filePath, buffer);
        
        return `/uploads/barcodes/${fileName}`;
    } catch (error) {
        console.error('Barcode generation error:', error);
        return null;
    }
}

/**
 * Generate both QR Code and Barcode
 * @param {string} trackingNumber - The tracking number
 * @param {string} baseUrl - Base URL for tracking
 * @returns {Promise<object>} - { qrCode, barcode, trackingNumber }
 */
async function generateTrackingCodes(trackingNumber, baseUrl) {
    const [qrCode, barcode] = await Promise.all([
        generateQRCode(trackingNumber, baseUrl),
        generateBarcode(trackingNumber)
    ]);
    
    return {
        qrCode,
        barcode,
        trackingNumber
    };
}

/**
 * Generate QR Code as base64 data URL
 * @param {string} trackingNumber - The tracking number
 * @param {string} baseUrl - Base URL for tracking
 * @returns {Promise<string>} - QR code as data URL
 */
async function generateQRCodeDataUrl(trackingNumber, baseUrl) {
    try {
        const trackingUrl = `${baseUrl}/tracking-public.html?track=${trackingNumber}`;
        
        return await QRCode.toDataURL(trackingUrl, {
            errorCorrectionLevel: 'H',
            margin: 2,
            width: 300,
            color: {
                dark: '#D4AF37',
                light: '#FFFFFF'
            }
        });
    } catch (error) {
        console.error('QR Code generation error:', error);
        return null;
    }
}

module.exports = { 
    generateQRCode, 
    generateBarcode,
    generateTrackingCodes,
    generateQRCodeDataUrl 
};