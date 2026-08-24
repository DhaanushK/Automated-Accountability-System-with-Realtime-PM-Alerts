// Quick Start Guide - Using the New Ticket Data Service
// =====================================================

import { getAllTeamTicketData, getMemberTicketData, clearCache } from './src/services/ticketSheetsService.js';
import dotenv from 'dotenv';

dotenv.config();

// Example 1: Get all team data
async function example1_getAllData() {
  console.log('\n📊 Example 1: Get All Team Data\n');
  
  const teamData = await getAllTeamTicketData(process.env.GOOGLE_SPREADSHEET_ID);
  
  console.log('Team Summary:');
  console.log(`  Total Tickets: ${teamData.totalTickets}`);
  console.log(`  Team Members: ${teamData.teamMembers.join(', ')}`);
  console.log(`  Completion Rate: ${teamData.aggregatedKPIs.completionRate}%`);
  console.log(`  SLA Compliance: ${teamData.aggregatedKPIs.slaComplianceRate}%`);
}

// Example 2: Get specific member data
async function example2_getMemberData() {
  console.log('\n👤 Example 2: Get Specific Member Data\n');
  
  const memberData = await getMemberTicketData(
    process.env.GOOGLE_SPREADSHEET_ID, 
    'Winnish Allwin G J'
  );
  
  console.log(`Member: ${memberData.memberName}`);
  console.log(`  Tickets: ${memberData.tickets.length}`);
  console.log(`  Completed: ${memberData.kpis.completedTickets}`);
  console.log(`  Pending: ${memberData.kpis.pendingTickets}`);
  console.log(`  SLA Breaches: ${memberData.kpis.slaBreaches}`);
  
  // Show first ticket
  if (memberData.tickets.length > 0) {
    const ticket = memberData.tickets[0];
    console.log('\n  First Ticket:');
    console.log(`    Ticket No: ${ticket.ticketNo}`);
    console.log(`    Severity: ${ticket.severity}`);
    console.log(`    Status: ${ticket.status}`);
  }
}

// Example 3: Analyze by severity
async function example3_analyzeBySeverity() {
  console.log('\n🎯 Example 3: Analyze by Severity\n');
  
  const teamData = await getAllTeamTicketData(process.env.GOOGLE_SPREADSHEET_ID);
  const { severityCounts } = teamData.aggregatedKPIs;
  
  console.log('Severity Distribution:');
  for (const [severity, count] of Object.entries(severityCounts)) {
    const percentage = Math.round((count / teamData.totalTickets) * 100);
    console.log(`  ${severity}: ${count} (${percentage}%)`);
  }
}

// Example 4: Find SLA breaches
async function example4_findSLABreaches() {
  console.log('\n⚠️  Example 4: SLA Breach Analysis\n');
  
  const teamData = await getAllTeamTicketData(process.env.GOOGLE_SPREADSHEET_ID);
  
  // Filter tickets with SLA breaches
  const breachedTickets = teamData.rawTickets.filter(ticket => 
    ticket.remarks.includes('SLA breached') || ticket.daysForwarded > 0
  );
  
  console.log(`Total SLA Breaches: ${breachedTickets.length}`);
  console.log('\nTop 5 Breaches:');
  breachedTickets.slice(0, 5).forEach(ticket => {
    console.log(`  ${ticket.ticketNo} - ${ticket.memberName}`);
    console.log(`    Severity: ${ticket.severity}, Days Forwarded: ${ticket.daysForwarded}`);
  });
}

// Example 5: Team member performance comparison
async function example5_comparePerformance() {
  console.log('\n📈 Example 5: Performance Comparison\n');
  
  const teamData = await getAllTeamTicketData(process.env.GOOGLE_SPREADSHEET_ID);
  
  console.log('Member                   | Tickets | Completed | Rate | SLA Compliance');
  console.log('─'.repeat(75));
  
  for (const member of teamData.teamMembers) {
    const kpi = teamData.individualKPIs[member];
    console.log(
      `${member.padEnd(24)} | ${kpi.totalTickets.toString().padStart(7)} | ` +
      `${kpi.completedTickets.toString().padStart(9)} | ${kpi.completionRate.toString().padStart(3)}% | ` +
      `${kpi.slaComplianceRate.toString().padStart(3)}%`
    );
  }
}

// Example 6: Urgency analysis
async function example6_urgencyAnalysis() {
  console.log('\n🔥 Example 6: Urgency Score Analysis\n');
  
  const teamData = await getAllTeamTicketData(process.env.GOOGLE_SPREADSHEET_ID);
  
  console.log('Average Urgency Scores by Member:');
  for (const member of teamData.teamMembers) {
    const kpi = teamData.individualKPIs[member];
    console.log(`  ${member}: ${kpi.avgUrgencyScore}`);
  }
  
  console.log(`\nTeam Average: ${teamData.aggregatedKPIs.avgUrgencyScore}`);
  
  // Find high urgency tickets (score > 80)
  const highUrgency = teamData.rawTickets.filter(t => t.urgencyScore > 80);
  console.log(`\nHigh Urgency Tickets (>80): ${highUrgency.length}`);
}

// Example 7: Status distribution
async function example7_statusDistribution() {
  console.log('\n📋 Example 7: Status Distribution\n');
  
  const teamData = await getAllTeamTicketData(process.env.GOOGLE_SPREADSHEET_ID);
  const { statusCounts } = teamData.aggregatedKPIs;
  
  console.log('Ticket Status:');
  for (const [status, count] of Object.entries(statusCounts)) {
    const percentage = Math.round((count / teamData.totalTickets) * 100);
    const bar = '█'.repeat(Math.floor(percentage / 2));
    console.log(`  ${status.padEnd(20)}: ${bar} ${count} (${percentage}%)`);
  }
}

// Example 8: Using cache control
async function example8_cacheControl() {
  console.log('\n💾 Example 8: Cache Control\n');
  
  console.log('First call (fetches from API)...');
  const start1 = Date.now();
  await getAllTeamTicketData(process.env.GOOGLE_SPREADSHEET_ID);
  console.log(`  Time: ${Date.now() - start1}ms`);
  
  console.log('\nSecond call (from cache)...');
  const start2 = Date.now();
  await getAllTeamTicketData(process.env.GOOGLE_SPREADSHEET_ID);
  console.log(`  Time: ${Date.now() - start2}ms`);
  
  console.log('\nClearing cache...');
  clearCache();
  
  console.log('Third call (fetches from API again)...');
  const start3 = Date.now();
  await getAllTeamTicketData(process.env.GOOGLE_SPREADSHEET_ID);
  console.log(`  Time: ${Date.now() - start3}ms`);
}

// Run all examples
async function runAllExamples() {
  try {
    await example1_getAllData();
    await example2_getMemberData();
    await example3_analyzeBySeverity();
    await example4_findSLABreaches();
    await example5_comparePerformance();
    await example6_urgencyAnalysis();
    await example7_statusDistribution();
    await example8_cacheControl();
    
    console.log('\n✅ All examples completed!\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Uncomment to run:
// runAllExamples();

// Or run individual examples:
// example1_getAllData();
// example2_getMemberData();
// etc.

export {
  example1_getAllData,
  example2_getMemberData,
  example3_analyzeBySeverity,
  example4_findSLABreaches,
  example5_comparePerformance,
  example6_urgencyAnalysis,
  example7_statusDistribution,
  example8_cacheControl,
  runAllExamples
};
