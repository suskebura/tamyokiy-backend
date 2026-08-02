/**
 * generate-swagger.js
 * Generates a comprehensive OpenAPI 3.0 spec for TAMYOKIY Logistics API.
 * Run: node generate-swagger.js
 * Output: swagger.json
 */
const fs = require('fs');
const path = require('path');

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
const okResp = (desc = 'Success', schema) => ({
    description: desc,
    ...(schema ? { content: { 'application/json': { schema } } } : {})
});

const jsonBody = (schema, required = []) => ({
    required: required.length > 0,
    content: { 'application/json': { schema: { type: 'object', required, properties: schema } } }
});

const bearer = [{ bearerAuth: [] }];
const apiKey = [{ ApiKeyAuth: [] }];
const bearerOrApiKey = [{ bearerAuth: [] }, { ApiKeyAuth: [] }];

const errorResponses = {
    400: { description: 'Bad request / validation error' },
    401: { description: 'Unauthorized' },
    403: { description: 'Forbidden' },
    404: { description: 'Not found' },
    500: { description: 'Internal server error' }
};

const stdResp = (desc = 'Successful operation', schema) => ({
    '200': okResp(desc, schema),
    ...errorResponses
});

// Build a GET path item
const getOp = ({ tags, summary, description, security, params, schema, respDesc }) => ({
    get: {
        tags,
        summary,
        description,
        ...(security ? { security } : {}),
        ...(params ? { parameters: params } : {}),
        responses: stdResp(respDesc || summary, schema)
    }
});

// Build a POST path item
const postOp = ({ tags, summary, description, security, body, required, params, schema, respDesc, status }) => ({
    post: {
        tags,
        summary,
        description,
        ...(security ? { security } : {}),
        ...(params ? { parameters: params } : {}),
        ...(body ? { requestBody: jsonBody(body, required) } : {}),
        responses: {
            [status || '200']: okResp(respDesc || summary, schema),
            ...errorResponses
        }
    }
});

const putOp = ({ tags, summary, description, security, body, required, params, schema, respDesc }) => ({
    put: {
        tags,
        summary,
        description,
        ...(security ? { security } : {}),
        ...(params ? { parameters: params } : {}),
        ...(body ? { requestBody: jsonBody(body, required) } : {}),
        responses: stdResp(respDesc || summary, schema)
    }
});

const deleteOp = ({ tags, summary, description, security, params, schema, respDesc }) => ({
    delete: {
        tags,
        summary,
        description,
        ...(security ? { security } : {}),
        ...(params ? { parameters: params } : {}),
        responses: stdResp(respDesc || summary, schema)
    }
});

const patchOp = ({ tags, summary, description, security, body, required, params, schema, respDesc }) => ({
    patch: {
        tags,
        summary,
        description,
        ...(security ? { security } : {}),
        ...(params ? { parameters: params } : {}),
        ...(body ? { requestBody: jsonBody(body, required) } : {}),
        responses: stdResp(respDesc || summary, schema)
    }
});

// Path params helpers
const pathParam = (name, desc, type = 'string') => ({
    name,
    in: 'path',
    required: true,
    description: desc || `${name} identifier`,
    schema: { type }
});

const queryParam = (name, desc, type = 'string') => ({
    name,
    in: 'query',
    description: desc || name,
    schema: { type }
});

const schemaRef = (name) => ({ $ref: `#/components/schemas/${name}` });
const stringProp = (desc) => ({ type: 'string', description: desc });
const numberProp = (desc) => ({ type: 'number', description: desc });
const boolProp = (desc) => ({ type: 'boolean', description: desc });
const dateProp = (desc) => ({ type: 'string', format: 'date-time', description: desc });
const idProp = () => ({ type: 'string', description: 'MongoDB ObjectId' });

// ------------------------------------------------------------
// Components / Schemas
// ------------------------------------------------------------
const schemas = {
    User: {
        type: 'object',
        properties: {
            _id: idProp(),
            name: stringProp('Full name'),
            email: { type: 'string', format: 'email' },
            phone: stringProp('Phone number'),
            role: { type: 'string', enum: ['client', 'driver', 'admin'] },
            avatar: stringProp('Profile image URL'),
            isActive: boolProp('Account active status'),
            createdAt: dateProp('Created at')
        }
    },
    Shipment: {
        type: 'object',
        properties: {
            _id: idProp(),
            trackingNumber: stringProp('Unique tracking number (TAM...)'),
            userId: idProp(),
            senderId: idProp(),
            client: idProp(),
            senderName: stringProp('Sender name'),
            senderAddress: stringProp('Sender address'),
            senderPhone: stringProp('Sender phone'),
            senderEmail: { type: 'string', format: 'email' },
            receiverName: stringProp('Receiver name'),
            receiverAddress: stringProp('Receiver address'),
            receiverPhone: stringProp('Receiver phone'),
            receiverEmail: { type: 'string', format: 'email' },
            weight: numberProp('Package weight (kg)'),
            distance: numberProp('Distance (km)'),
            serviceType: { type: 'string', enum: ['standard', 'express', 'overnight'] },
            amount: numberProp('Shipping cost'),
            description: stringProp('Package description'),
            status: { type: 'string', enum: ['pending', 'picked', 'in_transit', 'delivered', 'cancelled'] },
            isPaid: boolProp('Payment status'),
            paidAt: dateProp('Paid at'),
            estimatedDelivery: { type: 'string', format: 'date' },
            currentLat: numberProp('Current latitude'),
            currentLng: numberProp('Current longitude'),
            refundStatus: { type: 'string', enum: ['none', 'pending', 'approved', 'rejected'] },
            statusHistory: { type: 'array', items: { type: 'object' } },
            createdAt: dateProp('Created at')
        }
    },
    Payment: {
        type: 'object',
        properties: {
            _id: idProp(),
            userId: idProp(),
            trackingNumber: stringProp('Shipment tracking number'),
            amount: numberProp('Payment amount'),
            paymentMethod: stringProp('Payment method'),
            status: { type: 'string', enum: ['pending', 'succeeded', 'failed'] },
            shippingType: stringProp('Shipping type'),
            offsetCarbon: boolProp('Carbon offset selected'),
            paidAt: dateProp('Paid at'),
            createdAt: dateProp('Created at')
        }
    },
    Vehicle: {
        type: 'object',
        properties: {
            _id: idProp(),
            plateNumber: stringProp('License plate'),
            type: stringProp('Vehicle type'),
            model: stringProp('Model'),
            status: { type: 'string', enum: ['available', 'in_use', 'maintenance'] },
            assignedDriver: idProp(),
            currentLocation: { type: 'object', properties: { lat: numberProp(), lng: numberProp() } },
            fuelEfficiency: numberProp('Fuel efficiency (L/100km)'),
            createdAt: dateProp('Created at')
        }
    },
    Ticket: {
        type: 'object',
        properties: {
            _id: idProp(),
            userId: idProp(),
            subject: stringProp('Ticket subject'),
            description: stringProp('Ticket description'),
            status: { type: 'string', enum: ['open', 'in_progress', 'resolved', 'closed'] },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
            assignedTo: idProp(),
            attachments: { type: 'array', items: { type: 'string' } },
            createdAt: dateProp('Created at')
        }
    },
    Invoice: {
        type: 'object',
        properties: {
            _id: idProp(),
            invoiceNumber: stringProp('Invoice number'),
            userId: idProp(),
            trackingNumber: stringProp('Shipment tracking number'),
            amount: numberProp('Invoice amount'),
            status: { type: 'string', enum: ['pending', 'paid', 'overdue'] },
            issuedAt: dateProp('Issued at'),
            dueDate: { type: 'string', format: 'date' }
        }
    },
    Rating: {
        type: 'object',
        properties: {
            _id: idProp(),
            shipmentId: idProp(),
            userId: idProp(),
            driverId: idProp(),
            rating: { type: 'number', minimum: 1, maximum: 5 },
            review: stringProp('Review text'),
            createdAt: dateProp('Created at')
        }
    },
    Route: {
        type: 'object',
        properties: {
            _id: idProp(),
            name: stringProp('Route name'),
            driverId: idProp(),
            stops: { type: 'array', items: { type: 'object' } },
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'] },
            distance: numberProp('Total distance'),
            estimatedDuration: numberProp('Estimated minutes'),
            createdAt: dateProp('Created at')
        }
    },
    Warehouse: {
        type: 'object',
        properties: {
            _id: idProp(),
            name: stringProp('Warehouse name'),
            location: stringProp('Address'),
            capacity: numberProp('Storage capacity'),
            manager: idProp(),
            status: { type: 'string', enum: ['active', 'inactive'] },
            createdAt: dateProp('Created at')
        }
    },
    WarehouseInventory: {
        type: 'object',
        properties: {
            _id: idProp(),
            warehouseId: idProp(),
            shipmentId: idProp(),
            trackingNumber: stringProp(),
            status: { type: 'string', enum: ['received', 'stored', 'out_for_delivery', 'delivered'] },
            receivedAt: dateProp('Received at'),
            storedLocation: stringProp('Bin / zone')
        }
    },
    InsuranceClaim: {
        type: 'object',
        properties: {
            _id: idProp(),
            userId: idProp(),
            shipmentId: idProp(),
            trackingNumber: stringProp(),
            claimType: stringProp('Claim type'),
            amount: numberProp('Claim amount'),
            status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'paid'] },
            description: stringProp('Claim description'),
            createdAt: dateProp('Created at')
        }
    },
    Message: {
        type: 'object',
        properties: {
            _id: idProp(),
            conversationId: idProp(),
            senderId: idProp(),
            recipientId: idProp(),
            content: stringProp('Message body'),
            read: boolProp('Read status'),
            attachments: { type: 'array', items: { type: 'string' } },
            createdAt: dateProp('Created at')
        }
    },
    Notification: {
        type: 'object',
        properties: {
            _id: idProp(),
            userId: idProp(),
            title: stringProp('Notification title'),
            message: stringProp('Notification body'),
            type: stringProp('Notification type'),
            read: boolProp('Read status'),
            createdAt: dateProp('Created at')
        }
    },
    AnomalyLog: {
        type: 'object',
        properties: {
            _id: idProp(),
            type: stringProp('Anomaly type'),
            severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            description: stringProp('Description'),
            resolved: boolProp('Resolution status'),
            createdAt: dateProp('Created at')
        }
    },
    SentimentLog: {
        type: 'object',
        properties: {
            _id: idProp(),
            ticketId: idProp(),
            userId: idProp(),
            label: { type: 'string', enum: ['positive', 'neutral', 'negative', 'urgent'] },
            score: numberProp('Sentiment score -1 to 1'),
            text: stringProp('Analyzed text'),
            createdAt: dateProp('Created at')
        }
    },
    AssignmentLog: {
        type: 'object',
        properties: {
            _id: idProp(),
            shipmentId: idProp(),
            trackingNumber: stringProp(),
            driverId: idProp(),
            status: { type: 'string', enum: ['assigned', 'accepted', 'rejected', 'completed'] },
            assignedAt: dateProp('Assigned at'),
            completedAt: dateProp('Completed at')
        }
    },
    Contact: {
        type: 'object',
        properties: {
            _id: idProp(),
            name: stringProp('Contact name'),
            email: { type: 'string', format: 'email' },
            subject: stringProp('Subject'),
            message: stringProp('Message'),
            status: { type: 'string', enum: ['new', 'approved', 'rejected'] },
            createdAt: dateProp('Created at')
        }
    },
    RefundRequest: {
        type: 'object',
        properties: {
            _id: idProp(),
            shipmentId: idProp(),
            trackingNumber: stringProp(),
            userId: idProp(),
            userEmail: { type: 'string', format: 'email' },
            reason: stringProp('Refund reason'),
            status: { type: 'string', enum: ['pending', 'under_review', 'approved', 'processed', 'rejected'] },
            refundAmount: numberProp(),
            createdAt: dateProp('Created at')
        }
    },
    DriverLocation: {
        type: 'object',
        properties: {
            _id: idProp(),
            driverId: idProp(),
            lat: numberProp('Latitude'),
            lng: numberProp('Longitude'),
            timestamp: dateProp('Location time'),
            online: boolProp('Online status')
        }
    },
    ApiKey: {
        type: 'object',
        properties: {
            _id: idProp(),
            name: stringProp('Key name'),
            key: stringProp('API key (x-api-key header)'),
            scopes: { type: 'array', items: { type: 'string' } },
            enabled: boolProp('Enabled status'),
            lastUsed: dateProp('Last used'),
            createdAt: dateProp('Created at')
        }
    },
    WebhookSubscription: {
        type: 'object',
        properties: {
            _id: idProp(),
            name: stringProp('Webhook name'),
            url: { type: 'string', format: 'uri' },
            events: { type: 'array', items: { type: 'string' } },
            secret: stringProp('Webhook secret'),
            enabled: boolProp('Enabled status'),
            createdAt: dateProp('Created at')
        }
    },
    CarbonFootprint: {
        type: 'object',
        properties: {
            _id: idProp(),
            userId: idProp(),
            shipmentId: idProp(),
            co2Emissions: numberProp('kg CO2e'),
            offsetAmount: numberProp('Offset payment amount'),
            offsetStatus: { type: 'string', enum: ['not_offset', 'pending', 'offset'] },
            createdAt: dateProp('Created at')
        }
    },
    Error: {
        type: 'object',
        properties: {
            success: { type: 'boolean', example: false },
            message: stringProp('Error message')
        }
    }
};

