import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  triggerAlertAnalysis,
  getAllAlertRecords,
  getEmployeeAlertRecords,
  getAlertStatistics,
  updateAlertStatus,
  exportEmployeeAlertsToPDF,
  deleteAlertRecord,
  getAlertSettings,
  updateAlertSettings
} from '../controllers/alertController.js';

const router = express.Router();

// All routes require authentication and PM role (verified in controller)
router.use(authMiddleware);

/**
 * @route   POST /api/alerts/trigger
 * @desc    Manually trigger alert analysis and sending (PM only)
 * @access  Private (PM only)
 */
router.post('/trigger', triggerAlertAnalysis);

/**
 * @route   GET /api/alerts
 * @desc    Get all alert records with pagination and filters (PM only)
 * @access  Private (PM only)
 */
router.get('/', getAllAlertRecords);

/**
 * @route   GET /api/alerts/statistics
 * @desc    Get alert statistics summary (PM only)
 * @access  Private (PM only)
 */
router.get('/statistics', getAlertStatistics);

/**
 * @route   GET /api/alerts/employee/:employeeEmail
 * @desc    Get alert records for specific employee (PM only)
 * @access  Private (PM only)
 */
router.get('/employee/:employeeEmail', getEmployeeAlertRecords);

/**
 * @route   GET /api/alerts/employee/:employeeEmail/export
 * @desc    Export employee alert records to PDF (PM only)
 * @access  Private (PM only)
 */
router.get('/employee/:employeeEmail/export', exportEmployeeAlertsToPDF);

/**
 * @route   PUT /api/alerts/:alertId
 * @desc    Update alert status or notes (PM only)
 * @access  Private (PM only)
 */
router.put('/:alertId', updateAlertStatus);

/**
 * @route   DELETE /api/alerts/:alertId
 * @desc    Delete alert record (PM only)
 * @access  Private (PM only)
 */
router.delete('/:alertId', deleteAlertRecord);

/**
 * @route   GET /api/alerts/settings
 * @desc    Get alert settings (PM only)
 * @access  Private (PM only)
 */
router.get('/settings', getAlertSettings);

/**
 * @route   POST /api/alerts/settings
 * @desc    Update alert settings (PM only)
 * @access  Private (PM only)
 */
router.post('/settings', updateAlertSettings);

export default router;
