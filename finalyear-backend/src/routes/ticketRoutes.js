import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import activityLogger from '../utils/activityLogger.js';
import { sheets } from '../services/googleSheets.js';

const router = express.Router();

// Map team lead names to their sheet names
const TEAM_LEAD_SHEETS = {
  'praveen': 'Praveen J A',
  'kanishkka': 'Kanishkka R'
};

// Map team lead names to their ticket ID ranges
const TICKET_ID_RANGES = {
  'praveen': { prefix: 'WG-TCK-', start: 400 },
  'kanishkka': { prefix: 'WG-TCK-', start: 500 }
};

/**
 * GET /api/tickets/generate-id
 * Generate the next sequential ticket ID for a team lead or team member
 */
router.get('/generate-id', authMiddleware, async (req, res) => {
  try {
    const { teamLeadName, memberName } = req.query;
    
    if (!teamLeadName && !memberName) {
      return res.status(400).json({ 
        success: false, 
        message: 'Team lead name or member name is required' 
      });
    }

    let sheetName, prefix, start;

    if (memberName) {
      // Team member submission - use member's own sheet
      sheetName = memberName; // Sheet name is the member's full name
      prefix = 'WG-TCK-';
      start = 1; // Start from 1 for team members
      console.log(`Generating ticket ID for team member: ${memberName}`);
    } else {
      // Team lead submission
      const teamLeadKey = teamLeadName.toLowerCase().includes('praveen') 
        ? 'praveen' 
        : teamLeadName.toLowerCase().includes('kanishkka') 
          ? 'kanishkka' 
          : null;

      if (!teamLeadKey) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid team lead name' 
        });
      }

      sheetName = TEAM_LEAD_SHEETS[teamLeadKey];
      const range = TICKET_ID_RANGES[teamLeadKey];
      prefix = range.prefix;
      start = range.start;
      console.log(`Generating ticket ID for team lead: ${teamLeadName} (${sheetName})`);
    }

    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

    // Fetch all tickets from the sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: `${sheetName}!B2:B`, // Column B contains Ticket ID
    });

    const rows = response.data.values || [];
    
    let nextNumber = start; // Default starting number

    if (rows.length > 0) {
      // Extract all ticket numbers and find the highest
      const ticketNumbers = rows
        .map(row => row[0]) // Get ticket ID from column B
        .filter(ticketId => ticketId && ticketId.startsWith(prefix))
        .map(ticketId => {
          const match = ticketId.match(/WG-TCK-(\d+)/);
          return match ? parseInt(match[1], 10) : 0;
        });

      if (memberName) {
        // For team members, find max in their range (1+)
        const validNumbers = ticketNumbers.filter(num => num >= 1);
        if (validNumbers.length > 0) {
          nextNumber = Math.max(...validNumbers) + 1;
        }
      } else {
        // For team leads, find max in their specific range
        const validNumbers = ticketNumbers.filter(num => num >= start && num < start + 100);
        if (validNumbers.length > 0) {
          nextNumber = Math.max(...validNumbers) + 1;
        }
      }
    }

    const ticketId = `${prefix}${nextNumber}`;
    
    console.log(`Generated ticket ID: ${ticketId}`);
    
    res.json({ 
      success: true, 
      ticketId: ticketId 
    });

  } catch (error) {
    console.error('Error generating ticket ID:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to generate ticket ID',
      error: error.message 
    });
  }
});

/**
 * POST /api/tickets/submit
 * Submit a new ticket to the team lead's or team member's Google Sheet
 */
router.post('/submit', authMiddleware, async (req, res) => {
  try {
    const {
      agentName,
      ticketId,
      ticketCreationDate,
      ticketCompletionDate,
      category,
      urgency,
      priority,
      status,
      sla,
      severity,
      carriedForward,
      escalationLevel,
      reopened,
      teamLeadName,
      memberName
    } = req.body;

    // Determine sheet name based on who's submitting
    let sheetName;
    
    if (memberName) {
      // Team member submission - use their own sheet
      sheetName = memberName;
      console.log(`Submitting ticket to team member sheet: ${sheetName}`);
    } else if (teamLeadName) {
      // Team lead submission - use team lead's sheet
      const teamLeadKey = teamLeadName.toLowerCase().includes('praveen') 
        ? 'praveen' 
        : teamLeadName.toLowerCase().includes('kanishkka') 
          ? 'kanishkka' 
          : null;

      if (!teamLeadKey) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid team lead name' 
        });
      }

      sheetName = TEAM_LEAD_SHEETS[teamLeadKey];
      console.log(`Submitting ticket to team lead sheet: ${sheetName}`);
    } else {
      // Use logged-in user's name from token
      const userName = req.user.name;
      sheetName = userName;
      console.log(`Submitting ticket to user's sheet: ${sheetName}`);
    }

    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

    // Prepare the row data matching the 13-column structure
    const rowData = [
      agentName || '',
      ticketId || '',
      ticketCreationDate || '',
      ticketCompletionDate || '',
      category || '',
      urgency || '',
      priority || '',
      status || '',
      sla || '', // Note: changed from slaCompliance to sla to match frontend
      severity || '',
      carriedForward || '',
      escalationLevel || '',
      reopened || ''
    ];

    // Append the row to the sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId: spreadsheetId,
      range: `${sheetName}!A:M`, // Columns A to M (13 columns)
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [rowData]
      }
    });

    activityLogger.logTicketChange(
      req.user.name || sheetName,
      req.user.role || 'Unknown',
      ticketId || 'N/A',
      'N/A',
      status || 'N/A'
    );

    console.log(`Ticket ${ticketId} submitted successfully to ${sheetName}`);

    res.json({ 
      success: true, 
      message: 'Ticket submitted successfully',
      ticketId: ticketId
    });

  } catch (error) {
    console.error('Error submitting ticket:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to submit ticket',
      error: error.message 
    });
  }
});

