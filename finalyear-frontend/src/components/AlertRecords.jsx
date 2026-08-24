import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './AlertRecords.css';

const AlertRecords = () => {
  const [statistics, setStatistics] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [employeeAlerts, setEmployeeAlerts] = useState([]);
  const [filters, setFilters] = useState({
    status: '',
    severity: '',
    employeeEmail: ''
  });
  const [triggeringAlert, setTriggeringAlert] = useState(false);
  const [alertResult, setAlertResult] = useState(null);

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

  useEffect(() => {
    fetchStatistics();
    fetchAlerts();
  }, []);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };
  };

  const fetchStatistics = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/alerts/statistics`, getAuthHeaders());
      setStatistics(response.data.data);
    } catch (err) {
      console.error('Error fetching statistics:', err);
      setError('Failed to load statistics');
    }
  };

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.severity) params.append('severity', filters.severity);
      if (filters.employeeEmail) params.append('employeeEmail', filters.employeeEmail);

      const response = await axios.get(
        `${API_BASE_URL}/api/alerts?${params.toString()}`,
        getAuthHeaders()
      );
      setAlerts(response.data.data.alerts);
      setError('');
    } catch (err) {
      console.error('Error fetching alerts:', err);
      setError('Failed to load alert records. Please ensure you are logged in as Project Manager.');
    } finally {
      setLoading(false);
    }
  };

  const triggerAlertAnalysis = async () => {
    try {
      setTriggeringAlert(true);
      setAlertResult(null);
      const response = await axios.post(`${API_BASE_URL}/api/alerts/trigger`, {}, getAuthHeaders());
      setAlertResult(response.data.data);
      
      // Refresh data after triggering
      setTimeout(() => {
        fetchStatistics();
        fetchAlerts();
      }, 1000);
    } catch (err) {
      console.error('Error triggering alerts:', err);
      setError('Failed to trigger alert analysis: ' + (err.response?.data?.message || err.message));
    } finally {
      setTriggeringAlert(false);
    }
  };

  const viewEmployeeAlerts = async (employeeEmail) => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/alerts/employee/${employeeEmail}`,
        getAuthHeaders()
      );
      setSelectedEmployee(response.data.data);
      setEmployeeAlerts(response.data.data.alerts);
    } catch (err) {
      console.error('Error fetching employee alerts:', err);
      alert('Failed to load employee alerts');
    }
  };

  const exportEmployeeAlerts = async (employeeEmail) => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/alerts/employee/${employeeEmail}/export`,
        {
          ...getAuthHeaders(),
          responseType: 'blob'
        }
      );

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Alert_Records_${employeeEmail}_${Date.now()}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting alerts:', err);
      alert('Failed to export alert records');
    }
  };

  const updateAlertStatus = async (alertId, status) => {
    try {
      await axios.put(
        `${API_BASE_URL}/api/alerts/${alertId}`,
        { status },
        getAuthHeaders()
      );
      fetchAlerts();
      if (selectedEmployee) {
        viewEmployeeAlerts(selectedEmployee.employeeEmail);
      }
    } catch (err) {
      console.error('Error updating alert:', err);
      alert('Failed to update alert status');
    }
  };

  const getSeverityColor = (severity) => {
    const colors = {
      'Critical': '#dc143c',
      'High': '#ff6347',
      'Medium': '#ff8c00',
      'Low': '#ffa500'
    };
    return colors[severity] || '#666';
  };

  const getStatusBadge = (status) => {
    const badges = {
      'Active': { bg: '#fff3cd', color: '#856404', text: '🔔 Active' },
      'Resolved': { bg: '#d4edda', color: '#155724', text: '✅ Resolved' },
      'Escalated': { bg: '#f8d7da', color: '#721c24', text: '⚠️  Escalated' }
    };
    const badge = badges[status] || badges['Active'];
    return (
      <span className="status-badge" style={{ background: badge.bg, color: badge.color }}>
        {badge.text}
      </span>
    );
  };

  if (loading && !statistics) {
    return (
      <div className="alert-records-container">
        <div className="loading">⏳ Loading Alert Records...</div>
      </div>
    );
  }

  return (
    <div className="alert-records-container">
      {/* Header */}
      <div className="alert-header">
        <div>
          <h1>🔔 Alert Records Dashboard</h1>
          <p className="subtitle">Confidential - Project Manager Access Only</p>
        </div>
        <button 
          className="btn-trigger" 
          onClick={triggerAlertAnalysis}
          disabled={triggeringAlert}
        >
          {triggeringAlert ? '⏳ Analyzing...' : '🚀 Trigger Alert Analysis'}
        </button>
      </div>

      {error && (
        <div className="error-message">
          ❌ {error}
        </div>
      )}

      {alertResult && (
        <div className="alert-result">
          <h3>✅ Alert Analysis Complete</h3>
          <p>Total Defaulters Found: <strong>{alertResult.totalDefaulters}</strong></p>
          <p>Alerts Sent: <strong>{alertResult.alertsSent}</strong></p>
          {alertResult.alertsFailed > 0 && (
            <p className="failed">Alerts Failed: <strong>{alertResult.alertsFailed}</strong></p>
          )}
        </div>
      )}

      {/* Statistics Section */}
      {statistics && (
        <div className="statistics-section">
          <h2>📊 Statistics Summary</h2>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-number">{statistics.summary.totalAlerts}</div>
              <div className="stat-label">Total Alerts</div>
            </div>
            <div className="stat-card active">
              <div className="stat-number">{statistics.summary.activeAlerts}</div>
              <div className="stat-label">Active Alerts</div>
            </div>
            <div className="stat-card resolved">
              <div className="stat-number">{statistics.summary.resolvedAlerts}</div>
              <div className="stat-label">Resolved</div>
            </div>
            <div className="stat-card escalated">
              <div className="stat-number">{statistics.summary.escalatedAlerts}</div>
              <div className="stat-label">Escalated</div>
            </div>
          </div>

          <div className="severity-breakdown">
            <h3>Severity Breakdown</h3>
            <div className="severity-grid">
              <div className="severity-item" style={{ borderColor: '#dc143c' }}>
                <span className="severity-count">{statistics.summary.severityCounts.Critical}</span>
                <span className="severity-name">Critical</span>
              </div>
              <div className="severity-item" style={{ borderColor: '#ff6347' }}>
                <span className="severity-count">{statistics.summary.severityCounts.High}</span>
                <span className="severity-name">High</span>
              </div>
              <div className="severity-item" style={{ borderColor: '#ff8c00' }}>
                <span className="severity-count">{statistics.summary.severityCounts.Medium}</span>
                <span className="severity-name">Medium</span>
              </div>
              <div className="severity-item" style={{ borderColor: '#ffa500' }}>
                <span className="severity-count">{statistics.summary.severityCounts.Low}</span>
                <span className="severity-name">Low</span>
              </div>
            </div>
          </div>

          {/* Top Defaulters */}
          {statistics.topDefaulters && statistics.topDefaulters.length > 0 && (
            <div className="top-defaulters">
              <h3>⚠️  Top Defaulters</h3>
              <table className="defaulters-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Email</th>
                    <th>Total Alerts</th>
                    <th>Active</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {statistics.topDefaulters.map((defaulter, index) => (
                    <tr key={index}>
                      <td>{defaulter.employeeName}</td>
                      <td>{defaulter._id}</td>
                      <td><strong>{defaulter.totalAlerts}</strong></td>
                      <td><span className="badge-warning">{defaulter.activeAlerts}</span></td>
                      <td>
                        <button 
                          className="btn-small"
                          onClick={() => viewEmployeeAlerts(defaulter._id)}
                        >
                          View Details
                        </button>
                        <button 
                          className="btn-small btn-export"
                          onClick={() => exportEmployeeAlerts(defaulter._id)}
                        >
                          📄 Export PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="filters-section">
        <h2>🔍 Filter Alert Records</h2>
        <div className="filters">
          <select 
            value={filters.status} 
            onChange={(e) => setFilters({...filters, status: e.target.value})}
          >
            <option value="">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Resolved">Resolved</option>
            <option value="Escalated">Escalated</option>
          </select>

          <select 
            value={filters.severity} 
            onChange={(e) => setFilters({...filters, severity: e.target.value})}
          >
            <option value="">All Severities</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>

          <input 
            type="email"
            placeholder="Filter by employee email"
            value={filters.employeeEmail}
            onChange={(e) => setFilters({...filters, employeeEmail: e.target.value})}
          />

          <button className="btn-apply" onClick={fetchAlerts}>
            Apply Filters
          </button>
        </div>
      </div>

      {/* Alert Records Table */}
      <div className="alerts-section">
        <h2>📋 Alert Records ({alerts.length})</h2>
        {loading ? (
          <div className="loading">Loading alerts...</div>
        ) : alerts.length === 0 ? (
          <div className="no-data">✅ No alert records found</div>
        ) : (
          <div className="alerts-table-container">
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
                      <div className="employee-info">
                        <div className="name">{alert.employeeName}</div>
                        <div className="email">{alert.employeeEmail}</div>
                      </div>
                    </td>
                    <td>{alert.ticketNo}</td>
                    <td>
                      <span 
                        className="severity-badge" 
                        style={{ background: getSeverityColor(alert.severity), color: 'white' }}
                      >
                        {alert.severity}
                      </span>
                    </td>
                    <td className="alerts-count">
                      <strong>{alert.noOfAlertsSent}</strong>
                    </td>
                    <td>{getStatusBadge(alert.status)}</td>
                    <td>{new Date(alert.lastAlertSentAt).toLocaleString()}</td>
                    <td>
                      <div className="action-buttons">
                        {alert.status === 'Active' && (
                          <>
                            <button 
                              className="btn-action btn-resolve"
                              onClick={() => updateAlertStatus(alert._id, 'Resolved')}
                            >
                              ✅ Resolve
                            </button>
                            <button 
                              className="btn-action btn-escalate"
                              onClick={() => updateAlertStatus(alert._id, 'Escalated')}
                            >
                              ⚠️  Escalate
                            </button>
                          </>
                        )}
                        <button 
                          className="btn-action btn-view"
                          onClick={() => viewEmployeeAlerts(alert.employeeEmail)}
                        >
                          👁️  View
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Employee Alert Details Modal */}
      {selectedEmployee && (
        <div className="modal-overlay" onClick={() => setSelectedEmployee(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📊 Alert History: {selectedEmployee.employeeEmail}</h2>
              <button className="btn-close" onClick={() => setSelectedEmployee(null)}>✖</button>
            </div>
            
            <div className="employee-stats">
              <div className="stats-row">
                <div className="stat-item">
                  <span className="label">Total Alerts:</span>
                  <span className="value">{selectedEmployee.stats.totalAlerts}</span>
                </div>
                <div className="stat-item">
                  <span className="label">Active:</span>
                  <span className="value">{selectedEmployee.stats.activeAlerts}</span>
                </div>
                <div className="stat-item">
                  <span className="label">Resolved:</span>
                  <span className="value">{selectedEmployee.stats.resolvedAlerts}</span>
                </div>
                <div className="stat-item">
                  <span className="label">Escalated:</span>
                  <span className="value">{selectedEmployee.stats.escalatedAlerts}</span>
                </div>
              </div>
              <button 
                className="btn-export-employee"
                onClick={() => exportEmployeeAlerts(selectedEmployee.employeeEmail)}
              >
                📄 Export to PDF
              </button>
            </div>

            <div className="employee-alerts-list">
              {employeeAlerts.map((alert) => (
                <div key={alert._id} className="alert-detail-card">
                  <div className="alert-detail-header">
                    <span className="alert-number">{alert.alertNo}</span>
                    <span 
                      className="severity-badge" 
                      style={{ background: getSeverityColor(alert.severity) }}
                    >
                      {alert.severity}
                    </span>
                    {getStatusBadge(alert.status)}
                  </div>
                  <div className="alert-detail-body">
                    <p><strong>Ticket:</strong> {alert.ticketNo}</p>
                    <p><strong>Alerts Sent:</strong> {alert.noOfAlertsSent}</p>
                    <p><strong>Created:</strong> {new Date(alert.createdAt).toLocaleString()}</p>
                    <p><strong>Last Alert:</strong> {new Date(alert.lastAlertSentAt).toLocaleString()}</p>
                    {alert.ticketDetails && alert.ticketDetails.incompleteFields && (
                      <div className="incomplete-fields">
                        <strong>Issues:</strong>
                        <ul>
                          {alert.ticketDetails.incompleteFields.map((field, idx) => (
                            <li key={idx}>{field}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {alert.notes && (
                      <p><strong>Notes:</strong> {alert.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AlertRecords;
