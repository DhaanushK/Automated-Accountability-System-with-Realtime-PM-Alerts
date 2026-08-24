import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class CalendarService {
  constructor() {
    this.calendar = null;
    this.auth = null;
  }

  async initialize() {
    try {
      // Load OAuth credentials
      const credentialsPath = path.join(__dirname, '../config/oauth_credentials.json');
      const credentials = JSON.parse(await fs.readFile(credentialsPath, 'utf8'));

      const { client_secret, client_id, redirect_uris } = credentials.web || credentials.installed;

      const oAuth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
      );

      // Try to load existing token
      const tokenPath = path.join(__dirname, '../config/calendar_token.json');
      try {
        const token = JSON.parse(await fs.readFile(tokenPath, 'utf8'));
        oAuth2Client.setCredentials(token);
      } catch (error) {
        console.log('⚠️ Calendar token not found. Calendar features will be limited.');
        // Will need manual authorization for full calendar access
        return null;
      }

      this.auth = oAuth2Client;
      this.calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
      
      console.log('✅ Calendar service initialized');
      return this.calendar;
    } catch (error) {
      console.error('❌ Calendar service initialization error:', error.message);
      return null;
    }
  }

  /**
   * Get upcoming events from calendar
   */
  async getUpcomingEvents(daysAhead = 7) {
    try {
      if (!this.calendar) {
        await this.initialize();
      }

      if (!this.calendar) {
        return [];
      }

      const now = new Date();
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + daysAhead);

      const response = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: now.toISOString(),
        timeMax: futureDate.toISOString(),
        maxResults: 20,
        singleEvents: true,
        orderBy: 'startTime',
      });

      return response.data.items || [];
    } catch (error) {
      console.error('Error fetching calendar events:', error.message);
      return [];
    }
  }

  /**
   * Create a calendar event
   */
  async createEvent(eventData) {
    try {
      if (!this.calendar) {
        await this.initialize();
      }

      if (!this.calendar) {
        throw new Error('Calendar service not available');
      }

      const event = {
        summary: eventData.summary || 'Event',
        description: eventData.description || '',
        start: {
          dateTime: eventData.startTime,
          timeZone: eventData.timeZone || 'Asia/Kolkata',
        },
        end: {
          dateTime: eventData.endTime,
          timeZone: eventData.timeZone || 'Asia/Kolkata',
        },
        attendees: eventData.attendees || [],
        reminders: eventData.reminders || {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 30 },
          ],
        },
      };

      if (eventData.recurrence) {
        event.recurrence = eventData.recurrence;
      }

      if (eventData.colorId) {
        event.colorId = eventData.colorId;
      }

      const response = await this.calendar.events.insert({
        calendarId: 'primary',
        resource: event,
        sendUpdates: 'all', // Send email notifications to all attendees
      });

      return response.data;
    } catch (error) {
      console.error('Error creating calendar event:', error.message);
      throw error;
    }
  }

  /**
   * Schedule weekly report reminder
   */
  async scheduleWeeklyReport(config = {}) {
    const now = new Date();
    const nextMonday = new Date();
    
    // Calculate next Monday
    const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
    nextMonday.setDate(now.getDate() + daysUntilMonday);
    nextMonday.setHours(9, 0, 0, 0);

    const endTime = new Date(nextMonday);
    endTime.setHours(10, 0, 0, 0);

    return await this.createEvent({
      summary: config.title || '📊 Weekly Performance Report Review',
      description: config.description || 'Review team performance metrics and weekly trends',
      startTime: nextMonday.toISOString(),
      endTime: endTime.toISOString(),
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO'],
      colorId: '9', // Blue
      attendees: config.attendees || [],
      ...config
    });
  }

  /**
   * Create milestone event
   */
  async createMilestone(milestoneData) {
    return await this.createEvent({
      summary: `🎯 ${milestoneData.name}`,
      description: milestoneData.description || '',
      startTime: milestoneData.date,
      endTime: new Date(new Date(milestoneData.date).getTime() + 60 * 60000).toISOString(), // 1 hour
      colorId: '9', // Blue
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 * 3 }, // 3 days
          { method: 'popup', minutes: 24 * 60 }, // 1 day
        ],
      },
    });
  }

  /**
   * Create SLA alert event
   */
  async createSLAAlert(taskData) {
    const alertTime = new Date();
    alertTime.setHours(alertTime.getHours() + 1);

    return await this.createEvent({
      summary: `⚠️ SLA Alert: ${taskData.taskName}`,
      description: `Owner: ${taskData.owner}\nStatus: ${taskData.status}\nDue: ${taskData.dueDate}`,
      startTime: alertTime.toISOString(),
      endTime: new Date(alertTime.getTime() + 30 * 60000).toISOString(),
      colorId: '11', // Red
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 0 },
          { method: 'popup', minutes: 0 },
        ],
      },
    });
  }

  /**
   * Delete an event
   */
  async deleteEvent(eventId) {
    try {
      if (!this.calendar) {
        await this.initialize();
      }

      if (!this.calendar) {
        throw new Error('Calendar service not available');
      }

      await this.calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId,
      });

      return { success: true, eventId };
    } catch (error) {
      console.error('Error deleting calendar event:', error.message);
      throw error;
    }
  }
}

const calendarServiceInstance = new CalendarService();
export default calendarServiceInstance;
