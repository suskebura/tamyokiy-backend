// utils/carbonPricing.js

const SHIPPING_OPTIONS = {
    standard: {
        name: 'Standard',
        basePrice: 100,
        days: 3,
        co2Factor: 1.0,  // Base CO₂
        description: 'Most affordable option'
    },
    express: {
        name: 'Express',
        basePrice: 150,
        days: 2,
        co2Factor: 1.3,  // 30% more CO₂ (faster = more emissions)
        description: 'Faster delivery'
    },
    overnight: {
        name: 'Overnight',
        basePrice: 200,
        days: 1,
        co2Factor: 1.8,  // 80% more CO₂ (fastest = highest emissions)
        description: 'Next day delivery'
    }
};

const ECO_TIERS = {
    'standard-eco': {
        name: 'Standard Eco',
        co2Reduction: 0.35,  // 35% less CO₂
        priceMultiplier: 1.05,  // 5% extra
        description: '🌿 Reduced emissions'
    },
    'express-eco': {
        name: 'Express Eco',
        co2Reduction: 0.30,  // 30% less CO₂
        priceMultiplier: 1.10,  // 10% extra
        description: '🌿 Fast & green'
    },
    'overnight-eco': {
        name: 'Overnight Eco',
        co2Reduction: 0.25,  // 25% less CO₂
        priceMultiplier: 1.15,  // 15% extra
        description: '🌿 Premium & sustainable'
    }
};

// Calculate carbon emissions for a shipment
function calculateCarbonEmissions(shippingTier, ecoTier, weight, distance) {
    // Base CO₂ calculation: 0.15 kg CO₂ per km per 100kg
    const baseCO2 = distance * 0.15 * (weight / 100);
    
    // Get shipping factor
    const shipping = SHIPPING_OPTIONS[shippingTier] || SHIPPING_OPTIONS.standard;
    
    // Get eco factor
    let co2Reduction = 0;
    let ecoMultiplier = 1.0;
    if (ecoTier && ecoTier !== 'standard') {
        const ecoKey = `${shippingTier}-${ecoTier}`;
        const eco = ECO_TIERS[ecoKey] || ECO_TIERS[`${shippingTier}-eco`];
        if (eco) {
            co2Reduction = eco.co2Reduction || 0;
            ecoMultiplier = eco.priceMultiplier || 1.0;
        }
    }
    
    // Calculate final CO₂
    const co2 = baseCO2 * shipping.co2Factor * (1 - co2Reduction);
    const co2e = co2 * 1.1; // CO₂ equivalent (including other greenhouse gases)
    
    return {
        co2: parseFloat(co2.toFixed(2)),
        co2e: parseFloat(co2e.toFixed(2)),
        reduction: co2Reduction * 100,
        ecoMultiplier: ecoMultiplier
    };
}

// Calculate price for a shipment
function calculateShippingPrice(shippingTier, ecoTier, weight, distance) {
    const shipping = SHIPPING_OPTIONS[shippingTier] || SHIPPING_OPTIONS.standard;
    
    // Base price with weight multiplier
    const weightMultiplier = 1 + (weight / 100);
    let basePrice = shipping.basePrice * weightMultiplier;
    
    // Apply eco pricing
    let ecoMultiplier = 1.0;
    if (ecoTier && ecoTier !== 'standard') {
        const ecoKey = `${shippingTier}-${ecoTier}`;
        const eco = ECO_TIERS[ecoKey] || ECO_TIERS[`${shippingTier}-eco`];
        if (eco) {
            ecoMultiplier = eco.priceMultiplier || 1.0;
        }
    }
    
    const finalPrice = basePrice * ecoMultiplier;
    
    // Calculate carbon offset cost (optional)
    const carbon = calculateCarbonEmissions(shippingTier, ecoTier, weight, distance);
    const offsetCost = carbon.co2 * 0.02; // $0.02 per kg CO₂
    
    return {
        basePrice: parseFloat(basePrice.toFixed(2)),
        ecoMultiplier: ecoMultiplier,
        finalPrice: parseFloat(finalPrice.toFixed(2)),
        offsetCost: parseFloat(offsetCost.toFixed(2)),
        carbon: carbon
    };
}

// Get shipping options for frontend
function getShippingOptions(weight, distance) {
    const options = [];
    const tiers = ['standard', 'express', 'overnight'];
    const ecoTypes = ['standard', 'eco'];
    
    tiers.forEach(shippingTier => {
        ecoTypes.forEach(ecoTier => {
            const priceData = calculateShippingPrice(shippingTier, ecoTier, weight, distance);
            options.push({
                id: `${shippingTier}-${ecoTier}`,
                shippingTier: shippingTier,
                ecoTier: ecoTier,
                name: `${SHIPPING_OPTIONS[shippingTier].name}${ecoTier !== 'standard' ? ' Eco' : ''}`,
                price: priceData.finalPrice,
                days: SHIPPING_OPTIONS[shippingTier].days,
                co2: priceData.carbon.co2,
                co2e: priceData.carbon.co2e,
                reduction: priceData.carbon.reduction,
                offsetCost: priceData.offsetCost,
                description: ecoTier !== 'standard' ? 
                    `🌿 ${priceData.carbon.reduction}% less carbon!` : 
                    SHIPPING_OPTIONS[shippingTier].description,
                ecoFriendly: ecoTier !== 'standard'
            });
        });
    });
    
    return options;
}

module.exports = {
    SHIPPING_OPTIONS,
    ECO_TIERS,
    calculateCarbonEmissions,
    calculateShippingPrice,
    getShippingOptions
};