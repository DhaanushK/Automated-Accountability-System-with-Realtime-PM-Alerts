/**
 * Performance Calculations Utility
 * Calculates metrics from ticket data for support team performance dashboard
 */

/**
 * Calculate overall dashboard metrics
 * @param {Array} tickets - Array of ticket objects from Google Sheets
 * @returns {Object} Aggregated metrics
 */
export function calculateDashboardMetrics(tickets) {
  const totalTickets = tickets.length;
  const resolvedTickets = tickets.filter(t => t.Status === 'Resolved' || t.Status === 'Closed').length;
  
  // Calculate SLA compliance
  const ticketsWithSLA = tickets.filter(t => t.SLA_Deadline && t.Resolution_Date);
  const slaMetTickets = ticketsWithSLA.filter(t => {
    const deadline = new Date(t.SLA_Deadline);
    const resolved = new Date(t.Resolution_Date);
    return resolved <= deadline;
  });
  const slaCompliance = ticketsWithSLA.length > 0 
    ? (slaMetTickets.length / ticketsWithSLA.length) * 100 
    : 0;

  // Calculate average resolution time
  const resolvedWithDates = tickets.filter(t => t.Created_Date && t.Resolution_Date);
  const totalResolutionTime = resolvedWithDates.reduce((sum, ticket) => {
    const created = new Date(ticket.Created_Date);
    const resolved = new Date(ticket.Resolution_Date);
    const hours = (resolved - created) / (1000 * 60 * 60);
    return sum + hours;
  }, 0);
  const avgResolutionTime = resolvedWithDates.length > 0 
    ? totalResolutionTime / resolvedWithDates.length 
    : 0;

  // Critical tickets
  const criticalTickets = tickets.filter(t => 
    t.Severity === 'Critical' || t.Severity === 'High'
  ).length;

  // Pending tickets
  const pendingTickets = tickets.filter(t => 
    t.Status !== 'Resolved' && t.Status !== 'Closed'
  ).length;

  return {
    totalTickets,
    resolvedTickets,
    slaCompliance,
    avgResolutionTime,
    criticalTickets,
    pendingTickets
  };
}

/**
 * Calculate agent-specific performance metrics
 * @param {Array} tickets - Array of ticket objects
 * @returns {Array} Array of agent performance objects
 */
export function calculateAgentPerformance(tickets) {
  const agentMap = new Map();

  tickets.forEach(ticket => {
    const agent = ticket.Assigned_To;
    if (!agent) return;

    if (!agentMap.has(agent)) {
      agentMap.set(agent, {
        name: agent,
        ticketsAssigned: 0,
        ticketsResolved: 0,
        totalResolutionTime: 0,
        resolvedCount: 0,
        slaMetCount: 0,
        slaCheckedCount: 0,
        criticalTickets: 0,
        carryForward: 0
      });
    }

    const agentData = agentMap.get(agent);
    agentData.ticketsAssigned++;

    // Resolved tickets
    if (ticket.Status === 'Resolved' || ticket.Status === 'Closed') {
      agentData.ticketsResolved++;
      
      // Resolution time
      if (ticket.Created_Date && ticket.Resolution_Date) {
        const created = new Date(ticket.Created_Date);
        const resolved = new Date(ticket.Resolution_Date);
        const hours = (resolved - created) / (1000 * 60 * 60);
        agentData.totalResolutionTime += hours;
        agentData.resolvedCount++;
      }

      // SLA compliance
      if (ticket.SLA_Deadline && ticket.Resolution_Date) {
        agentData.slaCheckedCount++;
        const deadline = new Date(ticket.SLA_Deadline);
        const resolved = new Date(ticket.Resolution_Date);
        if (resolved <= deadline) {
          agentData.slaMetCount++;
        }
      }
    }

    // Critical tickets
    if (ticket.Severity === 'Critical' || ticket.Severity === 'High') {
      agentData.criticalTickets++;
    }

    // Carry forward
    if (ticket.Carry_Forward === 'Yes' || ticket.Carry_Forward === 'TRUE') {
      agentData.carryForward++;
    }
  });

  // Calculate final metrics for each agent
  const agentPerformance = Array.from(agentMap.values()).map(agent => {
    const avgResolutionTime = agent.resolvedCount > 0 
      ? agent.totalResolutionTime / agent.resolvedCount 
      : 0;
    
    const slaCompliance = agent.slaCheckedCount > 0 
      ? (agent.slaMetCount / agent.slaCheckedCount) * 100 
      : 0;

    // Calculate performance score (weighted average)
    const resolutionWeight = 0.3;
    const slaWeight = 0.4;
    const speedWeight = 0.2;
    const criticalWeight = 0.1;

    const resolutionScore = Math.min(100, (agent.ticketsResolved / agent.ticketsAssigned) * 100);
    const speedScore = Math.max(0, 100 - (avgResolutionTime / 48) * 100); // 48h = 0 score
    const criticalScore = agent.ticketsAssigned > 0 
      ? Math.min(100, (agent.criticalTickets / agent.ticketsAssigned) * 100)
      : 0;

    const performanceScore = Math.round(
      (resolutionScore * resolutionWeight) +
      (slaCompliance * slaWeight) +
      (speedScore * speedWeight) +
      (criticalScore * criticalWeight)
    );

    return {
      name: agent.name,
      ticketsResolved: agent.ticketsResolved,
      avgResolutionTime: parseFloat(avgResolutionTime.toFixed(2)),
      slaCompliance: parseFloat(slaCompliance.toFixed(2)),
      criticalTickets: agent.criticalTickets,
      carryForward: agent.carryForward,
      performanceScore: Math.min(100, performanceScore)
    };
  });

  // Sort by performance score and add rank
  agentPerformance.sort((a, b) => b.performanceScore - a.performanceScore);
  agentPerformance.forEach((agent, index) => {
    agent.rank = index + 1;
  });

  return agentPerformance;
}

