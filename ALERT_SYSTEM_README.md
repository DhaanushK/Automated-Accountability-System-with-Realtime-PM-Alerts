# 🔔 Alert Notification System - README

## 📖 Overview

**Enterprise-grade notification system that automatically monitors employee ticket sheets and sends targeted alerts only to defaulters with incomplete tasks.**

Perfect employees are **never disturbed**. Only those who need help receive notifications.

## 🎯 Key Features

| Feature | Description | Status |
|---------|-------------|--------|
| **Smart Detection** | Analyzes individual ticket sheets for incomplete fields | ✅ Ready |
| **Targeted Alerts** | Only sends to employees with actual issues | ✅ Ready |
| **Alert Records** | Confidential database tracking all alerts | ✅ Ready |
| **PM Dashboard** | Complete overview with statistics & filters | ✅ Ready |
| **PDF Export** | Export alert history for any employee | ✅ Ready |
| **Automation** | Daily scheduled analysis (9 AM, 5 PM, Mon 10 AM) | ✅ Ready |
| **Security** | PM-only access, employees cannot see records | ✅ Ready |
| **Smart Cooldown** | 24-hour gap prevents spam | ✅ Ready |
| **Escalation** | Auto-escalate after 3 alerts | ✅ Ready |

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd finalyear-backend
npm install
```

### 2. Start Server
```bash
npm run dev
```

Look for:
```
✅ Alert Notification service initialized
✅ Alert Notification Scheduler initialized successfully
```

### 3. Access Dashboard
- Login as **Project Manager**
- Click **"Alert Records"** tab
- Click **"🚀 Trigger Alert Analysis"**

## 📁 File Structure

```
finalyear-backend/
├── src/
│   ├── models/
│   │   └── AlertRecord.js              # Database schema
│   ├── services/
│   │   ├── ticketAnalysisService.js    # Analyzes tickets
│   │   └── alertNotificationService.js # Sends alerts
│   ├── controllers/
│   │   └── alertController.js          # API handlers
│   ├── routes/
│   │   └── alertRoutes.js              # API routes
│   └── schedulers/
│       └── alertScheduler.js           # Automated scheduling
└── test-alert-system.js                # Test script

finalyear-frontend/
└── src/
    └── components/
        ├── AlertRecords.jsx            # PM dashboard
        └── AlertRecords.css            # Styling

Documentation/
├── ALERT_NOTIFICATION_SYSTEM_GUIDE.md  # Complete guide
├── ALERT_SYSTEM_QUICK_START.md         # Quick start
└── ALERT_SYSTEM_IMPLEMENTATION_SUMMARY.md # Implementation details
```

## 📊 What Gets Analyzed?

The system checks each employee's ticket sheet for:

| Issue | Alert | Severity |
|-------|-------|----------|
| Missing data (Date/Name/Email) | ✅ Yes | Low-Medium |
| Pending tasks > 0 | ✅ Yes | Medium |
| SLA breaches > 0 | ✅ Yes | Medium-High |
| No tasks completed | ✅ Yes | Critical |
| Missing remarks (when delayed) | ✅ Yes | Medium |
| High reopened tickets (> 2) | ✅ Yes | High |

## 🎨 Alert Email Example

```
Subject: ⚠️ [High] Alert: Incomplete Tasks Require Attention

Hello John Doe,

This is an automated alert regarding incomplete tasks.

📊 Statistics:
- Total Tasks: 10
- Completed: 5
- Pending: 5
- SLA Breaches: 2

⚠️ Issues Identified:
❌ Pending Tasks (5)
❌ SLA Breaches (2)
❌ Remarks (Missing explanation for delays)

🔧 Action Required:
- Complete all pending tasks
- Update your ticket sheet
- Add remarks explaining delays
- Contact Team Lead if you need help
```

## 🔌 API Endpoints

All require PM authentication.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/alerts/trigger` | POST | Trigger manual analysis |
| `/api/alerts` | GET | Get all alerts (with filters) |
| `/api/alerts/statistics` | GET | Get statistics summary |
| `/api/alerts/employee/:email` | GET | Get employee alerts |
| `/api/alerts/employee/:email/export` | GET | Export to PDF |
| `/api/alerts/:alertId` | PUT | Update alert status |
| `/api/alerts/:alertId` | DELETE | Delete alert |

## ⏰ Automated Schedule

```javascript
Daily at 9:00 AM  → Morning check
Daily at 5:00 PM  → Evening reminder
Monday at 10:00 AM → Weekly reminder
```

**Timezone:** Asia/Kolkata (configurable in `alertScheduler.js`)

