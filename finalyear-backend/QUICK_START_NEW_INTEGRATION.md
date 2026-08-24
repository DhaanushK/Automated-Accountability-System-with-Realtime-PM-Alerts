# Quick Start: New Ticket-Based Google Sheets Integration

## ✅ Integration Complete!

Your project now uses the new ticket-based Google Sheets structure with 119 tickets across 6 team members.

## 📊 Key Metrics
- **Total Tickets**: 119
- **Team Members**: 6 (Winnish, Vuppu, Sam, Kiran, Praveen, Kanishkka)
- **Completion Rate**: 80%
- **SLA Compliance**: 60%
- **Average Urgency Score**: 51

## 🚀 Quick Test Commands

### 1. Test the New Integration
```bash
cd finalyear-backend
node test-ticket-service.js
```

### 2. Check Spreadsheet Structure  
```bash
node check-new-sheets.js
```

### 3. Run Example Use Cases
```bash
node -e "import('./examples-ticket-service.js').then(m => m.runAllExamples())"
```

## 📡 API Endpoints Updated

### Get All Team Metrics
```http
GET /api/metrics/all
Authorization: Bearer <token>
```

**Response includes:**
- `totalTickets` - Total number of tickets
- `aggregatedKPIs` - Team-wide KPIs
- `individualKPIs` - Per-member KPIs
- `teamMembers` - List of team member names
- `userMetrics` - Tickets grouped by member
- `allMetrics` - All tickets (flattened)

### Send Team Performance Report
```http
POST /api/project-manager/send-team-report
Authorization: Bearer <token>
Content-Type: application/json

{
  "reportPeriod": "This Week"
}
```

## 💻 Code Usage Examples

### Basic Usage
```javascript
import { getAllTeamTicketData } from './src/services/ticketSheetsService.js';

// Get all team data
const teamData = await getAllTeamTicketData(process.env.GOOGLE_SPREADSHEET_ID);

console.log(`Total Tickets: ${teamData.totalTickets}`);
console.log(`Completion Rate: ${teamData.aggregatedKPIs.completionRate}%`);
```

### Get Specific Member Data
```javascript
import { getMemberTicketData } from './src/services/ticketSheetsService.js';

const memberData = await getMemberTicketData(
  process.env.GOOGLE_SPREADSHEET_ID,
  'Winnish Allwin G J'
);

console.log(`Tickets: ${memberData.tickets.length}`);
console.log(`SLA Compliance: ${memberData.kpis.slaComplianceRate}%`);
```

### Force Refresh Cache
```javascript
// Force refresh (bypass 5-minute cache)
const teamData = await getAllTeamTicketData(
  process.env.GOOGLE_SPREADSHEET_ID,
  true  // forceRefresh = true
);
```

## 📋 Available KPIs

### Aggregated KPIs (Team-wide)
- `totalTickets` - Total tickets across all members
- `completedTickets` - Total completed
- `pendingTickets` - Total pending
- `reopenedTickets` - Total reopened
- `escalatedTickets` - Total escalated
- `slaBreaches` - Total SLA breaches
- `carriedForward` - Total carried forward
- `completionRate` - Completion percentage
- `slaComplianceRate` - SLA compliance percentage
- `avgUrgencyScore` - Average urgency score
- `severityCounts` - Breakdown by severity (Critical/High/Medium/Low)
- `statusCounts` - Breakdown by status (Open/In Progress/Closed/etc.)

### Individual KPIs (Per Member)
Same metrics as aggregated, calculated per team member.

## 🔧 Configuration

### Environment Variables
Verify these are set in `.env`:
```env
GOOGLE_SPREADSHEET_ID=1KDj8ixj9oF5jSFEh-KXakLgJXjTwkgXn8uiHdxajaOc
GOOGLE_SERVICE_ACCOUNT_EMAIL=team-metrics-service@civic-shell-471423-u1.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
```

## 📁 New Files Created

1. **ticketSheetsService.js** - Main service for reading ticket data
2. **test-ticket-service.js** - Comprehensive test script
3. **check-new-sheets.js** - Inspect spreadsheet structure
4. **examples-ticket-service.js** - 8 usage examples
5. **NEW_SHEETS_INTEGRATION.md** - Detailed implementation docs

## 🎯 Next Steps

1. **Test the API**: Start your server and test `/api/metrics/all`
2. **Update Frontend**: Display new KPIs (severity, SLA compliance, urgency)
3. **Verify Reports**: Test email reports with new data
4. **Monitor Performance**: Check cache effectiveness with logging

## 🔍 Troubleshooting

### If data doesn't load:
```bash
# 1. Test connection
node check-new-sheets.js

# 2. Test service
node test-ticket-service.js

# 3. Check logs
tail -f logs/server.log
```

### If cache issues:
```javascript
import { clearCache } from './src/services/ticketSheetsService.js';
clearCache(); // Clear cache manually
```

### If service account access denied:
1. Go to Google Sheets
2. Click "Share"
3. Add: `team-metrics-service@civic-shell-471423-u1.iam.gserviceaccount.com`
4. Set permission to "Editor"

## 📞 Support

- Documentation: `NEW_SHEETS_INTEGRATION.md`
- Examples: `examples-ticket-service.js`
- Test Scripts: `test-ticket-service.js`, `check-new-sheets.js`

## ✨ What's Different?

### Old Structure
- Single sheet with user rows
- Columns: Date, Name, Email, Tasks, Completed, Pending, Late, Hours, Notes

### New Structure  
- Multiple sheets (one per team member)
- Columns: Ticket No, Created Date, Severity, SLA Hours, SLA Deadline, Status, etc.
- Rich ticket metadata (severity, urgency, SLA tracking)
- Better analytics capabilities

---

**Integration Date**: January 16, 2026
**Status**: ✅ Complete and Tested
**Test Results**: 119 tickets successfully loaded, all KPIs calculating correctly
