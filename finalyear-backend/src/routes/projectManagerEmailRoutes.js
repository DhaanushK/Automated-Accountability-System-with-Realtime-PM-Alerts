import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { projectManagerOnly } from '../middleware/roleAuth.js';
import nodemailerService from '../services/nodemailerService.js';
import smtpEmailService from '../services/smtpEmailService.js';
import EmailLog from '../models/EmailLog.js';
import User from '../models/User.js';
import { getAllTeamTicketData } from '../services/ticketSheetsService.js';

const router = express.Router();

// Send team performance report
router.post('/send-team-report',
  authMiddleware,
  projectManagerOnly,
  async (req, res) => {
    try {
      // Get all team ticket data using the new service
      const teamData = await getAllTeamTicketData(process.env.GOOGLE_SPREADSHEET_ID);
      
      // teamData already contains aggregatedKPIs and individualKPIs from the ticket service
      const teamMetricsData = {
        aggregatedKPIs: teamData.aggregatedKPIs,
        individualKPIs: teamData.individualKPIs,
        reportPeriod: req.body.reportPeriod || 'This Week',
        totalTickets: teamData.totalTickets,
        teamMembers: teamData.teamMembers
      };

      // Get sender info
      const senderUser = await User.findById(req.user.id).select('email name');
      
      // Try Gmail API first, fallback to SMTP
      let result;
      try {
        result = await nodemailerService.sendTeamPerformanceReport(teamMetricsData, senderUser);
      } catch (gmailError) {
        console.log('Gmail API failed, trying SMTP...', gmailError.message);
        result = await smtpEmailService.sendTeamPerformanceReport(teamMetricsData, senderUser);
      }

      res.json({
        message: 'Team performance report sent successfully',
        emailsSent: result.emailsSent,
        reportData: teamMetricsData
      });
    } catch (error) {
      console.error('Error sending team report:', error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Send individual feedback
router.post('/send-individual-feedback',
  authMiddleware,
  projectManagerOnly,
  async (req, res) => {
    try {
      const { recipientEmail, recipientName, performanceData, feedback } = req.body;

      if (!recipientEmail || !recipientName || !feedback) {
        return res.status(400).json({
          message: 'Recipient email, name, and feedback are required'
        });
      }

      // Validate that recipient email is in approved list
      const User = (await import('../models/User.js')).default;
      const teamUsers = await User.find({
        role: { $in: ['team_member', 'team_lead'] }
      }).select('email');
      
      const approvedEmails = teamUsers.map(user => user.email);

      if (!approvedEmails.includes(recipientEmail)) {
        return res.status(400).json({
          message: 'Recipient email is not in the approved team member list'
        });
      }

      // Get sender info
      const senderUser = await User.findById(req.user.id).select('email name');
      
      // Try Gmail API first, fallback to SMTP
      let result;
      try {
        result = await nodemailerService.sendIndividualFeedback({
          recipientEmail,
          recipientName,
          performanceData: performanceData || {},
          feedback
        }, senderUser);
      } catch (gmailError) {
        console.log('Gmail API failed, trying SMTP...', gmailError.message);
        result = await smtpEmailService.sendIndividualFeedback({
          recipientEmail,
          recipientName,
          performanceData: performanceData || {},
          feedback
        }, senderUser);
      }

      res.json({
        message: 'Individual feedback sent successfully',
        recipient: recipientEmail,
        messageId: result.messageId || result.id
      });
    } catch (error) {
      console.error('Error sending individual feedback:', error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Send urgent alert
router.post('/send-urgent-alert',
  authMiddleware,
  projectManagerOnly,
  async (req, res) => {
    try {
      const { subject, message, priority = 'high', recipients = 'all' } = req.body;

      if (!subject || !message) {
        return res.status(400).json({
          message: 'Subject and message are required'
        });
      }

      // Get recipient list with names
      let recipientList = [];
      if (recipients === 'all') {
        const teamUsers = await User.find({
          role: { $in: ['team_member', 'team_lead'] }
        }).select('email name');
        recipientList = teamUsers.map(user => ({ email: user.email, name: user.name }));
        console.log('📧 Recipients with names:', recipientList);
      } else {
        // If specific recipients, fetch their names from database
        const recipientEmails = Array.isArray(recipients) ? recipients : [recipients];
        const users = await User.find({ email: { $in: recipientEmails } }).select('email name');
        recipientList = users.map(user => ({ email: user.email, name: user.name }));
        console.log('📧 Specific recipients with names:', recipientList);
      }

      // Get sender info from authenticated user
      const senderUser = await User.findById(req.user.id).select('email name');

      // Send email using nodemailer (it will create the EmailLog)
      const result = await nodemailerService.sendUrgentAlert({
        subject,
        message,
        priority,
        recipients: recipientList
      }, senderUser);

      res.json({
        message: 'Urgent alert sent successfully',
        recipients: recipientList.length,
        results: result.results
      });
    } catch (error) {
      console.error('Error sending urgent alert:', error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Send metrics submission reminder
router.post('/send-metrics-reminder',
  authMiddleware,
  projectManagerOnly,
  async (req, res) => {
    try {
      const { targetDate, missingSubmissions } = req.body;

      if (!targetDate || !missingSubmissions || !Array.isArray(missingSubmissions)) {
        return res.status(400).json({
          message: 'Target date and missing submissions array are required'
        });
      }

      // Get sender info
      const senderUser = await User.findById(req.user.id).select('email name');
      
      // Try Gmail API first, fallback to SMTP
      let result;
      try {
        result = await nodemailerService.sendMetricsReminder({
          targetDate,
          missingSubmissions
        }, senderUser);
      } catch (gmailError) {
        console.log('Gmail API failed, trying SMTP...', gmailError.message);
        result = await smtpEmailService.sendMetricsReminder({
          targetDate,
          missingSubmissions
        }, senderUser);
      }

      res.json({
        message: 'Metrics reminders sent successfully',
        results: result.results
      });
    } catch (error) {
      console.error('Error sending metrics reminder:', error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Get email analytics
router.get('/email-analytics',
  authMiddleware,
  projectManagerOnly,
  async (req, res) => {
    try {
      // Try Gmail API first, fallback to SMTP
      let analytics;
      try {
        analytics = await nodemailerService.getEmailAnalytics();
      } catch (gmailError) {
        console.log('Gmail analytics failed, using SMTP analytics...', gmailError.message);
        analytics = await smtpEmailService.getEmailAnalytics();
      }
      res.json(analytics);
    } catch (error) {
      console.error('Error getting email analytics:', error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Get team member list for email recipients
router.get('/team-members',
  authMiddleware,
  projectManagerOnly,
  async (req, res) => {
    try {
      // Fetch actual users from database
      const User = (await import('../models/User.js')).default;
      const users = await User.find({
        role: { $in: ['team_member', 'team_lead'] }
      }).select('name email role');

      const teamMembers = users.map(user => ({
        name: user.name,
        email: user.email,
        role: user.role
      }));

      res.json({
        teamMembers,
        totalMembers: teamMembers.length
      });
    } catch (error) {
      console.error('Error fetching team members:', error);
      res.status(500).json({ message: error.message });
    }
  }
);

// Get inbox emails
router.get('/inbox',
  authMiddleware,
  projectManagerOnly,
  async (req, res) => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const skip = (page - 1) * limit;

      const query = {
        'recipients.email': req.user.email,
        status: 'active'
      };

      const total = await EmailLog.countDocuments(query);
      const emails = await EmailLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      const formattedEmails = emails.map(email => ({
        _id: email._id,
        subject: email.subject,
        sender: email.sender,
        recipients: email.recipients,
        content: email.content,
        attachments: email.attachments || [],
        priority: email.priority || 'normal',
        status: email.status,
        isRead: email.recipients.find(r => r.email === req.user.email)?.readAt !== null,
        createdAt: email.createdAt,
        updatedAt: email.updatedAt
      }));

      res.json({
        success: true,
        data: formattedEmails,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit),
          limit: parseInt(limit)
        }
      });
    } catch (error) {
      console.error('Error fetching inbox:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch inbox',
        error: error.message
      });
    }
  }
);

// Get outbox emails
router.get('/outbox',
  authMiddleware,
  projectManagerOnly,
  async (req, res) => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const skip = (page - 1) * limit;

      const query = {
        'sender.email': req.user.email,
        status: 'active'
      };

      const total = await EmailLog.countDocuments(query);
      const emails = await EmailLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      const formattedEmails = emails.map(email => ({
        _id: email._id,
        subject: email.subject,
        sender: email.sender,
        recipients: email.recipients,
        content: email.content,
        attachments: email.attachments || [],
        priority: email.priority || 'normal',
        status: email.status,
        createdAt: email.createdAt,
        updatedAt: email.updatedAt
      }));

      res.json({
        success: true,
        data: formattedEmails,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit),
          limit: parseInt(limit)
        }
      });
    } catch (error) {
      console.error('Error fetching outbox:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch outbox',
        error: error.message
      });
    }
  }
);

// Get email statistics
router.get('/stats',
  authMiddleware,
  projectManagerOnly,
  async (req, res) => {
    try {
      const stats = await EmailLog.aggregate([
        {
          $match: {
            $or: [
              { 'sender.email': req.user.email },
              { 'recipients.email': req.user.email }
            ],
            status: 'active'
          }
        },
        {
          $facet: {
            inbox: [
              {
                $match: {
                  'recipients.email': req.user.email
                }
              },
              { $count: 'count' }
            ],
            outbox: [
              {
                $match: {
                  'sender.email': req.user.email
                }
              },
              { $count: 'count' }
            ],
            unread: [
              {
                $match: {
                  'recipients.email': req.user.email,
                  'recipients.readAt': null
                }
              },
              { $count: 'count' }
            ]
          }
        }
      ]);

      const formatCount = (array) => (array[0]?.count || 0);
      const result = stats[0];

      res.json({
        success: true,
        data: {
          inbox: formatCount(result.inbox),
          outbox: formatCount(result.outbox),
          unread: formatCount(result.unread),
          totalInbox: formatCount(result.inbox),
          totalOutbox: formatCount(result.outbox)
        }
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch statistics',
        error: error.message
      });
    }
  }
);

// Mark email as read
router.patch('/:emailId/read-status',
  authMiddleware,
  projectManagerOnly,
  async (req, res) => {
    try {
      const { emailId } = req.params;
      const { isRead } = req.body;

      const email = await EmailLog.findById(emailId);
      if (!email) {
        return res.status(404).json({
          success: false,
          message: 'Email not found'
        });
      }

      // Find the recipient in the email
      const recipientIndex = email.recipients.findIndex(r => r.email === req.user.email);
      if (recipientIndex === -1) {
        return res.status(403).json({
          success: false,
          message: 'You are not a recipient of this email'
        });
      }

      // Update read status
      if (isRead) {
        email.recipients[recipientIndex].readAt = new Date();
      } else {
        email.recipients[recipientIndex].readAt = null;
      }

      await email.save();

      res.json({
        success: true,
        message: 'Email status updated'
      });
    } catch (error) {
      console.error('Error updating read status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update email status',
        error: error.message
      });
    }
  }
);

// Delete email (soft delete by changing status)
router.delete('/:emailId',
  authMiddleware,
  projectManagerOnly,
  async (req, res) => {
    try {
      const { emailId } = req.params;

      const email = await EmailLog.findById(emailId);
      if (!email) {
        return res.status(404).json({
          success: false,
          message: 'Email not found'
        });
      }

      // Verify user is either sender or recipient
      const isSender = email.sender.email === req.user.email;
      const isRecipient = email.recipients.some(r => r.email === req.user.email);

      if (!isSender && !isRecipient) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to delete this email'
        });
      }

      // Soft delete by updating status
      email.status = 'deleted';
      await email.save();

      res.json({
        success: true,
        message: 'Email deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting email:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete email',
        error: error.message
      });
    }
  }
);

// Test email service connection
router.get('/test-connection',
  authMiddleware,
  projectManagerOnly,
  async (req, res) => {
    try {
      await nodemailerService.initialize();
      res.json({ 
        message: 'Email service connection successful',
        status: 'connected',
        service: 'gmail-smtp',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Email connection test failed:', error);
      res.status(500).json({ 
        message: 'Email service connection failed',
        error: error.message,
        status: 'disconnected'
      });
    }
  }
);

export default router;