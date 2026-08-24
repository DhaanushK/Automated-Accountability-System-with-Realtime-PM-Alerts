# 🔔 Alert Notification System - Complete Guide

## Overview
A comprehensive enterprise-grade notification system that automatically analyzes employee ticket sheets, identifies defaulters (employees with incomplete tasks), and sends targeted alerts only to those who need them. The system includes a confidential Alert Records dashboard accessible only to Project Managers.

## Key Features

### 1. **Intelligent Defaulter Detection**
- ✅ Analyzes individual employee ticket sheets from Google Sheets
- ✅ Identifies incomplete fields and pending tasks
- ✅ Calculates severity levels (Low, Medium, High, Critical)
- ✅ Only alerts employees with actual issues (no spam to perfect employees)

### 2. **Alert Records System (PM Only)**
- ✅ Confidential database storing all alert history
- ✅ Separate records for each employee
- ✅ Tracks: Alert No, Ticket No, Severity, Number of Alerts Sent
- ✅ Export individual employee records to PDF
- ✅ Only accessible by Project Manager

### 3. **Automated Scheduling**
- ✅ Daily alerts at 9:00 AM (working hours start)
- ✅ Daily alerts at 5:00 PM (end of day reminder)
- ✅ Weekly Monday reminder at 10:00 AM
- ✅ Configurable timezone (default: Asia/Kolkata)

### 4. **Smart Alert Prevention**
- ✅ 24-hour cooldown between alerts (prevents spam)
- ✅ Escalation after 3 alerts
- ✅ Status tracking (Active, Resolved, Escalated)

## System Architecture

### Backend Components

#### 1. **Database Schema** (`src/models/AlertRecord.js`)
```javascript
{
  alertNo: "ALT-1234567890-1", // Auto-generated
  employeeId: ObjectId,
  employeeName: String,
  employeeEmail: String,
  ticketNo: String,
  ticketDetails: {
    date: String,
    totalTasks: Number,
    completed: Number,
    pending: Number,
    late: Number,
    hours: Number,
    incompleteFields: [String]
  },
  severity: "Low|Medium|High|Critical",
  noOfAlertsSent: Number,
  lastAlertSentAt: Date,
  alertHistory: [{
    sentAt: Date,
    severity: String,
    message: String,
    status: "sent|delivered|failed"
  }],
  status: "Active|Resolved|Escalated",
  notes: String
}
```

#### 2. **Ticket Analysis Service** (`src/services/ticketAnalysisService.js`)
Analyzes Google Sheets data to identify defaulters:
- Missing or empty data fields
- Pending tasks
- SLA breaches
- Missing remarks when there are delays
- No progress on assigned tasks
- High reopened ticket counts

#### 3. **Alert Notification Service** (`src/services/alertNotificationService.js`)
Handles the entire alert workflow:
- Analyzes tickets for defaulters
- Checks if alerts should be sent (24-hour cooldown)
- Sends personalized email alerts
- Records alerts in database
- Escalates after multiple alerts

#### 4. **Alert Scheduler** (`src/schedulers/alertScheduler.js`)
Automated cron jobs:
```javascript
// Daily at 9:00 AM
cron.schedule('0 9 * * *', analyzeAndSendAlerts)

// Daily at 5:00 PM
cron.schedule('0 17 * * *', analyzeAndSendAlerts)

// Monday at 10:00 AM
cron.schedule('0 10 * * 1', analyzeAndSendAlerts)
```

### Frontend Components

#### 1. **Alert Records Dashboard** (`src/components/AlertRecords.jsx`)
PM-only dashboard featuring:
- Statistics summary (total, active, resolved, escalated alerts)
- Severity breakdown visualization
- Top defaulters table
- Filter by status, severity, employee
- Individual employee alert history
- PDF export for each employee
- Update alert status (Active → Resolved/Escalated)

## API Endpoints

All endpoints require authentication and PM role verification.

### POST `/api/alerts/trigger`
Manually trigger alert analysis and sending.

**Request:**
```bash
POST /api/alerts/trigger
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalDefaulters": 5,
    "alertsSent": 4,
    "alertsFailed": 1,
    "results": [...]
  }
}
```

### GET `/api/alerts`
Get all alert records with pagination and filters.

**Query Parameters:**
- `status` - Filter by status (Active, Resolved, Escalated)
- `severity` - Filter by severity (Low, Medium, High, Critical)
- `employeeEmail` - Filter by employee email
- `page` - Page number (default: 1)
- `limit` - Results per page (default: 50)

**Response:**
```json
{
  "success": true,
  "data": {
    "alerts": [...],
    "pagination": {
      "total": 100,
      "page": 1,
      "limit": 50,
      "pages": 2
    }
  }
}
```

