import express from "express";
import { authMiddleware, authorizeRoles } from "../middleware/auth.js";
import DateValidator from "../middleware/dateValidation.js";
import eventLogger from "../services/eventLogger.js";
import { sheets, appendRow } from "../services/googleSheets.js";
import { getUserMetricsData, getAllTeamMetricsData } from "../services/userSheetsService.js";
import { getAllTeamTicketData, getMemberTicketData } from "../services/ticketSheetsService.js";
import User from "../models/User.js";
import compression from 'compression';
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();
const router = express.Router();

// Route to verify Google Sheets access
router.get('/verify-sheets', authMiddleware, async (req, res) => {
  try {
    const { validateSheet } = await import('../services/googleSheets.js');
    const isValid = await validateSheet(process.env.GOOGLE_SPREADSHEET_ID);
    res.json({
      success: true,
      accessible: isValid,
      message: isValid ? 'Google Sheets is accessible' : 'Google Sheets is not accessible'
    });
  } catch (error) {
    console.error('Sheets verification error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  console.error('Metrics Route Error:', err);
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({ message: err.message });
  }
  
  if (err.code === 'ECONNABORTED') {
    return res.status(408).json({ message: 'Request timeout' });
  }
  
  res.status(500).json({ 
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
};

// APPROVED EMAILS FOR METRICS SUBMISSION
// Only users with these email addresses can submit metrics to dashboards
const APPROVED_EMAILS = [
  'dhaanushk1110@gmail.com',      // Project Manager - unchanged
  'kanishkka0208@gmail.com',      // Team Member
  'japraveen1212@gmail.com',      // Team Member  
  'winnish0703@gmail.com',        // Team Member
  'reddyvuppu3@gmail.com',        // Team Member - Updated
  'jsam290104@gmail.com',         // Team Member - Updated
  'kkumar210504@gmail.com'        // Team Member
];

/**
 * Middleware to validate if user email is approved for metrics submission
 */
const validateApprovedEmail = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!APPROVED_EMAILS.includes(user.email)) {
      return res.status(403).json({ 
        message: "Access denied: Your email is not approved for metrics submission",
        userEmail: user.email,
        approvedEmails: APPROVED_EMAILS
      });
    }

    req.user.email = user.email; // Attach email to request for further use
    next();
  } catch (error) {
    console.error('Error validating email:', error);
    res.status(500).json({ message: "Error validating user email" });
  }
};

console.log('Using spreadsheet ID:', process.env.GOOGLE_SPREADSHEET_ID);

// Update metrics route with date validation and logging
router.put(
  "/update",
  authMiddleware,
  validateApprovedEmail,
  DateValidator.validateDateForEntry,
  async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      console.log(`✅ Metrics update approved for: ${user.email}`);

      const {
        date,
        ticketsAssigned,
        ticketsResolved,
        slaBreaches,
        reopenedTickets,
        clientInteractions,
        remarks
      } = req.body;

      if (!date) {
        return res.status(400).json({ message: "Date is required for updates" });
      }

      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      });

      const userSheet = spreadsheet.data.sheets.find(sheet => 
        sheet.properties.title === user.name
      );

      if (!userSheet) {
        throw new Error("No sheet found for this user");
      }

      // Get current data to find the row to update
      const range = `${user.name}!A:I`;
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
        range: range,
      });

      const rows = result.data.values || [];
      let rowIndex = -1;
      let oldValues = {};

      // Find the row with matching date
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] === date) {
          rowIndex = i + 1; // Sheet rows are 1-indexed
          oldValues = {
            ticketsAssigned: rows[i][3] || '',
            ticketsResolved: rows[i][4] || '',
            slaBreaches: rows[i][5] || '',
            reopenedTickets: rows[i][6] || '',
            clientInteractions: rows[i][7] || '',
            remarks: rows[i][8] || ''
          };
          break;
        }
      }

      if (rowIndex === -1) {
        return res.status(404).json({ message: "No entry found for the specified date" });
      }

      // Update the specific row
      const updateRange = `${user.name}!A${rowIndex}:I${rowIndex}`;
      const newValues = [
        date,
        user.name,
        user.email,
        ticketsAssigned,
        ticketsResolved,
        slaBreaches,
        reopenedTickets,
        clientInteractions,
        remarks,
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
        range: updateRange,
        valueInputOption: 'RAW',
        resource: {
          values: [newValues]
        }
      });

      // Log the update to activity logger
      // Log each changed field to event logger
      const fields = [
        { name: 'Tickets Assigned', old: oldValues.ticketsAssigned, new: ticketsAssigned },
        { name: 'Tickets Resolved', old: oldValues.ticketsResolved, new: ticketsResolved },
        { name: 'SLA Breaches', old: oldValues.slaBreaches, new: slaBreaches },
        { name: 'Reopened Tickets', old: oldValues.reopenedTickets, new: reopenedTickets },
        { name: 'Client Interactions', old: oldValues.clientInteractions, new: clientInteractions },
        { name: 'Remarks', old: oldValues.remarks, new: remarks }
      ];

      for (const field of fields) {
        if (field.old !== field.new.toString()) {
          await eventLogger.logEvent({
            userName: user.name,
            userRole: user.role,
            action: 'UPDATE',
            sheetName: user.name,
            cellRange: `Row ${rowIndex}`,
            oldValue: field.old,
            newValue: field.new,
            rowName: `Metrics for ${date}`,
            columnName: field.name
          });
        }
      }

      res.status(200).json({ 
        message: "Metrics updated successfully",
        date: date,
        userName: user.name
      });
    } catch (err) {
      console.error('Error updating metrics:', err);
      res.status(500).json({ message: err.message });
    }
  }
);

