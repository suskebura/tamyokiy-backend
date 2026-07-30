const smsService = require('./smsService');
const emailService = require('./emailService');
const mongoose = require('mongoose');

class NotificationService {
    
    // ============================================================
    // 📱 SEND NOTIFICATION (SMS + Email)
    // ============================================================
    async sendNotification({
        userId,
        email,
        phone,
        trackingNumber,
        event,
        data = {},
        language = 'en'
    }) {
        console.log(`🔔 Sending notification for: ${event}`);
        
        const results = {
            sms: null,
            email: null,
            inApp: null
        };

        // Send SMS if phone number provided
        if (phone) {
            results.sms = await smsService.sendShipmentNotification(
                phone,
                trackingNumber,
                event,
                data.driverName || null,
                language
            );
        }

        // Send Email if email provided
        if (email) {
            results.email = await this.sendEmailNotification(
                email,
                trackingNumber,
                event,
                data,
                language
            );
        }

        // Save In-App notification
        if (userId) {
            results.inApp = await this.saveInAppNotification(
                userId,
                trackingNumber,
                event,
                data,
                language
            );
        }

        return results;
    }

    // ============================================================
    // 📧 SEND EMAIL NOTIFICATION
    // ============================================================
    async sendEmailNotification(email, trackingNumber, event, data, language) {
        switch (event) {
            case 'created':
                return await emailService.sendShipmentCreatedEmail(
                    email,
                    trackingNumber,
                    data.amount || 0,
                    language
                );
            case 'delivered':
                return await emailService.sendShipmentDeliveredEmail(
                    email,
                    trackingNumber,
                    language
                );
            case 'payment_received':
                return await emailService.sendPaymentReceivedEmail(
                    email,
                    trackingNumber,
                    data.amount || 0,
                    language
                );
            case 'driver_assigned':
                return await emailService.sendDriverAssignedEmail(
                    email,
                    trackingNumber,
                    data.driverName || 'Driver',
                    language
                );
            case 'picked_up':
                return await emailService.sendShipmentPickedUpEmail(
                    email,
                    trackingNumber,
                    language
                );
            case 'in_transit':
                return await emailService.sendShipmentInTransitEmail(
                    email,
                    trackingNumber,
                    language
                );
            case 'out_for_delivery':
                return await emailService.sendShipmentOutForDeliveryEmail(
                    email,
                    trackingNumber,
                    language
                );
            default:
                console.log(`⚠️ No email template for event: ${event}`);
                return null;
        }
    }

    // ============================================================
    // 📦 SEND DELIVERY STATUS NOTIFICATION
    // ============================================================
    async sendDeliveryStatus(user, trackingNumber, status, data = {}) {
        console.log(`🔔 Sending delivery status: ${status} for ${trackingNumber}`);
        
        const results = { sms: null, email: null, inApp: null };

        // 1. Send SMS
        if (user.phone) {
            results.sms = await this.sendStatusSMS(user.phone, trackingNumber, status, data);
        }

        // 2. Send Email
        if (user.email) {
            results.email = await this.sendStatusEmail(user.email, trackingNumber, status, data);
        }

        // 3. Send In-App Notification
        results.inApp = await this.sendInAppNotification(user._id, trackingNumber, status, data);

        return results;
    }

    // ============================================================
    // 📱 SEND STATUS SMS
    // ============================================================
    async sendStatusSMS(phone, trackingNumber, status, data) {
        const messages = {
            'created': `📦 TAMYOKIY: Shipment ${trackingNumber} created. Track: https://tamyokiy.com/track/${trackingNumber}`,
            'driver_assigned': `👤 TAMYOKIY: Driver ${data.driverName || 'assigned'} for ${trackingNumber}. Track live: https://tamyokiy.com/track/${trackingNumber}`,
            'picked_up': `🚚 TAMYOKIY: Shipment ${trackingNumber} picked up. ETA: ${data.eta || '2-3 days'}`,
            'in_transit': `🚚 TAMYOKIY: Shipment ${trackingNumber} in transit. Track: https://tamyokiy.com/track/${trackingNumber}`,
            'out_for_delivery': `🏠 TAMYOKIY: Shipment ${trackingNumber} out for delivery! Driver ${data.driverName || ''} is on the way.`,
            'delivered': `✅ TAMYOKIY: Shipment ${trackingNumber} delivered! Thank you for choosing us.`,
            'failed': `❌ TAMYOKIY: Delivery failed for ${trackingNumber}. Reason: ${data.reason || 'Unknown'}. Please contact support.`,
            'delayed': `⏰ TAMYOKIY: Shipment ${trackingNumber} delayed. New ETA: ${data.newEta || 'Check tracking'}.`
        };

        const message = messages[status] || `📦 TAMYOKIY: Update for ${trackingNumber}: ${status}`;
        return await smsService.sendSMS(phone, message);
    }