### GET `/api/alerts/statistics`
Get alert statistics summary.

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalAlerts": 50,
      "activeAlerts": 20,
      "resolvedAlerts": 25,
      "escalatedAlerts": 5,
      "severityCounts": {
        "Low": 10,
        "Medium": 15,
        "High": 20,
        "Critical": 5
      }
    },
    "topDefaulters": [...],
    "recentAlerts": [...]
  }
}
```

### GET `/api/alerts/employee/:employeeEmail`
Get all alert records for a specific employee.

**Response:**
```json
{
  "success": true,
  "data": {
    "employeeEmail": "john@example.com",
    "alerts": [...],
    "stats": {
      "totalAlerts": 10,
      "activeAlerts": 3,
      "resolvedAlerts": 7,
      "severityCounts": {...}
    }
  }
}
```

### GET `/api/alerts/employee/:employeeEmail/export`
Export employee alert records as PDF.

**Response:** PDF file download

### PUT `/api/alerts/:alertId`
Update alert status or notes.

**Request:**
```json
{
  "status": "Resolved",
  "notes": "Employee completed all tasks"
}
```

### DELETE `/api/alerts/:alertId`
Delete an alert record.

## Email Alert Template

The system sends beautifully formatted HTML emails with:
- Severity color coding
- Task statistics (Total, Completed, Pending, SLA Breaches)
- List of identified issues
- Action required section
- Alert count tracking
- Escalation warnings for repeat offenders

## Security & Privacy

### PM-Only Access
All alert records and APIs are protected:
```javascript
if (req.user.role !== 'project_manager') {
  return res.status(403).json({ 
    message: 'Access denied. Only Project Managers can view alert records.' 
  });
}
```

### Employee Privacy
- Employees do NOT see alert records
- Employees do NOT know the system tracks their alerts
- Only PM has visibility into alert history
- Confidential dashboard clearly marked: "Project Manager Access Only"

## Configuration

### Environment Variables
```env
# Email Configuration
EMAIL_USER=your-gmail@gmail.com
GMAIL_APP_PASSWORD=your-app-password

# Database
MONGO_URI=your-mongodb-connection-string

# Google Sheets
GOOGLE_SPREADSHEET_ID=your-spreadsheet-id
```

### Customize Alert Schedule
Edit `src/schedulers/alertScheduler.js`:
```javascript
// Change times or add more schedules
cron.schedule('0 9 * * *', analyzeAndSendAlerts, {
  timezone: "Asia/Kolkata"  // Change timezone
});
```

### Customize Severity Thresholds
Edit `src/services/ticketAnalysisService.js`:
```javascript
function calculateSeverity(ticketData) {
  const { pending, late, completed, totalTasks } = ticketData;
  
  // Adjust these thresholds as needed
  if (totalTasks > 0 && completed === 0) return 'Critical';
  if (late > 5) return 'Critical';
  if (late > 2 || pending > 5) return 'High';
  if (late > 0 || pending > 2) return 'Medium';
  return 'Low';
}
```

## Usage Guide

### For Project Managers

#### 1. **Access Alert Records Dashboard**
- Login as Project Manager
- Navigate to "Alert Records" tab
- View statistics and alert history

#### 2. **Trigger Manual Analysis**
- Click "🚀 Trigger Alert Analysis" button
- System analyzes all employee tickets
- Sends alerts to defaulters only
- Shows results summary

#### 3. **View Employee Alert History**
- Click "View Details" on any employee
- See complete alert history
- View incomplete fields and issues
- Export to PDF if needed

#### 4. **Manage Alerts**
- Mark alerts as "Resolved" when employee completes tasks
- Escalate alerts if employee continues to defaulter
- Add notes for tracking purposes

#### 5. **Export Reports**
- Click "📄 Export PDF" for any employee
- Get comprehensive alert history report
- Use for performance reviews or documentation

### For System Administrators

#### 1. **Enable Automated Alerts**
The scheduler starts automatically when server starts.

#### 2. **Monitor Alert Sending**
Check server logs:
```bash
✅ Alert Notification service initialized
🕐 Initializing Alert Notification Scheduler...
⏰ [Scheduled] Running morning alert analysis at 9:00 AM
✅ Alert sent to john@example.com - High severity
```

#### 3. **Adjust Alert Frequency**
Edit cooldown period in `ticketAnalysisService.js`:
```javascript
const hoursSinceLastAlert = (Date.now() - existingAlert.lastAlertSentAt) / (1000 * 60 * 60);

if (hoursSinceLastAlert < 24) {  // Change this value
  return { shouldSend: false };
}
```

## Troubleshooting

### Alerts Not Sending
1. Check email credentials in `.env`
2. Verify SMTP configuration
3. Check server logs for errors
4. Ensure 24-hour cooldown hasn't prevented sending

### PDF Export Not Working
1. Ensure `pdfkit` is installed: `npm install pdfkit`
2. Check browser console for download errors
3. Verify PM authentication token

### Dashboard Not Accessible
1. Ensure logged in as Project Manager
2. Check authentication token is valid
3. Verify API base URL configuration

### No Defaulters Found
This is good! It means all employees are on track.
- System only alerts employees with actual issues
- Check Google Sheets data is being fetched correctly

## Best Practices

1. **Review Alert Records Weekly**
   - Identify patterns in defaulting employees
   - Provide additional support to repeat offenders

2. **Don't Over-Alert**
   - Current 24-hour cooldown is recommended
   - Too frequent alerts become counterproductive

3. **Export Records for Reviews**
   - Use PDF exports during performance reviews
   - Keep documentation of employee progress

4. **Update Alert Status**
   - Mark resolved alerts as "Resolved"
   - Track escalations appropriately

5. **Monitor Severity Trends**
   - High critical alerts may indicate system issues
   - Consider adjusting workloads if many high-severity alerts

## Testing

### Manual Test
```bash
# Trigger alert analysis manually
curl -X POST http://localhost:5001/api/alerts/trigger \
  -H "Authorization: Bearer YOUR_PM_TOKEN"
```

### Check Alert Records
```bash
# Get all alerts
curl http://localhost:5001/api/alerts \
  -H "Authorization: Bearer YOUR_PM_TOKEN"
```

## Future Enhancements

Potential improvements:
- SMS notifications for critical alerts
- WhatsApp integration
- Slack/Teams notifications
- Machine learning for severity prediction
- Predictive analytics for defaulter patterns
- Real-time dashboard updates
- Mobile app for PM

## Support

For issues or questions:
1. Check server logs first
2. Review API responses for error messages
3. Verify configuration settings
4. Test with manual trigger before troubleshooting automation

---

**Remember:** This system is designed to help employees stay on track, not to punish them. Use it constructively to improve team performance and support those who need assistance.
