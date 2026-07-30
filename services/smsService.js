// ============================================================
// 📱 SMS SERVICE - WITH TWILIO SUPPORT & LOGGING MODE
// ============================================================

const twilio = require('twilio');

class SMSService {
    constructor() {
        this.accountSid = process.env.TWILIO_ACCOUNT_SID;
        this.authToken = process.env.TWILIO_AUTH_TOKEN;
        this.fromNumber = process.env.TWILIO_PHONE_NUMBER;
        
        if (this.accountSid && this.authToken && this.fromNumber) {
            this.client = twilio(this.accountSid, this.authToken);
            console.log('✅ Twilio SMS Service initialized');
            this.mode = 'twilio';
        } else {
            console.log('⚠️ SMS Service: Running in LOG mode (no real SMS sent)');
            console.log('   To enable Twilio, set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in .env');
            this.client = null;
            this.mode = 'log';
        }
    }

    // ============================================================
    // 📱 SEND SMS - MAIN METHOD
    // ============================================================
    async sendSMS(to, message, language = 'en') {
        console.log(`📱 Sending SMS to ${to} [${language}]`);
        console.log(`📝 Message: ${message}`);
        
        if (this.mode === 'log') {
            console.log('📱 ========================================');
            console.log(`📱 SMS WOULD BE SENT TO: ${to}`);
            console.log(`📝 MESSAGE: ${message}`);
            console.log('📱 ========================================');
            return { success: true, simulated: true };
        }

        try {
            const result = await this.client.messages.create({
                body: message,
                to: to,
                from: this.fromNumber
            });
            
            console.log('✅ SMS sent:', result.sid);
            return { success: true, sid: result.sid };
        } catch (error) {
            console.error('❌ SMS error:', error.message);
            return { success: false, error: error.message };
        }
    }

    // ============================================================
    // 📱 SEND VERIFICATION OTP
    // ============================================================
    async sendVerificationCode(phone, otp, language = 'en') {
        const messages = {
            en: `🔐 Your TAMYOKIY verification code is: ${otp}\nValid for 5 minutes.`,
            ar: `🔐 رمز التحقق الخاص بك في تاميوكي هو: ${otp}\nصالح لمدة 5 دقائق.`
        };
        
        const message = messages[language] || messages['en'];
        return await this.sendSMS(phone, message, language);
    }

    // ============================================================
    // 📱 SEND SHIPMENT NOTIFICATION
    // ============================================================
    async sendShipmentNotification(phone, trackingNumber, status, driverName = null, language = 'en') {
        const messages = {
            en: {
                'created': `📦 TAMYOKIY: Your shipment ${trackingNumber} has been created. Track at: https://tamyokiy.com/track/${trackingNumber}`,
                'picked_up': `🚚 TAMYOKIY: Your shipment ${trackingNumber} has been picked up. ETA: 2-3 days`,
                'in_transit': `🚚 TAMYOKIY: Your shipment ${trackingNumber} is in transit. Track live: https://tamyokiy.com/track/${trackingNumber}`,
                'out_for_delivery': `📦 TAMYOKIY: Your shipment ${trackingNumber} is out for delivery! Driver is on the way.`,
                'delivered': `✅ TAMYOKIY: Your shipment ${trackingNumber} has been delivered! Thank you for choosing us.`,
                'driver_assigned': `👤 TAMYOKIY: Driver assigned to ${trackingNumber}. Driver: ${driverName || 'Driver'}`,
                'payment_received': `💰 TAMYOKIY: Payment received for ${trackingNumber}. Your shipment is now active.`
            },
            ar: {
                'created': `📦 تاميوكي: تم إنشاء شحنتك ${trackingNumber}. تتبع: https://tamyokiy.com/track/${trackingNumber}`,
                'picked_up': `🚚 تاميوكي: تم استلام شحنتك ${trackingNumber}. الموعد المتوقع: 2-3 أيام`,
                'in_transit': `🚚 تاميوكي: شحنتك ${trackingNumber} في الطريق. تتبع مباشر: https://tamyokiy.com/track/${trackingNumber}`,
                'out_for_delivery': `📦 تاميوكي: شحنتك ${trackingNumber} في طريق التوصيل! السائق في الطريق.`,
                'delivered': `✅ تاميوكي: تم توصيل شحنتك ${trackingNumber}! شكراً لاختياركم تاميوكي.`,
                'driver_assigned': `👤 تاميوكي: تم تعيين سائق للشحنة ${trackingNumber}. السائق: ${driverName || 'السائق'}`,
                'payment_received': `💰 تاميوكي: تم استلام الدفع للشحنة ${trackingNumber}. شحنتك الآن نشطة.`
            }
        };

        const langMessages = messages[language] || messages['en'];
        let message = langMessages[status];
        
        // Replace driver name placeholder if present
        if (message && driverName) {
            message = message.replace(/\${driverName}/g, driverName);
        }
        
        if (message) {
            return await this.sendSMS(phone, message, language);
        }
        return { success: false, error: 'Invalid status' };
    }

