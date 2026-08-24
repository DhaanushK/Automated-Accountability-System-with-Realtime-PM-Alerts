import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import User from '../models/User.js';
import EmailLog from '../models/EmailLog.js';
import SMTPEmailService from '../services/smtpEmailService.js';

const router = express.Router();

// Middleware to ensure only team members can access these routes
const teamMemberOnly = async (req, res, next) => {
  if (req.user.role !== 'team_member') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Team member role required.'
    });
  }
  next();
};

// Apply auth middleware to all routes
router.use(authMiddleware);
router.use(teamMemberOnly);

// Test email connection
router.get('/test-connection', async (req, res) => {
  try {
    console.log('🧪 Testing SMTP connection for team member...');
    
    await SMTPEmailService.initialize();
    
    console.log('✅ SMTP connection successful for team member');
    res.json({
      success: true,
      message: 'Email service connected successfully',
      service: 'SMTP',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ SMTP connection failed for team member:', error.message);
    res.status(500).json({
      success: false,
      message: 'Email service connection failed',
      error: error.message
    });
  }
});

// Get notifications (placeholder - would typically come from database)
router.get('/notifications', async (req, res) => {
  try {
    // For now, return sample notifications
    // In a real app, this would query a notifications table
    const notifications = [
      {
        id: 1,
        subject: 'Weekly Team Meeting Reminder',
        message: 'Don\'t forget about our weekly team meeting tomorrow at 10 AM.',
        date: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
        priority: 'normal',
        from: 'Team Lead'
      },
      {
        id: 2,
        subject: 'New Project Requirements',
        message: 'Please review the updated project requirements document shared in the team drive.',
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        priority: 'high',
        from: 'Project Manager'
      }
    ];

    res.json({
      success: true,
      notifications
    });
  } catch (error) {
    console.error('❌ Failed to fetch notifications:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications',
      error: error.message
    });
  }
});

// Send status update to team lead
router.post('/send-status-update', async (req, res) => {
  try {
    const { subject, message, priority } = req.body;
    const memberName = req.user.username;
    const memberEmail = req.user.email;

    if (!subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'Subject and message are required'
      });
    }

    // Find team lead (for now, we'll send to a default email or find team lead logic)
    // In a real app, you'd have team structure in database
    const teamLead = await User.findOne({ role: 'team_lead' }).lean();
    
    if (!teamLead) {
      return res.status(404).json({
        success: false,
        message: 'No team lead found to send status update'
      });
    }

    await SMTPEmailService.initialize();

    const priorityEmoji = {
      low: '🟢',
      normal: '🟡',
      high: '🔴'
    };

    const emailContent = generateStatusUpdateEmail(
      memberName,
      memberEmail,
      subject,
      message,
      priority,
      priorityEmoji[priority] || '🟡'
    );

    await SMTPEmailService.sendEmail(
      teamLead.email,
      `Status Update: ${subject}`,
      emailContent
    );

    console.log(`✅ Status update sent from ${memberName} to team lead`);

    res.json({
      success: true,
      message: 'Status update sent successfully to your team lead'
    });

  } catch (error) {
    console.error('❌ Failed to send status update:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to send status update',
      error: error.message
    });
  }
});

// Send support request
router.post('/send-support-request', async (req, res) => {
  try {
    const { subject, description, urgency } = req.body;
    const memberName = req.user.username;
    const memberEmail = req.user.email;

    if (!subject || !description) {
      return res.status(400).json({
        success: false,
        message: 'Subject and description are required'
      });
    }

    // Find team lead and project manager
    const [teamLead, projectManager] = await Promise.all([
      User.findOne({ role: 'team_lead' }).lean(),
      User.findOne({ role: 'project_manager' }).lean()
    ]);

    const recipients = [];
    if (teamLead) recipients.push(teamLead.email);
    if (projectManager && urgency === 'critical') recipients.push(projectManager.email);

    if (recipients.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No team lead or project manager found to send support request'
      });
    }

    await SMTPEmailService.initialize();

    const urgencyEmoji = {
      low: '🟢',
      medium: '🟡',
      high: '🟠',
      critical: '🔴'
    };

    const emailContent = generateSupportRequestEmail(
      memberName,
      memberEmail,
      subject,
      description,
      urgency,
      urgencyEmoji[urgency] || '🟡'
    );

    // Send to all recipients
    for (const email of recipients) {
      await SMTPEmailService.sendEmail(
        email,
        `Support Request [${urgency.toUpperCase()}]: ${subject}`,
        emailContent
      );
    }

    console.log(`✅ Support request sent from ${memberName} to ${recipients.length} recipients`);

    res.json({
      success: true,
      message: `Support request sent successfully to ${recipients.length} team member(s)`
    });

  } catch (error) {
    console.error('❌ Failed to send support request:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to send support request',
      error: error.message
    });
  }
});

