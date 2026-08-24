import { sheets } from './googleSheets.js';

// Cache metrics data for 5 minutes
let metricsCache = {
  data: null,
  timestamp: null
};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Get all team metrics from the new ticket-based structure
 * Each sheet represents a team member with their tickets
 */
export async function getAllTeamTicketData(sheetId, forceRefresh = false) {
  try {
    // Check cache first unless force refresh
    const cacheAge = Date.now() - metricsCache.timestamp;
    if (!forceRefresh && metricsCache.data && cacheAge < CACHE_TTL) {
      console.log('Returning cached ticket data');
      return metricsCache.data;
    }

    console.log('Cache miss - fetching fresh ticket data');
    console.log('Using spreadsheet ID:', sheetId);
    
    if (!sheetId) {
      throw new Error('Spreadsheet ID is required');
    }

    // Get spreadsheet metadata
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: sheetId,
    });

    if (!spreadsheet.data || !spreadsheet.data.sheets) {
      throw new Error('Invalid spreadsheet structure');
    }

    // Get all team member sheets
    const teamMemberSheets = spreadsheet.data.sheets;
    console.log('Found team member sheets:', teamMemberSheets.map(s => s.properties.title));

    const allTickets = [];
    const teamData = {
      totalTickets: 0,
      teamMembers: [],
      userMetrics: {},
      individualKPIs: {},
      rawTickets: []
    };

    // Fetch data from each team member sheet
    for (const memberSheet of teamMemberSheets) {
      const memberName = memberSheet.properties.title;
      console.log(`Fetching ticket data from: ${memberName}`);
      
      try {
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId: sheetId,
          range: `${memberName}!A2:M`, // Columns A to M (13 columns)
        });

        const rows = res.data.values || [];
        console.log(`Found ${rows.length} tickets for ${memberName}`);
        
        const memberTickets = rows.map(row => {
          const [
            ticketNo,
            createdDate,
            severity,
            slaHours,
            slaDeadline,
            status,
            assignedLevel,
            assignedTo,
            resolutionDate,
            carryForward,
            daysForwarded,
            remarks,
            urgencyScore
          ] = row;

          const ticket = {
            ticketNo: ticketNo || '',
            createdDate: createdDate || '',
            severity: severity || '',
            slaHours: parseInt(slaHours, 10) || 0,
            slaDeadline: slaDeadline || '',
            status: status || '',
            assignedLevel: assignedLevel || '',
            assignedTo: assignedTo || memberName,
            resolutionDate: resolutionDate || '',
            carryForward: carryForward || 'No',
            daysForwarded: parseInt(daysForwarded, 10) || 0,
            remarks: remarks || '',
            urgencyScore: parseInt(urgencyScore, 10) || 0,
            memberName: memberName
          };

          return ticket;
        });

        allTickets.push(...memberTickets);
        teamData.rawTickets.push(...memberTickets);
        
        // Initialize team member data
        if (!teamData.teamMembers.includes(memberName)) {
          teamData.teamMembers.push(memberName);
        }
        
        teamData.userMetrics[memberName] = memberTickets;

        // Calculate individual KPIs for this member
        const kpi = calculateMemberKPIs(memberTickets);
        teamData.individualKPIs[memberName] = kpi;

        console.log(`Processed ${memberTickets.length} tickets for ${memberName}`);
      } catch (error) {
        console.error(`Error fetching data for ${memberName}:`, error.message);
        // Continue with other sheets
      }
    }

    teamData.totalTickets = allTickets.length;
    
    // Calculate aggregated KPIs
    teamData.aggregatedKPIs = calculateAggregatedKPIs(teamData.individualKPIs);

    console.log(`Total tickets collected: ${teamData.totalTickets}`);
    console.log(`Team members: ${teamData.teamMembers.length}`);

    // Update cache
    metricsCache = {
      data: teamData,
      timestamp: Date.now()
    };

    return teamData;
  } catch (error) {
    console.error('Error in getAllTeamTicketData:', error);
    throw new Error(`Failed to fetch team ticket data: ${error.message}`);
  }
}

/**
 * Calculate KPIs for a single team member
 */
