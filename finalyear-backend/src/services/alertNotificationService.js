import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import AlertRecord from '../models/AlertRecord.js';
import User from '../models/User.js';
import EmailLog from '../models/EmailLog.js';
import Email from '../models/Email.js';
import { analyzeTicketsForDefaulters, shouldSendAlert, calculateSeverity } from './ticketAnalysisService.js';

dotenv.config();

class AlertNotificationService {
  constructor() {
    this.transporter = null;
  }

  async initialize() {
    try {
      this.transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
          user: process.env.EMAIL_USER || 'dhaanushk1110@gmail.com',
          pass: process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASSWORD
        },
        connectionTimeout: 30000,
        greetingTimeout: 30000,
        socketTimeout: 30000
      });

      await this.transporter.verify();
      console.log('✅ Alert Notification service initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Alert Notification service:', error);
      throw error;
    }
  }

  /**
   * Main function to analyze and send alerts to defaulters
   */
  async analyzeAndSendAlerts() {
    try {
      if (!this.transporter) await this.initialize();

      console.log('🚀 Starting automated alert analysis...');
      
      // Analyze tickets to find defaulters
      const defaulters = await analyzeTicketsForDefaulters();
      
      if (defaulters.length === 0) {
        console.log('✅ No defaulters found - all employees are on track!');
        return { success: true, alertsSent: 0, message: 'No alerts needed' };
      }

      console.log(`⚠️  Found ${defaulters.length} employee(s) requiring alerts`);

      const results = [];

      for (const defaulter of defaulters) {
        try {
          // Check if we should send alert (avoid spam)
          const { shouldSend, existingAlert, escalate } = await shouldSendAlert(
            defaulter.email,
            defaulter.ticketNo
          );

          if (!shouldSend) {
            console.log(`⏭️  Skipping ${defaulter.email} - Alert sent recently`);
            continue;
          }

          // Escalate severity if needed
          let severity = defaulter.severity;
          if (escalate) {
            severity = severity === 'Medium' ? 'High' : severity === 'High' ? 'Critical' : severity;
          }

          // Send alert email
          console.log(`\n📬 Processing alert for ${defaulter.email}...`);
          const emailResult = await this.sendAlertEmail(defaulter, severity, existingAlert);

          if (!emailResult.success) {
            console.error(`❌ Email sending failed for ${defaulter.email}: ${emailResult.error}`);
            results.push({
              email: defaulter.email,
              status: 'email_failed',
              error: emailResult.error
            });
            continue; // Skip to next defaulter if email fails
          }

          console.log(`✅ Email delivered to ${defaulter.email}`);

          // Record alert in database
          const alertRecord = await this.recordAlert(defaulter, severity, existingAlert, emailResult);

          results.push({
            email: defaulter.email,
            ticketNo: defaulter.ticketNo,
            severity,
            alertNo: alertRecord.alertNo,
            status: 'sent'
          });

          console.log(`📝 Alert record saved: ${alertRecord.alertNo}`);
          console.log(`✅ Complete: Alert sent to ${defaulter.email} - ${severity} severity\n`);

        } catch (error) {
          console.error(`❌ Failed to process alert for ${defaulter.email}:`, error);
          results.push({
            email: defaulter.email,
            status: 'failed',
            error: error.message
          });
        }
      }

      console.log(`✅ Alert process complete. ${results.filter(r => r.status === 'sent').length} alerts sent successfully`);

      return {
        success: true,
        totalDefaulters: defaulters.length,
        alertsSent: results.filter(r => r.status === 'sent').length,
        alertsFailed: results.filter(r => r.status === 'failed').length,
        results
      };

    } catch (error) {
      console.error('❌ Error in analyzeAndSendAlerts:', error);
      throw error;
    }
  }

  /**
   * Send alert email to defaulter
   */
  async sendAlertEmail(defaulter, severity, existingAlert) {
    try {
      console.log(`📧 Preparing to send email to ${defaulter.email}...`);
      
      const isRepeatAlert = existingAlert && existingAlert.noOfAlertsSent > 0;
      const alertCount = isRepeatAlert ? existingAlert.noOfAlertsSent + 1 : 1;

      const htmlBody = this.createAlertEmailTemplate(defaulter, severity, alertCount);
      const textBody = this.createAlertTextTemplate(defaulter, severity, alertCount);

      const subject = isRepeatAlert 
        ? `🔴 [${severity}] REMINDER #${alertCount}: Incomplete Tasks - Action Required`
        : `⚠️  [${severity}] Alert: Incomplete Tasks Require Attention`;

      const mailOptions = {
        from: `"Project Manager - Alert System" <${process.env.EMAIL_USER}>`,
        to: defaulter.email,
        subject: subject,
        html: htmlBody,
        text: textBody,
        priority: severity === 'Critical' || severity === 'High' ? 'high' : 'normal'
      };

      console.log(`📤 Sending email from ${process.env.EMAIL_USER} to ${defaulter.email}...`);
      const result = await this.transporter.sendMail(mailOptions);
      
      console.log(`✅ Email sent successfully! Message ID: ${result.messageId}`);

      // ====== INTEGRATE WITH EMAIL MANAGEMENT SYSTEM ======
      
      // 1. Create EmailLog entry
      try {
        const emailLog = new EmailLog({
          type: 'team_alert',
          subject: subject,
          recipients: [{
            email: defaulter.email,
            name: defaulter.name,
            status: 'sent',
            messageId: result.messageId,
            sentAt: new Date()
          }],
          content: {
            text: textBody,
            html: htmlBody
          },
          priority: severity === 'Critical' || severity === 'High' ? 'high' : 'normal',
          metadata: {
            alertSeverity: severity,
            ticketNo: defaulter.ticketNo,
            overdueTickets: defaulter.late,
            pendingTickets: defaulter.pending,
            alertType: 'defaulter_notification'
          },
          sender: {
            email: process.env.EMAIL_USER,
            name: 'Project Manager',
            role: 'project_manager'
          },
          status: 'active'
        });
        await emailLog.save();
        console.log(`📝 EmailLog created: ${emailLog._id}`);
      } catch (error) {
        console.error('⚠️  Failed to create EmailLog:', error.message);
      }

      // 2. Create Email entries for Mailbox system
      try {
        // Find recipient user details
        const recipient = await User.findOne({ email: defaulter.email });
        
        if (recipient) {
          // Create email in PM's Outbox
          const pmOutboxEmail = new Email({
            senderEmail: process.env.EMAIL_USER,
            senderName: 'Dhaanush K',
            senderRole: 'project_manager',
            receiverEmail: defaulter.email,
            receiverName: defaulter.name,
            receiverRole: recipient.role,
            subject: subject,
            message: htmlBody,
            messageType: 'alert',
            folder: 'outbox',
            status: 'sent',
            timestamp: new Date(),
            metadata: {
              alertSeverity: severity,
              ticketNo: defaulter.ticketNo,
              messageId: result.messageId
            }
          });
          await pmOutboxEmail.save();
          console.log(`📤 Added to PM Outbox: ${pmOutboxEmail._id}`);

          // Create email in Recipient's Inbox
          const recipientInboxEmail = new Email({
            senderEmail: process.env.EMAIL_USER,
            senderName: 'Dhaanush K',
            senderRole: 'project_manager',
            receiverEmail: defaulter.email,
            receiverName: defaulter.name,
            receiverRole: recipient.role,
            subject: subject,
            message: htmlBody,
            messageType: 'alert',
            folder: 'inbox',
            status: 'sent',
            timestamp: new Date(),
            metadata: {
              alertSeverity: severity,
              ticketNo: defaulter.ticketNo,
              messageId: result.messageId
            }
          });
          await recipientInboxEmail.save();
          console.log(`📥 Added to ${defaulter.name}'s Inbox: ${recipientInboxEmail._id}`);
        }
      } catch (error) {
        console.error('⚠️  Failed to create mailbox entries:', error.message);
      }

      // ====== END EMAIL MANAGEMENT INTEGRATION ======
      
      return {
        success: true,
        messageId: result.messageId,
        sentAt: new Date()
      };
    } catch (error) {
      console.error(`❌ Failed to send email to ${defaulter.email}:`, error.message);
      console.error('Email error details:', error);
      return {
        success: false,
        error: error.message,
        sentAt: new Date()
      };
    }
  }

  /**
   * Create plain text version of alert email
   */
  createAlertTextTemplate(defaulter, severity, alertCount) {
    const isRepeat = alertCount > 1;
    
    return `
${isRepeat ? `REMINDER #${alertCount}` : 'ALERT'}: Incomplete Tasks Require Attention

Dear ${defaulter.name},

This is ${isRepeat ? 'a reminder' : 'an alert'} regarding your incomplete tasks and pending work items.

SEVERITY: ${severity}

TASK STATISTICS:
- Total Tasks: ${defaulter.totalTasks}
- Completed: ${defaulter.completed}
- Pending: ${defaulter.pending}
- Overdue/Late: ${defaulter.late}

ISSUES IDENTIFIED:
${defaulter.incompleteFields.map(field => `- ${field}`).join('\n')}

TICKET DETAILS:
- Ticket No: ${defaulter.ticketNo}
- Date: ${defaulter.date}
- Remarks: ${defaulter.remarks || 'No remarks provided'}

ACTION REQUIRED:
Please address these issues as soon as possible to avoid further escalation.

This is an automated alert from the Project Manager Alert System.

Best regards,
Project Manager
    `.trim();
  }

  /**
   * Record alert in database
   */
  async recordAlert(defaulter, severity, existingAlert, emailResult) {
    try {
      let alertRecord;

      if (existingAlert) {
        // Update existing alert record
        existingAlert.noOfAlertsSent += 1;
        existingAlert.lastAlertSentAt = new Date();
        existingAlert.severity = severity;
        existingAlert.ticketDetails = {
          date: defaulter.date,
          totalTasks: defaulter.totalTasks,
          completed: defaulter.completed,
          pending: defaulter.pending,
          late: defaulter.late,
          hours: defaulter.hours,
          incompleteFields: defaulter.incompleteFields
        };
        existingAlert.alertHistory.push({
          sentAt: new Date(),
          severity: severity,
          message: `Alert #${existingAlert.noOfAlertsSent} sent - ${defaulter.incompleteFields.join(', ')}`,
          status: emailResult.success ? 'sent' : 'failed'
        });

        // Escalate if too many alerts
        if (existingAlert.noOfAlertsSent >= 3) {
          existingAlert.status = 'Escalated';
        }

        alertRecord = await existingAlert.save();
      } else {
        // Create new alert record
        alertRecord = new AlertRecord({
          employeeId: defaulter.userId,
          employeeName: defaulter.name,
          employeeEmail: defaulter.email,
          ticketNo: defaulter.ticketNo,
          ticketDetails: {
            date: defaulter.date,
            totalTasks: defaulter.totalTasks,
            completed: defaulter.completed,
            pending: defaulter.pending,
            late: defaulter.late,
            hours: defaulter.hours,
            incompleteFields: defaulter.incompleteFields
          },
          severity: severity,
          noOfAlertsSent: 1,
          lastAlertSentAt: new Date(),
          alertHistory: [{
            sentAt: new Date(),
            severity: severity,
            message: `Initial alert sent - ${defaulter.incompleteFields.join(', ')}`,
            status: emailResult.success ? 'sent' : 'failed'
          }],
          notes: `Automated alert generated for incomplete tasks`
        });

        alertRecord = await alertRecord.save();
      }

      console.log(`📝 Alert record saved: ${alertRecord.alertNo}`);
      return alertRecord;
    } catch (error) {
      console.error('❌ Error recording alert:', error);
      throw error;
    }
  }

  /**
   * Create HTML email template for alert
   */
  createAlertEmailTemplate(defaulter, severity, alertCount) {
    const severityColor = {
      'Low': '#FFA500',
      'Medium': '#FF8C00',
      'High': '#FF6347',
      'Critical': '#DC143C'
    };

    const color = severityColor[severity] || '#FFA500';
    const isRepeat = alertCount > 1;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: ${color}; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
    .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; }
    .alert-box { background: #fff; border-left: 4px solid ${color}; padding: 15px; margin: 15px 0; }
    .issue-list { background: #fff; padding: 15px; margin: 10px 0; border-radius: 5px; }
    .issue-item { padding: 8px; margin: 5px 0; background: #ffe6e6; border-radius: 3px; }
    .stats { display: flex; justify-content: space-around; margin: 20px 0; }
    .stat-box { text-align: center; padding: 15px; background: white; border-radius: 5px; flex: 1; margin: 0 5px; }
    .stat-number { font-size: 24px; font-weight: bold; color: ${color}; }
    .stat-label { font-size: 12px; color: #666; }
    .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
    .btn { display: inline-block; padding: 12px 24px; background: ${color}; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚠️  ${isRepeat ? `REMINDER #${alertCount}` : 'TASK ALERT'}</h1>
      <p style="margin: 0; font-size: 18px;">${severity} Priority${isRepeat ? ' - Repeated Alert' : ''}</p>
    </div>
    
    <div class="content">
      <h2>Hello ${defaulter.name},</h2>
      
      ${isRepeat ? `
      <div class="alert-box" style="background: #fff3cd; border-color: #856404;">
        <strong>⚠️  This is your ${alertCount}${this.getOrdinalSuffix(alertCount)} reminder.</strong><br>
        Previous alerts have been sent but the issues remain unresolved. Please take immediate action.
      </div>
      ` : ''}
      
      <p>This is an automated alert regarding incomplete tasks in your ticket sheet (${defaulter.ticketNo}).</p>
      
      <div class="stats">
        <div class="stat-box">
          <div class="stat-number">${defaulter.totalTasks}</div>
          <div class="stat-label">Total Tasks</div>
        </div>
        <div class="stat-box">
          <div class="stat-number">${defaulter.completed}</div>
          <div class="stat-label">Completed</div>
        </div>
        <div class="stat-box" style="background: #ffe6e6;">
          <div class="stat-number">${defaulter.pending}</div>
          <div class="stat-label">Pending</div>
        </div>
        <div class="stat-box" style="background: #ffcccc;">
          <div class="stat-number">${defaulter.late}</div>
          <div class="stat-label">SLA Breaches</div>
        </div>
      </div>
      
      <div class="issue-list">
        <h3 style="margin-top: 0; color: ${color};">⚠️  Issues Identified:</h3>
        ${defaulter.incompleteFields.map(field => 
          `<div class="issue-item">❌ ${field}</div>`
        ).join('')}
      </div>
      
      <div class="alert-box">
        <strong>Action Required:</strong>
        <ul>
          <li>Complete all pending tasks as soon as possible</li>
          <li>Update your ticket sheet with accurate information</li>
          <li>Add remarks/notes explaining any delays</li>
          <li>Contact your Team Lead if you need assistance</li>
        </ul>
      </div>
      
      ${severity === 'Critical' || severity === 'High' ? `
      <div class="alert-box" style="background: #ffebee; border-color: #d32f2f;">
        <strong>⚠️  ${severity} Priority Notice:</strong><br>
        This issue requires immediate attention. Please address these concerns within the next 24 hours to avoid escalation.
      </div>
      ` : ''}
      
      <p><strong>Date:</strong> ${defaulter.date || 'N/A'}<br>
      <strong>Ticket No:</strong> ${defaulter.ticketNo}</p>
      
      ${defaulter.remarks ? `<p><strong>Current Remarks:</strong> ${defaulter.remarks}</p>` : ''}
      
      <p style="margin-top: 20px;">Please update your task status promptly to keep the project on track.</p>
      
      <p>Best regards,<br>
      <strong>Automated Alert System</strong></p>
    </div>
    
    <div class="footer">
      <p>This is an automated message. Please do not reply to this email.<br>
      For assistance, contact your Team Lead or Project Manager.</p>
      <p style="font-size: 10px; color: #999;">
        Alert ID: ${defaulter.ticketNo} | Severity: ${severity} | Alert Count: ${alertCount}
      </p>
    </div>
  </div>
</body>
</html>
    `;
  }

  getOrdinalSuffix(num) {
    const j = num % 10;
    const k = num % 100;
    if (j === 1 && k !== 11) return 'st';
    if (j === 2 && k !== 12) return 'nd';
    if (j === 3 && k !== 13) return 'rd';
    return 'th';
  }
}

// Create singleton instance
export const alertNotificationService = new AlertNotificationService();
export default alertNotificationService;