// Helper function to generate status update email HTML
function generateStatusUpdateEmail(memberName, memberEmail, subject, message, priority, priorityEmoji) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
      <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #e5e7eb;">
          <h1 style="color: #1f2937; margin: 0; font-size: 24px;">📝 Status Update</h1>
          <p style="color: #6b7280; margin: 10px 0 0 0; font-size: 14px;">From Team Member</p>
        </div>

        <!-- Member Info -->
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h3 style="color: #374151; margin: 0; font-size: 18px;">👤 ${memberName}</h3>
            <span style="background-color: ${priority === 'high' ? '#fef2f2' : priority === 'normal' ? '#fffbeb' : '#f0f9ff'}; 
                         color: ${priority === 'high' ? '#dc2626' : priority === 'normal' ? '#d97706' : '#2563eb'}; 
                         padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold;">
              ${priorityEmoji} ${priority.toUpperCase()} PRIORITY
            </span>
          </div>
          <p style="color: #6b7280; margin: 0; font-size: 14px;">📧 ${memberEmail}</p>
          <p style="color: #6b7280; margin: 5px 0 0 0; font-size: 14px;">🕐 ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
        </div>

        <!-- Subject -->
        <div style="margin-bottom: 25px;">
          <h3 style="color: #374151; margin: 0 0 10px 0; font-size: 16px; font-weight: 600;">📋 Subject:</h3>
          <div style="background-color: #f9fafb; padding: 15px; border-left: 4px solid #3b82f6; border-radius: 0 6px 6px 0;">
            <p style="color: #1f2937; margin: 0; font-weight: 500;">${subject}</p>
          </div>
        </div>

        <!-- Status Message -->
        <div style="margin-bottom: 30px;">
          <h3 style="color: #374151; margin: 0 0 15px 0; font-size: 16px; font-weight: 600;">💬 Status Message:</h3>
          <div style="background-color: #ffffff; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; line-height: 1.6;">
            <p style="color: #374151; margin: 0; white-space: pre-wrap;">${message}</p>
          </div>
        </div>

        <!-- Footer -->
        <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;">
          <p style="margin: 0;">This status update was sent automatically from the Team Performance Dashboard</p>
          <p style="margin: 5px 0 0 0;">Please reply to this email to communicate directly with ${memberName}</p>
        </div>
      </div>
    </div>
  `;
}

// Helper function to generate support request email HTML
function generateSupportRequestEmail(memberName, memberEmail, subject, description, urgency, urgencyEmoji) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
      <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #e5e7eb;">
          <h1 style="color: #dc2626; margin: 0; font-size: 24px;">🆘 Support Request</h1>
          <p style="color: #6b7280; margin: 10px 0 0 0; font-size: 14px;">Assistance Needed</p>
        </div>

        <!-- Urgency Alert -->
        <div style="background-color: ${urgency === 'critical' ? '#fef2f2' : urgency === 'high' ? '#fff7ed' : urgency === 'medium' ? '#fffbeb' : '#f0f9ff'}; 
                    padding: 15px; border-radius: 8px; margin-bottom: 25px; border: 1px solid ${urgency === 'critical' ? '#fecaca' : urgency === 'high' ? '#fed7aa' : urgency === 'medium' ? '#fde68a' : '#bfdbfe'};">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 20px;">${urgencyEmoji}</span>
            <div>
              <h3 style="margin: 0; color: ${urgency === 'critical' ? '#dc2626' : urgency === 'high' ? '#ea580c' : urgency === 'medium' ? '#d97706' : '#2563eb'}; font-size: 16px;">
                ${urgency.toUpperCase()} URGENCY
              </h3>
              <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 14px;">
                ${urgency === 'critical' ? 'Immediate attention required' : urgency === 'high' ? 'Blocking work progress' : urgency === 'medium' ? 'Need help soon' : 'Can wait for assistance'}
              </p>
            </div>
          </div>
        </div>

        <!-- Member Info -->
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
          <h3 style="color: #374151; margin: 0 0 10px 0; font-size: 18px;">👤 Requesting Member</h3>
          <p style="color: #6b7280; margin: 0; font-size: 14px;"><strong>Name:</strong> ${memberName}</p>
          <p style="color: #6b7280; margin: 5px 0; font-size: 14px;"><strong>Email:</strong> ${memberEmail}</p>
          <p style="color: #6b7280; margin: 0; font-size: 14px;"><strong>Time:</strong> ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
        </div>

        <!-- Issue Subject -->
        <div style="margin-bottom: 25px;">
          <h3 style="color: #374151; margin: 0 0 10px 0; font-size: 16px; font-weight: 600;">📋 Issue Subject:</h3>
          <div style="background-color: #f9fafb; padding: 15px; border-left: 4px solid #dc2626; border-radius: 0 6px 6px 0;">
            <p style="color: #1f2937; margin: 0; font-weight: 500;">${subject}</p>
          </div>
        </div>

        <!-- Problem Description -->
        <div style="margin-bottom: 30px;">
          <h3 style="color: #374151; margin: 0 0 15px 0; font-size: 16px; font-weight: 600;">🔍 Problem Description:</h3>
          <div style="background-color: #ffffff; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; line-height: 1.6;">
            <p style="color: #374151; margin: 0; white-space: pre-wrap;">${description}</p>
          </div>
        </div>

        <!-- Action Required -->
        <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; border: 1px solid #bfdbfe; margin-bottom: 20px;">
          <h4 style="color: #1e40af; margin: 0 0 10px 0; font-size: 14px; font-weight: 600;">⚡ ACTION REQUIRED</h4>
          <p style="color: #1e40af; margin: 0; font-size: 14px;">
            Please respond to this support request and provide assistance to ${memberName}. 
            ${urgency === 'critical' ? 'This is marked as CRITICAL - immediate action needed.' : ''}
          </p>
        </div>

        <!-- Footer -->
        <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;">
          <p style="margin: 0;">This support request was sent from the Team Performance Dashboard</p>
          <p style="margin: 5px 0 0 0;">Reply to this email to provide assistance directly to ${memberName}</p>
        </div>
      </div>
    </div>
  `;
}

