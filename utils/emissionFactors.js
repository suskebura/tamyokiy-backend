/**
 * CO2 Emission Factors by Vehicle Type and Fuel
 * Based on international standards (IPCC, EPA, DEFRA)
 * Values in kg CO2 per km
 */

const EMISSION_FACTORS = {
    // 🚗 Light Vehicles
    'diesel_car': {
        co2: 0.145,
        nox: 0.0005,
        pm: 0.00002,
        ch4: 0.00001,
        n2o: 0.00002,
        description: 'Diesel Car'
    },
    'petrol_car': {
        co2: 0.120,
        nox: 0.0004,
        pm: 0.00001,
        ch4: 0.00002,
        n2o: 0.00001,
        description: 'Petrol Car'
    },
    'electric_car': {
        co2: 0.035,
        nox: 0.00001,
        pm: 0.000001,
        ch4: 0,
        n2o: 0,
        description: 'Electric Car (Clean Grid)'
    },
    'hybrid_car': {
        co2: 0.075,
        nox: 0.0003,
        pm: 0.00001,
        ch4: 0.00001,
        n2o: 0.00001,
        description: 'Hybrid Car'
    },

    // 🚚 Light Trucks / Vans
    'diesel_van': {
        co2: 0.280,
        nox: 0.0010,
        pm: 0.00004,
        ch4: 0.00002,
        n2o: 0.00002,
        description: 'Diesel Van'
    },
    'electric_van': {
        co2: 0.060,
        nox: 0.00002,
        pm: 0.000002,
        ch4: 0,
        n2o: 0,
        description: 'Electric Van'
    },

    // 🚛 Medium Trucks (3.5-12t)
    'diesel_truck_medium': {
        co2: 0.450,
        nox: 0.0020,
        pm: 0.00008,
        ch4: 0.00003,
        n2o: 0.00003,
        description: 'Medium Diesel Truck'
    },

    // 🚛 Heavy Trucks (>12t)
    'diesel_truck_heavy': {
        co2: 0.650,
        nox: 0.0030,
        pm: 0.00012,
        ch4: 0.00004,
        n2o: 0.00004,
        description: 'Heavy Diesel Truck'
    },
    'diesel_truck_articulated': {
        co2: 0.850,
        nox: 0.0040,
        pm: 0.00016,
        ch4: 0.00005,
        n2o: 0.00005,
        description: 'Articulated Diesel Truck'
    },

    // 🚛 CNG Vehicles
    'cng_truck': {
        co2: 0.390,
        nox: 0.0012,
        pm: 0.00002,
        ch4: 0.00015,
        n2o: 0.00002,
        description: 'CNG Truck'
    },
    'cng_bus': {
        co2: 0.420,
        nox: 0.0015,
        pm: 0.00003,
        ch4: 0.00012,
        n2o: 0.00003,
        description: 'CNG Bus'
    },

    // 🚲 Bicycle / E-Bike
    'bicycle': {
        co2: 0.005,
        nox: 0,
        pm: 0,
        ch4: 0,
        n2o: 0,
        description: 'Bicycle'
    },
    'ebike': {
        co2: 0.010,
        nox: 0,
        pm: 0,
        ch4: 0,
        n2o: 0,
        description: 'E-Bike'
    },

    // 🏍️ Motorcycle
    'motorcycle': {
        co2: 0.100,
        nox: 0.0003,
        pm: 0.00001,
        ch4: 0.00002,
        n2o: 0.00001,
        description: 'Motorcycle'
    },

    // ✈️ Air Freight
    'air_freight': {
        co2: 1.200,
        nox: 0.005,
        pm: 0.0001,
        ch4: 0.00002,
        n2o: 0.00004,
        description: 'Air Freight'
    },

    // 🚢 Sea Freight
    'sea_freight': {
        co2: 0.015,
        nox: 0.0003,
        pm: 0.00005,
        ch4: 0.00001,
        n2o: 0.00002,
        description: 'Sea Freight'
    },

    // 🚆 Rail Freight
    'rail_freight': {
        co2: 0.020,
        nox: 0.0001,
        pm: 0.000005,
        ch4: 0,
        n2o: 0.00001,
        description: 'Rail Freight'
    }
};

// 🌍 Country-specific Grid Emission Factors (kg CO2/kWh)
const GRID_EMISSION_FACTORS = {
    'ethiopia': 0.010, // Mostly hydroelectric
    'kenya': 0.100,
    'south_africa': 0.850, // Coal-heavy
    'usa': 0.430,
    'uk': 0.220,
    'germany': 0.350,
    'france': 0.070, // Nuclear-heavy
    'china': 0.600,
    'india': 0.700,
    'brazil': 0.100,
    'australia': 0.800,
    'default': 0.500
};

