import AlertRecord from '../models/AlertRecord.js';
import { alertNotificationService } from '../services/alertNotificationService.js';
import { getEmployeeAlertStats } from '../services/ticketAnalysisService.js';
import User from '../models/User.js';
import PDFDocument from 'pdfkit';
import AlertSettings from '../models/AlertSettings.js';

/**
 * Trigger manual alert analysis and sending
 * Only accessible by Project Manager
 */
export const triggerAlertAnalysis = async (req, res) => {
  try {
    // Verify user is PM
    if (req.user.role !== 'project_manager') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Only Project Managers can trigger alerts.' 
      });
    }

    console.log('🚀 Manual alert analysis triggered by:', req.user.email);

    const result = await alertNotificationService.analyzeAndSendAlerts();

    res.status(200).json({
      success: true,
      message: 'Alert analysis completed',
      data: result
    });
  } catch (error) {
    console.error('❌ Error in triggerAlertAnalysis:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to trigger alert analysis',
      error: error.message
    });
  }
};

/**
 * Get all alert records (PM only)
 */
export const getAllAlertRecords = async (req, res) => {
  try {
    console.log('📋 getAllAlertRecords called by:', req.user.email, 'Role:', req.user.role);
    
    // Verify user is PM
    if (req.user.role !== 'project_manager') {
      console.log('❌ Access denied. User role:', req.user.role, 'Required: project_manager');
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Only Project Managers can view alert records.' 
      });
    }

    const { status, severity, employeeEmail, page = 1, limit = 50 } = req.query;

    // Build query
    const query = {};
    if (status) query.status = status;
    if (severity) query.severity = severity;
    if (employeeEmail) query.employeeEmail = employeeEmail;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const alerts = await AlertRecord.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('employeeId', 'name email role');

    const total = await AlertRecord.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        alerts,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('❌ Error in getAllAlertRecords:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch alert records',
      error: error.message
    });
  }
};

/**
 * Get alert records for a specific employee (PM only)
 */
export const getEmployeeAlertRecords = async (req, res) => {
  try {
    // Verify user is PM
    if (req.user.role !== 'project_manager') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Only Project Managers can view alert records.' 
      });
    }

    const { employeeEmail } = req.params;

    const alerts = await AlertRecord.find({ employeeEmail })
      .sort({ createdAt: -1 })
      .populate('employeeId', 'name email role');

    const stats = await getEmployeeAlertStats(employeeEmail);

    res.status(200).json({
      success: true,
      data: {
        employeeEmail,
        alerts,
        stats
      }
    });
  } catch (error) {
    console.error('❌ Error in getEmployeeAlertRecords:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employee alert records',
      error: error.message
    });
  }
};

/**
 * Get alert statistics summary (PM only)
 */
export const getAlertStatistics = async (req, res) => {
  try {
    console.log('📊 getAlertStatistics called by:', req.user.email, 'Role:', req.user.role);
    
    // Verify user is PM
    if (req.user.role !== 'project_manager') {
      console.log('❌ Access denied. User role:', req.user.role, 'Required: project_manager');
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Only Project Managers can view statistics.' 
      });
    }

    const totalAlerts = await AlertRecord.countDocuments();
    const activeAlerts = await AlertRecord.countDocuments({ status: 'Active' });
    const resolvedAlerts = await AlertRecord.countDocuments({ status: 'Resolved' });
    const escalatedAlerts = await AlertRecord.countDocuments({ status: 'Escalated' });

    const severityCounts = {
      Low: await AlertRecord.countDocuments({ severity: 'Low' }),
      Medium: await AlertRecord.countDocuments({ severity: 'Medium' }),
      High: await AlertRecord.countDocuments({ severity: 'High' }),
      Critical: await AlertRecord.countDocuments({ severity: 'Critical' })
    };

    // Get employees with most alerts
    const employeeAlertCounts = await AlertRecord.aggregate([
      {
        $group: {
          _id: '$employeeEmail',
          employeeName: { $first: '$employeeName' },
          totalAlerts: { $sum: 1 },
          activeAlerts: {
            $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] }
          },
          averageSeverity: { $avg: '$noOfAlertsSent' }
        }
      },
      { $sort: { totalAlerts: -1 } },
      { $limit: 10 }
    ]);

    // Recent alerts
    const recentAlerts = await AlertRecord.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('employeeId', 'name email');

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalAlerts,
          activeAlerts,
          resolvedAlerts,
          escalatedAlerts,
          severityCounts
        },
        topDefaulters: employeeAlertCounts,
        recentAlerts
      }
    });
  } catch (error) {
    console.error('❌ Error in getAlertStatistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch alert statistics',
      error: error.message
    });
  }
};

/**
 * Update alert status (PM only)
 */
export const updateAlertStatus = async (req, res) => {
  try {
    // Verify user is PM
    if (req.user.role !== 'project_manager') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Only Project Managers can update alerts.' 
      });
    }

    const { alertId } = req.params;
    const { status, notes } = req.body;

    const alert = await AlertRecord.findById(alertId);
    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alert record not found'
      });
    }

    if (status) alert.status = status;
    if (notes) alert.notes = notes;
    alert.updatedAt = new Date();

    await alert.save();

    res.status(200).json({
      success: true,
      message: 'Alert status updated successfully',
      data: alert
    });
  } catch (error) {
    console.error('❌ Error in updateAlertStatus:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update alert status',
      error: error.message
    });
  }
};

