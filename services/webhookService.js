// services/webhookService.js
// 🔔 Webhook Delivery Service

const WebhookSubscription = require('../models/WebhookSubscription');
const WebhookLog = require('../models/WebhookLog');
const axios = require('axios');

class WebhookService {
    
    /**
     * 📨 Deliver webhook event
     */
    async deliverEvent(event, payload, userId = null) {
        try {
            // Find all active subscriptions for this event
            let query = { 
                isActive: true,
                events: event
            };
            
            if (userId) {
                query.userId = userId;
            }
            
            const subscriptions = await WebhookSubscription.find(query);
            
            if (subscriptions.length === 0) {
                console.log(`📨 No webhook subscriptions for event: ${event}`);
                return;
            }
            
            console.log(`📨 Delivering webhook ${event} to ${subscriptions.length} subscribers`);
            
            // Send to each subscription
            for (const sub of subscriptions) {
                await this.sendWebhook(sub, event, payload);
            }
            
        } catch (err) {
            console.error('Webhook delivery error:', err);
        }
    }
    
    /**
     * 📤 Send webhook to a single subscription
     */
    async sendWebhook(subscription, event, payload) {
        const startTime = Date.now();
        let attempt = 1;
        let success = false;
        let lastError = null;
        
        while (attempt <= subscription.retryConfig.maxAttempts && !success) {
            try {
                // Prepare payload
                const webhookPayload = {
                    id: `wh_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                    event: event,
                    timestamp: new Date().toISOString(),
                    data: payload,
                    subscription: {
                        id: subscription._id,
                        name: subscription.name
                    }
                };
                
                // Prepare headers
                const headers = {
                    'Content-Type': 'application/json',
                    'User-Agent': 'TAMYOKIY-Webhook/1.0',
                    'X-Webhook-Event': event,
                    'X-Webhook-Id': webhookPayload.id,
                    'X-Webhook-Timestamp': webhookPayload.timestamp
                };
                
                // Add custom headers
                if (subscription.headers) {
                    for (const [key, value] of subscription.headers) {
                        headers[key] = value;
                    }
                }
                
                // Send webhook
                const response = await axios.post(subscription.url, webhookPayload, {
                    headers: headers,
                    timeout: subscription.retryConfig.timeout || 10000
                });
                
                // Success
                success = true;
                subscription.successCount++;
                subscription.lastTriggered = new Date();
                
                // Log success
                await this.logWebhook(subscription._id, event, payload, subscription.url, {
                    success: true,
                    status: response.status,
                    body: response.data,
                    attempt: attempt,
                    duration: Date.now() - startTime
                });
                
                console.log(`✅ Webhook delivered to ${subscription.url} (${response.status})`);
                
            } catch (err) {
                lastError = err.message;
                subscription.failureCount++;
                subscription.lastError = err.message;
                
                // Log failure
                await this.logWebhook(subscription._id, event, payload, subscription.url, {
                    success: false,
                    status: err.response?.status || 0,
                    body: err.response?.data || null,
                    attempt: attempt,
                    duration: Date.now() - startTime,
                    error: err.message
                });
                
                console.log(`❌ Webhook failed to ${subscription.url} (attempt ${attempt}): ${err.message}`);
                
                // Retry if not last attempt
                if (attempt < subscription.retryConfig.maxAttempts) {
                    const delay = subscription.retryConfig.retryDelay * attempt;
                    console.log(`⏳ Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
                
                attempt++;
            }
        }
        
        // Save subscription
        await subscription.save();
        
        return success;
    }
    
    /**
     * 📋 Log webhook delivery
     */
    async logWebhook(subscriptionId, event, payload, url, result) {
        try {
            const log = new WebhookLog({
                subscriptionId,
                event,
                payload,
                url,
                status: result.success ? 'success' : 'failed',
                responseStatus: result.status || null,
                responseBody: result.body ? JSON.stringify(result.body) : null,
                attempt: result.attempt || 1,
                error: result.error || null,
                duration: result.duration || 0
            });
            
            await log.save();
            return log;
            
        } catch (err) {
            console.error('Webhook log error:', err);
            return null;
        }
    }
    
    /**
     * 🧪 Test webhook endpoint
     */
    async testWebhook(url) {
        try {
            const testPayload = {
                test: true,
                event: 'webhook.test',
                timestamp: new Date().toISOString(),
                data: {
                    message: 'This is a test webhook from TAMYOKIY Logistics',
                    status: 'success'
                }
            };
            
            const response = await axios.post(url, testPayload, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'TAMYOKIY-Webhook/1.0',
                    'X-Webhook-Test': 'true'
                },
                timeout: 5000
            });
            
            return {
                success: true,
                status: response.status,
                data: response.data
            };
            
        } catch (err) {
            return {
                success: false,
                status: err.response?.status || 0,
                error: err.message,
                data: err.response?.data || null
            };
        }
    }
}

module.exports = new WebhookService();