// 🌿 Carbon Offset Costs (USD per kg CO2)
const OFFSET_COSTS = {
    'tree_planting': 0.020,
    'renewable_energy': 0.015,
    'forest_conservation': 0.025,
    'community_project': 0.030,
    'technology_capture': 0.050
};

// 🌳 Carbon Equivalence
const EQUIVALENCE = {
    treesPerKgCO2: 0.045, // Trees planted per kg CO2
    carsPerKgCO2: 0.0000045, // Cars off road per kg CO2 per year
    flightsPerKgCO2: 0.00000015, // Flights canceled per kg CO2
    homesPerKgCO2: 0.00000005 // Homes electricity per kg CO2
};

/**
 * Get emission factor for vehicle type
 */
function getEmissionFactor(vehicleType) {
    return EMISSION_FACTORS[vehicleType] || EMISSION_FACTORS['diesel_truck_medium'];
}

/**
 * Calculate carbon emissions for a shipment
 */
function calculateEmissions({
    vehicleType,
    distance,
    weight,
    loadFactor = 0.7,
    fuelEfficiency,
    country = 'default'
}) {
    const factor = getEmissionFactor(vehicleType);
    if (!factor) return null;

    // Base CO2 from distance
    let co2 = factor.co2 * distance;

    // Adjust for load factor (lower load = higher emissions per kg)
    const loadAdjustment = 1 + (1 - loadFactor) * 0.5;
    co2 = co2 * loadAdjustment;

    // For electric vehicles, use grid emission factor
    if (vehicleType.includes('electric')) {
        const gridFactor = GRID_EMISSION_FACTORS[country] || GRID_EMISSION_FACTORS.default;
        const energyConsumed = distance * 0.2; // kWh per km (average)
        co2 = energyConsumed * gridFactor;
    }

    // Adjust for fuel efficiency (if provided)
    if (fuelEfficiency && fuelEfficiency > 0) {
        const baseEfficiency = 10; // km/liter (default)
        const efficiencyRatio = baseEfficiency / fuelEfficiency;
        co2 = co2 * efficiencyRatio;
    }

    // Calculate other emissions
    const nox = (factor.nox || 0) * distance;
    const pm = (factor.pm || 0) * distance;
    const ch4 = (factor.ch4 || 0) * distance;
    const n2o = (factor.n2o || 0) * distance;

    // CO2 equivalent (including CH4 and N2O)
    const co2e = co2 + (ch4 * 28) + (n2o * 265);

    // Efficiency metrics
    const co2PerKm = co2 / distance;
    const co2PerKg = weight > 0 ? co2 / weight : 0;
    const co2PerKmPerKg = weight > 0 ? co2PerKm / weight : 0;

    return {
        totalEmissions: {
            co2: parseFloat(co2.toFixed(6)),
            co2e: parseFloat(co2e.toFixed(6)),
            nox: parseFloat(nox.toFixed(6)),
            pm: parseFloat(pm.toFixed(6)),
            ch4: parseFloat(ch4.toFixed(6)),
            n2o: parseFloat(n2o.toFixed(6))
        },
        efficiency: {
            co2PerKm: parseFloat(co2PerKm.toFixed(6)),
            co2PerKg: parseFloat(co2PerKg.toFixed(6)),
            co2PerKmPerKg: parseFloat(co2PerKmPerKg.toFixed(6))
        },
        equivalences: {
            treesPlanted: parseFloat((co2e * EQUIVALENCE.treesPerKgCO2).toFixed(4)),
            carsOffRoad: parseFloat((co2e * EQUIVALENCE.carsPerKgCO2).toFixed(6)),
            flightsCanceled: parseFloat((co2e * EQUIVALENCE.flightsPerKgCO2).toFixed(8)),
            homesElectricity: parseFloat((co2e * EQUIVALENCE.homesPerKgCO2).toFixed(8))
        }
    };
}

/**
 * Compare eco vs standard emissions
 */
function compareEmissions(ecoEmissions, standardEmissions) {
    const ecoTotal = ecoEmissions.totalEmissions.co2e;
    const standardTotal = standardEmissions.totalEmissions.co2e;
    
    const savings = standardTotal - ecoTotal;
    const savingsPercentage = standardTotal > 0 ? (savings / standardTotal) * 100 : 0;

    return {
        standardEmissions: standardTotal,
        ecoEmissions: ecoTotal,
        savings: parseFloat(savings.toFixed(6)),
        savingsPercentage: parseFloat(savingsPercentage.toFixed(2)),
        ecoFriendly: savings > 0
    };
}

module.exports = {
    EMISSION_FACTORS,
    GRID_EMISSION_FACTORS,
    OFFSET_COSTS,
    EQUIVALENCE,
    getEmissionFactor,
    calculateEmissions,
    compareEmissions,
    getEmissionFactors: () => EMISSION_FACTORS,
    getGridFactors: () => GRID_EMISSION_FACTORS,
    getOffsetCosts: () => OFFSET_COSTS
};