// ------------------------------------------------------------
// Paths
// ------------------------------------------------------------
const paths = {};

// --- System ---
paths['/api/health'] = getOp({ tags: ['System'], summary: 'Health check', description: 'Server status, MongoDB connection, model count' });
paths['/api/docs'] = getOp({ tags: ['System'], summary: 'API docs summary (JSON)', description: 'Static JSON summary of endpoints & models' });
paths['/api-docs.json'] = getOp({ tags: ['System'], summary: 'OpenAPI spec (JSON)', description: 'Full OpenAPI 3.0 spec served to Swagger UI' });
paths['/api/translations'] = getOp({ tags: ['System'], summary: 'Get UI translations', params: [queryParam('lang', 'Language code (en/ar)', 'string')] });
paths['/api/language'] = postOp({ tags: ['System'], summary: 'Switch language', body: { language: { type: 'string', enum: ['en', 'ar'] } }, required: ['language'] });

// --- Auth ---
paths['/api/auth/register'] = postOp({
    tags: ['Auth'], summary: 'Register client',
    body: {
        name: stringProp('Full name'), email: { type: 'string', format: 'email' },
        password: { type: 'string', format: 'password', minLength: 6 }, phone: stringProp(),
        role: { type: 'string', enum: ['client', 'driver', 'admin'] }
    },
    required: ['name', 'email', 'password', 'phone'],
    schema: { type: 'object', properties: { success: boolProp(), token: stringProp('JWT'), user: schemaRef('User') } },
    status: 201
});
paths['/api/auth/login'] = postOp({
    tags: ['Auth'], summary: 'Login',
    body: { email: { type: 'string', format: 'email' }, password: { type: 'string', format: 'password' } },
    required: ['email', 'password'],
    schema: { type: 'object', properties: { success: boolProp(), token: stringProp('JWT'), user: schemaRef('User') } }
});
paths['/api/auth/register-driver'] = postOp({
    tags: ['Auth'], summary: 'Register driver',
    body: {
        name: stringProp(), email: { type: 'string', format: 'email' },
        password: { type: 'string', format: 'password' }, phone: stringProp(),
        licenseNumber: stringProp(), vehicleType: { type: 'string', enum: ['bike', 'car', 'van', 'truck', 'heavy_truck'] }
    },
    required: ['name', 'email', 'password', 'phone', 'licenseNumber', 'vehicleType'],
    status: 201
});
paths['/api/auth/me'] = getOp({ tags: ['Auth'], summary: 'Current user', security: bearer, schema: { type: 'object', properties: { success: boolProp(), user: schemaRef('User') } } });

// --- OTP ---
paths['/api/auth/send-email-otp'] = postOp({ tags: ['OTP'], summary: 'Send email OTP', body: { email: { type: 'string', format: 'email' } }, required: ['email'] });
paths['/api/auth/verify-email-otp'] = postOp({ tags: ['OTP'], summary: 'Verify email OTP', body: { email: { type: 'string', format: 'email' }, code: stringProp(), token: stringProp() }, required: ['email', 'code', 'token'] });
paths['/api/auth/send-phone-otp'] = postOp({ tags: ['OTP'], summary: 'Send phone OTP', body: { phone: stringProp() }, required: ['phone'] });
paths['/api/auth/verify-phone-otp'] = postOp({ tags: ['OTP'], summary: 'Verify phone OTP', body: { phone: stringProp(), code: stringProp(), token: stringProp() }, required: ['phone', 'code', 'token'] });

// --- Tracking ---
paths['/api/tracking'] = postOp({
    tags: ['Tracking'], summary: 'Create shipment', security: bearer,
    body: {
        senderName: stringProp(), senderAddress: stringProp(), receiverName: stringProp(),
        receiverAddress: stringProp(), weight: numberProp('kg'), distance: numberProp('km'),
        serviceType: { type: 'string', enum: ['standard', 'express', 'overnight'] },
        senderLat: numberProp(), senderLng: numberProp(), receiverLat: numberProp(), receiverLng: numberProp()
    },
    required: ['senderName', 'senderAddress', 'receiverName', 'receiverAddress', 'weight'],
    schema: { type: 'object', properties: { success: boolProp(), trackingNumber: stringProp(), amount: numberProp(), estimatedDelivery: { type: 'string', format: 'date' } } },
    status: 201
});
paths['/api/tracking/create-pending'] = postOp({
    tags: ['Tracking'], summary: 'Create pending shipment', security: bearer,
    body: {
        senderName: stringProp(), senderAddress: stringProp(), receiverName: stringProp(),
        receiverAddress: stringProp(), weight: numberProp(), serviceType: { type: 'string', enum: ['standard', 'express', 'overnight'] }, amount: numberProp()
    },
    required: ['senderName', 'senderAddress', 'receiverName', 'receiverAddress']
});
paths['/api/tracking/create-with-user'] = postOp({
    tags: ['Tracking'], summary: 'Create shipment with user ID', security: bearer,
    body: {
        senderName: stringProp(), senderAddress: stringProp(), senderPhone: stringProp(), senderEmail: { type: 'string', format: 'email' },
        receiverName: stringProp(), receiverAddress: stringProp(), receiverPhone: stringProp(), receiverEmail: { type: 'string', format: 'email' },
        weight: numberProp(), serviceType: { type: 'string', enum: ['standard', 'express', 'overnight'] }, amount: numberProp(), description: stringProp()
    },
    required: ['receiverName', 'receiverAddress']
});
paths['/api/tracking/confirm-payment'] = putOp({ tags: ['Tracking'], summary: 'Confirm payment', security: bearer, body: { trackingNumber: stringProp() }, required: ['trackingNumber'] });
paths['/api/tracking/{trackingNumber}'] = {
    get: getOp({ tags: ['Tracking'], summary: 'Track shipment', description: 'Public tracking by number', params: [pathParam('trackingNumber', 'Tracking number')], schema: schemaRef('Shipment') }).get,
    put: putOp({ tags: ['Tracking'], summary: 'Update shipment coordinates', security: bearer, params: [pathParam('trackingNumber', 'Tracking number')], body: { status: { type: 'string', enum: ['pending', 'picked', 'in_transit', 'delivered', 'cancelled'] }, currentLat: numberProp(), currentLng: numberProp() } })
};
paths['/api/tracking/{trackingNumber}/progress'] = getOp({ tags: ['Tracking'], summary: 'Get shipment progress', params: [pathParam('trackingNumber', 'Tracking number')] });
paths['/api/tracking/{trackingNumber}/status'] = putOp({ tags: ['Tracking'], summary: 'Update shipment status', security: bearer, params: [pathParam('trackingNumber', 'Tracking number')], body: { status: { type: 'string', enum: ['pending', 'picked', 'in_transit', 'delivered', 'cancelled'] } }, required: ['status'] });
paths['/api/tracking/my/shipments'] = getOp({ tags: ['Tracking'], summary: 'My shipments', security: bearer, schema: { type: 'array', items: schemaRef('Shipment') } });
paths['/api/tracking/driver/shipments'] = getOp({ tags: ['Tracking'], summary: 'Driver shipments', security: bearer });
paths['/api/tracking/driver/update-status/{trackingNumber}'] = putOp({ tags: ['Tracking'], summary: 'Driver update status', security: bearer, params: [pathParam('trackingNumber')], body: { status: stringProp(), note: stringProp() } });
paths['/api/tracking/driver/complete/{trackingNumber}'] = postOp({ tags: ['Tracking'], summary: 'Driver complete shipment', security: bearer, params: [pathParam('trackingNumber')] });
paths['/api/tracking/upload-photo/{trackingNumber}'] = postOp({ tags: ['Tracking'], summary: 'Upload delivery photo', security: bearer, params: [pathParam('trackingNumber')] });
paths['/api/tracking/driver/status'] = putOp({ tags: ['Tracking'], summary: 'Driver availability status', security: bearer, body: { online: boolProp(), status: stringProp() } });

