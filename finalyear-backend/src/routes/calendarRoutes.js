import express from 'express';
import calendarService from '../services/calendarService.js';
import { authMiddleware, authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

// Get upcoming events
/**
 * Get upcoming calendar events
 */
router.get('/upcoming', authMiddleware, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const events = await calendarService.getUpcomingEvents(days);
    
    res.json({ 
      success: true, 
      events,
      count: events.length 
    });
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch calendar events',
      message: error.message 
    });
  }
});

// Schedule weekly report (PM only)
router.post('/schedule-weekly-report', authorizeRoles('project_manager'), async (req, res) => {
  try {
    const event = await calendarService.scheduleWeeklyReport(req.body);
    
    res.json({ 
      success: true, 
      event,
      message: 'Weekly report scheduled successfully' 
    });
  } catch (error) {
    console.error('Error scheduling weekly report:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to schedule weekly report',
      message: error.message 
    });
  }
});

// Create milestone (PM only)
router.post('/milestone', authorizeRoles('project_manager'), async (req, res) => {
  try {
    const event = await calendarService.createMilestone(req.body);
    
    res.json({ 
      success: true, 
      event,
      message: 'Milestone created successfully' 
    });
  } catch (error) {
    console.error('Error creating milestone:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create milestone',
      message: error.message 
    });
  }
});

// Create SLA alert (PM and Team Lead)
router.post('/sla-alert', authorizeRoles('project_manager', 'team_lead'), async (req, res) => {
  try {
    const event = await calendarService.createSLAAlert(req.body);
    
    res.json({ 
      success: true, 
      event,
      message: 'SLA alert created successfully' 
    });
  } catch (error) {
    console.error('Error creating SLA alert:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create SLA alert',
      message: error.message 
    });
  }
});

// Create custom event (PM only)
router.post('/event', authorizeRoles('project_manager'), async (req, res) => {
  try {
    const event = await calendarService.createEvent(req.body);
    
    res.json({ 
      success: true, 
      event,
      message: 'Event created successfully' 
    });
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create event',
      message: error.message 
    });
  }
});

// Create custom event - alias route for backward compatibility
router.post('/create-event', authorizeRoles('project_manager'), async (req, res) => {
  try {
    const { summary, attendees, alertMinutes, date, time } = req.body;
    
    // Combine date and time to create ISO datetime
    const startDateTime = new Date(`${date}T${time}`);
    const endDateTime = new Date(startDateTime.getTime() + 60 * 60000); // 1 hour duration
    
    // Format attendees for Google Calendar API (needs array of objects with email property)
    const formattedAttendees = (attendees || []).map(email => ({ email }));
    
    // Create event data for calendar service
    const eventData = {
      summary,
      startTime: startDateTime.toISOString(),
      endTime: endDateTime.toISOString(),
      attendees: formattedAttendees,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: parseInt(alertMinutes) || 15 },
          { method: 'popup', minutes: parseInt(alertMinutes) || 15 },
        ],
      },
    };
    
    const event = await calendarService.createEvent(eventData);
    
    res.json({ 
      success: true, 
      event,
      message: 'Event scheduled successfully! All attendees will be notified.' 
    });
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create event',
      message: error.message 
    });
  }
});

// Delete event (PM only)
router.delete('/event/:eventId', authorizeRoles('project_manager'), async (req, res) => {
  try {
    const result = await calendarService.deleteEvent(req.params.eventId);
    
    res.json({ 
      success: true, 
      result,
      message: 'Event deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete event',
      message: error.message 
    });
  }
});

export default router;
