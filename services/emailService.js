const nodemailer = require('nodemailer');
const path = require('path');

class EmailService {
    constructor() {
        this.transporter = null;
        this.emailUser = process.env.EMAIL_USER;
        this.emailPass = process.env.EMAIL_PASS;
        
        if (this.emailUser && this.emailPass) {
            this.transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: this.emailUser,
                    pass: this.emailPass
                }
            });
            console.log('✅ Email Service initialized');
        } else {
            console.log('⚠️ Email credentials not configured - emails will be logged only');
        }
    }

    // ============================================================
    // 📧 SEND EMAIL
    // ============================================================
    async sendEmail(to, subject, html, text = null) {
        console.log(`📧 Sending email to ${to}`);
        console.log(`📝 Subject: ${subject}`);
        
        if (!this.transporter) {
            console.log('⚠️ Email would be sent (simulated):', { to, subject });
            return { success: true, simulated: true };
        }

        try {
            const result = await this.transporter.sendMail({
                from: `TAMYOKIY Logistics <${this.emailUser}>`,
                to: to,
                subject: subject,
                text: text || html.replace(/<[^>]*>/g, ''),
                html: html
            });
            
            console.log('✅ Email sent:', result.messageId);
            return { success: true, messageId: result.messageId };
        } catch (error) {
            console.error('❌ Email error:', error.message);
            return { success: false, error: error.message };
        }
    }

    // ============================================================
    // 📧 SHIPMENT CREATED EMAIL
    // ============================================================
    async sendShipmentCreatedEmail(email, trackingNumber, amount, language = 'en') {
        const templates = {
            en: {
                subject: `📦 Shipment Created - ${trackingNumber}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
                        <div style="background: #1a1a2e; padding: 20px; border-radius: 10px; color: #D4AF37; text-align: center;">
                            <h1>🚚 TAMYOKIY Logistics</h1>
                        </div>
                        <div style="background: white; padding: 30px; border-radius: 10px; margin-top: 20px;">
                            <h2 style="color: #D4AF37;">✅ Shipment Created!</h2>
                            <p>Your shipment has been created successfully.</p>
                            <div style="background: #f0f0f0; padding: 15px; border-radius: 8px; margin: 20px 0;">
                                <p><strong>Tracking Number:</strong> ${trackingNumber}</p>
                                <p><strong>Amount:</strong> $${amount}</p>
                                <p><strong>Status:</strong> Pending Payment</p>
                            </div>
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="https://tamyokiy.com/payment-form.html?tracking=${trackingNumber}&amount=${amount}" 
                                   style="background: linear-gradient(135deg, #D4AF37, #FFD700); color: #050505; padding: 14px 28px; border-radius: 40px; text-decoration: none; font-weight: 700;">
                                    💳 Pay Now
                                </a>
                            </div>
                            <p style="color: #666; font-size: 0.9rem;">Track your shipment: <a href="https://tamyokiy.com/track/${trackingNumber}" style="color: #D4AF37;">https://tamyokiy.com/track/${trackingNumber}</a></p>
                            <hr style="border: 1px solid #eee; margin: 20px 0;">
                            <p style="color: #888; font-size: 0.8rem;">Thank you for choosing TAMYOKIY Logistics</p>
                        </div>
                        <div style="text-align: center; padding: 20px; color: #888; font-size: 0.8rem;">
                            <p>© 2026 TAMYOKIY Logistics Inc. All rights reserved.</p>
                        </div>
                    </div>
                `
            },
            ar: {
                subject: `📦 تم إنشاء الشحنة - ${trackingNumber}`,
                html: `
                    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
                        <div style="background: #1a1a2e; padding: 20px; border-radius: 10px; color: #D4AF37; text-align: center;">
                            <h1>🚚 تاميوكي للخدمات اللوجستية</h1>
                        </div>
                        <div style="background: white; padding: 30px; border-radius: 10px; margin-top: 20px;">
                            <h2 style="color: #D4AF37;">✅ تم إنشاء الشحنة!</h2>
                            <p>تم إنشاء شحنتك بنجاح.</p>
                            <div style="background: #f0f0f0; padding: 15px; border-radius: 8px; margin: 20px 0;">
                                <p><strong>رقم التتبع:</strong> ${trackingNumber}</p>
                                <p><strong>المبلغ:</strong> $${amount}</p>
                                <p><strong>الحالة:</strong> في انتظار الدفع</p>
                            </div>
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="https://tamyokiy.com/payment-form.html?tracking=${trackingNumber}&amount=${amount}" 
                                   style="background: linear-gradient(135deg, #D4AF37, #FFD700); color: #050505; padding: 14px 28px; border-radius: 40px; text-decoration: none; font-weight: 700;">
                                    💳 ادفع الآن
                                </a>
                            </div>
                            <p style="color: #666; font-size: 0.9rem;">تتبع شحنتك: <a href="https://tamyokiy.com/track/${trackingNumber}" style="color: #D4AF37;">https://tamyokiy.com/track/${trackingNumber}</a></p>
                            <hr style="border: 1px solid #eee; margin: 20px 0;">
                            <p style="color: #888; font-size: 0.8rem;">شكراً لاختياركم تاميوكي للخدمات اللوجستية</p>
                        </div>
                        <div style="text-align: center; padding: 20px; color: #888; font-size: 0.8rem;">
                            <p>© 2026 تاميوكي للخدمات اللوجستية. جميع الحقوق محفوظة.</p>
                        </div>
                    </div>
                `
            }
        };

        const template = templates[language] || templates['en'];
        return await this.sendEmail(email, template.subject, template.html);
    }

    // ============================================================
    // 📧 SHIPMENT DELIVERED EMAIL
    // ============================================================
    async sendShipmentDeliveredEmail(email, trackingNumber, language = 'en') {
        const templates = {
            en: {
                subject: `✅ Shipment Delivered - ${trackingNumber}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
                        <div style="background: #1a1a2e; padding: 20px; border-radius: 10px; color: #D4AF37; text-align: center;">
                            <h1>🚚 TAMYOKIY Logistics</h1>
                        </div>
                        <div style="background: white; padding: 30px; border-radius: 10px; margin-top: 20px;">
                            <h2 style="color: #4caf50;">✅ Delivered Successfully!</h2>
                            <p>Your shipment has been delivered.</p>
                            <div style="background: #f0f0f0; padding: 15px; border-radius: 8px; margin: 20px 0;">
                                <p><strong>Tracking Number:</strong> ${trackingNumber}</p>
                                <p><strong>Status:</strong> ✅ Delivered</p>
                            </div>
                            <p style="color: #666; font-size: 0.9rem;">Thank you for choosing TAMYOKIY Logistics</p>
                            <hr style="border: 1px solid #eee; margin: 20px 0;">
                            <p style="color: #888; font-size: 0.8rem;">Rate your delivery: <a href="https://tamyokiy.com/dashboard.html" style="color: #D4AF37;">Rate Now</a></p>
                        </div>
                        <div style="text-align: center; padding: 20px; color: #888; font-size: 0.8rem;">
                            <p>© 2026 TAMYOKIY Logistics Inc. All rights reserved.</p>
                        </div>
                    </div>
                `
            },
            ar: {
                subject: `✅ تم توصيل الشحنة - ${trackingNumber}`,
                html: `
                    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
                        <div style="background: #1a1a2e; padding: 20px; border-radius: 10px; color: #D4AF37; text-align: center;">
                            <h1>🚚 تاميوكي للخدمات اللوجستية</h1>
                        </div>
                        <div style="background: white; padding: 30px; border-radius: 10px; margin-top: 20px;">
                            <h2 style="color: #4caf50;">✅ تم التوصيل بنجاح!</h2>
                            <p>تم توصيل شحنتك.</p>
                            <div style="background: #f0f0f0; padding: 15px; border-radius: 8px; margin: 20px 0;">
                                <p><strong>رقم التتبع:</strong> ${trackingNumber}</p>
                                <p><strong>الحالة:</strong> ✅ تم التوصيل</p>
                            </div>
                            <p style="color: #666; font-size: 0.9rem;">شكراً لاختياركم تاميوكي للخدمات اللوجستية</p>
                            <hr style="border: 1px solid #eee; margin: 20px 0;">
                            <p style="color: #888; font-size: 0.8rem;">قيم توصيلك: <a href="https://tamyokiy.com/dashboard.html" style="color: #D4AF37;">قيم الآن</a></p>
                        </div>
                        <div style="text-align: center; padding: 20px; color: #888; font-size: 0.8rem;">
                            <p>© 2026 تاميوكي للخدمات اللوجستية. جميع الحقوق محفوظة.</p>
                        </div>
                    </div>
                `
            }
        };

        const template = templates[language] || templates['en'];
        return await this.sendEmail(email, template.subject, template.html);
    }

    // ============================================================
    // 📧 PAYMENT RECEIVED EMAIL
    // ============================================================
    async sendPaymentReceivedEmail(email, trackingNumber, amount, language = 'en') {
        const templates = {
            en: {
                subject: `💰 Payment Received - ${trackingNumber}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
                        <div style="background: #1a1a2e; padding: 20px; border-radius: 10px; color: #D4AF37; text-align: center;">
                            <h1>🚚 TAMYOKIY Logistics</h1>
                        </div>
                        <div style="background: white; padding: 30px; border-radius: 10px; margin-top: 20px;">
                            <h2 style="color: #4caf50;">💰 Payment Received!</h2>
                            <p>Your payment has been confirmed.</p>
                            <div style="background: #f0f0f0; padding: 15px; border-radius: 8px; margin: 20px 0;">
                                <p><strong>Tracking Number:</strong> ${trackingNumber}</p>
                                <p><strong>Amount:</strong> $${amount}</p>
                                <p><strong>Status:</strong> ✅ Active</p>
                            </div>
                            <p style="color: #666; font-size: 0.9rem;">Track your shipment: <a href="https://tamyokiy.com/track/${trackingNumber}" style="color: #D4AF37;">https://tamyokiy.com/track/${trackingNumber}</a></p>
                        </div>
                        <div style="text-align: center; padding: 20px; color: #888; font-size: 0.8rem;">
                            <p>© 2026 TAMYOKIY Logistics Inc. All rights reserved.</p>
                        </div>
                    </div>
                `
            },
            ar: {
                subject: `💰 تم استلام الدفع - ${trackingNumber}`,
                html: `
                    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
                        <div style="background: #1a1a2e; padding: 20px; border-radius: 10px; color: #D4AF37; text-align: center;">
                            <h1>🚚 تاميوكي للخدمات اللوجستية</h1>
                        </div>
                        <div style="background: white; padding: 30px; border-radius: 10px; margin-top: 20px;">
                            <h2 style="color: #4caf50;">💰 تم استلام الدفع!</h2>
                            <p>تم تأكيد دفعتك.</p>
                            <div style="background: #f0f0f0; padding: 15px; border-radius: 8px; margin: 20px 0;">
                                <p><strong>رقم التتبع:</strong> ${trackingNumber}</p>
                                <p><strong>المبلغ:</strong> $${amount}</p>
                                <p><strong>الحالة:</strong> ✅ نشطة</p>
                            </div>
                            <p style="color: #666; font-size: 0.9rem;">تتبع شحنتك: <a href="https://tamyokiy.com/track/${trackingNumber}" style="color: #D4AF37;">https://tamyokiy.com/track/${trackingNumber}</a></p>
                        </div>
                        <div style="text-align: center; padding: 20px; color: #888; font-size: 0.8rem;">
                            <p>© 2026 تاميوكي للخدمات اللوجستية. جميع الحقوق محفوظة.</p>
                        </div>
                    </div>
                `
            }
        };

        const template = templates[language] || templates['en'];
        return await this.sendEmail(email, template.subject, template.html);
    }

    // ============================================================
    // 📧 DRIVER ASSIGNED EMAIL
    // ============================================================
    async sendDriverAssignedEmail(email, trackingNumber, driverName, language = 'en') {
        const templates = {
            en: {
                subject: `👤 Driver Assigned - ${trackingNumber}`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
                        <div style="background: #1a1a2e; padding: 20px; border-radius: 10px; color: #D4AF37; text-align: center;">
                            <h1>🚚 TAMYOKIY Logistics</h1>
                        </div>
                        <div style="background: white; padding: 30px; border-radius: 10px; margin-top: 20px;">
                            <h2 style="color: #2196F3;">👤 Driver Assigned!</h2>
                            <p>A driver has been assigned to your shipment.</p>
                            <div style="background: #f0f0f0; padding: 15px; border-radius: 8px; margin: 20px 0;">
                                <p><strong>Tracking Number:</strong> ${trackingNumber}</p>
                                <p><strong>Driver:</strong> ${driverName}</p>
                            </div>
                            <p style="color: #666; font-size: 0.9rem;">Track your shipment live: <a href="https://tamyokiy.com/track/${trackingNumber}" style="color: #D4AF37;">https://tamyokiy.com/track/${trackingNumber}</a></p>
                        </div>
                        <div style="text-align: center; padding: 20px; color: #888; font-size: 0.8rem;">
                            <p>© 2026 TAMYOKIY Logistics Inc. All rights reserved.</p>
                        </div>
                    </div>
                `
            },
            ar: {
                subject: `👤 تم تعيين سائق - ${trackingNumber}`,
                html: `
                    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
                        <div style="background: #1a1a2e; padding: 20px; border-radius: 10px; color: #D4AF37; text-align: center;">
                            <h1>🚚 تاميوكي للخدمات اللوجستية</h1>
                        </div>
                        <div style="background: white; padding: 30px; border-radius: 10px; margin-top: 20px;">
                            <h2 style="color: #2196F3;">👤 تم تعيين سائق!</h2>
                            <p>تم تعيين سائق لشحنتك.</p>
                            <div style="background: #f0f0f0; padding: 15px; border-radius: 8px; margin: 20px 0;">
                                <p><strong>رقم التتبع:</strong> ${trackingNumber}</p>
                                <p><strong>السائق:</strong> ${driverName}</p>
                            </div>
                            <p style="color: #666; font-size: 0.9rem;">تتبع شحنتك مباشر: <a href="https://tamyokiy.com/track/${trackingNumber}" style="color: #D4AF37;">https://tamyokiy.com/track/${trackingNumber}</a></p>
                        </div>
                        <div style="text-align: center; padding: 20px; color: #888; font-size: 0.8rem;">
                            <p>© 2026 تاميوكي للخدمات اللوجستية. جميع الحقوق محفوظة.</p>
                        </div>
                    </div>
                `
            }
        };

        const template = templates[language] || templates['en'];
        return await this.sendEmail(email, template.subject, template.html);
    }
}

module.exports = new EmailService();