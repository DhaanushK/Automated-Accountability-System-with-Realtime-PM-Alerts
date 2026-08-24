# Team Management Dashboard - Calculation Formulas & Methods

## 📊 Overview

This document explains **exactly how** every metric, visualization, and score in the Team Management Dashboard is calculated, including all formulas, data sources, and calculation methods.

---

## 🔍 Data Source & Extraction

### Raw Data Location
**Google Sheets**: `EmployeeTickets` Spreadsheet
- **Spreadsheet ID**: `1KDj8ixj9oF5jSFEh-KXakLgJXjTwkgXn8uiHdxajaOc`
- **Structure**: One sheet per team member
- **Columns** (A to M, 13 columns):
  1. **A**: Ticket Number
  2. **B**: Created Date
  3. **C**: Severity (Critical/High/Medium/Low)
  4. **D**: SLA Hours (numeric)
  5. **E**: SLA Deadline (date/time)
  6. **F**: Status (Open/In Progress/Closed/Reopened/Escalated to Level)
  7. **G**: Assigned Level
  8. **H**: Assigned To (team member name)
  9. **I**: Resolution Date
  10. **J**: Carry Forward (Yes/No)
  11. **K**: Days Forwarded (numeric)
  12. **L**: Remarks
  13. **M**: Urgency Score (0-100)

### Data Extraction Process
**File**: `finalyear-backend/src/services/ticketSheetsService.js`

```javascript
// Read each team member's sheet
const res = await sheets.spreadsheets.values.get({
  spreadsheetId: sheetId,
  range: `${memberName}!A2:M`, // Skip header row, get all data rows
});

// Parse each row into ticket object
const ticket = {
  ticketNo: row[0],
  createdDate: row[1],
  severity: row[2],
  slaHours: parseInt(row[3], 10) || 0,
  slaDeadline: row[4],
  status: row[5],
  assignedLevel: row[6],
  assignedTo: row[7] || memberName,
  resolutionDate: row[8],
  carryForward: row[9] || 'No',
  daysForwarded: parseInt(row[10], 10) || 0,
  remarks: row[11] || '',
  urgencyScore: parseInt(row[12], 10) || 0,
  memberName: memberName
};
```

---

## 📈 Backend Calculations (Server-Side)

### 1. Individual Member KPIs
**Function**: `calculateMemberKPIs(tickets)`
**Location**: `finalyear-backend/src/services/ticketSheetsService.js`

For each team member, the following metrics are calculated:

#### A. Total Tickets
```javascript
totalTickets = tickets.length
```
**Example**: If member has 20 rows in their sheet → totalTickets = 20

#### B. Completed Tickets
```javascript
completedTickets = 0
for each ticket:
  if (status === 'Closed' OR resolutionDate === 'Completed'):
    completedTickets++
```
**Example**: 16 tickets with status "Closed" → completedTickets = 16

#### C. Pending Tickets
```javascript
pendingTickets = 0
for each ticket:
  if (status === 'Open' OR status === 'In Progress'):
    pendingTickets++
```
**Example**: 3 Open + 1 In Progress → pendingTickets = 4

#### D. Reopened Tickets
```javascript
reopenedTickets = 0
for each ticket:
  if (status === 'Reopened'):
    reopenedTickets++
```

#### E. Escalated Tickets
```javascript
escalatedTickets = 0
for each ticket:
  if (status includes 'Escalated'):
    escalatedTickets++
```

#### F. SLA Breaches
```javascript
slaBreaches = 0
for each ticket:
  if (remarks includes 'SLA breached' OR daysForwarded > 0):
    slaBreaches++
```
**Example**: 8 tickets have "SLA breached" in remarks → slaBreaches = 8

#### G. Carried Forward
```javascript
carriedForward = 0
for each ticket:
  if (carryForward === 'Yes'):
    carriedForward++
```

