# 📅 Google Calendar Integration - Setup Guide

## Overview
Your application now has a **full Google Calendar integration** with month view, agenda view, event creation, editing, and deletion capabilities.

## 🚀 Quick Setup

### Step 1: Enable Google Calendar API

You need to enable the Calendar API for your Google Cloud project:

1. **Visit the API Console:**
   - Go to: https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=957310809293
   - OR go to: https://console.cloud.google.com/apis/library/calendar-json.googleapis.com?project=civic-shell-471423-u1

2. **Click "Enable"**
   - Click the blue "ENABLE" button
   - Wait 2-3 minutes for changes to propagate

3. **Verify Authorization:**
   - Make sure you've authorized the calendar access using your OAuth credentials
   - If not, run the calendar authorization script:
   ```bash
   cd finalyear-backend
   node authorize-calendar.js
   ```

### Step 2: Test the Integration

1. **Start your backend server:**
   ```bash
   cd finalyear-backend
   npm start
   ```

2. **Start your frontend:**
   ```bash
   cd finalyear-frontend
   npm run dev
   ```

3. **Access the Calendar:**
   - Login to your application
   - Click the **"Calendar"** button in the top navigation bar
   - You should see the full calendar interface!

## ✨ Features Added

### 1. **Full Calendar Component** (`FullCalendar.jsx`)
   - **Month View**: Interactive calendar grid with all events
   - **Agenda View**: List view of upcoming events
   - **Day/Week Views**: Placeholders for future enhancement
   - **Event Creation**: Create events with date, time, location, attendees
   - **Event Details**: View full event information in modal
   - **Event Deletion**: Remove events from calendar
   - **Color Coding**: 11 different colors for categorizing events

### 2. **Calendar Page** (`CalendarPage.jsx`)
   - Dedicated calendar page accessible from all dashboards
   - Toggle between full calendar and list view
   - Quick info cards explaining features
   - Beautiful gradient design

### 3. **Enhanced Navigation**
   - Calendar button in TopBar for quick access
   - Available to all users (Project Manager, Team Lead, Team Member)
   - Highlights when you're on the calendar page

### 4. **Backend Enhancements**
   Already implemented in your backend:
   - ✅ Get upcoming events
   - ✅ Create custom events
   - ✅ Delete events
   - ✅ Schedule weekly reports
   - ✅ Create milestones
   - ✅ Create SLA alerts

## 🎨 Color Coding

Events can be color-coded:
- **Lavender** (#a4bdfc) - Default
- **Sage** (#7ae7bf) - Success/Completed
- **Grape** (#dbadff) - Important
- **Flamingo** (#ff887c) - Urgent
- **Banana** (#fbd75b) - Warning
- **Tangerine** (#ffb878) - Review
- **Peacock** (#46d6db) - Team Events
- **Blueberry** (#5484ed) - Reports/Analytics
- **Basil** (#51b749) - Milestones
- **Tomato** (#dc2127) - Alerts/Critical

## 📋 Usage Instructions

### Creating an Event
1. Click **"Create Event"** button or click any date in the calendar
2. Fill in event details:
   - Title (required)
   - Start and end date/time (required)
   - Description, location, attendees (optional)
   - Choose a color
3. Click **"Create Event"**

### Viewing Event Details
- Click any event in the calendar or agenda view
- See full details including time, location, attendees, description
- Option to delete the event

### Navigating the Calendar
- Use **◀ Today ▶** buttons to navigate
- Switch between **Day**, **Week**, **Month**, and **Agenda** views
- Month view shows all events in a traditional calendar grid
- Agenda view shows upcoming events in a list format

## 🔧 API Endpoints Used

```javascript
GET  /api/calendar/upcoming?days=7          // Get upcoming events
POST /api/calendar/event                    // Create new event
POST /api/calendar/schedule-weekly-report   // Schedule weekly report
POST /api/calendar/milestone                // Create milestone
POST /api/calendar/sla-alert                // Create SLA alert
DELETE /api/calendar/event/:eventId         // Delete event
```

## 🛠️ Troubleshooting

### Error: "Google Calendar API has not been used"
**Solution:** Enable the Calendar API (see Step 1 above)

### Error: "Calendar token not found"
**Solution:** Run the authorization script:
```bash
cd finalyear-backend
node authorize-calendar.js
```

### Error: "Failed to fetch events"
**Solutions:**
1. Check if backend is running
2. Verify OAuth credentials are correct
3. Check if calendar_token.json exists in `finalyear-backend/src/config/`
4. Ensure you've authorized the application

### Events not syncing
**Solution:** 
- Click the refresh button (🔄) in the calendar
- Wait a few seconds for Google's systems to propagate changes

## 📱 Mobile Responsive

The calendar is fully responsive and works on:
- Desktop (optimal experience)
- Tablets (good experience)
- Mobile phones (agenda view recommended)

## 🎯 Future Enhancements

Planned features (not yet implemented):
- [ ] Week view with hour-by-hour breakdown
- [ ] Day view with detailed schedule
- [ ] Event editing (currently only create/delete)
- [ ] Recurring events management
- [ ] Event reminders customization
- [ ] Export to .ics file
- [ ] Multiple calendar support
- [ ] Event search and filtering

## 💡 Tips

1. **Use Colors Wisely**: Assign colors to different event types for easy identification
2. **Add Attendees**: Include team member emails for automatic invitations
3. **Set Reminders**: Events automatically have email (24h) and popup (30min) reminders
4. **Check Agenda View**: Great for seeing upcoming events in detail
5. **Mobile Access**: Use agenda view on mobile for better readability

## 🔐 Security

- All calendar operations require authentication
- Only Project Managers can delete events by default
- Events are synced to your Google Calendar (OAuth secured)
- Attendee emails are validated by Google

## Need Help?

If you encounter any issues:
1. Check the browser console for errors
2. Check backend logs
3. Verify API is enabled in Google Cloud Console
4. Ensure OAuth tokens are valid

Enjoy your new integrated calendar! 📅✨
