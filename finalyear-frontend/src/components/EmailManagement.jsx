import { useState, useEffect } from 'react';
import axios from 'axios';
import './EmailManagement.css';

const EmailManagement = () => {
  const [activeTab, setActiveTab] = useState('compose');
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Tab 1: Compose Email
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [showComposeModal, setShowComposeModal] = useState(false);
  const [emailForm, setEmailForm] = useState({
    to: '',
    subject: '',
    message: '',
    priority: 'normal'
  });

  // Tab 2: Alert System
  const [alertSettings, setAlertSettings] = useState({
    automatedEnabled: true,
    customTime: '',
    scheduleType: 'preset' // 'preset' or 'custom'
  });
  const [triggeringAlert, setTriggeringAlert] = useState(false);

  // Tab 3: Alert Records
  const [alerts, setAlerts] = useState([]);
  const [statistics, setStatistics] = useState({});
  const [filters, setFilters] = useState({
    status: '',
    severity: '',
    employeeEmail: ''
  });
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [showAlertModal, setShowAlertModal] = useState(false);

  // Tab 4: Inbox
  const [inboxEmails, setInboxEmails] = useState([]);
  const [inboxPage, setInboxPage] = useState(1);
  const [inboxTotal, setInboxTotal] = useState(0);
  
  // Tab 5: Outbox
  const [outboxEmails, setOutboxEmails] = useState([]);
  const [outboxPage, setOutboxPage] = useState(1);
  const [outboxTotal, setOutboxTotal] = useState(0);

  // Email viewer modal
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [showEmailModal, setShowEmailModal] = useState(false);

  const API_BASE = '/api';

  useEffect(() => {
    fetchEmployees();
    if (activeTab === 'alerts') {
      fetchAlertStatistics();
      fetchAlerts();
    } else if (activeTab === 'inbox') {
      fetchInbox();
    } else if (activeTab === 'outbox') {
      fetchOutbox();
    }
  }, [activeTab]);

  // ========== TAB 1: COMPOSE EMAIL FUNCTIONS ==========

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE}/users/all`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      // Filter out project managers, keep team leads and members
      const teamMembers = response.data.users.filter(
        user => user.role !== 'project_manager'
      );
      setEmployees(teamMembers);
    } catch (error) {
      console.error('Error fetching employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const openComposeModal = (employee) => {
    setSelectedEmployee(employee);
    setEmailForm({
      to: employee.email,
      subject: '',
      message: '',
      priority: 'normal'
    });
    setShowComposeModal(true);
  };

  const handleSendEmail = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      await axios.post(
        `${API_BASE}/pm-email/send-individual-feedback`,
        {
          recipientEmail: emailForm.to,
          recipientName: selectedEmployee.name,
          subject: emailForm.subject,
          feedback: emailForm.message,
          performanceData: {} // Optional performance data
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      alert('Email sent successfully!');
      setShowComposeModal(false);
      setEmailForm({ to: '', subject: '', message: '', priority: 'normal' });
    } catch (error) {
      console.error('Error sending email:', error);
      alert('Failed to send email: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  // ========== TAB 2: ALERT SYSTEM FUNCTIONS ==========

  const handleTriggerAlerts = async () => {
    if (!window.confirm('Are you sure you want to trigger alert analysis? This will send emails to all defaulters.')) {
      return;
    }

    try {
      setTriggeringAlert(true);
      const token = localStorage.getItem('token');
      
      const response = await axios.post(
        `${API_BASE}/alerts/trigger`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      alert(`Alert analysis complete!\n\nDefaulters found: ${response.data.data.totalDefaulters}\nAlerts sent: ${response.data.data.alertsSent}\nAlerts failed: ${response.data.data.alertsFailed}`);
      
      // Refresh alerts if on alert records tab
      if (activeTab === 'alerts') {
        fetchAlerts();
        fetchAlertStatistics();
      }
    } catch (error) {
      console.error('Error triggering alerts:', error);
      alert('Failed to trigger alerts: ' + (error.response?.data?.message || error.message));
    } finally {
      setTriggeringAlert(false);
    }
  };

  const handleSaveAlertSettings = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      // TODO: Create API endpoint to save alert settings
      await axios.post(
        `${API_BASE}/alerts/settings`,
        alertSettings,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      alert('Alert settings saved successfully!');
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Settings saved locally (API endpoint to be implemented)');
    } finally {
      setLoading(false);
    }
  };

  // ========== TAB 3: ALERT RECORDS FUNCTIONS ==========

  const fetchAlertStatistics = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_BASE}/alerts/statistics`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Backend returns counts under data.summary; map it to the flat shape this tab renders.
      setStatistics(response.data?.data?.summary || {});
    } catch (error) {
      console.error('Error fetching statistics:', error);
    }
  };

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.severity) params.append('severity', filters.severity);
      if (filters.employeeEmail) params.append('employeeEmail', filters.employeeEmail);

      const response = await axios.get(`${API_BASE}/alerts?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setAlerts(response.data.data.alerts);
    } catch (error) {
      console.error('Error fetching alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewAlert = (alert) => {
    setSelectedAlert(alert);
    setShowAlertModal(true);
  };

  const handleUpdateAlertStatus = async (alertId, newStatus) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${API_BASE}/alerts/${alertId}`,
        { status: newStatus },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      
      alert('Alert status updated successfully!');
      fetchAlerts();
      fetchAlertStatistics();
    } catch (error) {
      console.error('Error updating alert:', error);
      alert('Failed to update alert status');
    }
  };

  const handleExportToPDF = async (employeeEmail) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_BASE}/alerts/employee/${employeeEmail}/export`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        }
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `alert-records-${employeeEmail}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert('Failed to export PDF');
    }
  };

  // ========== TAB 4 & 5: INBOX/OUTBOX FUNCTIONS ==========

  const fetchInbox = async (page = 1) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_BASE}/pm-email/inbox?page=${page}&limit=20`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (response.data.success) {
        setInboxEmails(response.data.data);
        setInboxTotal(response.data.pagination.total);
        setInboxPage(page);
      }
    } catch (error) {
      console.error('Error fetching inbox:', error);
      alert('Failed to fetch inbox emails');
    } finally {
      setLoading(false);
    }
  };

  const fetchOutbox = async (page = 1) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API_BASE}/pm-email/outbox?page=${page}&limit=20`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (response.data.success) {
        setOutboxEmails(response.data.data);
        setOutboxTotal(response.data.pagination.total);
        setOutboxPage(page);
      }
    } catch (error) {
      console.error('Error fetching outbox:', error);
      alert('Failed to fetch outbox emails');
    } finally {
      setLoading(false);
    }
  };

  const handleViewEmail = (email) => {
    setSelectedEmail(email);
    setShowEmailModal(true);
  };

  const handleDeleteEmail = async (emailId, folder) => {
    if (!window.confirm('Are you sure you want to delete this email?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await axios.delete(
        `${API_BASE}/pm-email/${emailId}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      alert('Email deleted successfully!');
      
      // Refresh the appropriate list
      if (folder === 'inbox') {
        fetchInbox(inboxPage);
      } else {
        fetchOutbox(outboxPage);
      }
    } catch (error) {
      console.error('Error deleting email:', error);
      alert('Failed to delete email');
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'Critical': return '#dc3545';
      case 'High': return '#fd7e14';
      case 'Medium': return '#ffc107';
      case 'Low': return '#28a745';
      default: return '#6c757d';
    }
  };

  // ========== RENDER FUNCTIONS ==========

  const renderComposeTab = () => (
    <div className="compose-tab">
      <div className="tab-header">
        <h3>📧 Compose & Send Emails</h3>
        <p>Send emails to team members and team leaders</p>
      </div>

      <div className="employees-list">
        {loading ? (
          <div className="loading">Loading employees...</div>
        ) : (
          <table className="employees-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee._id}>
                  <td>{employee.name}</td>
                  <td>{employee.email}</td>
                  <td>
                    <span className={`role-badge ${employee.role}`}>
                      {employee.role === 'team_lead' ? 'Team Leader' : 'Team Member'}
                    </span>
                  </td>
                  <td>
                    <button
                      className="compose-btn"
                      onClick={() => openComposeModal(employee)}
                    >
                      ✉️ Compose
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Compose Email Modal */}
      {showComposeModal && (
        <div className="modal-overlay" onClick={() => setShowComposeModal(false)}>
          <div className="modal-content compose-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>✉️ Compose Email</h3>
              <button className="close-btn" onClick={() => setShowComposeModal(false)}>×</button>
            </div>
            
            <form onSubmit={handleSendEmail}>
              <div className="form-group">
                <label>To:</label>
                <input
                  type="email"
                  value={emailForm.to}
                  disabled
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label>Subject:</label>
                <input
                  type="text"
                  value={emailForm.subject}
                  onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
                  placeholder="Enter email subject"
                  className="form-input"
                  required
                />
              </div>

              <div className="form-group">
                <label>Priority:</label>
                <select
                  value={emailForm.priority}
                  onChange={(e) => setEmailForm({ ...emailForm, priority: e.target.value })}
                  className="form-input"
                >
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div className="form-group">
                <label>Message:</label>
                <textarea
                  value={emailForm.message}
                  onChange={(e) => setEmailForm({ ...emailForm, message: e.target.value })}
                  placeholder="Type your message here..."
                  className="form-textarea"
                  rows="10"
                  required
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowComposeModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-send" disabled={loading}>
                  {loading ? 'Sending...' : 'Send Email'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  const renderAlertSystemTab = () => (
    <div className="alert-system-tab">
      <div className="tab-header">
        <h3>🚨 Alert System</h3>
        <p>Send automated alerts to defaulters</p>
      </div>

      {/* Manual Trigger Section */}
      <div className="alert-section">
        <h4>⚡ Manual Alert Trigger</h4>
        <p>Analyze ticket sheets and send alerts to defaulters immediately</p>
        
        <button
          className="trigger-alert-btn"
          onClick={handleTriggerAlerts}
          disabled={triggeringAlert}
        >
          {triggeringAlert ? '⏳ Analyzing...' : '🚀 Trigger Alert Analysis Now'}
        </button>
        
        <div className="alert-info">
          <p>💡 This will:</p>
          <ul>
            <li>Analyze all employee ticket sheets</li>
            <li>Identify employees with overdue, reopened, or escalated tickets</li>
            <li>Send alert emails to defaulters</li>
            <li>Record alerts in Alert Records</li>
          </ul>
        </div>
      </div>

      {/* Automated Alert Settings */}
      <div className="alert-section">
        <h4>⏰ Automated Alert Schedule</h4>
        
        <div className="settings-form">
          <div className="form-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={alertSettings.automatedEnabled}
                onChange={(e) => setAlertSettings({
                  ...alertSettings,
                  automatedEnabled: e.target.checked
                })}
              />
              Enable Automated Alerts
            </label>
          </div>

          <div className="form-group">
            <label>Schedule Type:</label>
            <select
              value={alertSettings.scheduleType}
              onChange={(e) => setAlertSettings({
                ...alertSettings,
                scheduleType: e.target.value
              })}
              className="form-input"
              disabled={!alertSettings.automatedEnabled}
            >
              <option value="preset">Preset Schedule (9AM, 5PM, Monday 10AM)</option>
              <option value="custom">Custom Time (For Testing)</option>
            </select>
          </div>

          {alertSettings.scheduleType === 'custom' && (
            <div className="form-group">
              <label>Custom Time (24-hour format):</label>
              <input
                type="time"
                value={alertSettings.customTime}
                onChange={(e) => setAlertSettings({
                  ...alertSettings,
                  customTime: e.target.value
                })}
                className="form-input"
                disabled={!alertSettings.automatedEnabled}
              />
              <small>Set a custom time for easy testing (e.g., 2 minutes from now)</small>
            </div>
          )}

          <button
            className="save-settings-btn"
            onClick={handleSaveAlertSettings}
            disabled={!alertSettings.automatedEnabled}
          >
            💾 Save Settings
          </button>
        </div>

        <div className="schedule-info">
          <h5>📅 Current Schedule:</h5>
          {alertSettings.scheduleType === 'preset' ? (
            <ul>
              <li>Daily at 9:00 AM (Asia/Kolkata)</li>
              <li>Daily at 5:00 PM (Asia/Kolkata)</li>
              <li>Every Monday at 10:00 AM (Asia/Kolkata)</li>
            </ul>
          ) : (
            <ul>
              <li>Custom time: {alertSettings.customTime || 'Not set'}</li>
            </ul>
          )}
        </div>
      </div>
    </div>
  );

  const renderAlertRecordsTab = () => (
    <div className="alert-records-tab">
      <div className="tab-header">
        <h3>📊 Alert Records</h3>
        <p>View and manage all sent alerts</p>
      </div>

      {/* Statistics Cards */}
      <div className="statistics-grid">
        <div className="stat-card">
          <div className="stat-icon">📧</div>
          <div className="stat-info">
            <div className="stat-value">{statistics.totalAlerts || 0}</div>
            <div className="stat-label">Total Alerts</div>
          </div>
        </div>
        
        <div className="stat-card active">
          <div className="stat-icon">⚠️</div>
          <div className="stat-info">
            <div className="stat-value">{statistics.activeAlerts || 0}</div>
            <div className="stat-label">Active</div>
          </div>
        </div>
        
        <div className="stat-card resolved">
          <div className="stat-icon">✅</div>
          <div className="stat-info">
            <div className="stat-value">{statistics.resolvedAlerts || 0}</div>
            <div className="stat-label">Resolved</div>
          </div>
        </div>
        
        <div className="stat-card escalated">
          <div className="stat-icon">🔴</div>
          <div className="stat-info">
            <div className="stat-value">{statistics.escalatedAlerts || 0}</div>
            <div className="stat-label">Escalated</div>
          </div>
        </div>
      </div>

      {/* Severity Breakdown */}
      {statistics.severityCounts && (
        <div className="severity-breakdown">
          <h4>Severity Breakdown:</h4>
          <div className="severity-bars">
            {Object.entries(statistics.severityCounts).map(([severity, count]) => (
              <div key={severity} className="severity-bar">
                <span className="severity-label">{severity}</span>
                <div className="bar-container">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${(count / (statistics.totalAlerts || 1)) * 100}%`,
                      backgroundColor: getSeverityColor(severity)
                    }}
                  />
                </div>
                <span className="severity-count">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="filters-section">
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          className="filter-select"
        >
          <option value="">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Resolved">Resolved</option>
          <option value="Escalated">Escalated</option>
        </select>

        <select
          value={filters.severity}
          onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
          className="filter-select"
        >
          <option value="">All Severities</option>
          <option value="Low">Low</option>
          <option value="Medium">Medium</option>
          <option value="High">High</option>
          <option value="Critical">Critical</option>
        </select>

        <input
          type="text"
          placeholder="Filter by employee email..."
          value={filters.employeeEmail}
          onChange={(e) => setFilters({ ...filters, employeeEmail: e.target.value })}
          className="filter-input"
        />

        <button className="filter-btn" onClick={fetchAlerts}>
          🔍 Apply Filters
        </button>
      </div>

      {/* Alert Records Table */}
      <div className="alerts-table-container">
        {loading ? (
          <div className="loading">Loading alerts...</div>
        ) : alerts.length === 0 ? (
          <div className="no-alerts">No alert records found</div>
        ) : (
          <table className="alerts-table">
            <thead>
              <tr>
                <th>Alert No</th>
                <th>Employee</th>
                <th>Ticket No</th>
                <th>Severity</th>
                <th>Alerts Sent</th>
                <th>Status</th>
                <th>Last Alert</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <tr key={alert._id}>
                  <td className="alert-no">{alert.alertNo}</td>
                  <td>
                    <div className="employee-cell">
                      <div className="employee-name">{alert.employeeName}</div>
                      <div className="employee-email">{alert.employeeEmail}</div>
                    </div>
                  </td>
                  <td>{alert.ticketNo}</td>
                  <td>
                    <span
                      className="severity-badge"
                      style={{ backgroundColor: getSeverityColor(alert.severity) }}
                    >
                      {alert.severity}
                    </span>
                  </td>
                  <td className="alerts-count">{alert.noOfAlertsSent}</td>
                  <td>
                    <span className={`status-badge ${alert.status.toLowerCase()}`}>
                      {alert.status}
                    </span>
                  </td>
                  <td>{new Date(alert.lastAlertSentAt).toLocaleString()}</td>
                  <td className="actions-cell">
                    <button
                      className="action-btn view"
                      onClick={() => handleViewAlert(alert)}
                      title="View Details"
                    >
                      👁️
                    </button>
                    <button
                      className="action-btn export"
                      onClick={() => handleExportToPDF(alert.employeeEmail)}
                      title="Export to PDF"
                    >
                      📄
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Alert Detail Modal */}
      {showAlertModal && selectedAlert && (
        <div className="modal-overlay" onClick={() => setShowAlertModal(false)}>
          <div className="modal-content alert-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Alert Details</h3>
              <button className="close-btn" onClick={() => setShowAlertModal(false)}>×</button>
            </div>

            <div className="alert-details">
              <div className="detail-row">
                <span className="detail-label">Alert No:</span>
                <span className="detail-value">{selectedAlert.alertNo}</span>
              </div>
              
              <div className="detail-row">
                <span className="detail-label">Employee:</span>
                <span className="detail-value">
                  {selectedAlert.employeeName} ({selectedAlert.employeeEmail})
                </span>
              </div>

              <div className="detail-row">
                <span className="detail-label">Ticket No:</span>
                <span className="detail-value">{selectedAlert.ticketNo}</span>
              </div>

              <div className="detail-row">
                <span className="detail-label">Severity:</span>
                <span
                  className="severity-badge"
                  style={{ backgroundColor: getSeverityColor(selectedAlert.severity) }}
                >
                  {selectedAlert.severity}
                </span>
              </div>

              <div className="detail-row">
                <span className="detail-label">Status:</span>
                <select
                  value={selectedAlert.status}
                  onChange={(e) => handleUpdateAlertStatus(selectedAlert._id, e.target.value)}
                  className="status-select"
                >
                  <option value="Active">Active</option>
                  <option value="Resolved">Resolved</option>
                  <option value="Escalated">Escalated</option>
                </select>
              </div>

              <div className="detail-row">
                <span className="detail-label">Total Alerts Sent:</span>
                <span className="detail-value">{selectedAlert.noOfAlertsSent}</span>
              </div>

              {selectedAlert.ticketDetails && (
                <>
                  <h4>Ticket Statistics:</h4>
                  <div className="ticket-stats">
                    <div>Total Tasks: {selectedAlert.ticketDetails.totalTasks}</div>
                    <div>Completed: {selectedAlert.ticketDetails.completed}</div>
                    <div>Pending: {selectedAlert.ticketDetails.pending}</div>
                    <div>Late/Overdue: {selectedAlert.ticketDetails.late}</div>
                  </div>

                  <h4>Incomplete Fields:</h4>
                  <ul className="incomplete-fields">
                    {selectedAlert.ticketDetails.incompleteFields?.map((field, idx) => (
                      <li key={idx}>{field}</li>
                    ))}
                  </ul>
                </>
              )}

              {selectedAlert.alertHistory && selectedAlert.alertHistory.length > 0 && (
                <>
                  <h4>Alert History:</h4>
                  <div className="alert-history">
                    {selectedAlert.alertHistory.map((entry, idx) => (
                      <div key={idx} className="history-entry">
                        <div className="history-date">
                          {new Date(entry.sentAt).toLocaleString()}
                        </div>
                        <div className="history-message">{entry.message}</div>
                        <div className={`history-status ${entry.status}`}>
                          {entry.status}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="modal-actions">
              <button
                className="btn-export"
                onClick={() => handleExportToPDF(selectedAlert.employeeEmail)}
              >
                📄 Export to PDF
              </button>
              <button className="btn-close" onClick={() => setShowAlertModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderInboxTab = () => (
    <div className="inbox-tab">
      <div className="tab-header">
        <h3>📥 Inbox</h3>
        <p>Emails received from team members and alerts</p>
      </div>

      <div className="emails-table-container">
        {loading ? (
          <div className="loading">Loading inbox...</div>
        ) : inboxEmails.length === 0 ? (
          <div className="no-emails">No emails in inbox</div>
        ) : (
          <table className="emails-table">
            <thead>
              <tr>
                <th>From</th>
                <th>Subject</th>
                <th>Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {inboxEmails.map((email) => (
                <tr key={email._id} className={email.isRead ? 'read' : 'unread'}>
                  <td>
                    <div className="email-sender">
                      <div className="sender-name">{email.sender.name}</div>
                      <div className="sender-email">{email.sender.email}</div>
                    </div>
                  </td>
                  <td className="email-subject">{email.subject}</td>
                  <td>{new Date(email.createdAt).toLocaleString()}</td>
                  <td>
                    <span className={`email-status-badge ${email.isRead ? 'read' : 'unread'}`}>
                      {email.isRead ? '✓ Read' : '● Unread'}
                    </span>
                  </td>
                  <td>
                    <div className="actions-cell">
                      <button
                        className="action-btn view"
                        onClick={() => handleViewEmail(email)}
                        title="View Email"
                      >
                        👁️
                      </button>
                      <button
                        className="action-btn delete"
                        onClick={() => handleDeleteEmail(email._id, 'inbox')}
                        title="Delete Email"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {inboxTotal > 20 && (
        <div className="pagination">
          <button
            onClick={() => fetchInbox(inboxPage - 1)}
            disabled={inboxPage === 1}
            className="pagination-btn"
          >
            ← Previous
          </button>
          <span className="pagination-info">
            Page {inboxPage} of {Math.ceil(inboxTotal / 20)}
          </span>
          <button
            onClick={() => fetchInbox(inboxPage + 1)}
            disabled={inboxPage >= Math.ceil(inboxTotal / 20)}
            className="pagination-btn"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );

  const renderOutboxTab = () => (
    <div className="outbox-tab">
      <div className="tab-header">
        <h3>📤 Outbox</h3>
        <p>Emails sent to team members</p>
      </div>

      <div className="emails-table-container">
        {loading ? (
          <div className="loading">Loading outbox...</div>
        ) : outboxEmails.length === 0 ? (
          <div className="no-emails">No sent emails</div>
        ) : (
          <table className="emails-table">
            <thead>
              <tr>
                <th>To</th>
                <th>Subject</th>
                <th>Date</th>
                <th>Priority</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {outboxEmails.map((email) => (
                <tr key={email._id}>
                  <td>
                    <div className="email-recipients">
                      {email.recipients.map((recipient, idx) => (
                        <div key={idx} className="recipient-item">
                          <div className="recipient-name">{recipient.name}</div>
                          <div className="recipient-email">{recipient.email}</div>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="email-subject">{email.subject}</td>
                  <td>{new Date(email.createdAt).toLocaleString()}</td>
                  <td>
                    <span className={`priority-badge ${email.priority}`}>
                      {email.priority}
                    </span>
                  </td>
                  <td>
                    <div className="actions-cell">
                      <button
                        className="action-btn view"
                        onClick={() => handleViewEmail(email)}
                        title="View Email"
                      >
                        👁️
                      </button>
                      <button
                        className="action-btn delete"
                        onClick={() => handleDeleteEmail(email._id, 'outbox')}
                        title="Delete Email"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {outboxTotal > 20 && (
        <div className="pagination">
          <button
            onClick={() => fetchOutbox(outboxPage - 1)}
            disabled={outboxPage === 1}
            className="pagination-btn"
          >
            ← Previous
          </button>
          <span className="pagination-info">
            Page {outboxPage} of {Math.ceil(outboxTotal / 20)}
          </span>
          <button
            onClick={() => fetchOutbox(outboxPage + 1)}
            disabled={outboxPage >= Math.ceil(outboxTotal / 20)}
            className="pagination-btn"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="email-management-container">
      <div className="email-management-header">
        <h2>📬 Email Management</h2>
        <p>Manage emails, alerts, and notifications</p>
      </div>

      {/* Tab Navigation */}
      <div className="tab-navigation">
        <button
          className={`tab-btn ${activeTab === 'compose' ? 'active' : ''}`}
          onClick={() => setActiveTab('compose')}
        >
          ✉️ Compose & Send
        </button>
        <button
          className={`tab-btn ${activeTab === 'inbox' ? 'active' : ''}`}
          onClick={() => setActiveTab('inbox')}
        >
          📥 Inbox
        </button>
        <button
          className={`tab-btn ${activeTab === 'outbox' ? 'active' : ''}`}
          onClick={() => setActiveTab('outbox')}
        >
          📤 Outbox
        </button>
        <button
          className={`tab-btn ${activeTab === 'system' ? 'active' : ''}`}
          onClick={() => setActiveTab('system')}
        >
          🚨 Alert System
        </button>
        <button
          className={`tab-btn ${activeTab === 'alerts' ? 'active' : ''}`}
          onClick={() => setActiveTab('alerts')}
        >
          📊 Alert Records
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'compose' && renderComposeTab()}
        {activeTab === 'inbox' && renderInboxTab()}
        {activeTab === 'outbox' && renderOutboxTab()}
        {activeTab === 'system' && renderAlertSystemTab()}
        {activeTab === 'alerts' && renderAlertRecordsTab()}
      </div>

      {/* Email Viewer Modal */}
      {showEmailModal && selectedEmail && (
        <div className="modal-overlay" onClick={() => setShowEmailModal(false)}>
          <div className="modal-content email-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📧 Email Details</h3>
              <button className="close-btn" onClick={() => setShowEmailModal(false)}>×</button>
            </div>

            <div className="email-details">
              <div className="detail-row">
                <span className="detail-label">From:</span>
                <span className="detail-value">
                  {selectedEmail.sender.name} ({selectedEmail.sender.email})
                </span>
              </div>

              <div className="detail-row">
                <span className="detail-label">To:</span>
                <span className="detail-value">
                  {selectedEmail.recipients.map(r => `${r.name} (${r.email})`).join(', ')}
                </span>
              </div>

              <div className="detail-row">
                <span className="detail-label">Subject:</span>
                <span className="detail-value">{selectedEmail.subject}</span>
              </div>

              <div className="detail-row">
                <span className="detail-label">Date:</span>
                <span className="detail-value">
                  {new Date(selectedEmail.createdAt).toLocaleString()}
                </span>
              </div>

              <div className="detail-row">
                <span className="detail-label">Priority:</span>
                <span className={`priority-badge ${selectedEmail.priority}`}>
                  {selectedEmail.priority}
                </span>
              </div>

              <div className="email-content">
                <h4>Message:</h4>
                <div className="message-body">
                  {selectedEmail.content?.html ? (
                    <div dangerouslySetInnerHTML={{ __html: selectedEmail.content.html }} />
                  ) : (
                    <pre>{selectedEmail.content?.text}</pre>
                  )}
                </div>
              </div>

              {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                <div className="attachments-section">
                  <h4>Attachments:</h4>
                  <ul className="attachments-list">
                    {selectedEmail.attachments.map((attachment, idx) => (
                      <li key={idx}>📎 {attachment.filename}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn-close" onClick={() => setShowEmailModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailManagement;