#### H. Average Urgency Score
```javascript
totalUrgency = sum of all ticket.urgencyScore
avgUrgencyScore = round(totalUrgency / totalTickets)
```
**Example**: 
- Ticket 1: urgency = 60
- Ticket 2: urgency = 40
- Ticket 3: urgency = 50
- avgUrgencyScore = round((60+40+50)/3) = round(50) = 50

#### I. Severity Counts
```javascript
severityCounts = {
  Critical: 0,
  High: 0,
  Medium: 0,
  Low: 0
}

for each ticket:
  severity = ticket.severity.trim()
  if severity in severityCounts:
    severityCounts[severity]++
```
**Example**:
- 5 Critical tickets → severityCounts.Critical = 5
- 8 High tickets → severityCounts.High = 8
- 4 Medium tickets → severityCounts.Medium = 4
- 3 Low tickets → severityCounts.Low = 3

#### J. Status Counts
```javascript
statusCounts = {
  'Open': 0,
  'In Progress': 0,
  'Closed': 0,
  'Reopened': 0,
  'Escalated to Level': 0
}

for each ticket:
  status = ticket.status.trim()
  if status in statusCounts:
    statusCounts[status]++
```

#### K. Completion Rate (%)
```javascript
completionRate = totalTickets > 0 
  ? round((completedTickets / totalTickets) × 100) 
  : 0
```
**Example**: 16 completed out of 20 total
- completionRate = round((16/20) × 100) = round(80) = **80%**

#### L. SLA Compliance Rate (%)
```javascript
slaComplianceRate = totalTickets > 0 
  ? round(((totalTickets - slaBreaches) / totalTickets) × 100) 
  : 0
```
**Example**: 20 total tickets, 8 SLA breaches
- slaComplianceRate = round(((20-8)/20) × 100) = round(60) = **60%**

---

### 2. Aggregated Team KPIs
**Function**: `calculateAggregatedKPIs(individualKPIs)`
**Location**: `finalyear-backend/src/services/ticketSheetsService.js`

Combines all team members' KPIs:

#### A. Totals (Simple Sum)
```javascript
aggregated.totalTickets = sum of all members' totalTickets
aggregated.completedTickets = sum of all members' completedTickets
aggregated.pendingTickets = sum of all members' pendingTickets
aggregated.reopenedTickets = sum of all members' reopenedTickets
aggregated.escalatedTickets = sum of all members' escalatedTickets
aggregated.slaBreaches = sum of all members' slaBreaches
aggregated.carriedForward = sum of all members' carriedForward
```

**Example** (3 team members):
- Member A: 20 tickets
- Member B: 15 tickets
- Member C: 18 tickets
- **aggregated.totalTickets = 20 + 15 + 18 = 53**

#### B. Severity Counts (Sum)
```javascript
for each member in individualKPIs:
  aggregated.severityCounts.Critical += member.severityCounts.Critical
  aggregated.severityCounts.High += member.severityCounts.High
  aggregated.severityCounts.Medium += member.severityCounts.Medium
  aggregated.severityCounts.Low += member.severityCounts.Low
```

#### C. Status Counts (Sum)
```javascript
for each member in individualKPIs:
  for each status in statusCounts:
    aggregated.statusCounts[status] += member.statusCounts[status]
```

#### D. Average Urgency Score (Team Average)
```javascript
totalUrgencySum = sum of all members' avgUrgencyScore
aggregated.avgUrgencyScore = round(totalUrgencySum / teamMemberCount)
```

**Example** (3 members):
- Member A: avgUrgencyScore = 55
- Member B: avgUrgencyScore = 48
- Member C: avgUrgencyScore = 52
- **aggregated.avgUrgencyScore = round((55+48+52)/3) = round(51.67) = 52**

#### E. Team Completion Rate
```javascript
aggregated.completionRate = aggregated.totalTickets > 0 
  ? round((aggregated.completedTickets / aggregated.totalTickets) × 100) 
  : 0
```