// --- Public ---
paths['/api/public/track/{trackingNumber}'] = getOp({ tags: ['Public'], summary: 'Public track shipment', params: [pathParam('trackingNumber')], schema: schemaRef('Shipment') });
paths['/api/public/track/{trackingNumber}/progress'] = getOp({ tags: ['Public'], summary: 'Public shipment progress', params: [pathParam('trackingNumber')] });
paths['/api/public/status'] = getOp({ tags: ['Public'], summary: 'Public status info' });

// --- Payments ---
paths['/api/payment/methods'] = getOp({ tags: ['Payments'], summary: 'Payment methods', security: bearer });
paths['/api/payment/create'] = postOp({ tags: ['Payments'], summary: 'Create payment', security: bearer, body: { trackingNumber: stringProp(), amount: numberProp(), paymentMethod: stringProp(), shippingType: stringProp(), offsetCarbon: boolProp() }, required: ['trackingNumber', 'amount'] });
paths['/api/payment/create-checkout-session'] = postOp({ tags: ['Payments'], summary: 'Create checkout session', security: bearer, body: { trackingNumber: stringProp(), amount: numberProp(), paymentMethod: stringProp(), shippingType: stringProp(), offsetCarbon: boolProp() }, required: ['trackingNumber', 'amount'] });
paths['/api/payment/mock-success'] = postOp({ tags: ['Payments'], summary: 'Mock payment success', security: bearer, body: { trackingNumber: stringProp(), amount: numberProp(), paymentMethod: stringProp() } });
paths['/api/payment/history'] = getOp({ tags: ['Payments'], summary: 'Payment history', security: bearer, schema: { type: 'array', items: schemaRef('Payment') } });
paths['/api/payment/shipment/{trackingNumber}'] = getOp({ tags: ['Payments'], summary: 'Payment for shipment', security: bearer, params: [pathParam('trackingNumber')] });
paths['/api/payment/carbon-stats'] = getOp({ tags: ['Payments'], summary: 'Carbon stats', security: bearer });
paths['/api/payment/carbon-summary'] = getOp({ tags: ['Payments'], summary: 'Carbon summary', security: bearer });
paths['/api/payment/webhook'] = postOp({ tags: ['Payments'], summary: 'Payment webhook', description: 'Stripe/webhook callback (raw body)' });

// --- Refunds ---
paths['/api/refund/request'] = postOp({ tags: ['Refunds'], summary: 'Submit refund request', security: bearer, body: { trackingNumber: stringProp(), reason: stringProp(), description: stringProp() }, required: ['trackingNumber', 'reason'] });

// --- User ---
paths['/api/user/profile'] = {
    get: getOp({ tags: ['User'], summary: 'Get profile', security: bearer, schema: schemaRef('User') }).get,
    put: putOp({ tags: ['User'], summary: 'Update profile', security: bearer, body: { name: stringProp(), phone: stringProp(), email: { type: 'string', format: 'email' }, address: stringProp() } })
};
paths['/api/user/upload-profile-pic'] = postOp({ tags: ['User'], summary: 'Upload profile picture', security: bearer });
paths['/api/user/remove-profile-pic'] = deleteOp({ tags: ['User'], summary: 'Remove profile picture', security: bearer });
paths['/api/user/change-password'] = putOp({ tags: ['User'], summary: 'Change password', security: bearer, body: { currentPassword: { type: 'string', format: 'password' }, newPassword: { type: 'string', format: 'password' } }, required: ['currentPassword', 'newPassword'] });
paths['/api/user/account'] = deleteOp({ tags: ['User'], summary: 'Delete account', security: bearer });
paths['/api/user/invoice/{trackingNumber}'] = getOp({ tags: ['User'], summary: 'Get shipment invoice', security: bearer, params: [pathParam('trackingNumber')], schema: schemaRef('Invoice') });

// --- Client ---
paths['/api/client/shipments'] = getOp({ tags: ['Client'], summary: 'Client shipments', security: bearer, schema: { type: 'array', items: schemaRef('Shipment') } });
paths['/api/client/shipments/{trackingNumber}'] = getOp({ tags: ['Client'], summary: 'Client shipment detail', security: bearer, params: [pathParam('trackingNumber')], schema: schemaRef('Shipment') });
paths['/api/client/payments'] = getOp({ tags: ['Client'], summary: 'Client payments', security: bearer, schema: { type: 'array', items: schemaRef('Payment') } });
paths['/api/client/reports'] = getOp({ tags: ['Client'], summary: 'Client reports', security: bearer });
paths['/api/client/invoices'] = getOp({ tags: ['Client'], summary: 'Client invoices', security: bearer, schema: { type: 'array', items: schemaRef('Invoice') } });
paths['/api/client/invoices/{trackingNumber}'] = getOp({ tags: ['Client'], summary: 'Client invoice detail', params: [pathParam('trackingNumber')], schema: schemaRef('Invoice') });
paths['/api/client/invoices/{trackingNumber}/pay'] = putOp({ tags: ['Client'], summary: 'Pay invoice', security: bearer, params: [pathParam('trackingNumber')], body: { amount: numberProp(), paymentMethod: stringProp() } });

// --- Driver ---
paths['/api/driver/test'] = getOp({ tags: ['Driver'], summary: 'Driver test', security: bearer });
paths['/api/driver/my-route'] = getOp({ tags: ['Driver'], summary: 'My route', security: bearer, schema: schemaRef('Route') });
paths['/api/driver/my-route/stop/{stopId}'] = putOp({ tags: ['Driver'], summary: 'Update route stop', security: bearer, params: [pathParam('stopId')], body: { status: stringProp(), delivered: boolProp() } });
paths['/api/driver/my-route/stats'] = getOp({ tags: ['Driver'], summary: 'Route stats', security: bearer });
paths['/api/driver/weekly-stats'] = getOp({ tags: ['Driver'], summary: 'Weekly stats', security: bearer });
paths['/api/driver/dashboard'] = getOp({ tags: ['Driver'], summary: 'Driver dashboard', security: bearer });
paths['/api/driver/status'] = putOp({ tags: ['Driver'], summary: 'Update availability', security: bearer, body: { online: boolProp(), status: stringProp() } });
paths['/api/driver/shipments'] = getOp({ tags: ['Driver'], summary: 'Driver shipments', security: bearer, schema: { type: 'array', items: schemaRef('Shipment') } });
paths['/api/driver/shipments/{trackingNumber}/status'] = putOp({ tags: ['Driver'], summary: 'Update shipment status', security: bearer, params: [pathParam('trackingNumber')], body: { status: stringProp(), note: stringProp() } });
paths['/api/driver/complete/{trackingNumber}'] = postOp({ tags: ['Driver'], summary: 'Complete shipment', security: bearer, params: [pathParam('trackingNumber')] });
paths['/api/driver/start-gps'] = postOp({ tags: ['Driver'], summary: 'Start GPS tracking', security: bearer });
paths['/api/driver/stop-gps'] = postOp({ tags: ['Driver'], summary: 'Stop GPS tracking', security: bearer });
paths['/api/driver/gps-status'] = getOp({ tags: ['Driver'], summary: 'GPS status', security: bearer });

// --- Driver Location ---
paths['/api/driver-location/update'] = postOp({ tags: ['Driver Location'], summary: 'Update location', security: bearer, body: { lat: numberProp(), lng: numberProp(), online: boolProp() }, required: ['lat', 'lng'] });
paths['/api/driver-location/current/{driverId}'] = getOp({ tags: ['Driver Location'], summary: 'Driver current location', params: [pathParam('driverId')], schema: schemaRef('DriverLocation') });
paths['/api/driver-location/my-location'] = getOp({ tags: ['Driver Location'], summary: 'My location', security: bearer });
paths['/api/driver-location/customer-track/{trackingNumber}'] = getOp({ tags: ['Driver Location'], summary: 'Customer track driver', params: [pathParam('trackingNumber')] });

