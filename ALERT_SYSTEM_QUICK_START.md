# 🚀 Alert System - Quick Start Guide

## 🎯 What This System Does

**Automatically identifies employees with incomplete tasks and sends them personalized alerts.** Perfect employees are NOT disturbed!

## ✨ Key Features

1. ✅ **Smart Detection** - Only alerts defaulters with actual issues
2. ✅ **Confidential Tracking** - PM-only alert records dashboard
3. ✅ **Automated** - Runs daily at 9 AM, 5 PM, and Monday mornings
4. ✅ **PDF Export** - Export alert history for any employee
5. ✅ **No Spam** - 24-hour cooldown between alerts

## 🏃 Quick Start (5 Minutes)

### Step 1: Verify Installation
```bash
cd finalyear-backend
npm install  # Installs all dependencies including pdfkit
```

### Step 2: Configure Environment
Ensure these are in your `.env` file:
```env
EMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-app-password
GOOGLE_SPREADSHEET_ID=your-spreadsheet-id
MONGO_URI=your-mongodb-uri
```

### Step 3: Start Backend Server
```bash
npm run dev
```

You should see:
```
✅ SMTP Email service initialized
✅ Alert Notification service initialized
🕐 Initializing Alert Notification Scheduler...
✅ Alert Notification Scheduler initialized successfully
```

### Step 4: Access Dashboard
1. Start frontend: `cd finalyear-frontend && npm run dev`
2. Login as **Project Manager**
3. Navigate to **"Alert Records"** tab

### Step 5: Test Manual Alert
Click **"🚀 Trigger Alert Analysis"** button in the dashboard.

The system will:
- ✅ Analyze all employee ticket sheets
- ✅ Identify defaulters
- ✅ Send alerts only to employees with issues
- ✅ Record everything in the database

## 📊 What Gets Checked?

The system analyzes each employee's ticket sheet for:

| Check | Alert Trigger |
|-------|---------------|
| Missing Date/Name/Email | ✅ Yes |
| Pending Tasks > 0 | ✅ Yes |
| SLA Breaches > 0 | ✅ Yes (Higher severity) |
| No Tasks Completed | ✅ Yes (Critical) |
| Missing Remarks (when delayed) | ✅ Yes |
| High Reopened Tickets (> 2) | ✅ Yes |

## 🎨 Severity Levels

- 🟢 **Low** - Minor issues (1-2 pending tasks)
- 🟡 **Medium** - Some delays (SLA breaches or 3-5 pending)
- 🟠 **High** - Multiple issues (>2 SLA breaches, >5 pending)
- 🔴 **Critical** - No progress or severe delays

## 📱 Alert Email Example

Employees receive:
```
Subject: ⚠️ [High] Alert: Incomplete Tasks Require Attention

Hello John Doe,

This is an automated alert regarding incomplete tasks in your ticket sheet.

Statistics:
- Total Tasks: 10
- Completed: 5
- Pending: 5  ⚠️
- SLA Breaches: 2  ⚠️

Issues Identified:
❌ Pending Tasks (5)
❌ SLA Breaches (2)
❌ Remarks (Missing explanation for delays)

Action Required:
- Complete all pending tasks as soon as possible
- Update your ticket sheet with accurate information
- Add remarks/notes explaining any delays
```

## 🎯 PM Dashboard Features

### 1. Statistics Summary
- Total Alerts
- Active Alerts
- Resolved Alerts
- Escalated Alerts
- Severity Breakdown

### 2. Top Defaulters Table
See employees with most alerts at a glance.

### 3. Filter & Search
- Filter by Status (Active/Resolved/Escalated)
- Filter by Severity (Low/Medium/High/Critical)
- Search by Employee Email

### 4. Individual Employee View
Click "View Details" to see:
- Complete alert history
- All incomplete fields
- Alert timestamps
- Notes and status

### 5. PDF Export
Export any employee's alert records to PDF:
- Professional formatted report
- Complete alert history
- Statistics summary
- Confidential watermark

## ⏰ Automated Schedule

Alerts run automatically:
- **9:00 AM** - Morning check (working hours start)
- **5:00 PM** - Evening reminder (end of day)
- **Monday 10:00 AM** - Weekly reminder

**Timezone:** Asia/Kolkata (configurable)

## 🔒 Security & Privacy

### PM-Only Access ✅
- Only Project Managers can view alert records
- API endpoints verify PM role
- 403 Forbidden for other roles

### Employee Privacy ✅
- Employees do NOT see alert records
- Employees do NOT know alerts are tracked
- Only receive individual alert emails

### Confidential Database ✅
- Separate AlertRecord collection
- Not accessible to team leads or members
- Clearly marked as confidential

## 🛠️ Common Tasks

### Manually Trigger Alert Analysis
**Dashboard:** Click "🚀 Trigger Alert Analysis"