    // ============================================================
    // 📧 SEND STATUS EMAIL
    // ============================================================
    async sendStatusEmail(email, trackingNumber, status, data) {
        const templates = {
            'created': {
                subject: `📦 Shipment Created - ${trackingNumber}`,
                template: this.getCreatedEmail
            },
            'driver_assigned': {
                subject: `👤 Driver Assigned - ${trackingNumber}`,
                template: this.getDriverAssignedEmail
            },
            'picked_up': {
                subject: `🚚 Shipment Picked Up - ${trackingNumber}`,
                template: this.getPickedUpEmail
            },
            'in_transit': {
                subject: `🚚 Shipment In Transit - ${trackingNumber}`,
                template: this.getInTransitEmail
            },
            'out_for_delivery': {
                subject: `🏠 Out for Delivery - ${trackingNumber}`,
                template: this.getOutForDeliveryEmail
            },
            'delivered': {
                subject: `✅ Delivered - ${trackingNumber}`,
                template: this.getDeliveredEmail
            },
            'failed': {
                subject: `❌ Delivery Failed - ${trackingNumber}`,
                template: this.getFailedEmail
            },
            'delayed': {
                subject: `⏰ Delivery Delayed - ${trackingNumber}`,
                template: this.getDelayedEmail
            }
        };

        const template = templates[status];
        if (!template) return null;

        const html = template.template(trackingNumber, data);
        return await emailService.sendEmail(email, template.subject, html);
    }

    // ============================================================
    // 📧 EMAIL TEMPLATES
    // ============================================================

    getCreatedEmail(trackingNumber, data) {
        return `
            <div style="font-family: Arial; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
                <div style="background: #1a1a2e; padding: 20px; border-radius: 10px; color: #D4AF37; text-align: center;">
                    <h1>📦 TAMYOKIY Logistics</h1>
                </div>
                <div style="background: white; padding: 30px; border-radius: 10px; margin-top: 20px;">
                    <h2 style="color: #D4AF37;">✅ Shipment Created!</h2>
                    <p>Your shipment has been created successfully.</p>
                    <div style="background: #f0f0f0; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p><strong>Tracking Number:</strong> ${trackingNumber}</p>
                        <p><strong>Status:</strong> 📋 Created</p>
                        <p><strong>Estimated Delivery:</strong> ${data.estimatedDelivery || 'Calculating...'}</p>
                    </div>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="https://tamyokiy.com/track/${trackingNumber}" 
                           style="background: linear-gradient(135deg, #D4AF37, #FFD700); color: #050505; padding: 14px 28px; border-radius: 40px; text-decoration: none; font-weight: 700;">
                            🔍 Track Now
                        </a>
                    </div>
                    <hr style="border: 1px solid #eee; margin: 20px 0;">
                    <p style="color: #888; font-size: 0.8rem;">We'll keep you updated on your shipment status.</p>
                </div>
                <div style="text-align: center; padding: 20px; color: #888; font-size: 0.8rem;">
                    <p>© 2026 TAMYOKIY Logistics Inc.</p>
                </div>
            </div>
        `;
    }

