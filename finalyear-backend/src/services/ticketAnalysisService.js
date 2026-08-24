import { sheets } from './googleSheets.js';
import User from '../models/User.js';
import AlertRecord from '../models/AlertRecord.js';

/**
 * Analyzes individual employee ticket sheets and identifies defaulters
 * Returns list of employees with incomplete tasks
 */
export async function analyzeTicketsForDefaulters() {
  try {
    console.log('🔍 Analyzing tickets for defaulters...');

    const SHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
    
    if (!SHEET_ID) {
      throw new Error('GOOGLE_SPREADSHEET_ID environment variable is not set');
    }

    // Get all sheets (each sheet represents an employee)
    const metadata = await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID,
    });

    const employeeSheets = metadata.data.sheets || [];
    console.log(`📊 Found ${employeeSheets.length} employee sheets to analyze`);

    const defaulters = [];
    const currentDate = new Date();

    for (const sheet of employeeSheets) {
      const sheetName = sheet.properties.title;
      const employeeName = sheetName; // Sheet name is employee name
      
      console.log(`\n🔍 Analyzing sheet: "${sheetName}"`);

      try {
        // Fetch ticket data from employee sheet
        // Columns: TicketNo, Created Date, Severity, SLA_Hours, SLA_Deadline, Status, 
        //          Assigned_Level, Assigned_To, Resolution_Date, Carry_Forward, Days_Forwarded, Remarks, Urgency_Score
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId: SHEET_ID,
          range: `${sheetName}!A2:M`, // A=TicketNo → M=Urgency_Score
        });

        const rows = res.data.values || [];
        
        if (rows.length === 0) {
          console.log(`   ℹ️  No tickets found for ${sheetName}`);
          continue;
        }

        // Analyze tickets for this employee
        let openTickets = 0;
        let overdueTickets = 0;
        let reopenedTickets = 0;
        let escalatedTickets = 0;
        let highSeverityOpen = 0;
        const incompleteFields = [];
        const problematicTickets = [];

        for (const row of rows) {
          const [ticketNo, createdDate, severity, slaHours, slaDeadline, status, 
                 assignedLevel, assignedTo, resolutionDate, carryForward, daysForwarded, remarks, urgencyScore] = row;

          // Check for open/in-progress tickets
          if (status === 'Open' || status === 'In Progress') {
            openTickets++;

            // Check if SLA deadline is passed
            if (slaDeadline) {
              try {
                const deadlineDate = new Date(slaDeadline);
                if (currentDate > deadlineDate) {
                  overdueTickets++;
                  problematicTickets.push({
                    ticketNo: ticketNo || 'Unknown',
                    issue: 'Overdue',
                    severity: severity || 'Medium',
                    daysForwarded: parseInt(daysForwarded) || 0
                  });
                }
              } catch (e) {
                // Invalid date format, skip
              }
            }

            // Check for high severity open tickets
            if (severity === 'High' || severity === 'Critical') {
              highSeverityOpen++;
            }
          }

          // Check for reopened tickets
          if (status === 'Reopened') {
            reopenedTickets++;
            problematicTickets.push({
              ticketNo: ticketNo || 'Unknown',
              issue: 'Reopened',
              severity: severity || 'Medium'
            });
          }

          // Check for escalated tickets
          if (status === 'Escalated to Level') {
            escalatedTickets++;
            problematicTickets.push({
              ticketNo: ticketNo || 'Unknown',
              issue: 'Escalated',
              severity: severity || 'Medium'
            });
          }

          // Check for long-pending tickets (Days_Forwarded > 3)
          const daysForwardedCount = parseInt(daysForwarded) || 0;
          if (daysForwardedCount > 3 && (status === 'Open' || status === 'In Progress')) {
            problematicTickets.push({
              ticketNo: ticketNo || 'Unknown',
              issue: `Long Pending (${daysForwardedCount} days)`,
              severity: severity || 'Medium'
            });
          }
        }

        // Determine if employee is a defaulter
        let isDefaulter = false;
        let defaulterSeverity = 'Low';

        // Build incomplete fields list
        if (overdueTickets > 0) {
          incompleteFields.push(`Overdue Tickets (${overdueTickets})`);
          isDefaulter = true;
          defaulterSeverity = overdueTickets > 2 ? 'High' : 'Medium';
        }

        if (reopenedTickets > 0) {
          incompleteFields.push(`Reopened Tickets (${reopenedTickets})`);
          isDefaulter = true;
          defaulterSeverity = reopenedTickets > 1 ? 'High' : 'Medium';
        }

        if (escalatedTickets > 0) {
          incompleteFields.push(`Escalated Tickets (${escalatedTickets})`);
          isDefaulter = true;
          defaulterSeverity = 'High';
        }

        if (highSeverityOpen > 0) {
          incompleteFields.push(`High/Critical Severity Open (${highSeverityOpen})`);
          isDefaulter = true;
          defaulterSeverity = 'Critical';
        }

        // If definitely a defaulter, add to list
        if (isDefaulter) {
          // Try to find user email from database using name
          const user = await User.findOne({ 
            name: { $regex: new RegExp(employeeName, 'i') } 
          });

          // Get the most recent problematic ticket for the ticket number
          const mostRecentTicket = problematicTickets.length > 0 
            ? problematicTickets[0] 
            : { ticketNo: 'N/A', issue: 'Multiple issues' };

          defaulters.push({
            name: employeeName,
            email: user ? user.email : `${employeeName.toLowerCase().replace(/\s+/g, '.')}@example.com`,
            userId: user ? user._id : null,
            date: new Date().toLocaleDateString(),
            totalTasks: rows.length,
            completed: rows.filter(r => r[5] === 'Completed' || r[5] === 'Closed').length,
            pending: openTickets,
            late: overdueTickets,
            hours: 0, // Not tracked in this sheet structure
            remarks: `${incompleteFields.join(', ')}`,
            incompleteFields,
            severity: defaulterSeverity,
            ticketNo: mostRecentTicket.ticketNo,
            problematicTickets: problematicTickets.slice(0, 5) // Top 5 issues
          });

          console.log(`   ⚠️  DEFAULTER: ${openTickets} open, ${overdueTickets} overdue, ${reopenedTickets} reopened`);
        } else {
          console.log(`   ✅ All tickets on track`);
        }

      } catch (error) {
        console.error(`   ❌ Error analyzing sheet "${sheetName}":`, error.message);
      }
    }

    console.log(`\n✅ Analysis complete. Found ${defaulters.length} defaulter(s)`);
    return defaulters;
  } catch (error) {
    console.error('❌ Error analyzing tickets:', error);
    throw new Error('Failed to analyze tickets: ' + error.message);
  }
}