## 🔒 Security

### PM-Only Access
```javascript
// Every endpoint checks
if (req.user.role !== 'project_manager') {
  return res.status(403).json({ message: 'Access denied' });
}
```

### Employee Privacy
- ❌ Cannot view alert records
- ❌ Cannot see tracking system
- ✅ Only receive individual alerts

## 📈 Dashboard Features

### Statistics Cards
- Total Alerts
- Active Alerts
- Resolved Alerts
- Escalated Alerts

### Severity Breakdown
- Critical (Red)
- High (Orange)
- Medium (Yellow)
- Low (Green)

### Top Defaulters Table
See employees with most alerts

### Filters
- Status (Active/Resolved/Escalated)
- Severity (Low/Medium/High/Critical)
- Employee Email

### Individual Employee View
- Complete alert history
- All incomplete fields
- Alert timestamps
- Export to PDF

## 🧪 Testing

```bash
# Run test script
cd finalyear-backend
node test-alert-system.js
```

Expected output:
```
✅ Database connected
✅ Alert service initialized
✅ Found X defaulter(s)
✅ All tests completed successfully!
```

## ⚙️ Configuration

### Change Schedule
Edit `src/schedulers/alertScheduler.js`:
```javascript
// Change from 9 AM to 8 AM
cron.schedule('0 8 * * *', analyzeAndSendAlerts)
```

### Change Cooldown
Edit `src/services/ticketAnalysisService.js`:
```javascript
// Change from 24 hours to 12 hours
if (hoursSinceLastAlert < 12) { ... }
```

### Change Severity Thresholds
Edit `src/services/ticketAnalysisService.js`:
```javascript
function calculateSeverity(ticketData) {
  // Adjust these values
  if (late > 5) return 'Critical';
  if (late > 2 || pending > 5) return 'High';
  // ...
}
```

## 🐛 Troubleshooting

### Alerts Not Sending?
- ✅ Check `.env` has email credentials
- ✅ Verify 24-hour cooldown
- ✅ Check server logs

### PDF Export Failing?
- ✅ Ensure `pdfkit` installed
- ✅ Check PM authentication
- ✅ Verify browser allows downloads

### Dashboard Shows "Access Denied"?
- ✅ Login as **Project Manager** (not TL or TM)
- ✅ Check authentication token
- ✅ Verify API URL configuration

## 📚 Documentation

| File | Purpose |
|------|---------|
| `ALERT_NOTIFICATION_SYSTEM_GUIDE.md` | Complete technical documentation |
| `ALERT_SYSTEM_QUICK_START.md` | Quick start guide (5 minutes) |
| `ALERT_SYSTEM_IMPLEMENTATION_SUMMARY.md` | Implementation details |
| This README | Quick reference |

## ✅ Checklist

Before using the system, verify:

- [ ] Backend dependencies installed
- [ ] Backend server running
- [ ] Scheduler initialized (check logs)
- [ ] Frontend running
- [ ] Logged in as Project Manager
- [ ] "Alert Records" tab visible
- [ ] Can trigger manual analysis
- [ ] Statistics showing
- [ ] Can export PDF

## 🎉 Success!

If all checkpoints pass, your alert system is **fully operational**!

## 💡 Best Practices

1. **Review weekly** - Check alert statistics regularly
2. **Don't over-alert** - Keep 24-hour cooldown
3. **Use for support** - Help employees, don't punish
4. **Export for reviews** - Use PDF reports for documentation
5. **Track trends** - Monitor severity patterns

## 📞 Support

If you encounter issues:
1. Check server logs first
2. Review API error messages
3. Run test script: `node test-alert-system.js`
4. Check documentation files

## 🎓 Understanding the Flow

```
Google Sheets
    ↓
Ticket Analysis (checks each employee)
    ↓
Identify Defaulters (incomplete tasks)
    ↓
Calculate Severity (Low/Medium/High/Critical)
    ↓
Check Cooldown (24 hours since last alert)
    ↓
Send Email Alert (only to defaulters)
    ↓
Record in Database (Alert Records)
    ↓
PM Dashboard (view & manage)
```

## 🌟 Key Points

- ✅ **Smart System** - Only alerts those who need it
- ✅ **Automated** - Runs daily without manual intervention
- ✅ **Confidential** - PM-only visibility
- ✅ **Helpful** - Designed to support employees
- ✅ **Complete** - Full tracking and reporting

---

## 🚦 Status: READY FOR PRODUCTION ✅

The system is fully implemented, tested, and documented. Ready to help your team stay on track!

**Happy Monitoring! 🎊**
