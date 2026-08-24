import express from "express";
import { authMiddleware, authorizeRoles } from "../middleware/auth.js";
import activityLogger from "../utils/activityLogger.js";
import path from "path";
import fs from "fs";

const router = express.Router();

// Get activity logs (admin/team lead only)
router.get(
  "/activity",
  authMiddleware,
  authorizeRoles("project_manager", "team_lead"),
  async (req, res) => {
    try {
      console.log(`Activity logs requested by: ${req.user.name} (${req.user.role})`);
      
      const logs = activityLogger.readLogs();
      
      res.json({ 
        logs, 
        total: logs.length,
        message: logs.length === 0 ? 'No activity logs found' : `Found ${logs.length} activity logs`
      });
      
    } catch (error) {
      console.error('Error reading activity logs:', error);
      res.status(500).json({ message: 'Error retrieving activity logs' });
    }
  }
);

// Download activity logs as Excel file
router.get(
  "/activity/download",
  authMiddleware,
  authorizeRoles("project_manager", "team_lead"),
  async (req, res) => {
    try {
      console.log(`Activity logs download requested by: ${req.user.name} (${req.user.role})`);
      
      const logFilePath = activityLogger.getLogFilePath();
      
      if (!fs.existsSync(logFilePath)) {
        return res.status(404).json({ message: 'No activity logs found' });
      }

      const fileName = `activity_log_${new Date().toISOString().split('T')[0]}.xlsx`;
      
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      
      res.sendFile(path.resolve(logFilePath));
      
    } catch (error) {
      console.error('Error downloading activity logs:', error);
      res.status(500).json({ message: 'Error downloading activity logs' });
    }
  }
);

// Get activity logs summary/stats
router.get(
  "/activity/stats",
  authMiddleware,
  authorizeRoles("project_manager", "team_lead"),
  async (req, res) => {
    try {
      const logs = activityLogger.readLogs();
      
      const totalLogs = logs.length;
      const uniqueEmployees = [...new Set(logs.map(log => log.employeeName).filter(Boolean))];

      const roleStats = logs.reduce((acc, log) => {
        const role = log.role || 'Unknown';
        acc[role] = (acc[role] || 0) + 1;
        return acc;
      }, {});

      const statusAfterStats = logs.reduce((acc, log) => {
        const status = log.statusAfter || 'Unknown';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});

      const statusBeforeStats = logs.reduce((acc, log) => {
        const status = log.statusBefore || 'Unknown';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const recentLogs = logs.filter(log => {
        const logDate = new Date(log.dateTime);
        return logDate >= sevenDaysAgo;
      });
      
      res.json({
        totalLogs,
        uniqueEmployees: uniqueEmployees.length,
        roleStats,
        statusBeforeStats,
        statusAfterStats,
        recentActivity: recentLogs.length,
        usersList: uniqueEmployees,
        latestChanges: logs.slice(0, 5)
      });
      
    } catch (error) {
      console.error('Error getting activity stats:', error);
      res.status(500).json({ message: 'Error retrieving activity statistics' });
    }
  }
);

export default router;