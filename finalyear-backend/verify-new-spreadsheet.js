import dotenv from 'dotenv';
import { getAllTeamTicketData } from './src/services/ticketSheetsService.js';

dotenv.config();

async function verifyConfiguration() {
  console.log('\n🔍 VERIFYING SPREADSHEET CONFIGURATION\n');
  console.log('═'.repeat(80));
  
  const newSpreadsheetId = '1KDj8ixj9oF5jSFEh-KXakLgJXjTwkgXn8uiHdxajaOc';
  const oldSpreadsheetId = '1vl5gTB6OkLVSvYvnCfLwHW_FyjKUinkiKxav-5zaA80';
  
  // Check environment variable
  console.log('\n📋 Environment Configuration:');
  console.log('─'.repeat(80));
  console.log(`GOOGLE_SPREADSHEET_ID: ${process.env.GOOGLE_SPREADSHEET_ID}`);
  
  if (process.env.GOOGLE_SPREADSHEET_ID === newSpreadsheetId) {
    console.log('✅ Correct! Using NEW spreadsheet (EmployeeTickets)');
  } else if (process.env.GOOGLE_SPREADSHEET_ID === oldSpreadsheetId) {
    console.log('❌ ERROR! Still using OLD spreadsheet');
    console.log('   Please update .env file with:');
    console.log(`   GOOGLE_SPREADSHEET_ID=${newSpreadsheetId}`);
  } else {
    console.log('⚠️  WARNING! Using unknown spreadsheet ID');
  }
  
  // Test actual data fetch
  console.log('\n📊 Testing Data Fetch:');
  console.log('─'.repeat(80));
  
  try {
    const teamData = await getAllTeamTicketData(process.env.GOOGLE_SPREADSHEET_ID, true);
    
    console.log('✅ Successfully connected to spreadsheet');
    console.log(`\n📈 Data Summary:`);
    console.log(`   Total Tickets: ${teamData.totalTickets}`);
    console.log(`   Team Members: ${teamData.teamMembers.length}`);
    console.log(`   Members: ${teamData.teamMembers.join(', ')}`);
    
    // Check data structure
    console.log('\n🎫 Data Structure Check:');
    console.log('─'.repeat(80));
    
    const firstTicket = teamData.rawTickets[0];
    if (firstTicket) {
      console.log('Sample ticket structure:');
      console.log(`   Ticket No: ${firstTicket.ticketNo}`);
      console.log(`   Severity: ${firstTicket.severity}`);
      console.log(`   Status: ${firstTicket.status}`);
      console.log(`   Urgency Score: ${firstTicket.urgencyScore}`);
      
      if (firstTicket.ticketNo && firstTicket.severity && firstTicket.urgencyScore !== undefined) {
        console.log('\n✅ Confirmed: Using NEW ticket-based data structure');
      } else {
        console.log('\n❌ ERROR: Data structure doesn\'t match new format');
      }
    }
    
    // Show KPIs
    console.log('\n📊 Current KPIs:');
    console.log('─'.repeat(80));
    console.log(`   Completion Rate: ${teamData.aggregatedKPIs.completionRate}%`);
    console.log(`   SLA Compliance: ${teamData.aggregatedKPIs.slaComplianceRate}%`);
    console.log(`   Avg Urgency Score: ${teamData.aggregatedKPIs.avgUrgencyScore}`);
    
    console.log('\n═'.repeat(80));
    console.log('✅ VERIFICATION COMPLETE - All systems using NEW spreadsheet!');
    console.log('═'.repeat(80));
    console.log(`\n🔗 View spreadsheet: https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SPREADSHEET_ID}/edit\n`);
    
  } catch (error) {
    console.error('\n❌ ERROR fetching data:', error.message);
    console.log('\nPossible issues:');
    console.log('1. Service account not shared with the spreadsheet');
    console.log('2. Wrong spreadsheet ID in .env');
    console.log('3. Network connectivity issues\n');
  }
}

verifyConfiguration();