// --- Admin ---
paths['/api/admin/stats'] = getOp({ tags: ['Admin'], summary: 'Admin dashboard stats', security: bearer });
paths['/api/admin/anomaly-summary'] = getOp({ tags: ['Admin'], summary: 'Anomaly summary', security: bearer });
paths['/api/admin/contacts'] = getOp({ tags: ['Admin'], summary: 'List contacts', security: bearer, schema: { type: 'array', items: schemaRef('Contact') } });
paths['/api/admin/contacts/{id}'] = deleteOp({ tags: ['Admin'], summary: 'Delete contact', security: bearer, params: [pathParam('id')] });
paths['/api/admin/applications'] = getOp({ tags: ['Admin'], summary: 'List applications', security: bearer });
paths['/api/admin/applications/{id}'] = getOp({ tags: ['Admin'], summary: 'Application detail', security: bearer, params: [pathParam('id')] });
paths['/api/admin/applications/{id}/approve'] = putOp({ tags: ['Admin'], summary: 'Approve application', security: bearer, params: [pathParam('id')] });
paths['/api/admin/applications/{id}/reject'] = putOp({ tags: ['Admin'], summary: 'Reject application', security: bearer, params: [pathParam('id')] });
paths['/api/admin/applications/{id}/download-cv'] = getOp({ tags: ['Admin'], summary: 'Download CV', params: [pathParam('id')] });
paths['/api/admin/shipments'] = getOp({ tags: ['Admin'], summary: 'List shipments', security: bearer, schema: { type: 'array', items: schemaRef('Shipment') } });
paths['/api/admin/shipments/{trackingNumber}/status'] = putOp({ tags: ['Admin'], summary: 'Update shipment status', security: bearer, params: [pathParam('trackingNumber')], body: { status: stringProp(), note: stringProp() } });
paths['/api/admin/shipments/{trackingNumber}'] = deleteOp({ tags: ['Admin'], summary: 'Delete shipment', security: bearer, params: [pathParam('trackingNumber')] });
paths['/api/admin/shipments/{trackingNumber}/update-cost'] = putOp({ tags: ['Admin'], summary: 'Update shipment cost', security: bearer, params: [pathParam('trackingNumber')], body: { amount: numberProp() } });
paths['/api/admin/shipments/{trackingNumber}/notes'] = {
    get: getOp({ tags: ['Admin'], summary: 'Get shipment notes', security: bearer, params: [pathParam('trackingNumber')] }).get,
    post: postOp({ tags: ['Admin'], summary: 'Add shipment note', security: bearer, params: [pathParam('trackingNumber')], body: { note: stringProp(), visibility: stringProp() } })
};
paths['/api/admin/shipments/{trackingNumber}/upload-photo'] = postOp({ tags: ['Admin'], summary: 'Upload delivery photo', security: bearer, params: [pathParam('trackingNumber')] });
paths['/api/admin/shipments/{trackingNumber}/delivery-photos'] = getOp({ tags: ['Admin'], summary: 'Get delivery photos', security: bearer, params: [pathParam('trackingNumber')] });
paths['/api/admin/shipments/{trackingNumber}/delivery-photo'] = getOp({ tags: ['Admin'], summary: 'Get delivery photo', security: bearer, params: [pathParam('trackingNumber')] });
paths['/api/admin/shipments/{trackingNumber}/assign-driver'] = putOp({ tags: ['Admin'], summary: 'Assign driver', security: bearer, params: [pathParam('trackingNumber')], body: { driverId: idProp() }, required: ['driverId'] });
paths['/api/admin/shipments/{trackingNumber}/unassign-driver'] = putOp({ tags: ['Admin'], summary: 'Unassign driver', security: bearer, params: [pathParam('trackingNumber')] });
paths['/api/admin/shipments/unassigned'] = getOp({ tags: ['Admin'], summary: 'Unassigned shipments', security: bearer });
paths['/api/admin/users'] = getOp({ tags: ['Admin'], summary: 'List users', security: bearer, schema: { type: 'array', items: schemaRef('User') } });
paths['/api/admin/users/{id}'] = deleteOp({ tags: ['Admin'], summary: 'Delete user', security: bearer, params: [pathParam('id')] });
paths['/api/admin/users/{id}/make-admin'] = putOp({ tags: ['Admin'], summary: 'Make admin', security: bearer, params: [pathParam('id')] });
paths['/api/admin/users/{id}/unlock'] = putOp({ tags: ['Admin'], summary: 'Unlock user', security: bearer, params: [pathParam('id')] });
paths['/api/admin/users/locked'] = getOp({ tags: ['Admin'], summary: 'Locked users', security: bearer });
paths['/api/admin/users/{id}/lock-status'] = getOp({ tags: ['Admin'], summary: 'User lock status', security: bearer, params: [pathParam('id')] });
paths['/api/admin/drivers'] = {
    get: getOp({ tags: ['Admin'], summary: 'List drivers', security: bearer, schema: { type: 'array', items: schemaRef('User') } }).get,
    post: postOp({ tags: ['Admin'], summary: 'Create driver', security: bearer, body: { name: stringProp(), email: { type: 'string', format: 'email' }, password: stringProp(), phone: stringProp(), licenseNumber: stringProp(), vehicleType: stringProp() } })
};
paths['/api/admin/drivers/{id}'] = {
    get: getOp({ tags: ['Admin'], summary: 'Driver detail', security: bearer, params: [pathParam('id')], schema: schemaRef('User') }).get,
    put: putOp({ tags: ['Admin'], summary: 'Update driver', security: bearer, params: [pathParam('id')], body: { name: stringProp(), phone: stringProp(), licenseNumber: stringProp(), vehicleType: stringProp() } }),
    delete: deleteOp({ tags: ['Admin'], summary: 'Delete driver', security: bearer, params: [pathParam('id')] })
};
paths['/api/admin/drivers/stats/summary'] = getOp({ tags: ['Admin'], summary: 'Driver stats summary', security: bearer });
paths['/api/admin/drivers/available/list'] = getOp({ tags: ['Admin'], summary: 'Available drivers', security: bearer });
paths['/api/admin/drivers/{driverId}/shipments'] = getOp({ tags: ['Admin'], summary: 'Driver shipments', security: bearer, params: [pathParam('driverId')] });
paths['/api/admin/reports/revenue-growth'] = getOp({ tags: ['Admin'], summary: 'Revenue growth report', security: bearer });
paths['/api/admin/reports/driver-performance'] = getOp({ tags: ['Admin'], summary: 'Driver performance report', security: bearer });
paths['/api/admin/reports/forecast'] = getOp({ tags: ['Admin'], summary: 'Forecast report', security: bearer });
paths['/api/admin/reports/sla-performance'] = getOp({ tags: ['Admin'], summary: 'SLA performance report', security: bearer });
paths['/api/admin/reports/customer-analytics'] = getOp({ tags: ['Admin'], summary: 'Customer analytics', security: bearer });
paths['/api/admin/reports/failed-delivery-analysis'] = getOp({ tags: ['Admin'], summary: 'Failed delivery analysis', security: bearer });
paths['/api/admin/reports/geographic-analytics'] = getOp({ tags: ['Admin'], summary: 'Geographic analytics', security: bearer });
paths['/api/admin/reports/profit-analysis'] = getOp({ tags: ['Admin'], summary: 'Profit analysis', security: bearer });
paths['/api/admin/ratings'] = getOp({ tags: ['Admin'], summary: 'List ratings', security: bearer, schema: { type: 'array', items: schemaRef('Rating') } });
paths['/api/admin/ratings/{id}'] = deleteOp({ tags: ['Admin'], summary: 'Delete rating', security: bearer, params: [pathParam('id')] });
paths['/api/admin/ratings/driver/{driverId}/stats'] = getOp({ tags: ['Admin'], summary: 'Driver rating stats', security: bearer, params: [pathParam('driverId')] });

// --- Warehouse ---
paths['/api/warehouse/warehouses'] = {
    get: getOp({ tags: ['Warehouse'], summary: 'List warehouses', security: bearer, schema: { type: 'array', items: schemaRef('Warehouse') } }).get,
    post: postOp({ tags: ['Warehouse'], summary: 'Create warehouse', security: bearer, body: { name: stringProp(), location: stringProp(), capacity: numberProp(), manager: idProp() }, required: ['name', 'location'] })
};
paths['/api/warehouse/warehouses/{id}'] = {
    get: getOp({ tags: ['Warehouse'], summary: 'Warehouse detail', security: bearer, params: [pathParam('id')], schema: schemaRef('Warehouse') }).get,
    put: putOp({ tags: ['Warehouse'], summary: 'Update warehouse', security: bearer, params: [pathParam('id')], body: { name: stringProp(), location: stringProp(), capacity: numberProp(), status: stringProp() } }),
    delete: deleteOp({ tags: ['Warehouse'], summary: 'Delete warehouse', security: bearer, params: [pathParam('id')] })
};
paths['/api/warehouse/inventory/receive'] = postOp({ tags: ['Warehouse'], summary: 'Receive inventory', security: bearer, body: { trackingNumber: stringProp(), warehouseId: idProp(), quantity: numberProp(), location: stringProp() }, required: ['trackingNumber', 'warehouseId'] });
paths['/api/warehouse/inventory/{inventoryId}/status'] = putOp({ tags: ['Warehouse'], summary: 'Update inventory status', security: bearer, params: [pathParam('inventoryId')], body: { status: stringProp() } });
paths['/api/warehouse/inventory/{warehouseId}'] = getOp({ tags: ['Warehouse'], summary: 'Warehouse inventory', security: bearer, params: [pathParam('warehouseId')], schema: { type: 'array', items: schemaRef('WarehouseInventory') } });
paths['/api/warehouse/inventory/{inventoryId}/assign-driver'] = putOp({ tags: ['Warehouse'], summary: 'Assign driver to inventory', security: bearer, params: [pathParam('inventoryId')], body: { driverId: idProp() } });
paths['/api/warehouse/shipment/{trackingNumber}'] = getOp({ tags: ['Warehouse'], summary: 'Warehouse shipment detail', security: bearer, params: [pathParam('trackingNumber')] });
paths['/api/warehouse/stats'] = getOp({ tags: ['Warehouse'], summary: 'Warehouse stats', security: bearer });

// --- Warehouse Client ---
paths['/api/warehouse-client/my-items'] = getOp({ tags: ['Warehouse Client'], summary: 'My warehouse items', security: bearer });
paths['/api/warehouse-client/request-dispatch'] = postOp({ tags: ['Warehouse Client'], summary: 'Request dispatch', security: bearer, body: { trackingNumber: stringProp(), warehouseId: idProp(), deliveryAddress: stringProp() }, required: ['trackingNumber'] });

// --- Warehouse Driver ---
paths['/api/warehouse-driver/pickups'] = getOp({ tags: ['Warehouse Driver'], summary: 'Warehouse pickups', security: bearer });
paths['/api/warehouse-driver/pickup/{trackingNumber}'] = putOp({ tags: ['Warehouse Driver'], summary: 'Complete pickup', security: bearer, params: [pathParam('trackingNumber')], body: { status: stringProp() } });

