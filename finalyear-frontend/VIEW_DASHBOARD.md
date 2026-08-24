# 🚀 View Your New Performance Dashboard

## Quick Start - See It Now!

### Option 1: Direct URL Access (Fastest)

1. **Start your frontend** (if not running):
   ```bash
   cd finalyear-frontend
   npm run dev
   ```

2. **Open in browser**:
   ```
   http://localhost:5173/support-performance
   ```

That's it! You'll see the dashboard with mock data.

---

## What You'll See

### Dashboard Layout:
```
┌────────────────────────────────────────────┐
│ 📊 Support Team Performance Dashboard     │
│ [Last 30 Days ▼] [🔄 Refresh] [📊 Export] │
├────────────────────────────────────────────┤
│ 🎫 Total: 197  ✅ Resolved: 168           │
│ 🎯 SLA: 85.3%  ⏱️ Avg Time: 22.5h         │
│ 🔴 Critical: 23 ⏳ Pending: 29            │
├────────────────────────────────────────────┤
│ [Ticket Status Board] [SLA Gauge Chart]   │
├────────────────────────────────────────────┤
│ [Agent Performance Bar Chart]              │
├────────────────────────────────────────────┤
│ [Severity Pie Chart] [Time Trend Line]    │
├────────────────────────────────────────────┤
│ [Detailed Agent Performance Table]         │
└────────────────────────────────────────────┘
```

### Interactive Features:
- ✅ **Sort bar chart** by different metrics
- ✅ **Search agents** in the table
- ✅ **Change date range** (7/30/90/365 days)
- ✅ **Hover charts** for detailed tooltips
- ✅ **Click refresh** to reload data

---

## Using Real Data (Next Step)

Currently showing **mock data**. To connect to your Google Sheets:

### 1. Create Backend Route

Create: `finalyear-backend/src/routes/performanceRoutes.js`

```javascript
import express from 'express';
import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import {
  calculateDashboardMetrics,
  calculateAgentPerformance,
  calculateSeverityDistribution,
  calculateStatusDistribution,
  calculateResolutionTimeTrend,
  calculateSLAData
} from '../utils/performanceCalculations.js';

const router = express.Router();

router.get('/dashboard', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    // Load Google Sheets credentials
    const credPath = path.join(process.cwd(), 'src/config/credentials.json');
    const credentials = JSON.parse(await fs.readFile(credPath, 'utf8'));

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

    // Get ticket data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A2:L1000', // Adjust based on your sheet name
    });

    const rows = response.data.values || [];

    // Convert to ticket objects
    const tickets = rows.map(row => ({
      Ticket_No: row[0],
      Created_Date: row[1],
      Severity: row[2],
      SLA_Hours: row[3],
      SLA_Deadline: row[4],
      Status: row[5],
      Assigned_Level: row[6],
      Assigned_To: row[7],
      Resolution_Date: row[8],
      Carry_Forward: row[9],
      Days_Forwarded: row[10],
      Remarks: row[11]
    }));

    // Filter by date range
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const filteredTickets = tickets.filter(t =>
      new Date(t.Created_Date) >= cutoffDate
    );

    // Calculate all metrics
    const dashboardData = {
      kpiMetrics: calculateDashboardMetrics(filteredTickets),
      slaData: calculateSLAData(filteredTickets),
      statusData: calculateStatusDistribution(filteredTickets),
      severityData: calculateSeverityDistribution(filteredTickets),
      agentPerformance: calculateAgentPerformance(filteredTickets),
      trendData: calculateResolutionTimeTrend(filteredTickets, days)
    };

    res.json(dashboardData);
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
```

### 2. Register Route in Server

In `finalyear-backend/src/server.js`, add:

```javascript
import performanceRoutes from './routes/performanceRoutes.js';

// ... other code ...

app.use('/api/performance', performanceRoutes);
```

### 3. Update Frontend to Use Real API

In `SupportPerformanceDashboard.jsx`, the component will automatically call:
```javascript
/api/performance/dashboard?days=30
```

---

## File Locations

All files created:

### Frontend Components:
```
finalyear-frontend/src/
├── components/performance/
│   ├── PerformanceKPICards.jsx + .css
│   ├── AgentPerformanceChart.jsx + .css
│   ├── SLAComplianceGauge.jsx + .css
│   ├── SeverityDistribution.jsx + .css
│   ├── ResolutionTimeTrend.jsx + .css
│   ├── AgentPerformanceTable.jsx + .css
│   └── TicketStatusBoard.jsx + .css
└── pages/
    └── SupportPerformanceDashboard.jsx + .css
```

### Backend:
```
finalyear-backend/
└── utils/
    └── performanceCalculations.js
```

---

## Troubleshooting

### Can't see the page?
1. Check dev server is running: `npm run dev`
2. Navigate to: `http://localhost:5173/support-performance`
3. Check browser console (F12) for errors

### Charts not showing?
- Recharts should already be installed
- Check console for import errors
- Verify package.json has: `"recharts": "^3.2.0"`

### Want to add to navigation menu?
In your existing dashboard component, add a link:

```jsx
<Link to="/support-performance">
  📊 Performance Dashboard
</Link>
```

---

## Next Steps

1. ✅ View the dashboard now with mock data
2. 🔄 Connect to real Google Sheets data (see above)
3. 🎨 Customize colors/thresholds in CSS files
4. 📊 Add export functionality
5. 🔔 Add real-time alerts

---

**Need help?** Check [DASHBOARD_IMPLEMENTATION_GUIDE.md](../DASHBOARD_IMPLEMENTATION_GUIDE.md) for full integration details.