    getDeliveredEmail(trackingNumber, data) {
        return `
            <div style="font-family: Arial; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
                <div style="background: #1a1a2e; padding: 20px; border-radius: 10px; color: #D4AF37; text-align: center;">
                    <h1>🚚 TAMYOKIY Logistics</h1>
                </div>
                <div style="background: white; padding: 30px; border-radius: 10px; margin-top: 20px;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <span style="font-size: 3rem;">🎉</span>
                    </div>
                    <h2 style="color: #4caf50; text-align: center;">✅ Delivered Successfully!</h2>
                    <p style="text-align: center;">Your shipment has been delivered.</p>
                    <div style="background: #f0f0f0; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p><strong>Tracking Number:</strong> ${trackingNumber}</p>
                        <p><strong>Status:</strong> ✅ Delivered</p>
                        <p><strong>Delivered At:</strong> ${data.deliveredAt || 'Just now'}</p>
                        ${data.signature ? `<p><strong>Signed by:</strong> ${data.signature}</p>` : ''}
                    </div>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="https://tamyokiy.com/dashboard.html" 
                           style="background: linear-gradient(135deg, #D4AF37, #FFD700); color: #050505; padding: 14px 28px; border-radius: 40px; text-decoration: none; font-weight: 700;">
                            ⭐ Rate Your Delivery
                        </a>
                    </div>
                    <hr style="border: 1px solid #eee; margin: 20px 0;">
                    <p style="color: #888; font-size: 0.8rem;">Thank you for choosing TAMYOKIY Logistics!</p>
                </div>
                <div style="text-align: center; padding: 20px; color: #888; font-size: 0.8rem;">
                    <p>© 2026 TAMYOKIY Logistics Inc.</p>
                </div>
            </div>
        `;
    }

    getDriverAssignedEmail(trackingNumber, data) {
        return `
            <div style="font-family: Arial; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
                <div style="background: #1a1a2e; padding: 20px; border-radius: 10px; color: #D4AF37; text-align: center;">
                    <h1>👤 TAMYOKIY Logistics</h1>
                </div>
                <div style="background: white; padding: 30px; border-radius: 10px; margin-top: 20px;">
                    <h2 style="color: #D4AF37;">👤 Driver Assigned!</h2>
                    <p>A driver has been assigned to your shipment.</p>
                    <div style="background: #f0f0f0; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p><strong>Tracking Number:</strong> ${trackingNumber}</p>
                        <p><strong>Driver:</strong> ${data.driverName || 'Assigned Driver'}</p>
                        <p><strong>Vehicle:</strong> ${data.vehicleType || 'N/A'}</p>
                    </div>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="https://tamyokiy.com/track/${trackingNumber}" 
                           style="background: linear-gradient(135deg, #D4AF37, #FFD700); color: #050505; padding: 14px 28px; border-radius: 40px; text-decoration: none; font-weight: 700;">
                            🔍 Track Now
                        </a>
                    </div>
                </div>
            </div>
        `;
    }

    getPickedUpEmail(trackingNumber, data) {
        return `
            <div style="font-family: Arial; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
                <div style="background: #1a1a2e; padding: 20px; border-radius: 10px; color: #D4AF37; text-align: center;">
                    <h1>🚚 TAMYOKIY Logistics</h1>
                </div>
                <div style="background: white; padding: 30px; border-radius: 10px; margin-top: 20px;">
                    <h2 style="color: #D4AF37;">📦 Shipment Picked Up!</h2>
                    <p>Your shipment has been picked up and is on its way.</p>
                    <div style="background: #f0f0f0; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p><strong>Tracking Number:</strong> ${trackingNumber}</p>
                        <p><strong>Status:</strong> 📦 Picked Up</p>
                        <p><strong>ETA:</strong> ${data.eta || '2-3 days'}</p>
                    </div>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="https://tamyokiy.com/track/${trackingNumber}" 
                           style="background: linear-gradient(135deg, #D4AF37, #FFD700); color: #050505; padding: 14px 28px; border-radius: 40px; text-decoration: none; font-weight: 700;">
                            🔍 Track Now
                        </a>
                    </div>
                </div>
            </div>
        `;
    }

    getInTransitEmail(trackingNumber, data) {
        return `
            <div style="font-family: Arial; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
                <div style="background: #1a1a2e; padding: 20px; border-radius: 10px; color: #D4AF37; text-align: center;">
                    <h1>🚚 TAMYOKIY Logistics</h1>
                </div>
                <div style="background: white; padding: 30px; border-radius: 10px; margin-top: 20px;">
                    <h2 style="color: #D4AF37;">🚛 In Transit!</h2>
                    <p>Your shipment is currently in transit to its destination.</p>
                    <div style="background: #f0f0f0; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p><strong>Tracking Number:</strong> ${trackingNumber}</p>
                        <p><strong>Status:</strong> 🚛 In Transit</p>
                        <p><strong>Current Location:</strong> ${data.currentLocation || 'En route'}</p>
                    </div>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="https://tamyokiy.com/track/${trackingNumber}" 
                           style="background: linear-gradient(135deg, #D4AF37, #FFD700); color: #050505; padding: 14px 28px; border-radius: 40px; text-decoration: none; font-weight: 700;">
                            🔍 Track Now
                        </a>
                    </div>
                </div>
            </div>
        `;
    }