// --- Warehouse Forecast ---
paths['/api/warehouse-forecast/all'] = getOp({ tags: ['Warehouse Forecast'], summary: 'All forecasts', security: bearer });
paths['/api/warehouse-forecast/stats'] = getOp({ tags: ['Warehouse Forecast'], summary: 'Forecast stats', security: bearer });
paths['/api/warehouse-forecast/generate'] = postOp({ tags: ['Warehouse Forecast'], summary: 'Generate forecasts', security: bearer });
paths['/api/warehouse-forecast/warehouse/{warehouseId}/trend'] = getOp({ tags: ['Warehouse Forecast'], summary: 'Warehouse trend', security: bearer, params: [pathParam('warehouseId')] });
paths['/api/warehouse-forecast/warehouse/{warehouseId}/generate'] = postOp({ tags: ['Warehouse Forecast'], summary: 'Generate warehouse forecast', security: bearer, params: [pathParam('warehouseId')] });
paths['/api/warehouse-forecast/alerts'] = getOp({ tags: ['Warehouse Forecast'], summary: 'Forecast alerts', security: bearer });
paths['/api/warehouse-forecast/accuracy/{warehouseId}'] = getOp({ tags: ['Warehouse Forecast'], summary: 'Forecast accuracy', security: bearer, params: [pathParam('warehouseId')] });
paths['/api/warehouse-forecast/predict/{warehouseId}'] = getOp({ tags: ['Warehouse Forecast'], summary: 'Predict demand', security: bearer, params: [pathParam('warehouseId')] });
paths['/api/warehouse-forecast/seasonal/{warehouseId}'] = getOp({ tags: ['Warehouse Forecast'], summary: 'Seasonal factors', security: bearer, params: [pathParam('warehouseId')] });
paths['/api/warehouse-forecast/threshold/{warehouseId}'] = {
    get: getOp({ tags: ['Warehouse Forecast'], summary: 'Get threshold', security: bearer, params: [pathParam('warehouseId')] }).get,
    put: putOp({ tags: ['Warehouse Forecast'], summary: 'Update threshold', security: bearer, params: [pathParam('warehouseId')], body: { threshold: numberProp() } })
};
paths['/api/warehouse-forecast/export/csv'] = getOp({ tags: ['Warehouse Forecast'], summary: 'Export CSV', security: bearer });

// --- Fleet ---
paths['/api/fleet/vehicles'] = {
    get: getOp({ tags: ['Fleet'], summary: 'List vehicles', security: bearer, schema: { type: 'array', items: schemaRef('Vehicle') } }).get,
    post: postOp({ tags: ['Fleet'], summary: 'Create vehicle', security: bearer, body: { plateNumber: stringProp(), type: stringProp(), model: stringProp(), fuelEfficiency: numberProp() }, required: ['plateNumber', 'type'] })
};
paths['/api/fleet/vehicles/{id}'] = {
    get: getOp({ tags: ['Fleet'], summary: 'Vehicle detail', security: bearer, params: [pathParam('id')], schema: schemaRef('Vehicle') }).get,
    put: putOp({ tags: ['Fleet'], summary: 'Update vehicle', security: bearer, params: [pathParam('id')], body: { plateNumber: stringProp(), type: stringProp(), model: stringProp(), status: stringProp(), fuelEfficiency: numberProp() } }),
    delete: deleteOp({ tags: ['Fleet'], summary: 'Delete vehicle', security: bearer, params: [pathParam('id')] })
};
paths['/api/fleet/vehicles/{id}/assign-driver'] = putOp({ tags: ['Fleet'], summary: 'Assign driver', security: bearer, params: [pathParam('id')], body: { driverId: idProp() } });
paths['/api/fleet/vehicles/{id}/unassign-driver'] = putOp({ tags: ['Fleet'], summary: 'Unassign driver', security: bearer, params: [pathParam('id')] });
paths['/api/fleet/vehicles/{id}/location'] = putOp({ tags: ['Fleet'], summary: 'Update vehicle location', security: bearer, params: [pathParam('id')], body: { lat: numberProp(), lng: numberProp() } });
paths['/api/fleet/vehicles/location/{plateNumber}'] = getOp({ tags: ['Fleet'], summary: 'Vehicle by plate', security: bearer, params: [pathParam('plateNumber')] });
paths['/api/fleet/vehicles/locations/all'] = getOp({ tags: ['Fleet'], summary: 'All vehicle locations', security: bearer });
paths['/api/fleet/vehicles/gps/update'] = putOp({ tags: ['Fleet'], summary: 'GPS bulk update', security: bearer, body: { updates: { type: 'array', items: { type: 'object' } } } });
paths['/api/fleet/stats'] = getOp({ tags: ['Fleet'], summary: 'Fleet stats', security: bearer });
paths['/api/fleet/maintenance'] = {
    get: getOp({ tags: ['Fleet'], summary: 'List maintenance', security: bearer }).get,
    post: postOp({ tags: ['Fleet'], summary: 'Create maintenance', security: bearer, body: { vehicleId: idProp(), type: stringProp(), description: stringProp(), cost: numberProp(), scheduledDate: { type: 'string', format: 'date' } }, required: ['vehicleId'] })
};
paths['/api/fleet/maintenance/{id}/status'] = putOp({ tags: ['Fleet'], summary: 'Update maintenance status', security: bearer, params: [pathParam('id')], body: { status: stringProp(), completedDate: { type: 'string', format: 'date' } } });
paths['/api/fleet/reports/summary'] = getOp({ tags: ['Fleet'], summary: 'Fleet report summary', security: bearer });
paths['/api/fleet/reports/export-csv'] = getOp({ tags: ['Fleet'], summary: 'Export fleet CSV', security: bearer });
paths['/api/fleet/reports/export-pdf'] = getOp({ tags: ['Fleet'], summary: 'Export fleet PDF', security: bearer });
paths['/api/fleet/analytics/dashboard'] = getOp({ tags: ['Fleet'], summary: 'Fleet analytics dashboard', security: bearer });

// --- Insurance ---
paths['/api/insurance/admin/claims'] = getOp({ tags: ['Insurance'], summary: 'All claims (admin)', security: bearer, schema: { type: 'array', items: schemaRef('InsuranceClaim') } });
paths['/api/insurance/admin/stats'] = getOp({ tags: ['Insurance'], summary: 'Claims stats (admin)', security: bearer });
paths['/api/insurance/claim'] = postOp({ tags: ['Insurance'], summary: 'Submit claim', security: bearer, body: { shipmentId: idProp(), trackingNumber: stringProp(), claimType: stringProp(), amount: numberProp(), description: stringProp() }, required: ['trackingNumber', 'amount'] });
paths['/api/insurance/admin/{claimId}/approve'] = putOp({ tags: ['Insurance'], summary: 'Approve claim', security: bearer, params: [pathParam('claimId')] });
paths['/api/insurance/admin/{claimId}/reject'] = putOp({ tags: ['Insurance'], summary: 'Reject claim', security: bearer, params: [pathParam('claimId')], body: { reason: stringProp() } });
paths['/api/insurance/admin/{claimId}/paid'] = putOp({ tags: ['Insurance'], summary: 'Mark claim paid', security: bearer, params: [pathParam('claimId')] });
paths['/api/insurance/admin/{claimId}'] = deleteOp({ tags: ['Insurance'], summary: 'Delete claim', security: bearer, params: [pathParam('claimId')] });
paths['/api/insurance/my-claims'] = getOp({ tags: ['Insurance'], summary: 'My claims', security: bearer, schema: { type: 'array', items: schemaRef('InsuranceClaim') } });

// --- Chat ---
paths['/api/chat/users'] = getOp({ tags: ['Chat'], summary: 'Chat users', schema: { type: 'array', items: schemaRef('User') } });
paths['/api/chat/conversations'] = getOp({ tags: ['Chat'], summary: 'Conversations' });
paths['/api/chat/conversation/{userId}'] = getOp({ tags: ['Chat'], summary: 'Conversation messages', params: [pathParam('userId')], schema: { type: 'array', items: schemaRef('Message') } });
paths['/api/chat/send'] = postOp({ tags: ['Chat'], summary: 'Send message', body: { recipientId: idProp(), content: stringProp(), attachment: stringProp() }, required: ['recipientId', 'content'] });
paths['/api/chat/mark-read/{userId}'] = putOp({ tags: ['Chat'], summary: 'Mark messages read', params: [pathParam('userId')] });
paths['/api/chat/unread/count'] = getOp({ tags: ['Chat'], summary: 'Unread count' });

// --- Messages ---
paths['/api/messages/conversations'] = getOp({ tags: ['Messages'], summary: 'My conversations', security: bearer });
paths['/api/messages/conversation/{conversationId}'] = getOp({ tags: ['Messages'], summary: 'Conversation messages', security: bearer, params: [pathParam('conversationId')], schema: { type: 'array', items: schemaRef('Message') } });
paths['/api/messages/send'] = postOp({ tags: ['Messages'], summary: 'Send message', security: bearer, body: { recipientId: idProp(), conversationId: idProp(), content: stringProp(), attachments: { type: 'array', items: { type: 'string' } } }, required: ['content'] });
paths['/api/messages/read/{conversationId}'] = putOp({ tags: ['Messages'], summary: 'Mark conversation read', security: bearer, params: [pathParam('conversationId')] });
paths['/api/messages/unread/count'] = getOp({ tags: ['Messages'], summary: 'Unread count', security: bearer });
paths['/api/messages/admin/drivers'] = getOp({ tags: ['Messages'], summary: 'Admin: drivers list', security: bearer });
paths['/api/messages/admin/list'] = getOp({ tags: ['Messages'], summary: 'Admin message list', security: bearer });
paths['/api/messages/{messageId}'] = deleteOp({ tags: ['Messages'], summary: 'Delete message', security: bearer, params: [pathParam('messageId')] });

// --- Notifications ---
paths['/api/notifications'] = getOp({ tags: ['Notifications'], summary: 'My notifications', schema: { type: 'array', items: schemaRef('Notification') } });
paths['/api/notifications/test'] = postOp({ tags: ['Notifications'], summary: 'Send test notification', body: { userId: idProp(), title: stringProp(), message: stringProp() } });
paths['/api/notifications/bulk'] = postOp({ tags: ['Notifications'], summary: 'Bulk notification', body: { userIds: { type: 'array', items: { type: 'string' } }, title: stringProp(), message: stringProp() }, required: ['userIds', 'message'] });
paths['/api/notifications/{id}/read'] = putOp({ tags: ['Notifications'], summary: 'Mark notification read', params: [pathParam('id')] });
paths['/api/notifications/read-all'] = putOp({ tags: ['Notifications'], summary: 'Mark all read' });
paths['/api/notifications/{id}'] = deleteOp({ tags: ['Notifications'], summary: 'Delete notification', params: [pathParam('id')] });