/**
 * Calculate severity based on multiple factors
 */
export function calculateSeverity(ticketData) {
  const { pending, late, completed, totalTasks, reopened, escalated, highSeverityOpen } = ticketData;
  
  // Critical: High/Critical severity tickets open, or severe SLA breaches
  if (highSeverityOpen > 0 || late > 5) {
    return 'Critical';
  }

  // High: Multiple issues or escalated
  if (escalated > 0 || late > 2 || pending > 5 || reopened > 2) {
    return 'High';
  }

  // Medium: Some delays
  if (late > 0 || pending > 2 || reopened > 0) {
    return 'Medium';
  }

  // Low: Minor issues
  return 'Low';
}

/**
 * Check if employee should receive alert based on history
 */
export async function shouldSendAlert(employeeEmail, ticketNo) {
  try {
    // Find existing alert records for this employee and ticket
    const existingAlert = await AlertRecord.findOne({
      employeeEmail,
      ticketNo,
      status: 'Active'
    }).sort({ lastAlertSentAt: -1 });

    if (!existingAlert) {
      return { shouldSend: true, existingAlert: null };
    }

    // Check last alert time - don't spam (wait at least 24 hours)
    const hoursSinceLastAlert = (Date.now() - existingAlert.lastAlertSentAt) / (1000 * 60 * 60);
    
    if (hoursSinceLastAlert < 24) {
      console.log(`⏰ Skipping alert for ${employeeEmail} - Last alert sent ${hoursSinceLastAlert.toFixed(1)} hours ago`);
      return { shouldSend: false, existingAlert };
    }

    // Escalate severity if multiple alerts have been sent
    if (existingAlert.noOfAlertsSent >= 3) {
      return { shouldSend: true, existingAlert, escalate: true };
    }

    return { shouldSend: true, existingAlert };
  } catch (error) {
    console.error('Error checking alert eligibility:', error);
    return { shouldSend: true, existingAlert: null };
  }
}

/**
 * Get alert statistics for a specific employee
 */
export async function getEmployeeAlertStats(employeeEmail) {
  try {
    const alerts = await AlertRecord.find({ employeeEmail }).sort({ createdAt: -1 });
    
    const stats = {
      totalAlerts: alerts.length,
      activeAlerts: alerts.filter(a => a.status === 'Active').length,
      resolvedAlerts: alerts.filter(a => a.status === 'Resolved').length,
      escalatedAlerts: alerts.filter(a => a.status === 'Escalated').length,
      severityCounts: {
        Low: alerts.filter(a => a.severity === 'Low').length,
        Medium: alerts.filter(a => a.severity === 'Medium').length,
        High: alerts.filter(a => a.severity === 'High').length,
        Critical: alerts.filter(a => a.severity === 'Critical').length
      },
      lastAlertDate: alerts.length > 0 ? alerts[0].lastAlertSentAt : null
    };

    return stats;
  } catch (error) {
    console.error('Error getting employee alert stats:', error);
    throw error;
  }
}