#### F. Team SLA Compliance Rate
```javascript
aggregated.slaComplianceRate = aggregated.totalTickets > 0 
  ? round(((aggregated.totalTickets - aggregated.slaBreaches) / aggregated.totalTickets) × 100) 
  : 0
```

---

## 💻 Frontend Calculations (Client-Side)

### 3. Performance Score (Composite Metric)
**Function**: `calculatePerformanceScore(kpi)`
**Location**: `finalyear-frontend/src/components/TeamManagementDashboard.jsx`

This is a **weighted composite score** that combines multiple factors:

#### Formula
```javascript
const completionWeight = 0.4;  // 40%
const slaWeight = 0.3;         // 30%
const qualityWeight = 0.3;     // 30%

// Component 1: Completion Score
completionScore = completionRate × completionWeight

// Component 2: SLA Score
slaScore = slaComplianceRate × slaWeight

// Component 3: Quality Score (with penalties)
reopenPenalty = reopenedTickets × 5
escalatePenalty = escalatedTickets × 3
qualityScore = max(0, 100 - reopenPenalty - escalatePenalty) × qualityWeight

// Final Score
performanceScore = round(completionScore + slaScore + qualityScore)
```

#### Step-by-Step Example
**Member Data**:
- completionRate = 80%
- slaComplianceRate = 60%
- reopenedTickets = 2
- escalatedTickets = 3

**Calculation**:
```javascript
// Step 1: Completion Score
completionScore = 80 × 0.4 = 32

// Step 2: SLA Score
slaScore = 60 × 0.3 = 18

// Step 3: Quality Score
reopenPenalty = 2 × 5 = 10
escalatePenalty = 3 × 3 = 9
qualityScore = max(0, 100 - 10 - 9) × 0.3
qualityScore = 81 × 0.3 = 24.3

// Step 4: Final Score
performanceScore = round(32 + 18 + 24.3) = round(74.3) = 74
```

**Result**: Performance Score = **74/100**

---

### 4. Team Member Rankings
**Function**: `getMemberPerformanceData()`

```javascript
// Calculate performance score for each member
members = teamMembers.map(member => ({
  name: member.name,
  performanceScore: calculatePerformanceScore(member.kpi),
  // ... other metrics
}))

// Sort by performance score (descending)
sortedMembers = members.sort((a, b) => 
  b.performanceScore - a.performanceScore
)

// Assign ranks
rankedMembers = sortedMembers.map((member, index) => ({
  ...member,
  rank: index + 1  // 1st place, 2nd place, etc.
}))
```

**Example**:
- Alice: performanceScore = 85 → Rank 1
- Bob: performanceScore = 74 → Rank 2
- Charlie: performanceScore = 68 → Rank 3

---

## 📊 Visualization Data Preparation

### 5. Severity Distribution (Pie Chart)
**Function**: `getSeverityDistributionData()`

```javascript
severityData = [
  { name: 'Critical', value: aggregatedKPIs.severityCounts.Critical },
  { name: 'High', value: aggregatedKPIs.severityCounts.High },
  { name: 'Medium', value: aggregatedKPIs.severityCounts.Medium },
  { name: 'Low', value: aggregatedKPIs.severityCounts.Low }
]
```

**Example Data**:
```javascript
[
  { name: 'Critical', value: 15 },  // 15 critical tickets
  { name: 'High', value: 22 },      // 22 high priority
  { name: 'Medium', value: 10 },    // 10 medium
  { name: 'Low', value: 6 }         // 6 low priority
]
```

**Recharts calculates percentages automatically**:
- Critical: 15/53 = 28.3%
- High: 22/53 = 41.5%
- Medium: 10/53 = 18.9%
- Low: 6/53 = 11.3%

---

### 6. Status Distribution (Status Board)
**Function**: `getStatusData()`