// Team Lead checks team's status
router.get(
  "/team",
  authMiddleware,
  authorizeRoles("team_lead"),
  (req, res) => {
    res.json({ message: "Team Lead can see team metrics" });
  }
);

// Consolidated KPI calculation function
function calculateUserKPIs(data, options = { includeEfficiency: false }) {
  // Use simple for loop
  let totalTasks = 0;
  let completedTasks = 0;
  let pendingTasks = 0;
  let lateTasks = 0;
  let totalClientInteractions = 0;
  
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    totalTasks += d.totalTasks || 0;
    completedTasks += d.completed || 0;
    pendingTasks += d.pending || 0;
    lateTasks += d.late || 0;
    totalClientInteractions += d.clientInteractions || 0;
  }

  const result = {
    totalTasks,
    completedTasks,
    pendingTasks,
    lateTasks,
    totalClientInteractions,
    completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
  };

  if (options.includeEfficiency) {
    result.efficiency = totalClientInteractions > 0 
      ? Math.round((completedTasks / totalClientInteractions) * 100) / 100 
      : 0;
  }

  return result;
}

// Submit metrics route with date validation, email validation, and logging
router.post(
  "/submit",
  authMiddleware,
  validateApprovedEmail,
  DateValidator.validateDateForTeamLead,
  async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      console.log(`✅ Metrics submission approved for: ${user.email}`);

      const {
        date,
        ticketsAssigned,
        ticketsResolved,
        slaBreaches,
        reopenedTickets,
        clientInteractions,
        remarks
      } = req.body;

      // Use provided date or current date in MM/DD/YYYY format
      const submissionDate = date || new Date().toLocaleDateString('en-US');

      const values = [
        submissionDate,
        user.name,
        user.email,
        ticketsAssigned,
        ticketsResolved,
        slaBreaches,
        reopenedTickets,
        clientInteractions,
        remarks,
      ];

      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      });

      const userSheet = spreadsheet.data.sheets.find(sheet => 
        sheet.properties.title === user.name
      );

      if (!userSheet) {
        throw new Error("No sheet found for this user");
      }

      // Create the range for append operation
      const range = `${userSheet.properties.title}!A:I`;
      await appendRow(process.env.GOOGLE_SPREADSHEET_ID, range, values);

      // Log the submission to activity logger
      // Log the submission to event logger
      await eventLogger.logEvent({
        userName: user.name,
        userRole: user.role,
        action: 'INSERT',
        sheetName: user.name,
        cellRange: `Row for ${submissionDate}`,
        newValue: JSON.stringify({
          ticketsAssigned,
          ticketsResolved,
          slaBreaches,
          reopenedTickets,
          clientInteractions
        }),
        rowName: `Metrics for ${submissionDate}`,
        columnName: 'All Fields'
      });

      res.status(201).json({ 
        message: "Metrics submitted to Google Sheet",
        date: submissionDate,
        userName: user.name,
        userEmail: user.email
      });
    } catch (err) {
      console.error('Error submitting metrics:', err);
      res.status(500).json({ message: err.message });
    }
  }
);

