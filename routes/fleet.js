const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const auth = require('../middleware/auth');
const Vehicle = require('../models/Vehicle');
const Maintenance = require('../models/Maintenance');
const User = require('../models/User');
const { createAuditLog } = require('../middleware/audit');
const { createNotification } = require('./notification');

// ============================================================
// 🚛 VEHICLE MANAGEMENT
// ============================================================

// ===== GET ALL VEHICLES =====
router.get('/vehicles', auth, async (req, res) => {
    try {
        const { status, type, driverId, search } = req.query;
        
        let query = {};
        if (status) query.status = status;
        if (type) query.vehicleType = type;
        if (driverId) query.assignedDriver = driverId;
        if (search) {
            query.$or = [
                { plateNumber: { $regex: search, $options: 'i' } },
                { brand: { $regex: search, $options: 'i' } },
                { model: { $regex: search, $options: 'i' } }
            ];
        }
        
        const vehicles = await Vehicle.find(query)
            .populate('assignedDriver', 'name email phone')
            .populate('createdBy', 'name email')
            .sort({ createdAt: -1 });
        
        res.json({
            success: true,
            count: vehicles.length,
            vehicles
        });
    } catch (err) {
        console.error('Get vehicles error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== GET SINGLE VEHICLE =====
router.get('/vehicles/:id', auth, async (req, res) => {
    try {
        const vehicle = await Vehicle.findById(req.params.id)
            .populate('assignedDriver', 'name email phone vehicleType')
            .populate('createdBy', 'name email');
        
        if (!vehicle) {
            return res.status(404).json({ success: false, message: 'Vehicle not found' });
        }
        
        res.json({ success: true, vehicle });
    } catch (err) {
        console.error('Get vehicle error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== CREATE VEHICLE =====
router.post('/vehicles', adminAuth, async (req, res) => {
    try {
        const {
            plateNumber,
            vehicleType,
            brand,
            model,
            year,
            color,
            capacity,
            fuelType,
            fuelEfficiency,
            status,
            maintenanceInterval,
            notes
        } = req.body;
        
        // Check if plate number exists
        const existing = await Vehicle.findOne({ plateNumber: plateNumber.toUpperCase() });
        if (existing) {
            return res.status(400).json({ 
                success: false, 
                message: 'Vehicle with this plate number already exists' 
            });
        }
        
        const vehicle = new Vehicle({
            plateNumber: plateNumber.toUpperCase(),
            vehicleType,
            brand,
            model,
            year,
            color: color || 'White',
            capacity: capacity || { weight: 0, volume: 0 },
            fuelType: fuelType || 'diesel',
            fuelEfficiency: fuelEfficiency || 0,
            status: status || 'active',
            maintenanceInterval: maintenanceInterval || 5000,
            notes: notes || null,
            createdBy: req.user.id
        });
        
        await vehicle.save();
        
        await createAuditLog(
            req,
            'CREATE_VEHICLE',
            'Vehicle',
            vehicle._id,
            `Created vehicle: ${vehicle.plateNumber} (${vehicle.vehicleType})`
        );
        
        res.status(201).json({
            success: true,
            message: 'Vehicle created successfully',
            vehicle
        });
    } catch (err) {
        console.error('Create vehicle error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== UPDATE VEHICLE =====
router.put('/vehicles/:id', adminAuth, async (req, res) => {
    try {
        const vehicle = await Vehicle.findById(req.params.id);
        if (!vehicle) {
            return res.status(404).json({ success: false, message: 'Vehicle not found' });
        }
        
        const {
            plateNumber,
            vehicleType,
            brand,
            model,
            year,
            color,
            capacity,
            fuelType,
            fuelEfficiency,
            status,
            maintenanceInterval,
            notes
        } = req.body;
        
        // Check plate number if changed
        if (plateNumber && plateNumber.toUpperCase() !== vehicle.plateNumber) {
            const existing = await Vehicle.findOne({ plateNumber: plateNumber.toUpperCase() });
            if (existing) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Vehicle with this plate number already exists' 
                });
            }
            vehicle.plateNumber = plateNumber.toUpperCase();
        }
        
        if (vehicleType) vehicle.vehicleType = vehicleType;
        if (brand) vehicle.brand = brand;
        if (model) vehicle.model = model;
        if (year) vehicle.year = year;
        if (color) vehicle.color = color;
        if (capacity) vehicle.capacity = capacity;
        if (fuelType) vehicle.fuelType = fuelType;
        if (fuelEfficiency !== undefined) vehicle.fuelEfficiency = fuelEfficiency;
        if (status) vehicle.status = status;
        if (maintenanceInterval) vehicle.maintenanceInterval = maintenanceInterval;
        if (notes !== undefined) vehicle.notes = notes;
        
        await vehicle.save();
        
        await createAuditLog(
            req,
            'UPDATE_VEHICLE',
            'Vehicle',
            vehicle._id,
            `Updated vehicle: ${vehicle.plateNumber}`
        );
        
        res.json({
            success: true,
            message: 'Vehicle updated successfully',
            vehicle
        });
    } catch (err) {
        console.error('Update vehicle error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== DELETE VEHICLE =====
router.delete('/vehicles/:id', adminAuth, async (req, res) => {
    try {
        const vehicle = await Vehicle.findById(req.params.id);
        if (!vehicle) {
            return res.status(404).json({ success: false, message: 'Vehicle not found' });
        }
        
        // Check if vehicle has active assignments
        if (vehicle.assignedDriver) {
            return res.status(400).json({ 
                success: false, 
                message: 'Cannot delete vehicle with assigned driver. Unassign first.' 
            });
        }
        
        await vehicle.deleteOne();
        
        await createAuditLog(
            req,
            'DELETE_VEHICLE',
            'Vehicle',
            req.params.id,
            `Deleted vehicle: ${vehicle.plateNumber}`
        );
        
        res.json({ success: true, message: 'Vehicle deleted successfully' });
    } catch (err) {
        console.error('Delete vehicle error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 👤 ASSIGN DRIVER TO VEHICLE
// ============================================================

router.put('/vehicles/:id/assign-driver', adminAuth, async (req, res) => {
    try {
        const { driverId } = req.body;
        
        if (!driverId) {
            return res.status(400).json({ success: false, message: 'Driver ID is required' });
        }
        
        const vehicle = await Vehicle.findById(req.params.id);
        if (!vehicle) {
            return res.status(404).json({ success: false, message: 'Vehicle not found' });
        }
        
        const driver = await User.findById(driverId);
        if (!driver || driver.role !== 'driver') {
            return res.status(404).json({ success: false, message: 'Driver not found' });
        }
        
        // Unassign previous driver if any
        if (vehicle.assignedDriver) {
            const prevDriver = await User.findById(vehicle.assignedDriver);
            if (prevDriver) {
                await createNotification(
                    prevDriver._id,
                    '🚗 Vehicle Unassigned',
                    `You have been unassigned from vehicle ${vehicle.plateNumber}`,
                    'info',
                    vehicle._id
                );
            }
        }
        
        vehicle.assignedDriver = driver._id;
        vehicle.assignedDriverName = driver.name;
        vehicle.assignedAt = new Date();
        await vehicle.save();
        
        // Update driver's vehicle type
        driver.vehicleType = vehicle.vehicleType;
        await driver.save();
        
        await createNotification(
            driver._id,
            '🚗 Vehicle Assigned',
            `You have been assigned to vehicle ${vehicle.plateNumber} (${vehicle.vehicleType})`,
            'success',
            vehicle._id
        );
        
        await createAuditLog(
            req,
            'ASSIGN_VEHICLE_DRIVER',
            'Vehicle',
            vehicle._id,
            `Assigned driver ${driver.name} to vehicle ${vehicle.plateNumber}`
        );
        
        res.json({
            success: true,
            message: `Driver ${driver.name} assigned to vehicle ${vehicle.plateNumber}`,
            vehicle
        });
    } catch (err) {
        console.error('Assign driver error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== UNASSIGN DRIVER =====
router.put('/vehicles/:id/unassign-driver', adminAuth, async (req, res) => {
    try {
        const vehicle = await Vehicle.findById(req.params.id);
        if (!vehicle) {
            return res.status(404).json({ success: false, message: 'Vehicle not found' });
        }
        
        if (!vehicle.assignedDriver) {
            return res.status(400).json({ success: false, message: 'No driver assigned to this vehicle' });
        }
        
        const driverId = vehicle.assignedDriver;
        const driverName = vehicle.assignedDriverName;
        
        vehicle.assignedDriver = null;
        vehicle.assignedDriverName = null;
        vehicle.assignedAt = null;
        await vehicle.save();
        
        await createNotification(
            driverId,
            '🚗 Vehicle Unassigned',
            `You have been unassigned from vehicle ${vehicle.plateNumber}`,
            'info',
            vehicle._id
        );
        
        await createAuditLog(
            req,
            'UNASSIGN_VEHICLE_DRIVER',
            'Vehicle',
            vehicle._id,
            `Unassigned driver ${driverName} from vehicle ${vehicle.plateNumber}`
        );
        
        res.json({
            success: true,
            message: 'Driver unassigned successfully',
            vehicle
        });
    } catch (err) {
        console.error('Unassign driver error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 📍 UPDATE VEHICLE LOCATION (GPS)
// ============================================================

router.put('/vehicles/:id/location', auth, async (req, res) => {
    try {
        const { lat, lng, address } = req.body;
        
        if (!lat || !lng) {
            return res.status(400).json({ success: false, message: 'Latitude and longitude are required' });
        }
        
        const vehicle = await Vehicle.findById(req.params.id);
        if (!vehicle) {
            return res.status(404).json({ success: false, message: 'Vehicle not found' });
        }
        
        vehicle.currentLocation = {
            lat: lat,
            lng: lng,
            address: address || null,
            updatedAt: new Date()
        };
        await vehicle.save();
        
        res.json({
            success: true,
            message: 'Vehicle location updated',
            location: vehicle.currentLocation
        });
    } catch (err) {
        console.error('Update location error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 📊 FLEET STATISTICS
// ============================================================

router.get('/stats', adminAuth, async (req, res) => {
    try {
        const total = await Vehicle.countDocuments();
        const active = await Vehicle.countDocuments({ status: 'active' });
        const maintenance = await Vehicle.countDocuments({ status: 'maintenance' });
        const inactive = await Vehicle.countDocuments({ status: 'inactive' });
        const retired = await Vehicle.countDocuments({ status: 'retired' });
        
        const assigned = await Vehicle.countDocuments({ assignedDriver: { $ne: null } });
        const unassigned = total - assigned;
        
        const byType = await Vehicle.aggregate([
            { $group: { _id: '$vehicleType', count: { $sum: 1 } } }
        ]);
        
        res.json({
            success: true,
            stats: {
                total,
                active,
                maintenance,
                inactive,
                retired,
                assigned,
                unassigned,
                byType
            }
        });
    } catch (err) {
        console.error('Get fleet stats error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 🔧 MAINTENANCE MANAGEMENT
// ============================================================

// ===== GET MAINTENANCE RECORDS =====
router.get('/maintenance', adminAuth, async (req, res) => {
    try {
        const { vehicleId, status, type } = req.query;
        
        let query = {};
        if (vehicleId) query.vehicleId = vehicleId;
        if (status) query.status = status;
        if (type) query.type = type;
        
        const records = await Maintenance.find(query)
            .populate('vehicleId', 'plateNumber vehicleType brand model')
            .populate('createdBy', 'name email')
            .sort({ scheduledDate: -1 });
        
        res.json({
            success: true,
            count: records.length,
            records
        });
    } catch (err) {
        console.error('Get maintenance error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== CREATE MAINTENANCE RECORD =====
router.post('/maintenance', adminAuth, async (req, res) => {
    try {
        const {
            vehicleId,
            type,
            description,
            cost,
            mileage,
            scheduledDate,
            notes
        } = req.body;
        
        const vehicle = await Vehicle.findById(vehicleId);
        if (!vehicle) {
            return res.status(404).json({ success: false, message: 'Vehicle not found' });
        }
        
        const record = new Maintenance({
            vehicleId: vehicle._id,
            vehiclePlate: vehicle.plateNumber,
            type,
            description,
            cost: cost || 0,
            mileage: mileage || 0,
            status: 'scheduled',
            scheduledDate: new Date(scheduledDate),
            notes: notes || null,
            createdBy: req.user.id
        });
        
        await record.save();
        
        // Update vehicle maintenance dates
        vehicle.lastMaintenance = new Date();
        vehicle.nextMaintenance = new Date(Date.now() + (vehicle.maintenanceInterval * 30 * 24 * 60 * 60 * 1000));
        await vehicle.save();
        
        await createAuditLog(
            req,
            'CREATE_MAINTENANCE',
            'Maintenance',
            record._id,
            `Created maintenance for ${vehicle.plateNumber}: ${type}`
        );
        
        res.status(201).json({
            success: true,
            message: 'Maintenance record created',
            record
        });
    } catch (err) {
        console.error('Create maintenance error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== UPDATE MAINTENANCE STATUS =====
router.put('/maintenance/:id/status', adminAuth, async (req, res) => {
    try {
        const { status, completedDate, notes } = req.body;
        
        const record = await Maintenance.findById(req.params.id);
        if (!record) {
            return res.status(404).json({ success: false, message: 'Maintenance record not found' });
        }
        
        record.status = status;
        if (status === 'completed') {
            record.completedDate = new Date(completedDate || Date.now());
        }
        if (notes) record.notes = notes;
        
        await record.save();
        
        // Update vehicle status if maintenance completed
        if (status === 'completed') {
            await Vehicle.findByIdAndUpdate(record.vehicleId, { status: 'active' });
        }
        
        await createAuditLog(
            req,
            'UPDATE_MAINTENANCE_STATUS',
            'Maintenance',
            record._id,
            `Updated maintenance status to ${status} for ${record.vehiclePlate}`
        );
        
        res.json({
            success: true,
            message: 'Maintenance status updated',
            record
        });
    } catch (err) {
        console.error('Update maintenance error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 📊 FLEET REPORTS - STEP 1
// ============================================================

// ===== GET FLEET SUMMARY REPORT =====
router.get('/reports/summary', adminAuth, async (req, res) => {
    try {
        const vehicles = await Vehicle.find()
            .populate('assignedDriver', 'name email phone');
        
        const maintenance = await Maintenance.find();
        
        const totalVehicles = vehicles.length;
        const activeVehicles = vehicles.filter(v => v.status === 'active').length;
        const inMaintenance = vehicles.filter(v => v.status === 'maintenance').length;
        const inactive = vehicles.filter(v => v.status === 'inactive').length;
        const retired = vehicles.filter(v => v.status === 'retired').length;
        const assigned = vehicles.filter(v => v.assignedDriver).length;
        const unassigned = totalVehicles - assigned;
        
        const totalMaintenanceCost = maintenance.reduce((sum, m) => sum + (m.cost || 0), 0);
        const completedMaintenance = maintenance.filter(m => m.status === 'completed').length;
        const pendingMaintenance = maintenance.filter(m => m.status === 'scheduled' || m.status === 'in_progress').length;
        
        const byType = {};
        vehicles.forEach(v => {
            const type = v.vehicleType || 'unknown';
            byType[type] = (byType[type] || 0) + 1;
        });
        
        const topMileage = [...vehicles]
            .sort((a, b) => (b.totalMileage || 0) - (a.totalMileage || 0))
            .slice(0, 5)
            .map(v => ({
                plateNumber: v.plateNumber,
                brand: v.brand,
                model: v.model,
                mileage: v.totalMileage || 0
            }));
        
        res.json({
            success: true,
            generatedAt: new Date().toISOString(),
            summary: {
                totalVehicles,
                activeVehicles,
                inMaintenance,
                inactive,
                retired,
                assigned,
                unassigned,
                assignmentRate: totalVehicles > 0 ? Math.round((assigned / totalVehicles) * 100) : 0
            },
            maintenance: {
                totalCost: totalMaintenanceCost,
                completed: completedMaintenance,
                pending: pendingMaintenance
            },
            vehicles: {
                byType: byType,
                topMileage: topMileage,
                list: vehicles.map(v => ({
                    plateNumber: v.plateNumber,
                    vehicleType: v.vehicleType,
                    brand: v.brand,
                    model: v.model,
                    year: v.year,
                    status: v.status,
                    driver: v.assignedDriver?.name || null,
                    totalMileage: v.totalMileage || 0,
                    lastMaintenance: v.lastMaintenance,
                    nextMaintenance: v.nextMaintenance
                }))
            }
        });
        
    } catch (err) {
        console.error('Fleet report error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== EXPORT FLEET REPORT AS CSV =====
router.get('/reports/export-csv', adminAuth, async (req, res) => {
    try {
        const vehicles = await Vehicle.find()
            .populate('assignedDriver', 'name email');
        
        let csv = 'Plate Number,Type,Brand,Model,Year,Status,Driver,Mileage,Last Maintenance,Next Maintenance\n';
        
        vehicles.forEach(v => {
            csv += [
                v.plateNumber || '',
                v.vehicleType || '',
                v.brand || '',
                v.model || '',
                v.year || '',
                v.status || '',
                v.assignedDriver?.name || 'Unassigned',
                v.totalMileage || 0,
                v.lastMaintenance ? new Date(v.lastMaintenance).toLocaleDateString() : 'N/A',
                v.nextMaintenance ? new Date(v.nextMaintenance).toLocaleDateString() : 'N/A'
            ].join(',') + '\n';
        });
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=fleet_report_${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csv);
        
    } catch (err) {
        console.error('CSV export error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== EXPORT FLEET REPORT AS PDF (HTML printable) =====
router.get('/reports/export-pdf', adminAuth, async (req, res) => {
    try {
        const vehicles = await Vehicle.find()
            .populate('assignedDriver', 'name email');
        
        const totalVehicles = vehicles.length;
        const activeVehicles = vehicles.filter(v => v.status === 'active').length;
        const inMaintenance = vehicles.filter(v => v.status === 'maintenance').length;
        const assigned = vehicles.filter(v => v.assignedDriver).length;
        
        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Fleet Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; background: #fff; padding: 40px; color: #1a1a2e; }
        .header { text-align: center; border-bottom: 2px solid #D4AF37; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { color: #D4AF37; font-size: 28px; }
        .header p { color: #666; margin-top: 5px; }
        .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 30px; }
        .stat-box { background: #f5f5f5; padding: 20px; border-radius: 12px; text-align: center; }
        .stat-box .number { font-size: 28px; font-weight: 800; color: #D4AF37; }
        .stat-box .label { color: #666; font-size: 14px; margin-top: 5px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th { background: #D4AF37; color: #050505; padding: 12px; text-align: left; font-weight: 600; }
        td { padding: 10px 12px; border-bottom: 1px solid #ddd; }
        .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #888; font-size: 12px; }
        .badge { padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; display: inline-block; }
        .badge-active { background: #4caf50; color: white; }
        .badge-maintenance { background: #ff9800; color: white; }
        .badge-inactive { background: #9e9e9e; color: white; }
        .badge-retired { background: #ff6b6b; color: white; }
        @media print { body { padding: 20px; } .no-print { display: none; } }
    </style>
</head>
<body>
    <div class="header">
        <h1>🚛 TAMYOKIY Fleet Report</h1>
        <p>Generated: ${new Date().toLocaleString()}</p>
        <p>Total Vehicles: ${totalVehicles}</p>
    </div>
    
    <div class="stats-grid">
        <div class="stat-box">
            <div class="number">${totalVehicles}</div>
            <div class="label">Total Vehicles</div>
        </div>
        <div class="stat-box">
            <div class="number">${activeVehicles}</div>
            <div class="label">Active</div>
        </div>
        <div class="stat-box">
            <div class="number">${inMaintenance}</div>
            <div class="label">In Maintenance</div>
        </div>
        <div class="stat-box">
            <div class="number">${assigned}</div>
            <div class="label">Assigned to Drivers</div>
        </div>
    </div>
    
    <h2 style="color: #D4AF37; margin: 20px 0 10px;">📋 Vehicle List</h2>
    <table>
        <thead>
            <tr>
                <th>Plate</th>
                <th>Type</th>
                <th>Brand/Model</th>
                <th>Year</th>
                <th>Status</th>
                <th>Driver</th>
                <th>Mileage</th>
            </tr>
        </thead>
        <tbody>
            ${vehicles.map(v => `
            <tr>
                <td><strong>${v.plateNumber || 'N/A'}</strong></td>
                <td>${v.vehicleType || 'N/A'}</td>
                <td>${v.brand || ''} ${v.model || ''}</td>
                <td>${v.year || 'N/A'}</td>
                <td><span class="badge badge-${v.status || 'inactive'}">${v.status || 'inactive'}</span></td>
                <td>${v.assignedDriver?.name || 'Unassigned'}</td>
                <td>${v.totalMileage || 0} km</td>
            </tr>
            `).join('')}
        </tbody>
    </table>
    
    <div class="footer">
        <p>TAMYOKIY Logistics Inc. © ${new Date().getFullYear()}</p>
        <p>Built on Trust. Powered by Precision. Driven by Excellence.</p>
    </div>
    
    <div class="no-print" style="text-align:center; margin-top:20px;">
        <button onclick="window.print()" style="padding:12px 30px; background: #D4AF37; border: none; border-radius: 30px; font-weight: 700; cursor: pointer; font-size: 16px;">
            🖨️ Print / Save as PDF
        </button>
    </div>
</body>
</html>
        `;
        
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
        
    } catch (err) {
        console.error('PDF export error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 🗺️ VEHICLE GPS TRACKING - STEP 2
// ============================================================

// ===== GET VEHICLE LOCATION BY PLATE NUMBER =====
router.get('/vehicles/location/:plateNumber', auth, async (req, res) => {
    try {
        const vehicle = await Vehicle.findOne({ 
            plateNumber: req.params.plateNumber.toUpperCase() 
        });
        
        if (!vehicle) {
            return res.status(404).json({
                success: false,
                message: 'Vehicle not found'
            });
        }
        
        // Get driver location if vehicle is assigned
        if (vehicle.assignedDriver) {
            const DriverLocation = require('../models/DriverLocation');
            const location = await DriverLocation.findOne({
                driverId: vehicle.assignedDriver
            });
            
            if (location) {
                return res.json({
                    success: true,
                    vehicle: {
                        plateNumber: vehicle.plateNumber,
                        vehicleType: vehicle.vehicleType,
                        brand: vehicle.brand,
                        model: vehicle.model,
                        assignedDriver: vehicle.assignedDriverName
                    },
                    location: {
                        lat: location.lat,
                        lng: location.lng,
                        status: location.status,
                        address: location.address,
                        updatedAt: location.updatedAt,
                        speed: location.speed,
                        heading: location.heading
                    }
                });
            }
        }
        
        res.json({
            success: true,
            vehicle: {
                plateNumber: vehicle.plateNumber,
                vehicleType: vehicle.vehicleType,
                brand: vehicle.brand,
                model: vehicle.model,
                assignedDriver: vehicle.assignedDriverName || 'Not Assigned'
            },
            location: null,
            message: 'Vehicle location not available (driver offline or no GPS data)'
        });
        
    } catch (err) {
        console.error('Get vehicle location error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== GET ALL ACTIVE VEHICLES WITH LOCATIONS =====
router.get('/vehicles/locations/all', adminAuth, async (req, res) => {
    try {
        const vehicles = await Vehicle.find({
            assignedDriver: { $ne: null },
            status: 'active'
        });
        
        const DriverLocation = require('../models/DriverLocation');
        const locations = [];
        
        for (const vehicle of vehicles) {
            const location = await DriverLocation.findOne({
                driverId: vehicle.assignedDriver
            });
            
            locations.push({
                vehicle: {
                    plateNumber: vehicle.plateNumber,
                    vehicleType: vehicle.vehicleType,
                    brand: vehicle.brand,
                    model: vehicle.model,
                    driverName: vehicle.assignedDriverName
                },
                location: location ? {
                    lat: location.lat,
                    lng: location.lng,
                    status: location.status,
                    updatedAt: location.updatedAt,
                    speed: location.speed,
                    address: location.address
                } : null,
                isOnline: location && location.status !== 'offline'
            });
        }
        
        res.json({
            success: true,
            count: locations.length,
            onlineCount: locations.filter(l => l.isOnline).length,
            locations: locations
        });
        
    } catch (err) {
        console.error('Get all vehicle locations error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ===== UPDATE VEHICLE GPS LOCATION (Driver calls this) =====
router.put('/vehicles/gps/update', auth, async (req, res) => {
    try {
        const { plateNumber, lat, lng, status, address, speed, heading } = req.body;
        
        if (!plateNumber || lat === undefined || lng === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Plate number, latitude, and longitude are required'
            });
        }
        
        // Check if user is driver of this vehicle
        const vehicle = await Vehicle.findOne({ 
            plateNumber: plateNumber.toUpperCase() 
        });
        
        if (!vehicle) {
            return res.status(404).json({
                success: false,
                message: 'Vehicle not found'
            });
        }
        
        // Check if driver is assigned to this vehicle
        if (vehicle.assignedDriver?.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'You are not assigned to this vehicle'
            });
        }
        
        // Update vehicle location
        vehicle.currentLocation = {
            lat: lat,
            lng: lng,
            address: address || null,
            updatedAt: new Date()
        };
        await vehicle.save();
        
        // Also update DriverLocation
        const DriverLocation = require('../models/DriverLocation');
        let driverLocation = await DriverLocation.findOne({ driverId: req.user.id });
        
        if (driverLocation) {
            driverLocation.lat = lat;
            driverLocation.lng = lng;
            driverLocation.status = status || driverLocation.status || 'online';
            driverLocation.address = address || driverLocation.address || null;
            driverLocation.speed = speed || 0;
            driverLocation.heading = heading || 0;
            driverLocation.updatedAt = new Date();
            driverLocation.vehicleType = vehicle.vehicleType;
            driverLocation.addToHistory(lat, lng, speed || 0);
            await driverLocation.save();
        } else {
            // Create new driver location
            const driver = await User.findById(req.user.id);
            driverLocation = new DriverLocation({
                driverId: req.user.id,
                driverName: driver.name,
                driverEmail: driver.email,
                vehicleType: vehicle.vehicleType,
                lat: lat,
                lng: lng,
                status: status || 'online',
                address: address || null,
                speed: speed || 0,
                heading: heading || 0,
                history: [{ lat, lng, speed: speed || 0, timestamp: new Date() }]
            });
            await driverLocation.save();
        }
        
        res.json({
            success: true,
            message: 'GPS location updated',
            location: {
                lat: lat,
                lng: lng,
                updatedAt: new Date()
            }
        });
        
    } catch (err) {
        console.error('Update GPS error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ============================================================
// 📊 FLEET ANALYTICS DASHBOARD - STEP 3.1
// ============================================================

// ===== GET FLEET ANALYTICS DATA =====
router.get('/analytics/dashboard', adminAuth, async (req, res) => {
    try {
        const { period = 'month' } = req.query;
        
        // Get all vehicles
        const vehicles = await Vehicle.find();
        const totalVehicles = vehicles.length;
        
        // Vehicle status breakdown
        const active = vehicles.filter(v => v.status === 'active').length;
        const inMaintenance = vehicles.filter(v => v.status === 'maintenance').length;
        const inactive = vehicles.filter(v => v.status === 'inactive').length;
        const retired = vehicles.filter(v => v.status === 'retired').length;
        
        // Driver assignments
        const assigned = vehicles.filter(v => v.assignedDriver).length;
        const unassigned = totalVehicles - assigned;
        const assignmentRate = totalVehicles > 0 ? Math.round((assigned / totalVehicles) * 100) : 0;
        
        // Vehicle type breakdown
        const byType = {};
        vehicles.forEach(v => {
            const type = v.vehicleType || 'unknown';
            byType[type] = (byType[type] || 0) + 1;
        });
        
        // Total mileage
        const totalMileage = vehicles.reduce((sum, v) => sum + (v.totalMileage || 0), 0);
        const avgMileage = totalVehicles > 0 ? Math.round(totalMileage / totalVehicles) : 0;
        
        // Get maintenance records
        const maintenance = await Maintenance.find();
        const totalMaintenanceCost = maintenance.reduce((sum, m) => sum + (m.cost || 0), 0);
        const completedMaintenance = maintenance.filter(m => m.status === 'completed').length;
        const pendingMaintenance = maintenance.filter(m => m.status === 'scheduled' || m.status === 'in_progress').length;
        
        res.json({
            success: true,
            period: period,
            summary: {
                totalVehicles,
                active,
                inMaintenance,
                inactive,
                retired,
                assigned,
                unassigned,
                assignmentRate,
                totalMileage,
                avgMileage
            },
            maintenance: {
                totalCost: totalMaintenanceCost,
                completed: completedMaintenance,
                pending: pendingMaintenance
            },
            byType: byType
        });
        
    } catch (err) {
        console.error('Analytics error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;