    getOutForDeliveryEmail(trackingNumber, data) {
        return `
            <div style="font-family: Arial; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
                <div style="background: #1a1a2e; padding: 20px; border-radius: 10px; color: #D4AF37; text-align: center;">
                    <h1>🏠 TAMYOKIY Logistics</h1>
                </div>
                <div style="background: white; padding: 30px; border-radius: 10px; margin-top: 20px;">
                    <h2 style="color: #D4AF37;">🏠 Out for Delivery!</h2>
                    <p>Your shipment is out for delivery! The driver is on the way.</p>
                    <div style="background: #f0f0f0; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p><strong>Tracking Number:</strong> ${trackingNumber}</p>
                        <p><strong>Status:</strong> 🏠 Out for Delivery</p>
                        ${data.driverName ? `<p><strong>Driver:</strong> ${data.driverName}</p>` : ''}
                    </div>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="https://tamyokiy.com/track/${trackingNumber}" 
                           style="background: linear-gradient(135deg, #D4AF37, #FFD700); color: #050505; padding: 14px 28px; border-radius: 40px; text-decoration: none; font-weight: 700;">
                            🔍 Track Live
                        </a>
                    </div>
                </div>
            </div>
        `;
    }

    getFailedEmail(trackingNumber, data) {
        return `
            <div style="font-family: Arial; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
                <div style="background: #1a1a2e; padding: 20px; border-radius: 10px; color: #D4AF37; text-align: center;">
                    <h1>❌ TAMYOKIY Logistics</h1>
                </div>
                <div style="background: white; padding: 30px; border-radius: 10px; margin-top: 20px;">
                    <h2 style="color: #ff6b6b;">❌ Delivery Failed</h2>
                    <p>We're sorry, but the delivery attempt was unsuccessful.</p>
                    <div style="background: #f0f0f0; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p><strong>Tracking Number:</strong> ${trackingNumber}</p>
                        <p><strong>Status:</strong> ❌ Failed</p>
                        <p><strong>Reason:</strong> ${data.reason || 'Unknown'}</p>
                    </div>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="https://tamyokiy.com/support.html" 
                           style="background: linear-gradient(135deg, #ff6b6b, #c0392b); color: white; padding: 14px 28px; border-radius: 40px; text-decoration: none; font-weight: 700;">
                            📞 Contact Support
                        </a>
                    </div>
                </div>
            </div>
        `;
    }

    getDelayedEmail(trackingNumber, data) {
        return `
            <div style="font-family: Arial; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
                <div style="background: #1a1a2e; padding: 20px; border-radius: 10px; color: #D4AF37; text-align: center;">
                    <h1>⏰ TAMYOKIY Logistics</h1>
                </div>
                <div style="background: white; padding: 30px; border-radius: 10px; margin-top: 20px;">
                    <h2 style="color: #ffa500;">⏰ Delivery Delayed</h2>
                    <p>Your delivery has been delayed. We apologize for the inconvenience.</p>
                    <div style="background: #f0f0f0; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p><strong>Tracking Number:</strong> ${trackingNumber}</p>
                        <p><strong>New ETA:</strong> ${data.newEta || 'Check tracking for updated status'}</p>
                    </div>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="https://tamyokiy.com/track/${trackingNumber}" 
                           style="background: linear-gradient(135deg, #D4AF37, #FFD700); color: #050505; padding: 14px 28px; border-radius: 40px; text-decoration: none; font-weight: 700;">
                            🔍 Check Status
                        </a>
                    </div>
                </div>
            </div>
        `;
    }