/**
 * Calculate severity distribution
 * @param {Array} tickets - Array of ticket objects
 * @returns {Array} Severity distribution data
 */
export function calculateSeverityDistribution(tickets) {
  const severityMap = {
    'Critical': 0,
    'High': 0,
    'Medium': 0,
    'Low': 0
  };

  tickets.forEach(ticket => {
    const severity = ticket.Severity;
    if (severityMap.hasOwnProperty(severity)) {
      severityMap[severity]++;
    }
  });

  return Object.entries(severityMap).map(([name, value]) => ({
    name,
    value
  }));
}

/**
 * Calculate status distribution
 * @param {Array} tickets - Array of ticket objects
 * @returns {Object} Status counts
 */
export function calculateStatusDistribution(tickets) {
  const statusMap = {
    open: 0,
    inProgress: 0,
    resolved: 0,
    pending: 0
  };

  tickets.forEach(ticket => {
    const status = ticket.Status?.toLowerCase();
    if (status === 'open' || status === 'new') {
      statusMap.open++;
    } else if (status === 'in progress' || status === 'assigned') {
      statusMap.inProgress++;
    } else if (status === 'resolved' || status === 'closed') {
      statusMap.resolved++;
    } else if (status === 'pending' || status === 'waiting') {
      statusMap.pending++;
    }
  });

  return statusMap;
}

/**
 * Calculate resolution time trend over days
 * @param {Array} tickets - Array of ticket objects
 * @param {Number} days - Number of days to analyze
 * @returns {Array} Daily resolution time data
 */
export function calculateResolutionTimeTrend(tickets, days = 30) {
  const dailyData = new Map();
  const today = new Date();

  // Initialize all days
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateKey = date.toISOString().split('T')[0];
    dailyData.set(dateKey, {
      date: dateKey,
      totalTime: 0,
      count: 0
    });
  }

  // Aggregate data
  tickets.forEach(ticket => {
    if (!ticket.Resolution_Date || !ticket.Created_Date) return;

    const resolvedDate = new Date(ticket.Resolution_Date);
    const dateKey = resolvedDate.toISOString().split('T')[0];

    if (dailyData.has(dateKey)) {
      const created = new Date(ticket.Created_Date);
      const hours = (resolvedDate - created) / (1000 * 60 * 60);
      
      const dayData = dailyData.get(dateKey);
      dayData.totalTime += hours;
      dayData.count++;
    }
  });

  // Calculate averages and moving average
  const trendData = Array.from(dailyData.values()).map(day => ({
    date: day.date,
    avgResolutionTime: day.count > 0 ? day.totalTime / day.count : 0
  }));

  // Calculate 7-day moving average
  trendData.forEach((day, index) => {
    const start = Math.max(0, index - 6);
    const slice = trendData.slice(start, index + 1);
    const sum = slice.reduce((acc, d) => acc + d.avgResolutionTime, 0);
    day.movingAverage = sum / slice.length;
  });

  return trendData;
}

/**
 * Calculate SLA data
 * @param {Array} tickets - Array of ticket objects
 * @returns {Object} SLA metrics
 */
export function calculateSLAData(tickets) {
  const ticketsWithSLA = tickets.filter(t => t.SLA_Deadline);
  const totalTickets = ticketsWithSLA.length;

  const slaMet = ticketsWithSLA.filter(t => {
    if (!t.Resolution_Date) return false;
    const deadline = new Date(t.SLA_Deadline);
    const resolved = new Date(t.Resolution_Date);
    return resolved <= deadline;
  }).length;

  const slaBreached = ticketsWithSLA.filter(t => {
    if (!t.Resolution_Date) return false;
    const deadline = new Date(t.SLA_Deadline);
    const resolved = new Date(t.Resolution_Date);
    return resolved > deadline;
  }).length;

  const compliance = totalTickets > 0 ? (slaMet / totalTickets) * 100 : 0;

  return {
    compliance,
    totalTickets,
    slaMet,
    slaBreached
  };
}

export default {
  calculateDashboardMetrics,
  calculateAgentPerformance,
  calculateSeverityDistribution,
  calculateStatusDistribution,
  calculateResolutionTimeTrend,
  calculateSLAData
};
