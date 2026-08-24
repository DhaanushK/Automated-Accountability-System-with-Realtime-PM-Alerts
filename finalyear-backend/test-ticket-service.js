import { getAllTeamTicketData, getMemberTicketData } from './src/services/ticketSheetsService.js';
import dotenv from 'dotenv';

dotenv.config();

async function testTicketService() {
  try {
    console.log('🎫 Testing New Ticket Service...\n');
    
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    console.log('📊 Using Spreadsheet ID:', spreadsheetId);
    console.log('═'.repeat(70));
    
    // Test getting all team data
    console.log('\n1️⃣ Testing getAllTeamTicketData...\n');
    const allData = await getAllTeamTicketData(spreadsheetId, true);
    
    console.log('✅ Successfully fetched team data!');
    console.log('\n📈 Summary:');
    console.log(`   Total Tickets: ${allData.totalTickets}`);
    console.log(`   Team Members: ${allData.teamMembers.length}`);
    console.log(`   Members: ${allData.teamMembers.join(', ')}`);
    
    console.log('\n📊 Aggregated KPIs:');
    console.log(`   Completed: ${allData.aggregatedKPIs.completedTickets}`);
    console.log(`   Pending: ${allData.aggregatedKPIs.pendingTickets}`);
    console.log(`   SLA Breaches: ${allData.aggregatedKPIs.slaBreaches}`);
    console.log(`   Completion Rate: ${allData.aggregatedKPIs.completionRate}%`);
    console.log(`   SLA Compliance: ${allData.aggregatedKPIs.slaComplianceRate}%`);
    console.log(`   Avg Urgency Score: ${allData.aggregatedKPIs.avgUrgencyScore}`);
    
    console.log('\n   Severity Breakdown:');
    for (const [severity, count] of Object.entries(allData.aggregatedKPIs.severityCounts)) {
      console.log(`     ${severity}: ${count}`);
    }
    
    console.log('\n   Status Breakdown:');
    for (const [status, count] of Object.entries(allData.aggregatedKPIs.statusCounts)) {
      console.log(`     ${status}: ${count}`);
    }
    
    console.log('\n👥 Individual KPIs:');
    console.log('─'.repeat(70));
    for (const [member, kpis] of Object.entries(allData.individualKPIs)) {
      console.log(`\n   ${member}:`);
      console.log(`     Total Tickets: ${kpis.totalTickets}`);
      console.log(`     Completed: ${kpis.completedTickets} (${kpis.completionRate}%)`);
      console.log(`     Pending: ${kpis.pendingTickets}`);
      console.log(`     SLA Breaches: ${kpis.slaBreaches}`);
      console.log(`     SLA Compliance: ${kpis.slaComplianceRate}%`);
      console.log(`     Avg Urgency: ${kpis.avgUrgencyScore}`);
    }
    
    // Test getting specific member data
    console.log('\n\n2️⃣ Testing getMemberTicketData...\n');
    const firstMember = allData.teamMembers[0];
    const memberData = await getMemberTicketData(spreadsheetId, firstMember);
    
    console.log(`✅ Successfully fetched data for: ${firstMember}`);
    console.log(`   Tickets: ${memberData.tickets.length}`);
    console.log('\n   Sample Ticket:');
    if (memberData.tickets.length > 0) {
      const sample = memberData.tickets[0];
      console.log(`     Ticket No: ${sample.ticketNo}`);
      console.log(`     Created: ${sample.createdDate}`);
      console.log(`     Severity: ${sample.severity}`);
      console.log(`     Status: ${sample.status}`);
      console.log(`     SLA Hours: ${sample.slaHours}`);
      console.log(`     Urgency Score: ${sample.urgencyScore}`);
    }
    
    console.log('\n' + '═'.repeat(70));
    console.log('✅ All Tests Passed!\n');
    
  } catch (error) {
    console.error('\n❌ Test Failed:', error.message);
    console.error(error);
  }
}

testTicketService();