    // ============================================================
    // 📱 SEND DELIVERY CONFIRMATION
    // ============================================================
    async sendDeliveryConfirmation(phone, trackingNumber, recipientName, language = 'en') {
        const messages = {
            en: `✅ TAMYOKIY Delivery Confirmation\nTracking: ${trackingNumber}\nDelivered to: ${recipientName}\nThank you for choosing TAMYOKIY!\nRate us: https://tamyokiy.com/rating?tracking=${trackingNumber}`,
            ar: `✅ تأكيد التوصيل من تاميوكي\nرقم التتبع: ${trackingNumber}\nتم التوصيل إلى: ${recipientName}\nشكراً لاختياركم تاميوكي!\nقيمنا: https://tamyokiy.com/rating?tracking=${trackingNumber}`
        };
        
        const message = messages[language] || messages['en'];
        return await this.sendSMS(phone, message, language);
    }

    // ============================================================
    // 📱 SEND DRIVER ASSIGNMENT
    // ============================================================
    async sendDriverAssignment(phone, driverName, trackingNumber, pickupAddress, deliveryAddress, language = 'en') {
        const messages = {
            en: `🚚 TAMYOKIY Driver Assignment\nDriver: ${driverName}\nTracking: ${trackingNumber}\nPickup: ${pickupAddress}\nDelivery: ${deliveryAddress}\nPlease confirm assignment.`,
            ar: `🚚 تعيين سائق من تاميوكي\nالسائق: ${driverName}\nرقم التتبع: ${trackingNumber}\nمكان الاستلام: ${pickupAddress}\nمكان التوصيل: ${deliveryAddress}\nيرجى تأكيد التعيين.`
        };
        
        const message = messages[language] || messages['en'];
        return await this.sendSMS(phone, message, language);
    }

    // ============================================================
    // 📱 SEND BULK SMS
    // ============================================================
    async sendBulkSMS(recipients, message, language = 'en') {
        console.log(`📱 BULK SMS TO ${recipients.length} RECIPIENTS`);
        
        if (this.mode === 'log') {
            console.log('📱 ========================================');
            console.log(`📱 BULK SMS WOULD BE SENT TO ${recipients.length} RECIPIENTS`);
            console.log(`📝 MESSAGE: ${message}`);
            console.log('📱 ========================================');
            recipients.forEach((to, index) => {
                console.log(`   ${index + 1}. ${to}`);
            });
            console.log('📱 ========================================');
            return { success: true, simulated: true, count: recipients.length };
        }

        const results = [];
        for (const to of recipients) {
            const result = await this.sendSMS(to, message, language);
            results.push({ to, ...result });
        }
        
        const successCount = results.filter(r => r.success).length;
        return { 
            success: successCount > 0, 
            results,
            count: recipients.length,
            successCount
        };
    }

    // ============================================================
    // 📱 SEND WELCOME SMS
    // ============================================================
    async sendWelcomeSMS(phone, name, role = 'client', language = 'en') {
        const roleText = role === 'driver' ? 'driver' : 'client';
        const messages = {
            en: `👋 Welcome to TAMYOKIY Logistics, ${name}!\nYou are now registered as a ${roleText}.\nTrack shipments, manage deliveries, and more!\nLogin: https://tamyokiy.com/login`,
            ar: `👋 مرحباً بك في تاميوكي للخدمات اللوجستية، ${name}!\nتم تسجيلك كـ ${roleText === 'driver' ? 'سائق' : 'عميل'}.\nتتبع الشحنات، إدارة التوصيلات، والمزيد!\nتسجيل الدخول: https://tamyokiy.com/login`
        };
        
        const message = messages[language] || messages['en'];
        return await this.sendSMS(phone, message, language);
    }

