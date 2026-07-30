const WebhookSubscription = require('../models/WebhookSubscription');
const WebhookLog = require('../models/WebhookLog');
const crypto = require('crypto');

class WebhookDeliveryService {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        this.maxRetries = 3;
        this.retryDelays = [1000, 5000, 15000]; // 1s, 5s, 15s
    }

    // ============================================================
    // 📤 Deliver event to all subscribed webhooks
    // ============================================================
    async deliverEvent(event, data) {
        try {
            const webhooks = await WebhookSubscription.find({
                events: event,
                enabled: true
            });

            if (webhooks.length === 0) {
                console.log(`📭 No webhooks subscribed to event: ${event}`);
                return;
            }

            console.log(`📤 Delivering ${event} to ${webhooks.length} webhooks`);

            const payload = {
                event,
                timestamp: new Date().toISOString(),
                data
            };

            // Queue delivery for each webhook
            for (const webhook of webhooks) {
                this.queue.push({
                    webhook,
                    payload,
                    attempt: 0
                });
            }

            // Start processing if not already
            if (!this.isProcessing) {
                this.processQueue();
            }

        } catch (error) {
            console.error('Error delivering webhook:', error);
        }
    }

    // ============================================================
    // ⚙️ Process the webhook queue
    // ============================================================
    async processQueue() {
        if (this.isProcessing || this.queue.length === 0) {
            return;
        }

        this.isProcessing = true;

        while (this.queue.length > 0) {
            const item = this.queue.shift();
            await this.deliverToWebhook(item.webhook, item.payload, item.attempt);
        }

        this.isProcessing = false;
    }

    // ============================================================
    // 📤 Deliver to a single webhook
    // ============================================================
    async deliverToWebhook(webhook, payload, attempt) {
        try {
            // Generate signature
            const signature = crypto
                .createHmac('sha256', webhook.secret)
                .update(JSON.stringify(payload))
                .digest('hex');

            // Send webhook
            const response = await fetch(webhook.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Webhook-Signature': signature,
                    'X-Webhook-Id': webhook._id.toString(),
                    'X-Webhook-Event': payload.event,
                    'X-Webhook-Attempt': attempt + 1
                },
                body: JSON.stringify(payload),
                timeout: 10000 // 10 second timeout
            });

            const responseText = await response.text();

            // Log successful delivery
            await WebhookLog.create({
                webhookId: webhook._id,
                event: payload.event,
                payload: payload.data,
                response: responseText,
                status: response.ok ? 'delivered' : 'failed',
                statusCode: response.status,
                attempt: attempt + 1,
                timestamp: new Date()
            });

            if (!response.ok && attempt < this.maxRetries) {
                // Retry with backoff
                console.log(`🔄 Retrying webhook ${webhook._id} (attempt ${attempt + 1}/${this.maxRetries})`);
                setTimeout(() => {
                    this.queue.push({
                        webhook,
                        payload,
                        attempt: attempt + 1
                    });
                    this.processQueue();
                }, this.retryDelays[attempt] || 10000);
            } else if (!response.ok) {
                console.error(`❌ Webhook ${webhook._id} failed after ${this.maxRetries} attempts`);
            } else {
                console.log(`✅ Webhook ${webhook._id} delivered successfully`);
            }

        } catch (error) {
            console.error(`❌ Error delivering webhook ${webhook._id}:`, error.message);

            // Log failure
            await WebhookLog.create({
                webhookId: webhook._id,
                event: payload.event,
                payload: payload.data,
                response: error.message,
                status: 'failed',
                attempt: attempt + 1,
                timestamp: new Date()
            });

            // Retry if under limit
            if (attempt < this.maxRetries) {
                console.log(`🔄 Retrying webhook ${webhook._id} (attempt ${attempt + 1}/${this.maxRetries})`);
                setTimeout(() => {
                    this.queue.push({
                        webhook,
                        payload,
                        attempt: attempt + 1
                    });
                    this.processQueue();
                }, this.retryDelays[attempt] || 10000);
            }
        }
    }

    // ============================================================
    // 🔍 Get webhook delivery logs
    // ============================================================
    async getLogs(webhookId, limit = 50) {
        return await WebhookLog.find({ webhookId })
            .sort({ timestamp: -1 })
            .limit(limit);
    }

    // ============================================================
    // 📊 Get webhook statistics
    // ============================================================
    async getStats(webhookId) {
        const stats = await WebhookLog.aggregate([
            { $match: { webhookId: webhookId } },
            { $group: {
                _id: '$status',
                count: { $sum: 1 }
            }}
        ]);

        const total = stats.reduce((sum, s) => sum + s.count, 0);
        const delivered = stats.find(s => s._id === 'delivered')?.count || 0;
        const failed = stats.find(s => s._id === 'failed')?.count || 0;

        return {
            total,
            delivered,
            failed,
            successRate: total > 0 ? (delivered / total * 100).toFixed(1) : 0
        };
    }
}

module.exports = new WebhookDeliveryService();