```javascript
statusData = {
  open: aggregatedKPIs.statusCounts.Open,
  inProgress: aggregatedKPIs.statusCounts['In Progress'],
  resolved: aggregatedKPIs.statusCounts.Closed,
  reopened: aggregatedKPIs.statusCounts.Reopened,
  escalated: aggregatedKPIs.statusCounts['Escalated to Level']
}
```

**Example**:
```javascript
{
  open: 8,          // 8 open tickets
  inProgress: 5,    // 5 in progress
  resolved: 35,     // 35 resolved
  reopened: 3,      // 3 reopened
  escalated: 2      // 2 escalated
}
```

---

### 7. Performance Comparison Chart (Bar Chart)
**Function**: `getMemberPerformanceData()`

Returns array of objects for each team member:
```javascript
[
  {
    name: "Alice",
    ticketsResolved: 16,
    avgResolutionTime: 0,
    slaCompliance: 60,
    criticalTickets: 5,
    totalTickets: 20,
    pendingTickets: 0,
    escalatedTickets: 4,
    reopenedTickets: 0,
    avgUrgencyScore: 55,
    performanceScore: 74,
    rank: 1
  },
  // ... more members
]
```

Chart can be sorted by any metric (ticketsResolved, slaCompliance, etc.)

---

### 8. KPI Cards
**Function**: `getTeamKPIs()`

```javascript
teamKPIs = {
  totalTickets: aggregatedKPIs.totalTickets,
  resolvedTickets: aggregatedKPIs.completedTickets,
  slaCompliance: aggregatedKPIs.slaComplianceRate,
  avgResolutionTime: 0,  // Not yet calculated
  criticalTickets: aggregatedKPIs.severityCounts.Critical,
  pendingTickets: aggregatedKPIs.pendingTickets
}
```

---

## 🎨 Color Coding Logic

### Performance Level Colors
```javascript
function getComplianceColor(compliance) {
  if (compliance >= 90) return '#10b981';  // Green - Excellent
  if (compliance >= 70) return '#f59e0b';  // Orange - Good
  return '#ef4444';                        // Red - Needs Improvement
}
```

### Severity Colors (Fixed)
```javascript
const COLORS = {
  'Critical': '#f44336',  // Red
  'High': '#ff9800',      // Orange
  'Medium': '#ffeb3b',    // Yellow
  'Low': '#4caf50'        // Green
}
```

### Status Colors (Fixed)
```javascript
const STATUS_COLORS = {
  'Open': '#2196f3',              // Blue
  'In Progress': '#ff9800',       // Orange
  'Closed': '#4caf50',            // Green
  'Reopened': '#f44336',          // Red
  'Escalated to Level': '#9c27b0' // Purple
}
```

---

## 📊 Complete Calculation Flow

### Step-by-Step Process

```
┌─────────────────────────────────────────────────────────────┐
│ 1. DATA EXTRACTION (Google Sheets → Backend)                │
├─────────────────────────────────────────────────────────────┤
│  • Read each team member's sheet (A2:M)                     │
│  • Parse rows into ticket objects                           │
│  • Store in: teamData.userMetrics[memberName]               │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. INDIVIDUAL KPI CALCULATION (Backend)                     │
├─────────────────────────────────────────────────────────────┤
│  For each member:                                           │
│  • Count tickets by status → completedTickets, pending, etc │
│  • Count by severity → severityCounts                       │
│  • Sum urgency scores → avgUrgencyScore                     │
│  • Calculate rates → completionRate, slaComplianceRate      │
│  • Store in: teamData.individualKPIs[memberName]            │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. TEAM AGGREGATION (Backend)                               │
├─────────────────────────────────────────────────────────────┤
│  • Sum all individual metrics                               │
│  • Calculate team-wide rates                                │
│  • Store in: teamData.aggregatedKPIs                        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. API RESPONSE (Backend → Frontend)                        │
├─────────────────────────────────────────────────────────────┤
│  Return via /api/metrics/all:                               │
│  {                                                           │
│    teamMembers: [...],                                      │
│    userMetrics: { memberName: tickets[] },                  │
│    individualKPIs: { memberName: KPI },                     │
│    aggregatedKPIs: KPI                                      │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. FRONTEND PROCESSING                                      │
├─────────────────────────────────────────────────────────────┤
│  • Calculate performanceScore for each member               │
│  • Sort members by performance → assign ranks               │
│  • Prepare data for each visualization                      │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. VISUALIZATION RENDERING                                  │
├─────────────────────────────────────────────────────────────┤
│  • KPI Cards: Display aggregated metrics                    │
│  • Pie Chart: Severity distribution with percentages        │
│  • Status Board: Status counts with colors                  │
│  • Bar Chart: Member comparison (sortable)                  │
│  • Table: Detailed data (sortable, searchable)              │
└─────────────────────────────────────────────────────────────┘
```