// Get all team leaders (for email composition)
router.get('/team-leaders', async (req, res) => {
  try {
    const teamLeaders = await User.find({
      role: 'team_lead'
    }).select('name email role');

    const leaders = teamLeaders.map(leader => ({
      name: leader.name,
      email: leader.email,
      role: leader.role,
      displayName: `${leader.name} <${leader.email}> - Team Lead`
    }));

    res.json({
      success: true,
      teamLeaders: leaders,
      totalLeaders: leaders.length
    });
  } catch (error) {
    console.error('Error fetching team leaders:', error);
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// Send custom email to team leader
router.post('/send-custom-email', async (req, res) => {
  try {
    const { recipientEmail, subject, message, priority } = req.body;

    if (!recipientEmail || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'Recipient email, subject, and message are required'
      });
    }

    // Get team member info
    const teamMember = await User.findById(req.user.id).select('name email');
    
    // Get recipient info and verify they are a team leader
    const recipient = await User.findOne({ email: recipientEmail }).select('email name role department');
    
    if (!recipient) {
      return res.status(404).json({
        success: false,
        message: 'Recipient not found'
      });
    }

    // Verify recipient is a team leader
    if (recipient.role !== 'team_lead') {
      return res.status(403).json({
        success: false,
        message: 'Team members can only send emails to team leaders'
      });
    }

    // Create email log
    const emailLog = new EmailLog({
      type: 'custom',
      subject: subject,
      recipients: [{
        email: recipient.email,
        name: recipient.name || recipient.email.split('@')[0],
        displayName: `${recipient.name || recipient.email.split('@')[0]} <${recipient.email}>`,
        department: recipient.department || 'General',
        role: recipient.role,
        status: 'pending',
        sentAt: new Date(),
        readAt: null
      }],
      content: {
        text: message || '',
        html: '',
        plainText: message?.replace(/\n/g, ' ').trim() || ''
      },
      priority: priority || 'normal',
      sender: {
        email: teamMember.email,
        name: teamMember.name,
        role: 'team_member',
        displayName: `${teamMember.name} <${teamMember.email}>`
      },
      metadata: {
        sentAt: new Date(),
        updatedAt: new Date(),
        type: 'custom_email',
        priority: priority || 'normal',
        recipientCount: 1
      },
      status: 'active',
      readBy: []
    });

    await emailLog.save();

    // Create HTML template
    const htmlBody = createTeamMemberCustomEmailTemplate({
      subject,
      message,
      priority,
      teamMemberName: teamMember.name,
      teamMemberEmail: teamMember.email,
      recipientName: recipient.name
    });

    // Update the HTML content in the email log
    await EmailLog.updateOne(
      { _id: emailLog._id },
      { $set: { 'content.html': htmlBody } }
    );

    const mailOptions = {
      from: `"${teamMember.name} (Team Member)" <${process.env.EMAIL_USER || 'dhaanushk1110@gmail.com'}>`,
      to: recipient.email,
      subject: subject,
      html: htmlBody,
      priority: priority === 'high' ? 'high' : 'normal',
      headers: {
        'X-Email-Type': 'custom-email',
        'X-Email-Log-Id': emailLog._id.toString(),
        'X-Priority': priority || 'normal'
      }
    };

    try {
      const transporter = await SMTPEmailService.transporter || await SMTPEmailService.initialize().then(() => SMTPEmailService.transporter);
      const result = await transporter.sendMail(mailOptions);

      // Update recipient status in the email log
      await EmailLog.updateOne(
        { 
          _id: emailLog._id,
          'recipients.email': recipient.email 
        },
        {
          $set: {
            'recipients.$.status': 'sent',
            'recipients.$.messageId': result.messageId,
            'recipients.$.sentAt': new Date()
          }
        }
      );
      
      console.log(`✅ Custom email sent from ${teamMember.name} to ${recipient.email}`);
      
      res.json({
        success: true,
        message: 'Email sent successfully',
        emailLogId: emailLog._id,
        recipient: {
          email: recipient.email,
          name: recipient.name,
          messageId: result.messageId
        }
      });
    } catch (emailError) {
      // Update recipient status as failed in the email log
      await EmailLog.updateOne(
        { 
          _id: emailLog._id,
          'recipients.email': recipient.email 
        },
        {
          $set: {
            'recipients.$.status': 'failed',
            'recipients.$.error': emailError.message
          }
        }
      );

      console.error(`❌ Failed to send email to ${recipient.email}:`, emailError.message);
      throw emailError;
    }
  } catch (error) {
    console.error('Error sending custom email:', error);
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
});

// Email template for team member custom emails
function createTeamMemberCustomEmailTemplate({ subject, message, priority, teamMemberName, teamMemberEmail, recipientName }) {
  const priorityColor = priority === 'high' ? '#f44336' : priority === 'medium' ? '#ff9800' : '#10b981';
  
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 25px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">✉️ Message from Team Member</h1>
        <p style="margin: 10px 0 0 0; opacity: 0.9;">From: ${teamMemberName}</p>
      </div>

      <div style="background: #f8f9fa; padding: 25px; border-radius: 0 0 8px 8px;">
        <div style="background: white; padding: 20px; margin-bottom: 15px; border-radius: 6px;">
          <p style="margin: 0 0 10px 0; color: #666; font-size: 14px;">
            Hi <strong>${recipientName || 'Team Lead'}</strong>,
          </p>
        </div>

        <div style="background: white; padding: 20px; border-radius: 6px; border-left: 4px solid ${priorityColor};">
          <h2 style="margin: 0 0 15px 0; color: #2c3e50;">${subject}</h2>
          <div style="line-height: 1.6; color: #333;">
            ${message.replace(/\n/g, '<br>')}
          </div>
        </div>

        ${priority === 'high' ? `
        <div style="background: #fff3cd; padding: 15px; border-radius: 6px; margin-top: 15px; text-align: center; border-left: 4px solid #ffc107;">
          <p style="margin: 0; color: #856404; font-weight: bold;">
            ⚠️ High Priority - Please review at your earliest convenience
          </p>
        </div>
        ` : ''}

        <div style="text-align: center; padding: 20px 15px 15px;">
          <p style="margin: 0; color: #666; font-size: 14px;">
            Best regards,<br>
            <strong>${teamMemberName}</strong><br>
            Team Member<br>
            📧 ${teamMemberEmail}
          </p>
        </div>

        <div style="text-align: center; padding: 10px; border-top: 1px solid #e0e0e0;">
          <p style="margin: 0; color: #999; font-size: 12px;">
            Sent: ${new Date().toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  `;
}

// Get inbox emails
router.get('/inbox', async (req, res) => {
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
});

// Get outbox emails
router.get('/outbox', async (req, res) => {
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
});

// Get email statistics
router.get('/stats', async (req, res) => {
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
});

// Mark email as read
router.patch('/:emailId/read-status', async (req, res) => {
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
});

export default router;