function calculateMemberKPIs(tickets) {
  const kpi = {
    totalTickets: tickets.length,
    completedTickets: 0,
    pendingTickets: 0,
    reopenedTickets: 0,
    escalatedTickets: 0,
    slaBreaches: 0,
    carriedForward: 0,
    avgUrgencyScore: 0,
    severityCounts: {
      Critical: 0,
      High: 0,
      Medium: 0,
      Low: 0
    },
    statusCounts: {
      Open: 0,
      'In Progress': 0,
      Closed: 0,
      Reopened: 0,
      'Escalated to Level': 0
    },
    completionRate: 0,
    slaComplianceRate: 0
  };

  let totalUrgency = 0;

  for (const ticket of tickets) {
    // Count by status
    const status = ticket.status.trim();
    if (status === 'Closed' || ticket.resolutionDate === 'Completed') {
      kpi.completedTickets++;
    } else if (status === 'Open' || status === 'In Progress') {
      kpi.pendingTickets++;
    }

    if (status === 'Reopened') {
      kpi.reopenedTickets++;
    }

    if (status.includes('Escalated')) {
      kpi.escalatedTickets++;
    }

    // Count status
    if (kpi.statusCounts[status] !== undefined) {
      kpi.statusCounts[status]++;
    }

    // Count severity
    const severity = ticket.severity.trim();
    if (kpi.severityCounts[severity] !== undefined) {
      kpi.severityCounts[severity]++;
    }

    // Check SLA breach
    if (ticket.remarks.includes('SLA breached') || ticket.daysForwarded > 0) {
      kpi.slaBreaches++;
    }

    // Check carried forward
    if (ticket.carryForward === 'Yes') {
      kpi.carriedForward++;
    }

    // Sum urgency scores
    totalUrgency += ticket.urgencyScore;
  }

  // Calculate rates
  kpi.avgUrgencyScore = tickets.length > 0 ? Math.round(totalUrgency / tickets.length) : 0;
  kpi.completionRate = kpi.totalTickets > 0 ? 
    Math.round((kpi.completedTickets / kpi.totalTickets) * 100) : 0;
  kpi.slaComplianceRate = kpi.totalTickets > 0 ? 
    Math.round(((kpi.totalTickets - kpi.slaBreaches) / kpi.totalTickets) * 100) : 0;

  return kpi;
}

/**
 * Calculate aggregated KPIs across all team members
 */
function calculateAggregatedKPIs(individualKPIs) {
  const aggregated = {
    totalTickets: 0,
    completedTickets: 0,
    pendingTickets: 0,
    reopenedTickets: 0,
    escalatedTickets: 0,
    slaBreaches: 0,
    carriedForward: 0,
    avgUrgencyScore: 0,
    severityCounts: {
      Critical: 0,
      High: 0,
      Medium: 0,
      Low: 0
    },
    statusCounts: {
      Open: 0,
      'In Progress': 0,
      Closed: 0,
      Reopened: 0,
      'Escalated to Level': 0
    },
    completionRate: 0,
    slaComplianceRate: 0,
    teamMemberCount: 0
  };

  let totalUrgencySum = 0;

  for (const memberName in individualKPIs) {
    const kpi = individualKPIs[memberName];
    aggregated.teamMemberCount++;
    aggregated.totalTickets += kpi.totalTickets;
    aggregated.completedTickets += kpi.completedTickets;
    aggregated.pendingTickets += kpi.pendingTickets;
    aggregated.reopenedTickets += kpi.reopenedTickets;
    aggregated.escalatedTickets += kpi.escalatedTickets;
    aggregated.slaBreaches += kpi.slaBreaches;
    aggregated.carriedForward += kpi.carriedForward;
    totalUrgencySum += kpi.avgUrgencyScore;

    // Aggregate severity counts
    for (const severity in kpi.severityCounts) {
      aggregated.severityCounts[severity] += kpi.severityCounts[severity];
    }

    // Aggregate status counts
    for (const status in kpi.statusCounts) {
      aggregated.statusCounts[status] += kpi.statusCounts[status];
    }
  }

  // Calculate aggregate rates
  aggregated.avgUrgencyScore = aggregated.teamMemberCount > 0 ? 
    Math.round(totalUrgencySum / aggregated.teamMemberCount) : 0;
  aggregated.completionRate = aggregated.totalTickets > 0 ? 
    Math.round((aggregated.completedTickets / aggregated.totalTickets) * 100) : 0;
  aggregated.slaComplianceRate = aggregated.totalTickets > 0 ? 
    Math.round(((aggregated.totalTickets - aggregated.slaBreaches) / aggregated.totalTickets) * 100) : 0;

  return aggregated;
}

/**
 * Get metrics for a specific team member
 */
export async function getMemberTicketData(sheetId, memberName) {
  try {
    const allData = await getAllTeamTicketData(sheetId);
    
    if (!allData.userMetrics[memberName]) {
      throw new Error(`No data found for team member: ${memberName}`);
    }

    return {
      memberName,
      tickets: allData.userMetrics[memberName],
      kpis: allData.individualKPIs[memberName]
    };
  } catch (error) {
    console.error(`Error getting data for ${memberName}:`, error);
    throw error;
  }
}

/**
 * Clear the cache (useful for testing or force refresh)
 */
export function clearCache() {
  metricsCache = {
    data: null,
    timestamp: null
  };
  console.log('Cache cleared');
}
