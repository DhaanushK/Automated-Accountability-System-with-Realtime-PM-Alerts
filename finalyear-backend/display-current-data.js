import { google } from 'googleapis';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function displayCurrentData() {
  try {
    console.log('📊 CURRENT GOOGLE SHEETS DATA\n');
    console.log('═'.repeat(100));

    // Load credentials
    const credPath = path.join(__dirname, 'src/config/credentials.json');
    const credentials = JSON.parse(await fs.readFile(credPath, 'utf8'));

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || '1KDj8ixj9oF5jSFEh-KXakLgJXjTwkgXn8uiHdxajaOc';

    console.log(`\n📋 Spreadsheet ID: ${spreadsheetId}`);
    console.log(`🔗 Link: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit\n`);
    console.log('═'.repeat(100));

    // Get spreadsheet metadata
    const metadata = await sheets.spreadsheets.get({ spreadsheetId });
    const spreadsheetTitle = metadata.data.properties.title;
    
    console.log(`\n📄 Spreadsheet Name: "${spreadsheetTitle}"`);
    console.log(`\n👥 Team Members (${metadata.data.sheets.length} sheets):\n`);
    
    let totalTickets = 0;
    let totalCompleted = 0;
    let totalSLABreaches = 0;
    const memberStats = [];

    for (const sheet of metadata.data.sheets) {
      const sheetName = sheet.properties.title;
      
      try {
        // Get all data from this sheet
        const dataResponse = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheetName}!A2:M`,
        });

        const rows = dataResponse.data.values || [];
        
        // Calculate stats for this member
        let completed = 0;
        let slaBreaches = 0;
        const severityCounts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
        const statusCounts = {};

        rows.forEach(row => {
          const [ticketNo, createdDate, severity, slaHours, slaDeadline, status, assignedLevel, assignedTo, resolutionDate, carryForward, daysForwarded, remarks] = row;
          
          // Count completed
          if (status === 'Closed' || resolutionDate === 'Completed') {
            completed++;
          }
          
          // Count SLA breaches
          if (remarks && remarks.includes('SLA breached')) {
            slaBreaches++;
          }
          
          // Count severity
          if (severityCounts[severity] !== undefined) {
            severityCounts[severity]++;
          }
          
          // Count status
          statusCounts[status] = (statusCounts[status] || 0) + 1;
        });

        totalTickets += rows.length;
        totalCompleted += completed;
        totalSLABreaches += slaBreaches;

        const completionRate = rows.length > 0 ? Math.round((completed / rows.length) * 100) : 0;
        const slaCompliance = rows.length > 0 ? Math.round(((rows.length - slaBreaches) / rows.length) * 100) : 0;

        memberStats.push({
          name: sheetName,
          tickets: rows.length,
          completed,
          completionRate,
          slaBreaches,
          slaCompliance,
          severityCounts,
          statusCounts
        });

      } catch (err) {
        console.error(`   ❌ Error reading sheet ${sheetName}: ${err.message}`);
      }
    }

    // Display summary stats
    console.log('\n📈 TEAM SUMMARY STATISTICS');
    console.log('─'.repeat(100));
    console.log(`Total Tickets: ${totalTickets}`);
    console.log(`Completed: ${totalCompleted} (${Math.round((totalCompleted / totalTickets) * 100)}%)`);
    console.log(`SLA Breaches: ${totalSLABreaches} (SLA Compliance: ${Math.round(((totalTickets - totalSLABreaches) / totalTickets) * 100)}%)`);
    console.log('\n');

    // Display member-by-member breakdown
    console.log('👤 INDIVIDUAL MEMBER PERFORMANCE');
    console.log('─'.repeat(100));
    console.log('');
    console.log('Member Name              | Tickets | Completed | Rate | SLA Breaches | Compliance');
    console.log('─'.repeat(100));

    memberStats.forEach(member => {
      console.log(
        `${member.name.padEnd(24)} | ${member.tickets.toString().padStart(7)} | ` +
        `${member.completed.toString().padStart(9)} | ${member.completionRate.toString().padStart(3)}% | ` +
        `${member.slaBreaches.toString().padStart(12)} | ${member.slaCompliance.toString().padStart(7)}%`
      );
    });

    // Display detailed ticket data for each member
    console.log('\n\n📋 DETAILED TICKET DATA BY MEMBER');
    console.log('═'.repeat(100));

    for (const member of memberStats) {
      console.log(`\n\n👤 ${member.name}`);
      console.log('─'.repeat(100));
      console.log(`Tickets: ${member.tickets} | Completed: ${member.completed} (${member.completionRate}%) | SLA Compliance: ${member.slaCompliance}%`);
      
      console.log('\n  Severity Distribution:');
      for (const [severity, count] of Object.entries(member.severityCounts)) {
        const bar = '█'.repeat(Math.min(count, 50));
        console.log(`    ${severity.padEnd(10)}: ${bar} ${count}`);
      }
      
      console.log('\n  Status Distribution:');
      for (const [status, count] of Object.entries(member.statusCounts)) {
        const bar = '█'.repeat(Math.min(count, 50));
        console.log(`    ${status.padEnd(20)}: ${bar} ${count}`);
      }

      // Get and display actual tickets
      const dataResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${member.name}!A1:M`,
      });

      const allRows = dataResponse.data.values || [];
      const headers = allRows[0] || [];
      const tickets = allRows.slice(1);

      if (tickets.length > 0) {
        console.log('\n  📋 Recent Tickets (First 5):');
        console.log('  ' + '─'.repeat(96));
        
        tickets.slice(0, 5).forEach((row, idx) => {
          const [ticketNo, createdDate, severity, slaHours, slaDeadline, status, assignedLevel, assignedTo, resolutionDate, carryForward, daysForwarded, remarks, urgencyScore] = row;
          
          console.log(`\n  ${idx + 1}. Ticket: ${ticketNo}`);
          console.log(`     Created: ${createdDate} | Severity: ${severity} | Status: ${status}`);
          console.log(`     SLA: ${slaHours}h (Due: ${slaDeadline}) | Urgency: ${urgencyScore || 'N/A'}`);
          if (remarks) {
            console.log(`     Remarks: ${remarks}`);
          }
        });

        if (tickets.length > 5) {
          console.log(`\n  ... and ${tickets.length - 5} more tickets`);
        }
      }
    }

    // Show high-priority and breached tickets
    console.log('\n\n⚠️  HIGH PRIORITY & SLA BREACHED TICKETS');
    console.log('═'.repeat(100));

    for (const member of memberStats) {
      const dataResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${member.name}!A2:M`,
      });

      const tickets = dataResponse.data.values || [];
      
      const criticalTickets = tickets.filter(row => row[2] === 'Critical');
      const breachedTickets = tickets.filter(row => row[11] && row[11].includes('SLA breached'));

      if (criticalTickets.length > 0 || breachedTickets.length > 0) {
        console.log(`\n👤 ${member.name}:`);
        
        if (criticalTickets.length > 0) {
          console.log(`  🔴 Critical Tickets: ${criticalTickets.length}`);
          criticalTickets.slice(0, 3).forEach(ticket => {
            console.log(`     ${ticket[0]} - ${ticket[5]} (Created: ${ticket[1]})`);
          });
        }
        
        if (breachedTickets.length > 0) {
          console.log(`  ⚠️  SLA Breached: ${breachedTickets.length}`);
          breachedTickets.slice(0, 3).forEach(ticket => {
            console.log(`     ${ticket[0]} - ${ticket[5]} (Days Forwarded: ${ticket[10] || 0})`);
          });
        }
      }
    }

    console.log('\n\n═'.repeat(100));
    console.log('✅ Data Display Complete!');
    console.log(`\n📅 Retrieved on: ${new Date().toLocaleString()}`);
    console.log('═'.repeat(100));
    console.log('\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.log('\nPossible issues:');
    console.log('1. Service account not shared with spreadsheet');
    console.log('2. Spreadsheet ID incorrect');
    console.log('3. Google Sheets API not enabled\n');
  }
}

displayCurrentData();