// --- ETA ---
paths['/api/eta/predict'] = postOp({ tags: ['ETA'], summary: 'Predict ETA', security: bearer, body: { pickupLat: numberProp(), pickupLng: numberProp(), deliveryLat: numberProp(), deliveryLng: numberProp(), trafficLevel: stringProp(), weather: stringProp() }, required: ['pickupLat', 'pickupLng', 'deliveryLat', 'deliveryLng'] });
paths['/api/eta/shipment/{trackingNumber}'] = getOp({ tags: ['ETA'], summary: 'Shipment ETA', params: [pathParam('trackingNumber')] });
paths['/api/eta/update-all'] = postOp({ tags: ['ETA'], summary: 'Update all ETAs (admin)', security: bearer });
paths['/api/eta/stats'] = getOp({ tags: ['ETA'], summary: 'ETA stats (admin)', security: bearer });
paths['/api/eta/accuracy-stats'] = getOp({ tags: ['ETA'], summary: 'ETA accuracy', security: bearer });

// --- Routes ---
paths['/api/routes'] = {
    get: getOp({ tags: ['Routes'], summary: 'List routes', security: bearer, schema: { type: 'array', items: schemaRef('Route') } }).get,
    post: postOp({ tags: ['Routes'], summary: 'Create route', security: bearer, body: { name: stringProp(), driverId: idProp(), stops: { type: 'array', items: { type: 'object' } }, distance: numberProp() }, required: ['name'] })
};
paths['/api/routes/{id}'] = {
    get: getOp({ tags: ['Routes'], summary: 'Route detail', security: bearer, params: [pathParam('id')], schema: schemaRef('Route') }).get,
    put: putOp({ tags: ['Routes'], summary: 'Update route', security: bearer, params: [pathParam('id')], body: { name: stringProp(), driverId: idProp(), stops: { type: 'array', items: { type: 'object' } }, status: stringProp() } }),
    delete: deleteOp({ tags: ['Routes'], summary: 'Delete route', security: bearer, params: [pathParam('id')] })
};
paths['/api/routes/{id}/assign-driver'] = putOp({ tags: ['Routes'], summary: 'Assign driver', security: bearer, params: [pathParam('id')], body: { driverId: idProp() } });
paths['/api/routes/{id}/status'] = putOp({ tags: ['Routes'], summary: 'Update route status', security: bearer, params: [pathParam('id')], body: { status: stringProp() } });
paths['/api/routes/{routeId}/stops/{stopId}/status'] = putOp({ tags: ['Routes'], summary: 'Update stop status', security: bearer, params: [pathParam('routeId'), pathParam('stopId')], body: { status: stringProp() } });
paths['/api/routes/stats/summary'] = getOp({ tags: ['Routes'], summary: 'Routes stats', security: bearer });

// --- Ratings ---
paths['/api/rating/submit'] = postOp({ tags: ['Ratings'], summary: 'Submit rating', security: bearer, body: { shipmentId: idProp(), driverId: idProp(), rating: { type: 'number', minimum: 1, maximum: 5 }, review: stringProp() }, required: ['shipmentId', 'rating'] });
paths['/api/rating/shipment/{trackingNumber}'] = getOp({ tags: ['Ratings'], summary: 'Shipment rating', security: bearer, params: [pathParam('trackingNumber')] });
paths['/api/rating/my-ratings'] = getOp({ tags: ['Ratings'], summary: 'My ratings', security: bearer, schema: { type: 'array', items: schemaRef('Rating') } });

// --- API Keys ---
paths['/api/api-keys'] = {
    get: getOp({ tags: ['API Keys'], summary: 'My API keys', security: bearer, schema: { type: 'array', items: schemaRef('ApiKey') } }).get,
    post: postOp({ tags: ['API Keys'], summary: 'Create API key', security: bearer, body: { name: stringProp(), scopes: { type: 'array', items: { type: 'string' } } }, required: ['name'] })
};
paths['/api/api-keys/{id}'] = {
    get: getOp({ tags: ['API Keys'], summary: 'API key detail', security: bearer, params: [pathParam('id')], schema: schemaRef('ApiKey') }).get,
    put: putOp({ tags: ['API Keys'], summary: 'Update API key', security: bearer, params: [pathParam('id')], body: { name: stringProp(), scopes: { type: 'array', items: { type: 'string' } } } }),
    delete: deleteOp({ tags: ['API Keys'], summary: 'Delete API key', security: bearer, params: [pathParam('id')] })
};
paths['/api/api-keys/{id}/regenerate'] = postOp({ tags: ['API Keys'], summary: 'Regenerate API key', security: bearer, params: [pathParam('id')] });
paths['/api/api-keys/{id}/stats'] = getOp({ tags: ['API Keys'], summary: 'API key usage stats', security: bearer, params: [pathParam('id')] });
paths['/api/api-keys/admin'] = getOp({ tags: ['API Keys'], summary: 'All API keys (admin)', security: bearer });
paths['/api/api-keys/admin/{id}'] = deleteOp({ tags: ['API Keys'], summary: 'Delete API key (admin)', security: bearer, params: [pathParam('id')] });
paths['/api/api-keys/admin/{id}/toggle'] = patchOp({ tags: ['API Keys'], summary: 'Toggle API key (admin)', security: bearer, params: [pathParam('id')], body: { enabled: boolProp() } });

// --- B2B v1 ---
paths['/api/v1/tracking/{trackingNumber}'] = getOp({ tags: ['B2B (v1)'], summary: 'B2B: Track shipment', params: [pathParam('trackingNumber')], schema: schemaRef('Shipment') });
paths['/api/v1/shipments'] = {
    get: getOp({ tags: ['B2B (v1)'], summary: 'B2B: List shipments', security: apiKey, schema: { type: 'array', items: schemaRef('Shipment') } }).get,
    post: postOp({ tags: ['B2B (v1)'], summary: 'B2B: Create shipment', security: apiKey, body: { senderName: stringProp(), senderAddress: stringProp(), receiverName: stringProp(), receiverAddress: stringProp(), weight: numberProp(), serviceType: stringProp() }, required: ['receiverName', 'receiverAddress', 'weight'] })
};
paths['/api/v1/shipments/shipping-options'] = getOp({ tags: ['B2B (v1)'], summary: 'B2B: Shipping options', security: apiKey });
paths['/api/v1/shipments/{id}'] = {
    get: getOp({ tags: ['B2B (v1)'], summary: 'B2B: Shipment detail', security: apiKey, params: [pathParam('id')], schema: schemaRef('Shipment') }).get,
    put: putOp({ tags: ['B2B (v1)'], summary: 'B2B: Update shipment', security: apiKey, params: [pathParam('id')], body: { receiverName: stringProp(), receiverAddress: stringProp(), weight: numberProp(), serviceType: stringProp() } }),
    delete: deleteOp({ tags: ['B2B (v1)'], summary: 'B2B: Delete shipment', security: apiKey, params: [pathParam('id')] })
};
paths['/api/v1/shipments/stats'] = getOp({ tags: ['B2B (v1)'], summary: 'B2B: Shipment stats', security: apiKey });
paths['/api/v1/shipments/tracking/{number}'] = getOp({ tags: ['B2B (v1)'], summary: 'B2B: Track by number', security: apiKey, params: [pathParam('number')] });
paths['/api/v1/shipments/{id}/assign-driver'] = putOp({ tags: ['B2B (v1)'], summary: 'B2B: Assign driver', security: apiKey, params: [pathParam('id')], body: { driverId: idProp() } });
paths['/api/v1/shipments/recent'] = getOp({ tags: ['B2B (v1)'], summary: 'B2B: Recent shipments', security: apiKey });
paths['/api/v1/shipments/search'] = getOp({ tags: ['B2B (v1)'], summary: 'B2B: Search shipments', security: apiKey, params: [queryParam('q', 'Search query')] });
paths['/api/v1/shipments/delivered'] = getOp({ tags: ['B2B (v1)'], summary: 'B2B: Delivered shipments', security: apiKey });
paths['/api/v1/shipments/export'] = getOp({ tags: ['B2B (v1)'], summary: 'B2B: Export shipments', security: apiKey });
paths['/api/v1/drivers'] = getOp({ tags: ['B2B (v1)'], summary: 'B2B: List drivers', schema: { type: 'array', items: schemaRef('User') } });
paths['/api/v1/drivers/{id}/location'] = getOp({ tags: ['B2B (v1)'], summary: 'B2B: Driver location', params: [pathParam('id')], schema: schemaRef('DriverLocation') });
paths['/api/v1/rates/estimate'] = postOp({ tags: ['B2B (v1)'], summary: 'B2B: Rate estimate', body: { weight: numberProp(), distance: numberProp(), serviceType: stringProp(), pickupPostal: stringProp(), deliveryPostal: stringProp() }, required: ['weight', 'distance'] });
paths['/api/v1/auth/keys'] = {
    get: getOp({ tags: ['B2B (v1)'], summary: 'B2B: List API keys' }).get,
    post: postOp({ tags: ['B2B (v1)'], summary: 'B2B: Create API key', body: { name: stringProp(), scopes: { type: 'array', items: { type: 'string' } } }, required: ['name'] })
};
paths['/api/v1/auth/keys/{id}'] = {
    put: putOp({ tags: ['B2B (v1)'], summary: 'B2B: Update API key', params: [pathParam('id')], body: { name: stringProp(), scopes: { type: 'array', items: { type: 'string' } } } }),
    delete: deleteOp({ tags: ['B2B (v1)'], summary: 'B2B: Delete API key', params: [pathParam('id')] })
};

// --- Webhooks ---
paths['/api/v1/webhooks'] = {
    get: getOp({ tags: ['Webhooks'], summary: 'List webhooks', security: bearer, schema: { type: 'array', items: schemaRef('WebhookSubscription') } }).get,
    post: postOp({ tags: ['Webhooks'], summary: 'Create webhook', security: bearer, body: { name: stringProp(), url: { type: 'string', format: 'uri' }, events: { type: 'array', items: { type: 'string' } }, secret: stringProp(), enabled: boolProp() }, required: ['name', 'url', 'events'] })
};
paths['/api/v1/webhooks/logs'] = getOp({ tags: ['Webhooks'], summary: 'Webhook delivery logs', security: bearer });
paths['/api/v1/webhooks/{id}'] = {
    get: getOp({ tags: ['Webhooks'], summary: 'Webhook detail', security: bearer, params: [pathParam('id')], schema: schemaRef('WebhookSubscription') }).get,
    put: putOp({ tags: ['Webhooks'], summary: 'Update webhook', security: bearer, params: [pathParam('id')], body: { name: stringProp(), url: { type: 'string', format: 'uri' }, events: { type: 'array', items: { type: 'string' } }, enabled: boolProp() } }),
    delete: deleteOp({ tags: ['Webhooks'], summary: 'Delete webhook', security: bearer, params: [pathParam('id')] })
};
paths['/api/v1/webhooks/{id}/test'] = postOp({ tags: ['Webhooks'], summary: 'Test webhook', security: bearer, params: [pathParam('id')] });