    // ============================================================
    // 📲 SEND IN-APP NOTIFICATION
    // ============================================================
    async sendInAppNotification(userId, trackingNumber, status, data) {
        try {
            const Notification = mongoose.model('Notification');
            const statusEmojis = {
                'created': '📦',
                'driver_assigned': '👤',
                'picked_up': '🚚',
                'in_transit': '🚛',
                'out_for_delivery': '🏠',
                'delivered': '✅',
                'failed': '❌',
                'delayed': '⏰'
            };
            
            const statusMessages = {
                'created': `Shipment ${trackingNumber} has been created`,
                'driver_assigned': `Driver ${data.driverName || 'assigned'} for ${trackingNumber}`,
                'picked_up': `Shipment ${trackingNumber} has been picked up`,
                'in_transit': `Shipment ${trackingNumber} is in transit`,
                'out_for_delivery': `Shipment ${trackingNumber} is out for delivery!`,
                'delivered': `Shipment ${trackingNumber} has been delivered ✅`,
                'failed': `Delivery failed for ${trackingNumber}`,
                'delayed': `Delivery delayed for ${trackingNumber}`
            };

            const notification = new Notification({
                userId: userId,
                title: `${statusEmojis[status] || '📦'} ${status.replace('_', ' ').toUpperCase()}`,
                message: statusMessages[status] || `Update for ${trackingNumber}`,
                type: 'info',
                relatedId: trackingNumber,
                isRead: false,
                createdAt: new Date()
            });

            await notification.save();
            console.log(`💾 In-app notification saved for ${trackingNumber}`);
            return notification;
        } catch (err) {
            console.error('❌ In-app notification error:', err.message);
            return null;
        }
    }

    // ============================================================
    // 💾 SAVE NOTIFICATION TO DATABASE
    // ============================================================
    async saveInAppNotification(userId, trackingNumber, event, data, language) {
        try {
            const Notification = mongoose.model('Notification');
            
            const eventTitles = {
                'created': '📦 Shipment Created',
                'driver_assigned': '👤 Driver Assigned',
                'picked_up': '🚚 Picked Up',
                'in_transit': '🚛 In Transit',
                'out_for_delivery': '🏠 Out for Delivery',
                'delivered': '✅ Delivered',
                'payment_received': '💰 Payment Received',
                'failed': '❌ Delivery Failed',
                'delayed': '⏰ Delivery Delayed'
            };

            const eventMessages = {
                'created': `Your shipment ${trackingNumber} has been created and is awaiting pickup.`,
                'driver_assigned': `Driver ${data.driverName || 'assigned'} is on the way to pick up ${trackingNumber}.`,
                'picked_up': `Your shipment ${trackingNumber} has been picked up and is in transit.`,
                'in_transit': `Your shipment ${trackingNumber} is currently in transit to its destination.`,
                'out_for_delivery': `Your shipment ${trackingNumber} is out for delivery!`,
                'delivered': `Your shipment ${trackingNumber} has been delivered successfully! ✅`,
                'payment_received': `Payment of $${data.amount || 0} received for ${trackingNumber}.`,
                'failed': `Delivery failed for ${trackingNumber}. Please contact support.`,
                'delayed': `Delivery for ${trackingNumber} has been delayed. New ETA: ${data.newEta || 'Check tracking'}.`
            };

            const notification = new Notification({
                userId: userId,
                title: eventTitles[event] || `📦 Update for ${trackingNumber}`,
                message: eventMessages[event] || `Update for shipment ${trackingNumber}`,
                type: 'shipment',
                trackingNumber: trackingNumber,
                event: event,
                language: language || 'en',
                isRead: false,
                createdAt: new Date()
            });

            await notification.save();
            console.log(`💾 In-app notification saved for ${trackingNumber}`);
            return notification;
        } catch (err) {
            console.error('❌ Failed to save notification:', err.message);
            return null;
        }
    }

    // ============================================================
    // 📊 SEND BULK NOTIFICATIONS
    // ============================================================
    async sendBulkNotifications(users, event, data = {}) {
        console.log(`📊 Sending bulk notifications: ${event} to ${users.length} users`);
        
        const results = [];
        for (const user of users) {
            const result = await this.sendNotification({
                userId: user._id,
                email: user.email,
                phone: user.phone,
                trackingNumber: data.trackingNumber,
                event: event,
                data: data,
                language: user.language || 'en'
            });
            results.push(result);
            
            // Delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        return results;
    }
}

module.exports = new NotificationService();