// Get individual user metrics with KPIs (for team leads and approved team members)
router.get(
  "/user",
  authMiddleware,
  async (req, res) => {
    try {
      console.log('=== /user endpoint called ===');
      console.log('User from token:', req.user);
      
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      console.log('Found user in database:', {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      });

      // Check if user is team lead or approved team member
      const isTeamLead = user.role === 'team_lead';
      const isApprovedMember = APPROVED_EMAILS.includes(user.email);

      if (!isTeamLead && !isApprovedMember) {
        return res.status(403).json({ 
          message: "Access denied: Only team leads and approved team members can access this endpoint",
          userRole: user.role,
          userEmail: user.email
        });
      }

      console.log(`✅ Metrics dashboard access approved for: ${user.email} (${user.role})`);

      // For exact sheet name matching
      const userFullName = user.name; // This should match exactly with the sheet name
      console.log('Attempting to get ticket data for user:', userFullName, 'with spreadsheet ID:', process.env.GOOGLE_SPREADSHEET_ID);
      
      try {
        // Use new ticket service to get member-specific data
        const memberData = await getMemberTicketData(process.env.GOOGLE_SPREADSHEET_ID, userFullName);
        console.log('Retrieved tickets count:', memberData.tickets.length);
        console.log('Member KPIs:', memberData.kpis);
        
        res.json({
          tickets: memberData.tickets,
          kpis: memberData.kpis,
          userName: user.name,
          userEmail: user.email,
          userRole: user.role,
          // For backward compatibility, map tickets to metrics format
          metrics: memberData.tickets
        });
      } catch (error) {
        console.error('Error fetching ticket data:', error);
        console.error('Error details:', {
          message: error.message,
          stack: error.stack
        });
        res.status(500).json({
          message: "Failed to fetch user ticket data",
          error: error.message,
          userName: userFullName,
          spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
          availableSheets: 'Check that user name matches Google Sheet tab name exactly'
        });
      }
    } catch (err) {
      console.error('Error in /user route:', err);
      // Send a more specific error message
      res.status(500).json({ 
        message: "Failed to fetch user metrics", 
        error: err.message,
        details: process.env.NODE_ENV === 'development' ? err.stack : undefined
      });
    }
  }
);

// Project Manager and Team Lead access to all team metrics
router.get(
  "/all",
  authMiddleware,
  authorizeRoles("project_manager", "team_lead"),
  async (req, res) => {
    try {
      console.log('=== /metrics/all endpoint called ===');
      console.log('User:', req.user);
      
      const forceRefresh = req.query.refresh === 'true';
      const teamData = await getAllTeamTicketData(process.env.GOOGLE_SPREADSHEET_ID, forceRefresh);
      console.log('Team ticket data received:', typeof teamData, Object.keys(teamData || {}));
      
      // teamData structure from ticket service:
      // - totalTickets
      // - teamMembers (array of names)
      // - userMetrics (tickets by member)
      // - individualKPIs (KPIs by member)
      // - aggregatedKPIs (aggregated across all members)
      // - rawTickets (all tickets flattened)
      
      console.log('Sending team data:', {
        totalTickets: teamData.totalTickets,
        teamMembers: teamData.teamMembers,
        aggregatedKPIs: teamData.aggregatedKPIs
      });

      res.json({
        allMetrics: teamData.rawTickets, // For backward compatibility
        aggregatedKPIs: teamData.aggregatedKPIs,
        individualKPIs: teamData.individualKPIs,
        userMetrics: teamData.userMetrics,
        teamMembers: teamData.teamMembers,
        totalTickets: teamData.totalTickets
      });
    } catch (err) {
      console.error('Error fetching all metrics:', err);
      res.status(500).json({ message: err.message });
    }
  }
);

router.get(
  "/download",
  authMiddleware,
  authorizeRoles("team_lead", "project_manager"),
  (req, res) => {
    const filePath = path.join(process.cwd(), "metrics.xlsx");

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "Metrics file not found" });
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=metrics.xlsx");

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  }
);

export default router;