// --- Carbon ---
paths['/api/carbon/eco-options'] = postOp({ tags: ['Carbon'], summary: 'Get eco shipping options', security: bearer, body: { weight: numberProp('kg'), distance: numberProp('km') } });
paths['/api/carbon/offset'] = postOp({ tags: ['Carbon'], summary: 'Offset carbon', security: bearer, body: { shipmentId: idProp(), amount: numberProp() }, required: ['shipmentId'] });
paths['/api/carbon/offset-payment'] = postOp({ tags: ['Carbon'], summary: 'Offset payment', security: bearer, body: { shipmentId: idProp(), amount: numberProp(), paymentMethod: stringProp() }, required: ['shipmentId', 'amount'] });
paths['/api/carbon/offset-confirm'] = postOp({ tags: ['Carbon'], summary: 'Confirm offset', security: bearer, body: { paymentId: idProp() }, required: ['paymentId'] });
paths['/api/carbon/payments'] = getOp({ tags: ['Carbon'], summary: 'Carbon payments', security: bearer });
paths['/api/carbon/summary'] = getOp({ tags: ['Carbon'], summary: 'Carbon summary', security: bearer });
paths['/api/carbon/trend'] = getOp({ tags: ['Carbon'], summary: 'Carbon trend', security: bearer });
paths['/api/carbon/stats'] = getOp({ tags: ['Carbon'], summary: 'Carbon stats', security: bearer });
paths['/api/carbon/shipment/{id}'] = getOp({ tags: ['Carbon'], summary: 'Shipment carbon footprint', security: bearer, params: [pathParam('id')], schema: schemaRef('CarbonFootprint') });
paths['/api/carbon/calculate/{shipmentId}'] = postOp({ tags: ['Carbon'], summary: 'Calculate shipment carbon', security: bearer, params: [pathParam('shipmentId')] });
paths['/api/carbon/invoice/{invoiceId}'] = getOp({ tags: ['Carbon'], summary: 'Carbon invoice', security: bearer, params: [pathParam('invoiceId')] });
paths['/api/carbon/invoice-pdf/{invoiceId}'] = getOp({ tags: ['Carbon'], summary: 'Carbon invoice PDF', params: [pathParam('invoiceId')] });

// --- Anomaly ---
paths['/api/anomaly'] = getOp({ tags: ['Anomaly'], summary: 'List anomalies', security: bearer, schema: { type: 'array', items: schemaRef('AnomalyLog') } });
paths['/api/anomaly/stats'] = getOp({ tags: ['Anomaly'], summary: 'Anomaly stats', security: bearer });
paths['/api/anomaly/run'] = postOp({ tags: ['Anomaly'], summary: 'Run anomaly detection', security: bearer });
paths['/api/anomaly/scan'] = postOp({ tags: ['Anomaly'], summary: 'Scan for anomalies', security: bearer });
paths['/api/anomaly/types/stats'] = getOp({ tags: ['Anomaly'], summary: 'Anomaly types stats', security: bearer });
paths['/api/anomaly/recent/{limit}'] = getOp({ tags: ['Anomaly'], summary: 'Recent anomalies', security: bearer, params: [pathParam('limit', 'Max results', 'integer')] });
paths['/api/anomaly/score/summary'] = getOp({ tags: ['Anomaly'], summary: 'Anomaly score summary', security: bearer });
paths['/api/anomaly/{id}'] = {
    get: getOp({ tags: ['Anomaly'], summary: 'Anomaly detail', security: bearer, params: [pathParam('id')], schema: schemaRef('AnomalyLog') }).get,
    put: putOp({ tags: ['Anomaly'], summary: 'Update anomaly', security: bearer, params: [pathParam('id')], body: { status: stringProp(), note: stringProp() } }),
    delete: deleteOp({ tags: ['Anomaly'], summary: 'Delete anomaly', security: bearer, params: [pathParam('id')] })
};
paths['/api/anomaly/{id}/false-positive'] = putOp({ tags: ['Anomaly'], summary: 'Mark false positive', security: bearer, params: [pathParam('id')] });

// --- Sentiment ---
paths['/api/sentiment/stats'] = getOp({ tags: ['Sentiment'], summary: 'Sentiment stats', security: bearer });
paths['/api/sentiment/logs'] = getOp({ tags: ['Sentiment'], summary: 'Sentiment logs', security: bearer, schema: { type: 'array', items: schemaRef('SentimentLog') } });
paths['/api/sentiment/recent'] = getOp({ tags: ['Sentiment'], summary: 'Recent sentiment', security: bearer });
paths['/api/sentiment/urgent'] = getOp({ tags: ['Sentiment'], summary: 'Urgent sentiment', security: bearer });
paths['/api/sentiment/trends'] = getOp({ tags: ['Sentiment'], summary: 'Sentiment trends', security: bearer });
paths['/api/sentiment/distribution'] = getOp({ tags: ['Sentiment'], summary: 'Sentiment distribution', security: bearer });
paths['/api/sentiment/customers/summary'] = getOp({ tags: ['Sentiment'], summary: 'Customer sentiment summary', security: bearer });
paths['/api/sentiment/customer/{userId}'] = getOp({ tags: ['Sentiment'], summary: 'Customer sentiment', security: bearer, params: [pathParam('userId')] });
paths['/api/sentiment/ticket/{id}'] = getOp({ tags: ['Sentiment'], summary: 'Ticket sentiment', security: bearer, params: [pathParam('id')] });
paths['/api/sentiment/export/csv'] = getOp({ tags: ['Sentiment'], summary: 'Export sentiment CSV', security: bearer });
paths['/api/sentiment/analyze/ticket/{id}'] = postOp({ tags: ['Sentiment'], summary: 'Analyze ticket', security: bearer, params: [pathParam('id')] });
paths['/api/sentiment/analyze/all'] = postOp({ tags: ['Sentiment'], summary: 'Analyze all', security: bearer });
paths['/api/sentiment/analyze/text'] = postOp({ tags: ['Sentiment'], summary: 'Analyze text', security: bearer, body: { text: stringProp() }, required: ['text'] });
paths['/api/sentiment/analyze/bulk'] = postOp({ tags: ['Sentiment'], summary: 'Analyze bulk', security: bearer, body: { texts: { type: 'array', items: { type: 'string' } } }, required: ['texts'] });

// --- Assignment ---
paths['/api/assignment/auto-assign'] = postOp({ tags: ['Assignment'], summary: 'Auto-assign shipments', security: bearer });
paths['/api/assignment/stats'] = getOp({ tags: ['Assignment'], summary: 'Assignment stats', security: bearer });
paths['/api/assignment/history'] = getOp({ tags: ['Assignment'], summary: 'Assignment history', security: bearer });
paths['/api/assignment/recent'] = getOp({ tags: ['Assignment'], summary: 'Recent assignments', security: bearer });
paths['/api/assignment/metrics'] = getOp({ tags: ['Assignment'], summary: 'Assignment metrics', security: bearer });
paths['/api/assignment/logs'] = getOp({ tags: ['Assignment'], summary: 'Assignment logs', security: bearer });
paths['/api/assignment/assign/{trackingNumber}'] = postOp({ tags: ['Assignment'], summary: 'Assign shipment', security: bearer, params: [pathParam('trackingNumber')], body: { driverId: idProp() }, required: ['driverId'] });
paths['/api/assignment/driver-performance/{driverId}'] = getOp({ tags: ['Assignment'], summary: 'Driver performance', security: bearer, params: [pathParam('driverId')] });
paths['/api/assignment/accept/{trackingNumber}'] = postOp({ tags: ['Assignment'], summary: 'Accept assignment', security: bearer, params: [pathParam('trackingNumber')] });
paths['/api/assignment/reject/{trackingNumber}'] = postOp({ tags: ['Assignment'], summary: 'Reject assignment', security: bearer, params: [pathParam('trackingNumber')], body: { reason: stringProp() } });
paths['/api/assignment/complete/{trackingNumber}'] = postOp({ tags: ['Assignment'], summary: 'Complete assignment', security: bearer, params: [pathParam('trackingNumber')] });

// --- Tickets ---
paths['/api/tickets'] = postOp({ tags: ['Tickets'], summary: 'Create ticket', security: bearer, body: { subject: stringProp(), description: stringProp(), priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] }, attachments: { type: 'array', items: { type: 'string' } } }, required: ['subject', 'description'] });
paths['/api/tickets/my-tickets'] = getOp({ tags: ['Tickets'], summary: 'My tickets', security: bearer, schema: { type: 'array', items: schemaRef('Ticket') } });
paths['/api/tickets/{id}'] = getOp({ tags: ['Tickets'], summary: 'Ticket detail', security: bearer, params: [pathParam('id')], schema: schemaRef('Ticket') });
paths['/api/tickets/{id}/reply'] = postOp({ tags: ['Tickets'], summary: 'Reply to ticket', security: bearer, params: [pathParam('id')], body: { message: stringProp(), attachments: { type: 'array', items: { type: 'string' } } }, required: ['message'] });
paths['/api/tickets/admin/all'] = getOp({ tags: ['Tickets'], summary: 'Admin: all tickets', security: bearer });
paths['/api/tickets/admin/stats'] = getOp({ tags: ['Tickets'], summary: 'Admin: ticket stats', security: bearer });
paths['/api/tickets/admin/sentiment-stats'] = getOp({ tags: ['Tickets'], summary: 'Admin: sentiment stats', security: bearer });
paths['/api/tickets/admin/escalated'] = getOp({ tags: ['Tickets'], summary: 'Admin: escalated tickets', security: bearer });
paths['/api/tickets/admin/by-sentiment/{label}'] = getOp({ tags: ['Tickets'], summary: 'Tickets by sentiment', security: bearer, params: [pathParam('label')] });
paths['/api/tickets/admin/{id}/status'] = putOp({ tags: ['Tickets'], summary: 'Update ticket status', security: bearer, params: [pathParam('id')], body: { status: { type: 'string', enum: ['open', 'in_progress', 'resolved', 'closed'] } } });
paths['/api/tickets/admin/{id}/assign'] = putOp({ tags: ['Tickets'], summary: 'Assign ticket', security: bearer, params: [pathParam('id')], body: { assigneeId: idProp() } });