    // ============================================================
    // 📱 SEND OTP REMINDER
    // ============================================================
    async sendOTPReminder(phone, otp, remainingAttempts = 3, language = 'en') {
        const messages = {
            en: `🔐 TAMYOKIY Verification Reminder\nYour code: ${otp}\nValid for 5 minutes.\n${remainingAttempts} attempts remaining.`,
            ar: `🔐 تذكير بالتحقق من تاميوكي\nرمزك: ${otp}\nصالح لمدة 5 دقائق.\n${remainingAttempts} محاولات متبقية.`
        };
        
        const message = messages[language] || messages['en'];
        return await this.sendSMS(phone, message, language);
    }

    // ============================================================
    // 📱 SEND PAYMENT CONFIRMATION
    // ============================================================
    async sendPaymentConfirmation(phone, trackingNumber, amount, paymentMethod = 'Credit Card', language = 'en') {
        const messages = {
            en: `💳 TAMYOKIY Payment Confirmation\nTracking: ${trackingNumber}\nAmount: $${amount}\nMethod: ${paymentMethod}\nThank you for your payment!\nTrack: https://tamyokiy.com/track/${trackingNumber}`,
            ar: `💳 تأكيد الدفع من تاميوكي\nرقم التتبع: ${trackingNumber}\nالمبلغ: $${amount}\nطريقة الدفع: ${paymentMethod}\nشكراً لدفعكم!\nتتبع: https://tamyokiy.com/track/${trackingNumber}`
        };
        
        const message = messages[language] || messages['en'];
        return await this.sendSMS(phone, message, language);
    }

    // ============================================================
    // 📱 SEND REFUND CONFIRMATION
    // ============================================================
    async sendRefundConfirmation(phone, trackingNumber, amount, status = 'approved', language = 'en') {
        const messages = {
            en: `💰 TAMYOKIY Refund Update\nTracking: ${trackingNumber}\nAmount: $${amount}\nStatus: ${status.toUpperCase()}\nIf approved, refund will reflect in 3-5 business days.`,
            ar: `💰 تحديث استرداد المبلغ من تاميوكي\nرقم التتبع: ${trackingNumber}\nالمبلغ: $${amount}\nالحالة: ${status.toUpperCase()}\nإذا تمت الموافقة، سيظهر المبلغ المسترد خلال 3-5 أيام عمل.`
        };
        
        const message = messages[language] || messages['en'];
        return await this.sendSMS(phone, message, language);
    }

    // ============================================================
    // 📱 SEND RATING REQUEST
    // ============================================================
    async sendRatingRequest(phone, trackingNumber, driverName, language = 'en') {
        const messages = {
            en: `⭐ TAMYOKIY Rating Request\nRate your delivery experience with ${driverName}\nTracking: ${trackingNumber}\nRate here: https://tamyokiy.com/rating?tracking=${trackingNumber}`,
            ar: `⭐ طلب تقييم من تاميوكي\nقيم تجربة التوصيل مع ${driverName}\nرقم التتبع: ${trackingNumber}\nقيم هنا: https://tamyokiy.com/rating?tracking=${trackingNumber}`
        };
        
        const message = messages[language] || messages['en'];
        return await this.sendSMS(phone, message, language);
    }

    // ============================================================
    // 📱 SEND ACCOUNT LOCK NOTIFICATION
    // ============================================================
    async sendAccountLockNotification(phone, name, reason, duration = 15, language = 'en') {
        const messages = {
            en: `🔒 TAMYOKIY Account Security\nHello ${name},\nYour account has been locked for ${duration} minutes.\nReason: ${reason}\nContact support if this wasn't you.`,
            ar: `🔒 أمان الحساب في تاميوكي\nمرحباً ${name},\nتم قفل حسابك لمدة ${duration} دقيقة.\nالسبب: ${reason}\nاتصل بالدعم إذا لم تكن أنت.`
        };
        
        const message = messages[language] || messages['en'];
        return await this.sendSMS(phone, message, language);
    }

    // ============================================================
    // 📱 SEND ACCOUNT UNLOCK NOTIFICATION
    // ============================================================
    async sendAccountUnlockNotification(phone, name, language = 'en') {
        const messages = {
            en: `🔓 TAMYOKIY Account Security\nHello ${name},\nYour account has been unlocked.\nYou can now login again.\nIf you didn't request this, contact support immediately.`,
            ar: `🔓 أمان الحساب في تاميوكي\nمرحباً ${name},\nتم فتح حسابك.\nيمكنك الآن تسجيل الدخول مرة أخرى.\nإذا لم تطلب ذلك، اتصل بالدعم فوراً.`
        };
        
        const message = messages[language] || messages['en'];
        return await this.sendSMS(phone, message, language);
    }
}

module.exports = new SMSService();