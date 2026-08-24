import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import EmailLog from '../models/EmailLog.js';

dotenv.config();

class NodemailerService {
    constructor() {
        this.transporter = null;
    }

    async initialize() {
        try {
            // Create reusable transporter object using SMTP transport
            this.transporter = nodemailer.createTransport({
                service: 'Gmail',
                host: 'smtp.gmail.com',
                port: 465,
                secure: true, // true for 465, false for other ports
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.GMAIL_APP_PASSWORD
                },
                tls: {
                    rejectUnauthorized: false // Accept self-signed certificates
                }
            });

            // Verify connection configuration
            await this.transporter.verify();
            console.log('✅ Nodemailer SMTP service ready');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Nodemailer service:', error);
            throw error;
        }
    }

    async sendTeamPerformanceReport(teamMetricsData, senderUser = null) {
        try {
            if (!this.transporter) await this.initialize();

            const { recipients, subject, html } = this.createTeamPerformanceEmail(teamMetricsData);
            
            const results = [];
            const emailLog = new EmailLog({
                type: 'report',
                subject,
                content: { html },
                priority: 'normal',
                sender: {
                    email: senderUser?.email || process.env.EMAIL_USER,
                    name: senderUser?.name || 'Team Performance Dashboard'
                },
                recipients: [],
                metadata: {
                    smtpEmail: process.env.EMAIL_USER
                }
            });
            
            for (const recipient of recipients) {
                const info = await this.transporter.sendMail({
                    from: `"Team Performance Dashboard" <${process.env.EMAIL_USER}>`,
                    to: recipient.email,
                    subject,
                    html
                });
                
                results.push({
                    email: recipient.email,
                    messageId: info.messageId,
                    response: info.response
                });
                
                emailLog.recipients.push({
                    email: recipient.email,
                    name: recipient.name,
                    status: 'sent',
                    messageId: info.messageId,
                    sentAt: new Date()
                });
                
                console.log(`✅ Performance report sent to ${recipient.email}`);
            }

            await emailLog.save();
            return { success: true, results };
        } catch (error) {
            console.error('❌ Failed to send team performance report:', error);
            throw error;
        }
    }

    async sendIndividualFeedback(data, senderUser = null) {
        try {
            if (!this.transporter) await this.initialize();

            const { recipientEmail, recipientName, subject, html } = 
                this.createIndividualFeedbackEmail(data);

            const info = await this.transporter.sendMail({
                from: `"Team Performance Dashboard" <${process.env.EMAIL_USER}>`,
                to: recipientEmail,
                subject,
                html
            });

            // Log the email
            const emailLog = new EmailLog({
                type: 'feedback',
                subject,
                content: { html },
                priority: 'normal',
                sender: {
                    email: senderUser?.email || process.env.EMAIL_USER,
                    name: senderUser?.name || 'Team Performance Dashboard'
                },
                recipients: [{
                    email: recipientEmail,
                    name: recipientName,
                    status: 'sent',
                    messageId: info.messageId,
                    sentAt: new Date()
                }],
                metadata: {
                    smtpEmail: process.env.EMAIL_USER
                }
            });
            
            await emailLog.save();
            console.log(`✅ Individual feedback sent to ${recipientEmail}`);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('❌ Failed to send individual feedback:', error);
            throw error;
        }
    }

    async sendUrgentAlert(data, senderUser = null) {
        try {
            if (!this.transporter) await this.initialize();

            const { recipients, subject, html } = this.createUrgentAlertEmail(data);
            console.log('📧 Service received recipients:', recipients);
            const results = [];

            const emailLog = new EmailLog({
                type: 'urgent',
                subject: `🚨 ${subject}`,
                content: { html },
                priority: 'high',
                sender: {
                    email: senderUser?.email || process.env.EMAIL_USER,
                    name: senderUser?.name || 'Team Performance Dashboard'
                },
                recipients: [],
                metadata: {
                    smtpEmail: process.env.EMAIL_USER
                }
            });

            for (const recipient of recipients) {
                const recipientEmail = typeof recipient === 'string' ? recipient : recipient.email;
                const recipientName = typeof recipient === 'string' ? recipientEmail.split('@')[0] : recipient.name;
                
                const info = await this.transporter.sendMail({
                    from: `"Team Performance Dashboard" <${process.env.EMAIL_USER}>`,
                    to: recipientEmail,
                    subject: `🚨 ${subject}`,
                    html,
                    priority: 'high'
                });

                results.push({
                    email: recipientEmail,
                    name: recipientName,
                    messageId: info.messageId,
                    response: info.response
                });

                emailLog.recipients.push({
                    email: recipientEmail,
                    name: recipientName,
                    status: 'sent',
                    messageId: info.messageId,
                    sentAt: new Date()
                });

                console.log(`🚨 Urgent alert sent to ${recipientEmail}`);
            }

            await emailLog.save();
            return { success: true, results };
        } catch (error) {
            console.error('❌ Failed to send urgent alert:', error);
            throw error;
        }
    }

    async sendMetricsReminder(data, senderUser = null) {
        try {
            if (!this.transporter) await this.initialize();

            const { recipients, subject, html } = this.createMetricsReminderEmail(data);
            const results = [];

            const emailLog = new EmailLog({
                type: 'reminder',
                subject,
                content: { html },
                priority: 'normal',
                sender: {
                    email: senderUser?.email || process.env.EMAIL_USER,
                    name: senderUser?.name || 'Team Performance Dashboard'
                },
                recipients: [],
                metadata: {
                    smtpEmail: process.env.EMAIL_USER
                }
            });

            for (const recipient of recipients) {
                const personalizedHtml = html.replace('{{USER_NAME}}', recipient.name);
                const info = await this.transporter.sendMail({
                    from: `"Team Performance Dashboard" <${process.env.EMAIL_USER}>`,
                    to: recipient.email,
                    subject,
                    html: personalizedHtml
                });

                results.push({
                    email: recipient.email,
                    name: recipient.name,
                    messageId: info.messageId
                });

                emailLog.recipients.push({
                    email: recipient.email,
                    name: recipient.name,
                    status: 'sent',
                    messageId: info.messageId,
                    sentAt: new Date()
                });

                console.log(`📋 Metrics reminder sent to ${recipient.email}`);
            }

            await emailLog.save();
            return { success: true, results };
        } catch (error) {
            console.error('❌ Failed to send metrics reminder:', error);
            throw error;
        }
    }

    // Email template methods (same as before)
    createTeamPerformanceEmail(teamMetricsData) {
        const subject = `[PM] Weekly Team Performance Report - ${new Date().toDateString()}`;
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
                <!-- Your existing team performance email template -->
                ${this.createTeamPerformanceTemplate(teamMetricsData)}
            </div>
        `;
        return { subject, html, recipients: teamMetricsData.recipients };
    }

    createIndividualFeedbackEmail(data) {
        const subject = `[PM] Performance Feedback - ${data.recipientName}`;
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <!-- Your existing individual feedback email template -->
                ${this.createIndividualFeedbackTemplate(data)}
            </div>
        `;
        return { ...data, subject, html };
    }

    createUrgentAlertEmail(data) {
        const { subject, message, priority = 'high', recipients } = data;
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <!-- Your existing urgent alert email template -->
                ${this.createUrgentAlertTemplate({ subject, message, priority })}
            </div>
        `;
        return { subject, html, recipients };
    }

    createMetricsReminderEmail(data) {
        const { targetDate, missingSubmissions } = data;
        const subject = `[PM] Metrics Submission Reminder - ${targetDate}`;
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <!-- Your existing metrics reminder email template -->
                ${this.createMetricsReminderTemplate({ targetDate })}
            </div>
        `;
        return { subject, html, recipients: missingSubmissions };
    }

    // Reuse your existing email templates
    createTeamPerformanceTemplate(teamMetricsData) {
        // Your existing template code
        return `
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
                <h1 style="margin: 0; font-size: 28px;">📊 Team Performance Report</h1>
                <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">
                    Period: ${teamMetricsData.reportPeriod || 'This Week'} | Generated: ${new Date().toLocaleDateString()}
                </p>
            </div>
            <!-- Rest of your existing template -->
        `;
    }

    createIndividualFeedbackTemplate(data) {
        const { recipientName, feedback, performanceData = {} } = data;
        
        return `
            <div style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; padding: 25px; text-align: center; border-radius: 8px 8px 0 0;">
                <h1 style="margin: 0; font-size: 24px;">💬 Performance Feedback</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">Personal feedback from Project Manager</p>
            </div>
            
            <div style="background: white; padding: 30px; border-radius: 0 0 8px 8px;">
                <!-- Recipient Info -->
                <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; margin-bottom: 25px; border-left: 4px solid #0284c7;">
                    <h2 style="color: #0c4a6e; margin: 0 0 10px 0; font-size: 18px;">👤 ${recipientName}</h2>
                    <p style="color: #075985; margin: 0; font-size: 14px;">
                        <strong>Date:</strong> ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}
                    </p>
                </div>

                ${performanceData && Object.keys(performanceData).length > 0 ? `
                <!-- Performance Metrics -->
                <div style="margin-bottom: 25px;">
                    <h3 style="color: #0c4a6e; margin: 0 0 15px 0; font-size: 16px; border-bottom: 2px solid #e0f2fe; padding-bottom: 10px;">
                        📊 Performance Overview
                    </h3>
                    <div style="background: #f9fafb; padding: 15px; border-radius: 8px;">
                        ${performanceData.totalTasks ? `
                            <p style="margin: 8px 0; color: #374151;"><strong>Total Tasks:</strong> ${performanceData.totalTasks}</p>
                        ` : ''}
                        ${performanceData.completed ? `
                            <p style="margin: 8px 0; color: #059669;"><strong>Completed:</strong> ${performanceData.completed}</p>
                        ` : ''}
                        ${performanceData.pending ? `
                            <p style="margin: 8px 0; color: #d97706;"><strong>Pending:</strong> ${performanceData.pending}</p>
                        ` : ''}
                        ${performanceData.completionRate ? `
                            <p style="margin: 8px 0; color: #0284c7;"><strong>Completion Rate:</strong> ${performanceData.completionRate}%</p>
                        ` : ''}
                    </div>
                </div>
                ` : ''}

                <!-- Feedback Message -->
                <div style="margin-bottom: 25px;">
                    <h3 style="color: #0c4a6e; margin: 0 0 15px 0; font-size: 16px; border-bottom: 2px solid #e0f2fe; padding-bottom: 10px;">
                        💭 Manager's Feedback
                    </h3>
                    <div style="background: #ffffff; padding: 20px; border: 2px solid #e0f2fe; border-radius: 8px; line-height: 1.8;">
                        <p style="color: #1f2937; margin: 0; white-space: pre-wrap; font-size: 15px;">${feedback}</p>
                    </div>
                </div>

                <!-- Action Items (if any) -->
                <div style="background: #fef3c7; padding: 20px; border-radius: 8px; border-left: 4px solid #f59e0b; margin-top: 25px;">
                    <h4 style="color: #92400e; margin: 0 0 10px 0; font-size: 14px;">📌 Next Steps</h4>
                    <p style="color: #78350f; margin: 0; font-size: 14px;">
                        Please review this feedback and feel free to discuss any points with your Project Manager. 
                        Continue your excellent work and let us know if you need any support!
                    </p>
                </div>

                <!-- Footer -->
                <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                    <p style="color: #6b7280; font-size: 12px; margin: 0;">
                        This feedback was sent from the Team Performance Dashboard
                    </p>
                    <p style="color: #9ca3af; font-size: 11px; margin: 5px 0 0 0;">
                        © ${new Date().getFullYear()} Team Performance Management System
                    </p>
                </div>
            </div>
        `;
    }

    createUrgentAlertTemplate({ subject, message, priority }) {
        const priorityColor = priority === 'high' ? '#f44336' : priority === 'medium' ? '#ff9800' : '#2196f3';
        const priorityIcon = priority === 'high' ? '🚨' : priority === 'medium' ? '⚠️' : 'ℹ️';

        return `
            <div style="background: ${priorityColor}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                <h1 style="margin: 0; font-size: 24px;">${priorityIcon} URGENT ALERT</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">From: Project Manager</p>
            </div>
            <div style="background: #f8f9fa; padding: 25px; border-radius: 0 0 8px 8px;">
                <div style="background: white; padding: 20px; border-radius: 6px; border-left: 4px solid ${priorityColor};">
                    <h2 style="margin: 0 0 15px 0; color: #2c3e50;">${subject}</h2>
                    <div style="line-height: 1.6; color: #333;">
                        ${message.replace(/\n/g, '<br>')}
                    </div>
                </div>
                <div style="background: #ffebee; padding: 15px; border-radius: 6px; margin-top: 15px; text-align: center;">
                    <p style="margin: 0; color: #c62828; font-weight: bold;">
                        ⚡ This message requires immediate attention
                    </p>
                </div>
            </div>
        `;
    }

    createMetricsReminderTemplate({ targetDate }) {
        return `
            <div style="background: linear-gradient(135deg, #ff6b6b 0%, #ffa500 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                <h1 style="margin: 0; font-size: 24px;">📋 Metrics Submission Reminder</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">Daily metrics submission required</p>
            </div>
            <!-- Rest of your existing template -->
        `;
    }

    async getEmailAnalytics() {
        // For SMTP, we can't get real-time email analytics
        // Return placeholder data until we implement proper email logging
        return {
            totalSent: 0,
            recentMessages: [],
            analytics: {
                alerts: 0,
                reports: 0,
                feedback: 0,
                reminders: 0,
                other: 0
            }
        };
    }
}

export default new NodemailerService();