// --- Contact ---
paths['/api/contact'] = {
    get: getOp({ tags: ['Contact'], summary: 'List inquiries' }).get,
    post: postOp({ tags: ['Contact'], summary: 'Submit inquiry', body: { name: stringProp(), email: { type: 'string', format: 'email' }, subject: stringProp(), message: stringProp() }, required: ['name', 'email', 'message'] })
};
paths['/api/contact/{id}'] = deleteOp({ tags: ['Contact'], summary: 'Delete inquiry', params: [pathParam('id')] });
paths['/api/contact/{id}/approve'] = putOp({ tags: ['Contact'], summary: 'Approve inquiry', params: [pathParam('id')] });
paths['/api/contact/{id}/reject'] = putOp({ tags: ['Contact'], summary: 'Reject inquiry', params: [pathParam('id')] });
paths['/api/contact/{id}/reply'] = putOp({ tags: ['Contact'], summary: 'Reply to inquiry', params: [pathParam('id')], body: { reply: stringProp() }, required: ['reply'] });
paths['/api/contact/my-inquiries'] = getOp({ tags: ['Contact'], summary: 'My inquiries' });

// --- Careers ---
paths['/api/careers'] = {
    get: getOp({ tags: ['Careers'], summary: 'List applications' }).get,
    post: postOp({ tags: ['Careers'], summary: 'Submit application', body: { name: stringProp(), email: { type: 'string', format: 'email' }, position: stringProp(), experience: stringProp(), message: stringProp() }, required: ['name', 'email', 'position'] })
};

// --- Returns ---
paths['/api/returns/request'] = postOp({ tags: ['Returns'], summary: 'Request return', security: bearer, body: { trackingNumber: stringProp(), reason: stringProp(), description: stringProp() }, required: ['trackingNumber', 'reason'] });
paths['/api/returns/my-returns'] = getOp({ tags: ['Returns'], summary: 'My returns', security: bearer });
paths['/api/returns/admin/all'] = getOp({ tags: ['Returns'], summary: 'Admin: all returns', security: bearer });
paths['/api/returns/admin/stats'] = getOp({ tags: ['Returns'], summary: 'Admin: returns stats', security: bearer });
paths['/api/returns/admin/{returnId}'] = {
    put: putOp({ tags: ['Returns'], summary: 'Update return', security: bearer, params: [pathParam('returnId')], body: { status: stringProp(), adminNotes: stringProp() } }),
    delete: deleteOp({ tags: ['Returns'], summary: 'Delete return', security: bearer, params: [pathParam('returnId')] })
};

// --- Recurring Shipment ---
paths['/api/recurring-shipment'] = postOp({ tags: ['Recurring Shipment'], summary: 'Create recurring shipment', security: bearer, body: { frequency: { type: 'string', enum: ['weekly', 'biweekly', 'monthly'] }, dayOfWeek: numberProp(), dayOfMonth: numberProp(), shipmentTemplate: { type: 'object' } }, required: ['frequency'] });
paths['/api/recurring-shipment/process'] = postOp({ tags: ['Recurring Shipment'], summary: 'Process recurring shipments' });

// --- Bulk Shipment ---
paths['/api/bulk-shipment/upload'] = postOp({ tags: ['Bulk Shipment'], summary: 'Upload CSV bulk shipments', security: bearer, body: { csvFile: { type: 'string', format: 'binary' } }, required: ['csvFile'] });
paths['/api/bulk-shipment/template'] = getOp({ tags: ['Bulk Shipment'], summary: 'Download CSV template' });

// --- Optimization ---
paths['/api/optimize'] = postOp({ tags: ['Optimization'], summary: 'Run route optimization', security: bearer, body: { driverId: idProp(), shipments: { type: 'array', items: { type: 'string' } }, optimizeFor: { type: 'string', enum: ['time', 'distance', 'cost'] } }, required: ['shipments'] });
paths['/api/optimize/status'] = getOp({ tags: ['Optimization'], summary: 'Optimization status', security: bearer });

// --- Audit ---
paths['/api/audit'] = getOp({ tags: ['Audit'], summary: 'List audit logs', security: bearer });
paths['/api/audit/{id}'] = getOp({ tags: ['Audit'], summary: 'Audit log detail', security: bearer, params: [pathParam('id')] });
paths['/api/audit/stats/summary'] = getOp({ tags: ['Audit'], summary: 'Audit stats', security: bearer });

// --- Login History ---
paths['/api/login-history/my-history'] = getOp({ tags: ['Login History'], summary: 'My login history', security: bearer });
paths['/api/login-history/recent'] = getOp({ tags: ['Login History'], summary: 'Recent logins', security: bearer });
paths['/api/login-history/last-login'] = getOp({ tags: ['Login History'], summary: 'Last login', security: bearer });
paths['/api/login-history/admin/all'] = getOp({ tags: ['Login History'], summary: 'Admin: all logins', security: bearer });
paths['/api/login-history/admin/stats'] = getOp({ tags: ['Login History'], summary: 'Admin: login stats', security: bearer });

// ------------------------------------------------------------
// Assemble document
// ------------------------------------------------------------
const swaggerDocument = {
    openapi: '3.0.0',
    info: {
        title: 'TAMYOKIY Logistics API',
        description: 'Comprehensive API for the TAMYOKIY Logistics platform. Includes customer-facing shipment tracking, payments, insurance claims, chat, notifications, ETA prediction, admin management, warehouse operations, fleet management, anomaly detection, sentiment analysis, and B2B integration via API keys (x-api-key header).\n\n## Authentication\n- **JWT Bearer Token**: Login or register to get a token. Send as `Authorization: Bearer <token>`.\n- **API Key**: B2B clients use `x-api-key` header for `/api/v1` routes.\n- **Admin**: Admin routes require a JWT token for a user with role `admin`.\n\nUse the **Authorize** button to configure either security scheme.',
        version: '1.0.0',
        contact: { name: 'TAMYOKIY Support', email: 'support@tamyokiy.com' },
        license: { name: 'Proprietary' }
    },
    servers: [
        { url: 'http://localhost:5000', description: 'Development Server' },
        { url: 'https://tamyokiy-backend.onrender.com', description: 'Production Server' },
        { url: 'https://api.tamyokiy.com/api/v1', description: 'B2B API (Production)' }
    ],
    tags: [
        { name: 'System', description: 'Health, docs, translations' },
        { name: 'Auth', description: 'Authentication & registration (JWT)' },
        { name: 'OTP', description: 'Email & phone OTP verification' },
        { name: 'Tracking', description: 'Shipment tracking & creation' },
        { name: 'Public', description: 'Public endpoints (no auth required)' },
        { name: 'Payments', description: 'Payments, checkouts, invoices' },
        { name: 'Refunds', description: 'Refund requests' },
        { name: 'User', description: 'User profile & account management' },
        { name: 'Client', description: 'Client dashboard data' },
        { name: 'Driver', description: 'Driver operations & routes' },
        { name: 'Driver Location', description: 'Driver GPS location' },
        { name: 'Admin', description: 'Admin dashboard & management' },
        { name: 'Warehouse', description: 'Warehouse & inventory management' },
        { name: 'Warehouse Client', description: 'Warehouse client operations' },
        { name: 'Warehouse Driver', description: 'Warehouse driver pickups' },
        { name: 'Warehouse Forecast', description: 'Warehouse demand forecasting' },
        { name: 'Fleet', description: 'Fleet vehicle management' },
        { name: 'Insurance', description: 'Insurance claims' },
        { name: 'Chat', description: 'User chat & messaging' },
        { name: 'Messages', description: 'Structured messages' },
        { name: 'Notifications', description: 'Push notifications' },
        { name: 'ETA', description: 'ETA prediction & delay risk' },
        { name: 'Routes', description: 'Delivery routes & stops' },
        { name: 'Ratings', description: 'Ratings & reviews' },
        { name: 'API Keys', description: 'API key management' },
        { name: 'B2B (v1)', description: 'B2B API with x-api-key authentication' },
        { name: 'Webhooks', description: 'Webhook subscriptions' },
        { name: 'Carbon', description: 'Carbon footprint tracking' },
        { name: 'Anomaly', description: 'Anomaly detection' },
        { name: 'Sentiment', description: 'Sentiment analysis' },
        { name: 'Assignment', description: 'Driver assignment' },
        { name: 'Tickets', description: 'Support tickets' },
        { name: 'Contact', description: 'Contact & inquiries' },
        { name: 'Careers', description: 'Careers & applications' },
        { name: 'Returns', description: 'Returns & refunds' },
        { name: 'Recurring Shipment', description: 'Recurring shipments' },
        { name: 'Bulk Shipment', description: 'Bulk CSV shipments' },
        { name: 'Optimization', description: 'Route optimization' },
        { name: 'Audit', description: 'Admin audit logs' },
        { name: 'Login History', description: 'User login history' }
    ],
    paths,
    components: {
        securitySchemes: {
            bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
                description: 'Enter your JWT Bearer token.'
            },
            ApiKeyAuth: {
                type: 'apiKey',
                in: 'header',
                name: 'x-api-key',
                description: 'B2B client API key authentication.'
            }
        },
        schemas
    }
};

// Sort paths alphabetically for readability
const sortedPaths = {};
Object.keys(paths).sort().forEach((k) => { sortedPaths[k] = paths[k]; });
swaggerDocument.paths = sortedPaths;

const outPath = path.join(__dirname, 'swagger.json');
fs.writeFileSync(outPath, JSON.stringify(swaggerDocument, null, 2));
console.log(`✅ Generated swagger.json`);
console.log(`📍 Paths: ${Object.keys(swaggerDocument.paths).length}`);
console.log(`📍 Schemas: ${Object.keys(swaggerDocument.components.schemas).length}`);
console.log(`📍 File size: ${fs.statSync(outPath).size} bytes`);