/**
 * Export employee alert records to PDF (PM only)
 */
export const exportEmployeeAlertsToPDF = async (req, res) => {
  try {
    // Verify user is PM
    if (req.user.role !== 'project_manager') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Only Project Managers can export reports.' 
      });
    }

    const { employeeEmail } = req.params;

    const alerts = await AlertRecord.find({ employeeEmail })
      .sort({ createdAt: -1 })
      .populate('employeeId', 'name email role');

    if (alerts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No alert records found for this employee'
      });
    }

    const stats = await getEmployeeAlertStats(employeeEmail);
    const employeeName = alerts[0].employeeName;

    // Create PDF
    const doc = new PDFDocument({ margin: 50 });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Alert_Records_${employeeName.replace(/\s+/g, '_')}_${Date.now()}.pdf"`);
    
    // Pipe PDF to response
    doc.pipe(res);

    // PDF Header
    doc.fontSize(20).text('Alert Records Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Employee: ${employeeName}`, { align: 'center' });
    doc.text(`Email: ${employeeEmail}`, { align: 'center' });
    doc.text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown(2);

    // Statistics Summary
    doc.fontSize(16).text('Summary Statistics', { underline: true });
    doc.moveDown();
    doc.fontSize(11);
    doc.text(`Total Alerts: ${stats.totalAlerts}`);
    doc.text(`Active Alerts: ${stats.activeAlerts}`);
    doc.text(`Resolved Alerts: ${stats.resolvedAlerts}`);
    doc.text(`Escalated Alerts: ${stats.escalatedAlerts}`);
    doc.moveDown();
    doc.text('Severity Breakdown:');
    doc.text(`  • Critical: ${stats.severityCounts.Critical}`);
    doc.text(`  • High: ${stats.severityCounts.High}`);
    doc.text(`  • Medium: ${stats.severityCounts.Medium}`);
    doc.text(`  • Low: ${stats.severityCounts.Low}`);
    doc.moveDown(2);

    // Alert Records
    doc.fontSize(16).text('Alert Records', { underline: true });
    doc.moveDown();

    alerts.forEach((alert, index) => {
      // Check if we need a new page
      if (doc.y > 700) {
        doc.addPage();
      }

      doc.fontSize(12).text(`Alert #${index + 1}`, { underline: true });
      doc.fontSize(10);
      doc.text(`Alert No: ${alert.alertNo}`);
      doc.text(`Ticket No: ${alert.ticketNo}`);
      doc.text(`Severity: ${alert.severity}`);
      doc.text(`Status: ${alert.status}`);
      doc.text(`Alerts Sent: ${alert.noOfAlertsSent}`);
      doc.text(`Created: ${new Date(alert.createdAt).toLocaleString()}`);
      doc.text(`Last Alert: ${new Date(alert.lastAlertSentAt).toLocaleString()}`);
      
      if (alert.ticketDetails && alert.ticketDetails.incompleteFields) {
        doc.text('Incomplete Fields:');
        alert.ticketDetails.incompleteFields.forEach(field => {
          doc.text(`  • ${field}`, { indent: 20 });
        });
      }

      if (alert.notes) {
        doc.text(`Notes: ${alert.notes}`);
      }

      doc.moveDown(1.5);
    });

    // Footer
    doc.fontSize(8).text(
      'This is a confidential document. For Project Manager use only.',
      50,
      doc.page.height - 50,
      { align: 'center' }
    );

    // Finalize PDF
    doc.end();

  } catch (error) {
    console.error('❌ Error in exportEmployeeAlertsToPDF:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Failed to export alert records',
        error: error.message
      });
    }
  }
};

/**
 * Delete alert record (PM only)
 */
export const deleteAlertRecord = async (req, res) => {
  try {
    // Verify user is PM
    if (req.user.role !== 'project_manager') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Only Project Managers can delete alerts.' 
      });
    }

    const { alertId } = req.params;

    const alert = await AlertRecord.findByIdAndDelete(alertId);
    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alert record not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Alert record deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error in deleteAlertRecord:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete alert record',
      error: error.message
    });
  }
};

/**
 * Get alert settings (PM only)
 */
export const getAlertSettings = async (req, res) => {
  try {
    // Verify user is PM
    if (req.user.role !== 'project_manager') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Only Project Managers can view settings.' 
      });
    }

    const settings = await AlertSettings.getSettings();

    res.status(200).json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('❌ Error in getAlertSettings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch alert settings',
      error: error.message
    });
  }
};

/**
 * Update alert settings (PM only)
 */
export const updateAlertSettings = async (req, res) => {
  try {
    // Verify user is PM
    if (req.user.role !== 'project_manager') {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Only Project Managers can update settings.' 
      });
    }

    const updates = req.body;
    const settings = await AlertSettings.updateSettings(updates, req.user.email);

    console.log('⚙️ Alert settings updated by:', req.user.email);
    console.log('📝 New settings:', JSON.stringify(settings, null, 2));

    res.status(200).json({
      success: true,
      message: 'Alert settings updated successfully',
      data: settings
    });
  } catch (error) {
    console.error('❌ Error in updateAlertSettings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update alert settings',
      error: error.message
    });
  }
};
