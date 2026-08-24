import React, { useState, useEffect } from 'react';
import axios from '../config/axios';
import ProjectManagerMailbox from './ProjectManagerMailbox';
import './ProjectManagerEmailDashboard.css';

export default function ProjectManagerEmailDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [emailAnalytics, setEmailAnalytics] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('checking');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem('email') || '');
  const [showComposeModal, setShowComposeModal] = useState(false);
  const [composeType, setComposeType] = useState('');

  // Form states
  const [feedbackForm, setFeedbackForm] = useState({
    recipientEmail: '',
    recipientName: '',
    feedback: '',
    performanceData: {
      completionRate: '',
      completedTasks: '',
      slaPerformance: '',
      clientInteractions: ''
    }
  });

  const [alertForm, setAlertForm] = useState({
    subject: '',
    message: '',
    priority: 'high',
    recipients: 'all'
  });

  const [reminderForm, setReminderForm] = useState({
    targetDate: new Date().toISOString().split('T')[0],
    missingSubmissions: []
  });

  useEffect(() => {
    initializeUser();
    checkEmailConnection();
    fetchTeamMembers();
    fetchEmailAnalytics();
  }, []);

  const initializeUser = () => {
    try {
      const email = localStorage.getItem('email');
      const role = localStorage.getItem('role');
      const token = localStorage.getItem('token');
      
      if (!email || !role || !token) {
        throw new Error('Missing user data');
      }
      
      if (role !== 'project_manager') {
        throw new Error('Invalid role for this dashboard');
      }
      
      setUserEmail(email);
    } catch (error) {
      console.error('User data validation failed:', error);
      setMessage({ text: '❌ User email not found. Please log in again.', type: 'error' });
    }
  };

  const checkEmailConnection = async () => {
    setConnectionStatus('checking');
    try {
      const response = await axios.get('/api/pm-email/test-connection');
      setConnectionStatus(response.data.status);
    } catch (error) {
      console.error('Email connection test failed:', error);
      setConnectionStatus('disconnected');
    }
  };

  const fetchTeamMembers = async () => {
    try {
      const response = await axios.get('/api/pm-email/team-members');
      setTeamMembers(response.data.teamMembers);
    } catch (error) {
      console.error('Failed to fetch team members:', error);
    }
  };

  const fetchEmailAnalytics = async () => {
    try {
      const response = await axios.get('/api/pm-email/email-analytics');
      setEmailAnalytics(response.data);
    } catch (error) {
      console.error('Failed to fetch email analytics:', error);
    }
  };

  const sendTeamReport = async () => {
    try {
      setLoading(true);
      setMessage({ text: '', type: '' });
      
      const response = await axios.post('/api/pm-email/send-team-report', {
        reportPeriod: 'This Week'
      });
      
      setMessage({ text: `✅ Team report sent successfully to ${response.data.emailsSent} team members`, type: 'success' });
      fetchEmailAnalytics();
    } catch (error) {
      setMessage({ text: `❌ Failed to send team report: ${error.response?.data?.message || error.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const sendIndividualFeedback = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setMessage({ text: '', type: '' });

      const response = await axios.post('/api/pm-email/send-individual-feedback', feedbackForm);
      
      setMessage({ text: `✅ Individual feedback sent to ${feedbackForm.recipientEmail}`, type: 'success' });
      resetFeedbackForm();
      fetchEmailAnalytics();
      setShowComposeModal(false);
    } catch (error) {
      setMessage({ text: `❌ Failed to send feedback: ${error.response?.data?.message || error.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const sendUrgentAlert = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setMessage({ text: '', type: '' });

      const response = await axios.post('/api/pm-email/send-urgent-alert', alertForm, {
        timeout: 30000
      });
      
      setMessage({ text: `🚨 Urgent alert sent successfully to ${alertForm.recipients === 'all' ? 'all team members' : '1 recipient'}`, type: 'success' });
      resetAlertForm();
      fetchEmailAnalytics();
      setShowComposeModal(false);
    } catch (error) {
      setMessage({ text: `❌ Failed to send alert: ${error.response?.data?.message || error.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const sendMetricsReminder = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setMessage({ text: '', type: '' });

      if (reminderForm.missingSubmissions.length === 0) {
        setMessage({ text: '❌ Please select team members to send reminders to', type: 'error' });
        setLoading(false);
        return;
      }

      const response = await axios.post('/api/pm-email/send-metrics-reminder', reminderForm);
      
      setMessage({ text: `📋 Metrics reminders sent to ${response.data.results.length} team members`, type: 'success' });
      resetReminderForm();
      fetchEmailAnalytics();
      setShowComposeModal(false);
    } catch (error) {
      setMessage({ text: `❌ Failed to send reminders: ${error.response?.data?.message || error.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const resetFeedbackForm = () => {
    setFeedbackForm({
      recipientEmail: '',
      recipientName: '',
      feedback: '',
      performanceData: {
        completionRate: '',
        completedTasks: '',
        slaPerformance: '',
        clientInteractions: ''
      }
    });
  };

  const resetAlertForm = () => {
    setAlertForm({
      subject: '',
      message: '',
      priority: 'high',
      recipients: 'all'
    });
  };

  const resetReminderForm = () => {
    setReminderForm({
      targetDate: new Date().toISOString().split('T')[0],
      missingSubmissions: []
    });
  };

  const toggleReminderRecipient = (member) => {
    setReminderForm(prev => ({
      ...prev,
      missingSubmissions: prev.missingSubmissions.find(s => s.email === member.email)
        ? prev.missingSubmissions.filter(s => s.email !== member.email)
        : [...prev.missingSubmissions, { name: member.name, email: member.email }]
    }));
  };

  const openComposeModal = (type) => {
    setComposeType(type);
    setShowComposeModal(true);
    setMessage({ text: '', type: '' });
  };

  // Render Functions
  const renderConnectionStatus = () => {
    const statusConfig = {
      connected: { icon: '✅', text: 'Email Service Connected', class: 'connected' },
      disconnected: { icon: '❌', text: 'Email Service Disconnected', class: 'disconnected' },
      checking: { icon: '🔄', text: 'Checking Connection...', class: 'checking' }
    };

    const config = statusConfig[connectionStatus];

    return (
      <div className={`connection-badge ${config.class}`}>
        <span className="status-icon">{config.icon}</span>
        <span className="status-text">{config.text}</span>
        <button onClick={checkEmailConnection} className="refresh-icon" title="Refresh">
          <i className="fas fa-sync-alt"></i>
        </button>
      </div>
    );
  };

  const renderStatCard = (icon, label, value, color) => (
    <div className="stat-card" style={{ borderLeftColor: color }}>
      <div className="stat-icon" style={{ backgroundColor: `${color}15` }}>
        <i className={`fas ${icon}`} style={{ color }}></i>
      </div>
      <div className="stat-content">
        <span className="stat-label">{label}</span>
        <span className="stat-value">{value}</span>
      </div>
    </div>
  );

  const renderOverviewTab = () => (
    <div className="overview-container">
      {/* Stats Cards */}
      <div className="stats-grid">
        {renderStatCard('fa-paper-plane', 'Total Sent', emailAnalytics?.totalSent || 0, '#4CAF50')}
        {renderStatCard('fa-users', 'Team Members', teamMembers.length, '#2196F3')}
        {renderStatCard('fa-exclamation-circle', 'Alerts Sent', emailAnalytics?.analytics?.alerts || 0, '#FF9800')}
        {renderStatCard('fa-chart-line', 'Reports Sent', emailAnalytics?.analytics?.reports || 0, '#9C27B0')}
      </div>

      <div className="overview-grid">
        {/* Quick Actions */}
        <div className="card quick-actions-card">
          <div className="card-header">
            <h3><i className="fas fa-bolt"></i> Quick Actions</h3>
          </div>
          <div className="card-body">
            <button 
              className="action-card primary"
              onClick={() => openComposeModal('report')}
              disabled={loading || connectionStatus !== 'connected'}
            >
              <div className="action-icon">
                <i className="fas fa-chart-bar"></i>
              </div>
              <div className="action-content">
                <h4>Team Report</h4>
                <p>Send weekly performance report</p>
              </div>
            </button>

            <button 
              className="action-card warning"
              onClick={() => openComposeModal('alert')}
              disabled={loading || connectionStatus !== 'connected'}
            >
              <div className="action-icon">
                <i className="fas fa-exclamation-triangle"></i>
              </div>
              <div className="action-content">
                <h4>Urgent Alert</h4>
                <p>Send critical notification</p>
              </div>
            </button>

            <button 
              className="action-card info"
              onClick={() => openComposeModal('feedback')}
              disabled={loading || connectionStatus !== 'connected'}
            >
              <div className="action-icon">
                <i className="fas fa-comment-dots"></i>
              </div>
              <div className="action-content">
                <h4>Send Feedback</h4>
                <p>Individual performance feedback</p>
              </div>
            </button>

            <button 
              className="action-card secondary"
              onClick={() => openComposeModal('reminder')}
              disabled={loading || connectionStatus !== 'connected'}
            >
              <div className="action-icon">
                <i className="fas fa-bell"></i>
              </div>
              <div className="action-content">
                <h4>Metrics Reminder</h4>
                <p>Remind about submissions</p>
              </div>
            </button>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="card activity-card">
          <div className="card-header">
            <h3><i className="fas fa-history"></i> Recent Activity</h3>
          </div>
          <div className="card-body">
            {emailAnalytics?.recentMessages?.length > 0 ? (
              <div className="activity-list">
                {emailAnalytics.recentMessages.slice(0, 6).map((msg, index) => (
                  <div key={index} className="activity-item">
                    <div className="activity-icon">
                      <i className="fas fa-envelope"></i>
                    </div>
                    <div className="activity-details">
                      <p className="activity-subject">{msg.subject}</p>
                      <p className="activity-recipient">To: {msg.to}</p>
                      <p className="activity-time">{new Date(msg.timestamp).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <i className="fas fa-inbox"></i>
                <p>No recent email activity</p>
              </div>
            )}
          </div>
        </div>

        {/* Team Members */}
        <div className="card team-card">
          <div className="card-header">
            <h3><i className="fas fa-users"></i> Team Members</h3>
            <span className="badge">{teamMembers.length}</span>
          </div>
          <div className="card-body">
            <div className="team-list">
              {teamMembers.map((member, index) => (
                <div key={index} className="team-member">
                  <div className="member-avatar">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="member-info">
                    <span className="member-name">{member.name}</span>
                    <span className="member-email">{member.email}</span>
                  </div>
                  <button 
                    className="member-action"
                    onClick={() => {
                      setFeedbackForm(prev => ({
                        ...prev,
                        recipientEmail: member.email,
                        recipientName: member.name
                      }));
                      openComposeModal('feedback');
                    }}
                    title="Send Feedback"
                  >
                    <i className="fas fa-paper-plane"></i>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Analytics Breakdown */}
        <div className="card analytics-card">
          <div className="card-header">
            <h3><i className="fas fa-chart-pie"></i> Email Analytics</h3>
          </div>
          <div className="card-body">
            {emailAnalytics ? (
              <div className="analytics-breakdown">
                <div className="breakdown-item">
                  <span className="breakdown-label">
                    <i className="fas fa-exclamation-circle" style={{ color: '#FF9800' }}></i>
                    Alerts
                  </span>
                  <span className="breakdown-value">{emailAnalytics.analytics.alerts}</span>
                </div>
                <div className="breakdown-item">
                  <span className="breakdown-label">
                    <i className="fas fa-chart-bar" style={{ color: '#9C27B0' }}></i>
                    Reports
                  </span>
                  <span className="breakdown-value">{emailAnalytics.analytics.reports}</span>
                </div>
                <div className="breakdown-item">
                  <span className="breakdown-label">
                    <i className="fas fa-comment-dots" style={{ color: '#2196F3' }}></i>
                    Feedback
                  </span>
                  <span className="breakdown-value">{emailAnalytics.analytics.feedback}</span>
                </div>
                <div className="breakdown-item">
                  <span className="breakdown-label">
                    <i className="fas fa-bell" style={{ color: '#00BCD4' }}></i>
                    Reminders
                  </span>
                  <span className="breakdown-value">{emailAnalytics.analytics.reminders}</span>
                </div>
                <div className="breakdown-item">
                  <span className="breakdown-label">
                    <i className="fas fa-envelope" style={{ color: '#607D8B' }}></i>
                    Other
                  </span>
                  <span className="breakdown-value">{emailAnalytics.analytics.other}</span>
                </div>
              </div>
            ) : (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>Loading analytics...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderMailboxTab = () => (
    <ProjectManagerMailbox />
  );

  const renderComposeModal = () => {
    if (!showComposeModal) return null;

    const modalContent = {
      report: {
        title: '📊 Send Team Report',
        icon: 'fa-chart-bar',
        color: '#9C27B0',
        content: (
          <div className="modal-content-wrapper">
            <div className="info-box">
              <h4><i className="fas fa-info-circle"></i> Report Contents</h4>
              <ul>
                <li>Overall team performance metrics</li>
                <li>Individual performance breakdown</li>
                <li>Completion rates and SLA performance</li>
                <li>Action items and recommendations</li>
              </ul>
            </div>
            <div className="modal-actions">
              <button 
                onClick={sendTeamReport}
                disabled={loading || connectionStatus !== 'connected'}
                className="btn-primary btn-large"
              >
                {loading ? (
                  <>
                    <div className="spinner-small"></div>
                    Sending Report...
                  </>
                ) : (
                  <>
                    <i className="fas fa-paper-plane"></i>
                    Send Team Report
                  </>
                )}
              </button>
            </div>
          </div>
        )
      },
      alert: {
        title: '🚨 Send Urgent Alert',
        icon: 'fa-exclamation-triangle',
        color: '#FF9800',
        content: (
          <form onSubmit={sendUrgentAlert} className="compose-form">
            <div className="form-group">
              <label>Priority Level</label>
              <select
                value={alertForm.priority}
                onChange={(e) => setAlertForm(prev => ({ ...prev, priority: e.target.value }))}
                className="form-control"
              >
                <option value="high">🔴 High Priority</option>
                <option value="medium">🟡 Medium Priority</option>
                <option value="normal">🟢 Normal Priority</option>
              </select>
            </div>

            <div className="form-group">
              <label>Recipients</label>
              <select
                value={alertForm.recipients}
                onChange={(e) => setAlertForm(prev => ({ ...prev, recipients: e.target.value }))}
                className="form-control"
              >
                <option value="all">All Team Members</option>
                {teamMembers.map((member, index) => (
                  <option key={index} value={member.email}>
                    {member.name} only
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Subject</label>
              <input
                type="text"
                value={alertForm.subject}
                onChange={(e) => setAlertForm(prev => ({ ...prev, subject: e.target.value }))}
                required
                placeholder="Urgent: System maintenance scheduled"
                className="form-control"
              />
            </div>

            <div className="form-group">
              <label>Message</label>
              <textarea
                value={alertForm.message}
                onChange={(e) => setAlertForm(prev => ({ ...prev, message: e.target.value }))}
                required
                rows="6"
                placeholder="Provide clear, actionable information about the urgent situation..."
                className="form-control"
              />
            </div>

            <div className="modal-actions">
              <button 
                type="submit" 
                disabled={loading || connectionStatus !== 'connected'}
                className="btn-warning btn-large"
              >
                {loading ? (
                  <>
                    <div className="spinner-small"></div>
                    Sending Alert...
                  </>
                ) : (
                  <>
                    <i className="fas fa-exclamation-triangle"></i>
                    Send Urgent Alert
                  </>
                )}
              </button>
            </div>
          </form>
        )
      },
      feedback: {
        title: '💬 Send Individual Feedback',
        icon: 'fa-comment-dots',
        color: '#2196F3',
        content: (
          <form onSubmit={sendIndividualFeedback} className="compose-form">
            <div className="form-group">
              <label>Team Member</label>
              <select
                value={feedbackForm.recipientEmail}
                onChange={(e) => {
                  const selectedMember = teamMembers.find(m => m.email === e.target.value);
                  setFeedbackForm(prev => ({
                    ...prev,
                    recipientEmail: e.target.value,
                    recipientName: selectedMember ? selectedMember.name : ''
                  }));
                }}
                required
                className="form-control"
              >
                <option value="">Select team member...</option>
                {teamMembers.map((member, index) => (
                  <option key={index} value={member.email}>
                    {member.name} ({member.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="performance-section">
              <h4><i className="fas fa-chart-line"></i> Performance Metrics (Optional)</h4>
              <div className="metrics-grid">
                <div className="form-group">
                  <label>Completion Rate (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={feedbackForm.performanceData.completionRate}
                    onChange={(e) => setFeedbackForm(prev => ({
                      ...prev,
                      performanceData: { ...prev.performanceData, completionRate: e.target.value }
                    }))}
                    placeholder="85"
                    className="form-control"
                  />
                </div>
                <div className="form-group">
                  <label>Completed Tasks</label>
                  <input
                    type="number"
                    min="0"
                    value={feedbackForm.performanceData.completedTasks}
                    onChange={(e) => setFeedbackForm(prev => ({
                      ...prev,
                      performanceData: { ...prev.performanceData, completedTasks: e.target.value }
                    }))}
                    placeholder="25"
                    className="form-control"
                  />
                </div>
                <div className="form-group">
                  <label>SLA Performance (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={feedbackForm.performanceData.slaPerformance}
                    onChange={(e) => setFeedbackForm(prev => ({
                      ...prev,
                      performanceData: { ...prev.performanceData, slaPerformance: e.target.value }
                    }))}
                    placeholder="92"
                    className="form-control"
                  />
                </div>
                <div className="form-group">
                  <label>Client Interactions</label>
                  <input
                    type="number"
                    min="0"
                    value={feedbackForm.performanceData.clientInteractions}
                    onChange={(e) => setFeedbackForm(prev => ({
                      ...prev,
                      performanceData: { ...prev.performanceData, clientInteractions: e.target.value }
                    }))}
                    placeholder="15"
                    className="form-control"
                  />
                </div>
              </div>
            </div>

            <div className="form-group">
              <label>Feedback Message</label>
              <textarea
                value={feedbackForm.feedback}
                onChange={(e) => setFeedbackForm(prev => ({ ...prev, feedback: e.target.value }))}
                required
                rows="6"
                placeholder="Provide detailed feedback on performance, achievements, and areas for improvement..."
                className="form-control"
              />
            </div>

            <div className="modal-actions">
              <button 
                type="submit" 
                disabled={loading || connectionStatus !== 'connected'}
                className="btn-primary btn-large"
              >
                {loading ? (
                  <>
                    <div className="spinner-small"></div>
                    Sending Feedback...
                  </>
                ) : (
                  <>
                    <i className="fas fa-comment-dots"></i>
                    Send Feedback
                  </>
                )}
              </button>
            </div>
          </form>
        )
      },
      reminder: {
        title: '📋 Send Metrics Reminder',
        icon: 'fa-bell',
        color: '#00BCD4',
        content: (
          <form onSubmit={sendMetricsReminder} className="compose-form">
            <div className="form-group">
              <label>Target Date</label>
              <input
                type="date"
                value={reminderForm.targetDate}
                onChange={(e) => setReminderForm(prev => ({ ...prev, targetDate: e.target.value }))}
                required
                className="form-control"
              />
            </div>

            <div className="form-group">
              <label>Select Team Members ({reminderForm.missingSubmissions.length} selected)</label>
              <div className="member-selection-list">
                {teamMembers.map((member, index) => (
                  <label key={index} className="checkbox-card">
                    <input
                      type="checkbox"
                      checked={reminderForm.missingSubmissions.some(s => s.email === member.email)}
                      onChange={() => toggleReminderRecipient(member)}
                    />
                    <div className="checkbox-content">
                      <div className="member-avatar-small">
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <span className="checkbox-name">{member.name}</span>
                        <span className="checkbox-email">{member.email}</span>
                      </div>
                    </div>
                    <i className="fas fa-check-circle"></i>
                  </label>
                ))}
              </div>
            </div>

            <div className="modal-actions">
              <button 
                type="submit" 
                disabled={loading || connectionStatus !== 'connected' || reminderForm.missingSubmissions.length === 0}
                className="btn-info btn-large"
              >
                {loading ? (
                  <>
                    <div className="spinner-small"></div>
                    Sending Reminders...
                  </>
                ) : (
                  <>
                    <i className="fas fa-bell"></i>
                    Send Reminders ({reminderForm.missingSubmissions.length})
                  </>
                )}
              </button>
            </div>
          </form>
        )
      }
    };

    const modal = modalContent[composeType];

    return (
      <div className="modal-overlay" onClick={() => setShowComposeModal(false)}>
        <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header" style={{ borderLeftColor: modal.color }}>
            <h3>
              <i className={`fas ${modal.icon}`}></i>
              {modal.title}
            </h3>
            <button className="modal-close" onClick={() => setShowComposeModal(false)}>
              <i className="fas fa-times"></i>
            </button>
          </div>
          <div className="modal-body">
            {modal.content}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="pm-email-dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-content">
          <div className="header-title">
            <i className="fas fa-envelope-open-text"></i>
            <div>
              <h1>Email Management</h1>
              <p>Communicate effectively with your team</p>
            </div>
          </div>
          {renderConnectionStatus()}
        </div>
      </div>

      {/* Message Alert */}
      {message.text && (
        <div className={`alert alert-${message.type}`}>
          <i className={`fas ${message.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
          <span>{message.text}</span>
          <button onClick={() => setMessage({ text: '', type: '' })} className="alert-close">
            <i className="fas fa-times"></i>
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="tabs-container">
        <button 
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <i className="fas fa-home"></i>
          <span>Overview</span>
        </button>
        <button 
          className={`tab ${activeTab === 'mailbox' ? 'active' : ''}`}
          onClick={() => setActiveTab('mailbox')}
        >
          <i className="fas fa-inbox"></i>
          <span>Mailbox</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'mailbox' && renderMailboxTab()}
      </div>

      {/* Compose Modal */}
      {renderComposeModal()}
    </div>
  );
}
