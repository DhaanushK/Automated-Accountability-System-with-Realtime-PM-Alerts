# Support Team Performance Dashboard - Implementation Guide

## 📊 Overview

This guide explains how to integrate the newly created performance visualization components into your existing application.

## 🎯 Components Created

### 1. **PerformanceKPICards** - Key Performance Indicators
- Location: `finalyear-frontend/src/components/performance/PerformanceKPICards.jsx`
- Purpose: Display 6 key metrics in card format
- Props:
  ```javascript
  metrics: {
    totalTickets: number,
    resolvedTickets: number,
    slaCompliance: number,
    avgResolutionTime: number,
    criticalTickets: number,
    pendingTickets: number
  }
  ```

### 2. **AgentPerformanceChart** - Bar Chart Comparison
- Location: `finalyear-frontend/src/components/performance/AgentPerformanceChart.jsx`
- Purpose: Visual comparison of agent performance with sortable metrics
- Props:
  ```javascript
  data: Array of {
    name: string,
    ticketsResolved: number,
    avgResolutionTime: number,
    slaCompliance: number,
    criticalTickets: number
  }
  ```

### 3. **SLAComplianceGauge** - Gauge Chart
- Location: `finalyear-frontend/src/components/performance/SLAComplianceGauge.jsx`
- Purpose: Semi-circular gauge showing SLA compliance rate
- Props:
  ```javascript
  {
    compliance: number,
    totalTickets: number,
    slaMet: number,
    slaBreached: number
  }
  ```

### 4. **SeverityDistribution** - Pie Chart
- Location: `finalyear-frontend/src/components/performance/SeverityDistribution.jsx`
- Purpose: Ticket distribution by severity level
- Props:
  ```javascript
  data: Array of {
    name: 'Critical' | 'High' | 'Medium' | 'Low',
    value: number
  }
  ```

### 5. **ResolutionTimeTrend** - Area/Line Chart
- Location: `finalyear-frontend/src/components/performance/ResolutionTimeTrend.jsx`
- Purpose: Time-series trend of resolution times with moving average
- Props:
  ```javascript
  data: Array of {
    date: string,
    avgResolutionTime: number,
    movingAverage: number
  },
  showMovingAverage: boolean
  ```

### 6. **AgentPerformanceTable** - Detailed Data Table
- Location: `finalyear-frontend/src/components/performance/AgentPerformanceTable.jsx`
- Purpose: Sortable, searchable table with all agent metrics
- Props:
  ```javascript
  data: Array of {
    name: string,
    rank: number,
    ticketsResolved: number,
    avgResolutionTime: number,
    slaCompliance: number,
    criticalTickets: number,
    carryForward: number,
    performanceScore: number
  }
  ```

### 7. **TicketStatusBoard** - Status Overview
- Location: `finalyear-frontend/src/components/performance/TicketStatusBoard.jsx`
- Purpose: Kanban-style status board showing ticket distribution
- Props:
  ```javascript
  statusData: {
    open: number,
    inProgress: number,
    resolved: number,
    pending: number
  }
  ```

### 8. **SupportPerformanceDashboard** - Main Dashboard Page
- Location: `finalyear-frontend/src/pages/SupportPerformanceDashboard.jsx`
- Purpose: Complete dashboard layout combining all components
- Features: Date range filtering, data refresh, export capability

## 🛠️ Backend Utilities

### Performance Calculations (`finalyear-backend/utils/performanceCalculations.js`)

Functions to process Google Sheets ticket data:

1. **calculateDashboardMetrics(tickets)** - Overall KPI metrics
2. **calculateAgentPerformance(tickets)** - Individual agent analysis
3. **calculateSeverityDistribution(tickets)** - Severity breakdown
4. **calculateStatusDistribution(tickets)** - Status counts
5. **calculateResolutionTimeTrend(tickets, days)** - Time-series data
6. **calculateSLAData(tickets)** - SLA compliance metrics

## 🚀 Integration Steps

### Step 1: Create API Endpoint

Add to `finalyear-backend/src/routes/performanceRoutes.js`:

```javascript
import express from 'express';
import { 
  calculateDashboardMetrics,
  calculateAgentPerformance,
  calculateSeverityDistribution,
  calculateStatusDistribution,
  calculateResolutionTimeTrend,
  calculateSLAData
} from '../utils/performanceCalculations.js';
import { getTicketsFromSheets } from '../services/googleSheetsService.js';

const router = express.Router();

router.get('/dashboard', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    
    // Fetch tickets from Google Sheets
    const tickets = await getTicketsFromSheets();
    
    // Filter by date range if needed
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
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

export default router;
```

### Step 2: Add Google Sheets Service

Create `finalyear-backend/src/services/googleSheetsService.js`:

```javascript
import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';

export async function getTicketsFromSheets() {
  const credPath = path.join(process.cwd(), 'src/config/credentials.json');
  const credentials = JSON.parse(await fs.readFile(credPath, 'utf8'));

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Sheet1!A2:L1000', // Adjust range based on your sheet
  });

  const rows = response.data.values || [];
  
  // Convert rows to objects
  return rows.map(row => ({
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
}
```