/**
 * GET /api/tickets/incomplete
 * Get all incomplete tickets for the logged-in user
 */
router.get('/incomplete', authMiddleware, async (req, res) => {
  try {
    const User = (await import('../models/User.js')).default;
    const user = await User.findById(req.user.id).select('name');
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const sheetName = user.name;
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

    console.log(`Fetching incomplete tickets for user: ${sheetName}`);

    // Fetch all data from the user's sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: `'${sheetName}'!A:M`, // All 13 columns
    });

    const rows = response.data.values;
    
    if (!rows || rows.length === 0) {
      return res.json({ 
        success: true, 
        tickets: []
      });
    }

    // First row is headers
    const headers = rows[0];
    const dataRows = rows.slice(1);

    // Find status column index (case-insensitive)
    const statusIndex = headers.findIndex(h => 
      h && h.toLowerCase().includes('status')
    );

    if (statusIndex === -1) {
      return res.status(500).json({
        success: false,
        message: 'Status column not found in sheet'
      });
    }

    // Filter incomplete tickets (not "Closed" or "Completed")
    const incompleteTickets = dataRows
      .map((row, index) => ({
        rowNumber: index + 2, // +2 because: +1 for header, +1 for 1-based indexing
        agentName: row[0] || '',
        ticketId: row[1] || '',
        createdDate: row[2] || '',
        completionDate: row[3] || '',
        category: row[4] || '',
        urgency: row[5] || '',
        priority: row[6] || '',
        status: row[7] || '',
        sla: row[8] || '',
        severity: row[9] || '',
        carriedForward: row[10] || '',
        escalationLevel: row[11] || '',
        reopened: row[12] || ''
      }))
      .filter(ticket => {
        const status = ticket.status.toLowerCase();
        return status !== 'closed' && status !== 'completed';
      });

    console.log(`Found ${incompleteTickets.length} incomplete tickets`);

    res.json({ 
      success: true, 
      tickets: incompleteTickets
    });

  } catch (error) {
    console.error('Error fetching incomplete tickets:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch incomplete tickets',
      error: error.message 
    });
  }
});

/**
 * PATCH /api/tickets/update-status
 * Update the status of a specific ticket
 */
router.patch('/update-status', authMiddleware, async (req, res) => {
  try {
    const { ticketId, newStatus } = req.body;

    if (!ticketId || !newStatus) {
      return res.status(400).json({
        success: false,
        message: 'Ticket ID and new status are required'
      });
    }

    const User = (await import('../models/User.js')).default;
    const user = await User.findById(req.user.id).select('name');
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const sheetName = user.name;
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

    console.log(`Updating ticket ${ticketId} status to ${newStatus} for user: ${sheetName}`);

    // Fetch all data to find the ticket
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: `'${sheetName}'!A:M`,
    });

    const rows = response.data.values;
    
    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No data found in sheet'
      });
    }

    // Find the row with matching ticket ID (column B, index 1)
    const ticketRowIndex = rows.findIndex((row, index) => 
      index > 0 && row[1] === ticketId // Skip header row
    );

    if (ticketRowIndex === -1) {
      return res.status(404).json({
        success: false,
        message: `Ticket ${ticketId} not found`
      });
    }

    const previousStatus = rows[ticketRowIndex][7] || 'N/A';

    // Update the status (column H, index 7)
    const rowNumber = ticketRowIndex + 1; // Convert to 1-based index
    const statusCell = `H${rowNumber}`; // Status is in column H

    await sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheetId,
      range: `'${sheetName}'!${statusCell}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[newStatus]]
      }
    });

    if (previousStatus !== newStatus) {
      activityLogger.logTicketChange(
        user.name,
        req.user.role || 'Unknown',
        ticketId,
        previousStatus,
        newStatus
      );
    }

    console.log(`Updated ticket ${ticketId} status to ${newStatus} at row ${rowNumber}`);

    res.json({
      success: true,
      message: 'Ticket status updated successfully',
      ticketId: ticketId,
      newStatus: newStatus
    });

  } catch (error) {
    console.error('Error updating ticket status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update ticket status',
      error: error.message
    });
  }
});

export default router;
