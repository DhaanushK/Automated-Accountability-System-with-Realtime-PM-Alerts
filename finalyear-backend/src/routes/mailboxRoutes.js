import express from 'express';
import emailService from '../services/emailService.js';
import { authMiddleware } from '../middleware/auth.js';
import { projectManagerOnly } from '../middleware/roleAuth.js';

const router = express.Router();

// Get inbox emails
router.get('/inbox', authMiddleware, projectManagerOnly, async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    let emails;
    
    if (search) {
      emails = await emailService.searchEmails(search, 'INBOX');
    } else {
      emails = await emailService.getInboxEmails(['ALL'], limit);
    }

    // Format emails for response
    const formattedEmails = emails.map(email => ({
      id: email.messageId,
      from: email.from?.text || '',
      to: email.to?.text || '',
      cc: email.cc?.text || '',
      subject: email.subject || '',
      body: email.html || email.text || '',
      date: email.date,
      hasAttachments: email.attachments?.length > 0
    }));

    res.json({
      success: true,
      data: formattedEmails,
      page: parseInt(page),
      totalPages: Math.ceil(formattedEmails.length / limit)
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

// Get sent emails
router.get('/sent', authMiddleware, projectManagerOnly, async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    let emails;
    
    if (search) {
      emails = await emailService.searchEmails(search, 'SENT');
    } else {
      emails = await emailService.getSentEmails(['ALL'], limit);
    }

    // Format emails for response
    const formattedEmails = emails.map(email => ({
      id: email.messageId,
      from: email.from?.text || '',
      to: email.to?.text || '',
      cc: email.cc?.text || '',
      subject: email.subject || '',
      body: email.html || email.text || '',
      date: email.date,
      hasAttachments: email.attachments?.length > 0
    }));

    res.json({
      success: true,
      data: formattedEmails,
      page: parseInt(page),
      totalPages: Math.ceil(formattedEmails.length / limit)
    });
  } catch (error) {
    console.error('Error fetching sent emails:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch sent emails',
      error: error.message 
    });
  }
});

// Search emails
router.get('/search', authMiddleware, projectManagerOnly, async (req, res) => {
  try {
    const { query, folder = 'INBOX' } = req.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const emails = await emailService.searchEmails(query, folder);

    // Format emails for response
    const formattedEmails = emails.map(email => ({
      id: email.messageId,
      from: email.from?.text || '',
      to: email.to?.text || '',
      cc: email.cc?.text || '',
      subject: email.subject || '',
      body: email.html || email.text || '',
      date: email.date,
      hasAttachments: email.attachments?.length > 0
    }));

    res.json({
      success: true,
      data: formattedEmails
    });
  } catch (error) {
    console.error('Error searching emails:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to search emails',
      error: error.message 
    });
  }
});

// Send email
router.post('/send', authMiddleware, projectManagerOnly, async (req, res) => {
  try {
    const { to, subject, body, cc } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({
        success: false,
        message: 'To, subject, and body are required'
      });
    }

    const result = await emailService.sendEmail(to, subject, body, cc);

    res.json({
      success: true,
      message: 'Email sent successfully',
      messageId: result.messageId
    });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send email',
      error: error.message 
    });
  }
});

export default router;