### Step 3: Register Routes

In `finalyear-backend/src/server.js`:

```javascript
import performanceRoutes from './routes/performanceRoutes.js';

// ... other code ...

app.use('/api/performance', performanceRoutes);
```

### Step 4: Add Route to Frontend

In `finalyear-frontend/src/App.jsx`:

```javascript
import SupportPerformanceDashboard from './pages/SupportPerformanceDashboard';

// Add route
<Route path="/performance-dashboard" element={<SupportPerformanceDashboard />} />
```

### Step 5: Update Navigation

Add dashboard link to your navigation menu:

```javascript
<Link to="/performance-dashboard">
  📊 Performance Dashboard
</Link>
```

## 📋 Data Structure Requirements

Your Google Sheets must have these columns:

| Column Name       | Type   | Example                  |
|-------------------|--------|--------------------------|
| Ticket_No         | String | "TKT-2024-001"           |
| Created_Date      | Date   | "2024-01-15"             |
| Severity          | String | "Critical/High/Medium/Low"|
| SLA_Hours         | Number | 24                       |
| SLA_Deadline      | Date   | "2024-01-16 10:00"       |
| Status            | String | "Open/In Progress/Resolved"|
| Assigned_Level    | String | "L1/L2/L3"               |
| Assigned_To       | String | "John Doe"               |
| Resolution_Date   | Date   | "2024-01-16 08:30"       |
| Carry_Forward     | String | "Yes/No"                 |
| Days_Forwarded    | Number | 2                        |
| Remarks           | String | "Escalated to L2"        |

## 🎨 Customization Options

### Change Colors

Edit the CSS files to match your brand:

```css
/* Primary color */
#3b82f6 → Your primary color

/* Success color */
#10b981 → Your success color

/* Warning color */
#f59e0b → Your warning color

/* Danger color */
#ef4444 → Your danger color
```

### Modify Calculations

Edit `performanceCalculations.js` to adjust:
- Performance score weights
- SLA thresholds
- Moving average periods
- Date ranges

### Add New Metrics

1. Add calculation function to `performanceCalculations.js`
2. Create new component in `components/performance/`
3. Import and use in `SupportPerformanceDashboard.jsx`

## 📊 Usage Examples

### Basic Usage

```javascript
import SupportPerformanceDashboard from './pages/SupportPerformanceDashboard';

function App() {
  return <SupportPerformanceDashboard />;
}
```

### Individual Component Usage

```javascript
import PerformanceKPICards from './components/performance/PerformanceKPICards';

function MyCustomDashboard() {
  const metrics = {
    totalTickets: 100,
    resolvedTickets: 85,
    slaCompliance: 92.5,
    avgResolutionTime: 18.5,
    criticalTickets: 12,
    pendingTickets: 15
  };

  return <PerformanceKPICards metrics={metrics} />;
}
```

## 🐛 Troubleshooting

### Issue: Charts not rendering
**Solution**: Ensure Recharts is installed:
```bash
npm install recharts
```

### Issue: Data not loading
**Solution**: Check:
1. Google Sheets API credentials
2. Spreadsheet sharing permissions
3. Backend API endpoint is running
4. CORS configuration

### Issue: Performance slow
**Solution**:
1. Add data caching on backend
2. Implement pagination for large datasets
3. Use React.memo() for components
4. Debounce search/filter operations

## 🔒 Security Considerations

1. **API Authentication**: Add authentication middleware
2. **Rate Limiting**: Implement API rate limits
3. **Data Validation**: Validate all input data
4. **CORS**: Configure proper CORS policies
5. **Credentials**: Never commit credentials to git

## 📈 Performance Optimization

1. **Memoization**: Use React.memo for expensive components
2. **Lazy Loading**: Code-split dashboard components
3. **Virtual Scrolling**: For large data tables
4. **Caching**: Cache API responses
5. **Debouncing**: Debounce search and filters

## 🚀 Deployment

### Environment Variables

```env
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id
GOOGLE_SERVICE_ACCOUNT_EMAIL=your_service_account@project.iam.gserviceaccount.com
PORT=5000
NODE_ENV=production
```

### Build Commands

```bash
# Frontend
cd finalyear-frontend
npm run build

# Backend
cd finalyear-backend
npm start
```

## 📚 Additional Resources

- [Recharts Documentation](https://recharts.org/)
- [Google Sheets API](https://developers.google.com/sheets/api)
- [React Performance](https://react.dev/learn/render-and-commit)

## 🎉 Next Steps

1. Test all components with real data
2. Add export functionality (PDF/Excel)
3. Implement real-time updates (WebSockets)
4. Add email alerts for threshold breaches
5. Create mobile-responsive views
6. Add dark mode support
7. Implement user preferences saving

---

**Created**: January 2026
**Version**: 1.0.0
**Author**: Performance Analytics Team