**API:**
```bash
curl -X POST http://localhost:5001/api/alerts/trigger \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### View Employee Alert History
**Dashboard:** Click "View Details" on employee

**API:**
```bash
curl http://localhost:5001/api/alerts/employee/john@example.com \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Export to PDF
**Dashboard:** Click "📄 Export PDF"

**API:**
```bash
curl http://localhost:5001/api/alerts/employee/john@example.com/export \
  -H "Authorization: Bearer YOUR_TOKEN" \
  --output alert_records.pdf
```

### Mark Alert as Resolved
**Dashboard:** Click "✅ Resolve" button

**API:**
```bash
curl -X PUT http://localhost:5001/api/alerts/ALERT_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "Resolved", "notes": "Tasks completed"}'
```

### Escalate Alert
**Dashboard:** Click "⚠️ Escalate" button

**API:**
```bash
curl -X PUT http://localhost:5001/api/alerts/ALERT_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "Escalated"}'
```

## 📈 Monitoring

### Check Server Logs
```bash
# Alert Analysis Started
🚀 Starting automated alert analysis...
🔍 Analyzing tickets for defaulters...
✅ Analysis complete. Found 3 defaulter(s)

# Alert Sent
✅ Alert sent to john@example.com - High severity
📝 Alert record saved: ALT-1234567890-1

# Scheduled Jobs
⏰ [Scheduled] Running morning alert analysis at 9:00 AM
✅ [Scheduled] Morning alert analysis completed
```

### Database Queries
```javascript
// Check total alerts
db.alertrecords.countDocuments()

// Check active alerts
db.alertrecords.find({ status: 'Active' }).count()

// Check alerts for specific employee
db.alertrecords.find({ employeeEmail: 'john@example.com' })

// Check recent alerts
db.alertrecords.find().sort({ createdAt: -1 }).limit(10)
```

## ⚙️ Configuration

### Change Alert Schedule
Edit `src/schedulers/alertScheduler.js`:
```javascript
// Change time (currently 9 AM)
cron.schedule('0 9 * * *', analyzeAndSendAlerts)
//            │ │ │ │ │
//            │ │ │ │ └─── Day of week (0-7)
//            │ │ │ └───── Month (1-12)
//            │ │ └─────── Day of month (1-31)
//            │ └───────── Hour (0-23)
//            └─────────── Minute (0-59)
```

### Change Cooldown Period
Edit `src/services/ticketAnalysisService.js`:
```javascript
// Current: 24 hours
const hoursSinceLastAlert = (Date.now() - existingAlert.lastAlertSentAt) / (1000 * 60 * 60);

if (hoursSinceLastAlert < 24) {  // Change to 12 for 12 hours, 48 for 2 days, etc.
  return { shouldSend: false };
}
```

### Adjust Severity Thresholds
Edit `src/services/ticketAnalysisService.js`:
```javascript
export function calculateSeverity(ticketData) {
  const { pending, late } = ticketData;
  
  if (late > 5) return 'Critical';        // Adjust threshold
  if (late > 2 || pending > 5) return 'High';  // Adjust threshold
  if (late > 0 || pending > 2) return 'Medium'; // Adjust threshold
  return 'Low';
}
```

## 🐛 Troubleshooting

### Issue: Alerts Not Sending
**Solution:**
1. Check `.env` has correct email credentials
2. Verify SMTP connection: `node test-smtp.js`
3. Check 24-hour cooldown hasn't prevented sending
4. Review server logs for errors

### Issue: PDF Export Failing
**Solution:**
1. Ensure `pdfkit` installed: `npm install pdfkit`
2. Check browser console for errors
3. Verify PM token is valid

### Issue: Dashboard Shows "Access Denied"
**Solution:**
1. Ensure logged in as **Project Manager** (not Team Lead or Member)
2. Check localStorage has valid token
3. Verify API_URL is correct

### Issue: No Defaulters Found
**This is good!** It means all employees are on track.

To verify system is working:
1. Check server logs show analysis ran
2. Manually review Google Sheets data
3. Try with test data that has incomplete fields

## 📚 Full Documentation

For complete details, see: `ALERT_NOTIFICATION_SYSTEM_GUIDE.md`

## ✅ Success Checklist

- [ ] Backend server running
- [ ] Alert scheduler initialized
- [ ] Frontend accessible
- [ ] Logged in as Project Manager
- [ ] "Alert Records" tab visible in PM dashboard
- [ ] Can trigger manual alert analysis
- [ ] Statistics showing on dashboard
- [ ] Can view employee details
- [ ] PDF export working

## 🎉 You're Ready!

The alert notification system is now fully operational. It will:
- ✅ Automatically analyze tickets daily
- ✅ Send alerts only to defaulters
- ✅ Track everything in PM dashboard
- ✅ Keep perfect employees undisturbed

**Remember:** Use this system to help employees improve, not to punish them!

---

## 📞 Need Help?

If you encounter issues:
1. Check server logs first
2. Review API error messages
3. Verify configuration
4. Test manual trigger before troubleshooting automation

**Happy Monitoring! 🎊**