---

## 📐 Formula Summary Table

| Metric | Formula | Example |
|--------|---------|---------|
| **Total Tickets** | `count of all tickets` | 20 tickets |
| **Completed Tickets** | `count where status='Closed'` | 16 tickets |
| **Pending Tickets** | `count where status='Open' OR 'In Progress'` | 4 tickets |
| **Completion Rate** | `(completed / total) × 100` | (16/20)×100 = 80% |
| **SLA Compliance** | `((total - breaches) / total) × 100` | ((20-8)/20)×100 = 60% |
| **Avg Urgency** | `sum(urgencyScores) / count` | (60+40+50)/3 = 50 |
| **Performance Score** | `(completion×0.4) + (sla×0.3) + (quality×0.3)` | (80×0.4)+(60×0.3)+(81×0.3) = 74 |
| **Quality Score** | `max(0, 100 - (reopens×5) - (escalates×3))` | 100-(2×5)-(3×3) = 81 |

---

## 🔢 Example Calculation Walkthrough

### Real Data Example

**Input**: Alice's Google Sheet has 20 rows:
- 16 tickets with status "Closed"
- 2 tickets with status "Open"
- 2 tickets with status "Reopened"
- 5 tickets marked "Critical"
- 8 tickets marked "High"
- 4 tickets marked "Medium"
- 3 tickets marked "Low"
- 8 tickets have "SLA breached" in remarks
- 2 tickets with carryForward = "Yes"
- Urgency scores: [60, 55, 50, 45, 40, ...] average = 55

**Backend Calculations**:
```javascript
totalTickets = 20
completedTickets = 16
reopenedTickets = 2
slaBreaches = 8
avgUrgencyScore = 55

completionRate = (16/20) × 100 = 80%
slaComplianceRate = ((20-8)/20) × 100 = 60%
```

**Frontend Calculations**:
```javascript
performanceScore = (80×0.4) + (60×0.3) + (90×0.3)
                 = 32 + 18 + 27
                 = 77
```

**Visualizations**:
- KPI Card shows: "80% Completion Rate"
- KPI Card shows: "60% SLA Compliance"
- Performance Table shows: Score 77, Rank based on comparison
- Pie Chart shows: Critical 25%, High 40%, Medium 20%, Low 15%

---

## ✅ Data Validation

All calculations include validation:
```javascript
// Prevent division by zero
rate = totalTickets > 0 ? (value / total) × 100 : 0

// Ensure non-negative values
qualityScore = max(0, calculatedValue)

// Round to integers
finalValue = round(calculatedValue)
```

---

## 🎯 Key Takeaways

1. **Raw Data**: Comes from Google Sheets, 13 columns per ticket
2. **Backend**: Calculates counts, rates, and aggregations
3. **Frontend**: Adds performance scoring and rankings
4. **Formulas**: All calculations use standard mathematical formulas
5. **Visualizations**: Use pre-calculated data from backend + frontend
6. **No AI/ML**: All metrics are deterministic calculations
7. **Real-time**: Data refreshed every 5 minutes (cache TTL)

---

This document provides complete transparency into how every number, chart, and visualization in the dashboard is calculated! 📊
