import React, { useState, useEffect } from 'react';
import axios from '../config/axios';
import TeamMemberMailbox from './TeamMemberMailbox';
import './TeamMemberEmailDashboard.css';

export default function TeamMemberEmailDashboard() {
  const userEmail = localStorage.getItem('email') || '';
  const [activeTab, setActiveTab] = useState('overview');
  const [connectionStatus, setConnectionStatus] = useState('checking');
  const [notifications, setNotifications] = useState([]);
  const [inbox, setInbox] = useState([]);
  const [teamLeaders, setTeamLeaders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [showComposeModal, setShowComposeModal] = useState(false);
  const [composeType, setComposeType] = useState('');

  const [statusUpdate, setStatusUpdate] = useState({
    subject: '',
    message: '',
    priority: 'normal'
  });

  const [supportRequest, setSupportRequest] = useState({
    subject: '',
    description: '',
    urgency: 'low'
  });

  const [customEmailForm, setCustomEmailForm] = useState({
    recipientEmail: '',
    subject: '',
    message: '',
    priority: 'normal'
  });

  useEffect(() => {
    checkEmailConnection();
    fetchNotifications();
    fetchInbox();
    fetchTeamLeaders();
  }, []);

  const checkEmailConnection = async () => {
    try {
      const response = await axios.get('/api/tm-email/test-connection');
      setConnectionStatus(response.data.success ? 'connected' : 'disconnected');
    } catch (error) {
      setConnectionStatus('disconnected');
    }
  };

  const fetchNotifications = async () => {
    try {
      const response = await axios.get('/api/tm-email/notifications');
      if (response.data.success) {
        setNotifications(response.data.notifications || []);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  };

  const fetchInbox = async () => {
    try {
      if (!userEmail) return;

      const response = await axios.get(`/api/emails/inbox?email=${userEmail}`);
      if (response.data.success) {
        setInbox(response.data.emails || []);
      }
    } catch (error) {
      console.error('Failed to fetch inbox:', error);
    }
  };

  const fetchTeamLeaders = async () => {
    try {
      const response = await axios.get('/api/tm-email/team-leaders');
      if (response.data.success) {
        setTeamLeaders(response.data.teamLeaders || []);
      }
    } catch (error) {
      console.error('Failed to fetch team leaders:', error);
    }
  };

  const sendStatusUpdate = async (e) => {
    e.preventDefault();
    if (!statusUpdate.subject || !statusUpdate.message) {
      setMessage({ type: 'error', text: 'Please fill in all required fields' });
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post('/api/tm-email/send-status-update', statusUpdate);
      if (response.data.success) {
        setMessage({ type: 'success', text: 'Status update sent successfully!' });
        setStatusUpdate({ subject: '', message: '', priority: 'normal' });
        setShowComposeModal(false);
        setTimeout(() => setMessage(''), 5000);
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to send' });
    } finally {
      setLoading(false);
    }
  };

  const sendSupportRequest = async (e) => {
    e.preventDefault();
    if (!supportRequest.subject || !supportRequest.description) {
      setMessage({ type: 'error', text: 'Please fill in all required fields' });
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post('/api/tm-email/send-support-request', supportRequest);
      if (response.data.success) {
        setMessage({ type: 'success', text: 'Support request sent successfully!' });
        setSupportRequest({ subject: '', description: '', urgency: 'low' });
        setShowComposeModal(false);
        setTimeout(() => setMessage(''), 5000);
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to send' });
    } finally {
      setLoading(false);
    }
  };

  const sendCustomEmail = async (e) => {
    e.preventDefault();
    if (!customEmailForm.recipientEmail || !customEmailForm.subject || !customEmailForm.message) {
      setMessage({ type: 'error', text: 'Please fill in all required fields' });
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post('/api/tm-email/send-custom-email', customEmailForm);
      if (response.data.success) {
        setMessage({ type: 'success', text: `Email sent to ${response.data.recipient.name}` });
        setCustomEmailForm({ recipientEmail: '', subject: '', message: '', priority: 'normal' });
        setShowComposeModal(false);
        setTimeout(() => setMessage(''), 5000);
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to send email' });
    } finally {
      setLoading(false);
    }
  };

  const openComposeModal = (type) => {
    setComposeType(type);
    setShowComposeModal(true);
  };

  const closeComposeModal = () => {
    setShowComposeModal(false);
    setComposeType('');
  };

  return (
    <div className="tm-email-dashboard">
      {/* Header */}
      <div className="tm-dashboard-header">
        <div className="header-content">
          <h2>
            <span className="icon">📧</span>
            Team Member Email Hub
          </h2>
          <div className={`connection-badge ${connectionStatus}`}>
            {connectionStatus === 'connected' && <><span className="dot"></span> Connected</>}
            {connectionStatus === 'disconnected' && <><span className="dot"></span> Disconnected</>}
            {connectionStatus === 'checking' && <><span className="dot"></span> Checking...</>}
          </div>
        </div>
      </div>

      {/* Message Toast */}
      {message && (
        <div className={`tm-message-toast ${message.type}`}>
          <span className="toast-icon">{message.type === 'success' ? '✅' : '❌'}</span>
          <span className="toast-text">{message.text}</span>
          <button className="toast-close" onClick={() => setMessage('')}>×</button>
        </div>
      )}

      {/* Tabs */}
      <div className="tm-tabs">
        <button 
          className={`tm-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <span className="tab-icon">📊</span>
          <span className="tab-label">Overview</span>
        </button>
        <button 
          className={`tm-tab ${activeTab === 'inbox' ? 'active' : ''}`}
          onClick={() => setActiveTab('inbox')}
        >
          <span className="tab-icon">📬</span>
          <span className="tab-label">Inbox</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="tm-tab-content">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="tm-overview">
            {/* Stats Cards */}
            <div className="tm-stats-grid">
              <div className="tm-stat-card inbox">
                <div className="stat-icon">📬</div>
                <div className="stat-info">
                  <div className="stat-value">{inbox.length}</div>
                  <div className="stat-label">Inbox Messages</div>
                </div>
              </div>
              <div className="tm-stat-card notifications">
                <div className="stat-icon">🔔</div>
                <div className="stat-info">
                  <div className="stat-value">{notifications.length}</div>
                  <div className="stat-label">Notifications</div>
                </div>
              </div>
              <div className="tm-stat-card status">
                <div className="stat-icon">🔗</div>
                <div className="stat-info">
                  <div className="stat-value">{connectionStatus === 'connected' ? 'Active' : 'Offline'}</div>
                  <div className="stat-label">Email Service</div>
                </div>
              </div>
            </div>

            {/* Quick Compose Section */}
            <div className="tm-quick-compose">
              <h3>
                <span className="section-icon">✉️</span>
                Quick Actions
              </h3>
              <div className="compose-actions">
                <button 
                  className="compose-btn custom-email"
                  onClick={() => openComposeModal('custom')}
                  disabled={connectionStatus !== 'connected'}
                >
                  <span className="btn-icon">✉️</span>
                  <div className="btn-content">
                    <div className="btn-title">Compose Email</div>
                    <div className="btn-subtitle">Send email to team lead</div>
                  </div>
                </button>
                <button 
                  className="compose-btn status-update"
                  onClick={() => openComposeModal('status')}
                  disabled={connectionStatus !== 'connected'}
                >
                  <span className="btn-icon">📊</span>
                  <div className="btn-content">
                    <div className="btn-title">Status Update</div>
                    <div className="btn-subtitle">Send progress to team lead</div>
                  </div>
                </button>
                <button 
                  className="compose-btn support"
                  onClick={() => openComposeModal('support')}
                  disabled={connectionStatus !== 'connected'}
                >
                  <span className="btn-icon">🆘</span>
                  <div className="btn-content">
                    <div className="btn-title">Support Request</div>
                    <div className="btn-subtitle">Request help or clarification</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Recent Notifications */}
            <div className="tm-notifications-section">
              <h3>
                <span className="section-icon">🔔</span>
                Recent Notifications
              </h3>
              {notifications.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon">📭</span>
                  <p>No notifications at the moment</p>
                  <button className="refresh-btn" onClick={fetchNotifications}>
                    🔄 Refresh
                  </button>
                </div>
              ) : (
                <div className="notifications-list">
                  {notifications.slice(0, 5).map((notif, index) => (
                    <div key={index} className="notification-card">
                      <div className="notif-header">
                        <h4>{notif.subject}</h4>
                        <span className="notif-date">
                          {new Date(notif.date).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="notif-message">{notif.message}</p>
                      {notif.priority === 'high' && (
                        <span className="priority-badge high">High Priority</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Inbox Tab - using TeamMemberMailbox component */}
        {activeTab === 'inbox' && (
          <TeamMemberMailbox />
        )}
      </div>

      {/* Compose Modal */}
      {showComposeModal && (
        <div className="tm-modal-overlay" onClick={closeComposeModal}>
          <div className="tm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tm-modal-header">
              <h3>
                {composeType === 'custom' && '✉️ Compose Email'}
                {composeType === 'status' && '📊 Send Status Update'}
                {composeType === 'support' && '🆘 Request Support'}
              </h3>
              <button className="modal-close" onClick={closeComposeModal}>×</button>
            </div>
            
            <div className="tm-modal-body">
              {/* Custom Email Form */}
              {composeType === 'custom' && (
                <form onSubmit={sendCustomEmail} className="tm-compose-form">
                  <div className="form-field">
                    <label>To (Select Team Leader)</label>
                    <select
                      value={customEmailForm.recipientEmail}
                      onChange={(e) => setCustomEmailForm(prev => ({
                        ...prev,
                        recipientEmail: e.target.value
                      }))}
                      required
                    >
                      <option value="">-- Select a team leader --</option>
                      {teamLeaders.map((leader, index) => (
                        <option key={index} value={leader.email}>
                          {leader.displayName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-field">
                    <label>Priority Level</label>
                    <select
                      value={customEmailForm.priority}
                      onChange={(e) => setCustomEmailForm(prev => ({
                        ...prev,
                        priority: e.target.value
                      }))}
                    >
                      <option value="normal">📝 Normal</option>
                      <option value="medium">📋 Important</option>
                      <option value="high">⚠️ High Priority</option>
                    </select>
                  </div>

                  <div className="form-field">
                    <label>Subject</label>
                    <input
                      type="text"
                      value={customEmailForm.subject}
                      onChange={(e) => setCustomEmailForm(prev => ({
                        ...prev,
                        subject: e.target.value
                      }))}
                      required
                      placeholder="Enter email subject"
                    />
                  </div>

                  <div className="form-field">
                    <label>Message</label>
                    <textarea
                      value={customEmailForm.message}
                      onChange={(e) => setCustomEmailForm(prev => ({
                        ...prev,
                        message: e.target.value
                      }))}
                      required
                      rows="6"
                      placeholder="Type your message here..."
                    />
                  </div>

                  <button type="submit" disabled={loading} className="tm-submit-btn">
                    {loading ? '📤 Sending...' : '📤 Send Email'}
                  </button>
                </form>
              )}

              {/* Status Update Form */}
              {composeType === 'status' && (
                <form onSubmit={sendStatusUpdate} className="tm-compose-form">
                  <div className="form-field">
                    <label>Priority Level</label>
                    <select
                      value={statusUpdate.priority}
                      onChange={(e) => setStatusUpdate(prev => ({
                        ...prev,
                        priority: e.target.value
                      }))}
                    >
                      <option value="normal">📝 Normal</option>
                      <option value="medium">📋 Important</option>
                      <option value="high">⚠️ Urgent</option>
                    </select>
                  </div>

                  <div className="form-field">
                    <label>Subject</label>
                    <input
                      type="text"
                      value={statusUpdate.subject}
                      onChange={(e) => setStatusUpdate(prev => ({
                        ...prev,
                        subject: e.target.value
                      }))}
                      required
                      placeholder="Weekly Status Update - [Your Name]"
                    />
                  </div>

                  <div className="form-field">
                    <label>Status Message</label>
                    <textarea
                      value={statusUpdate.message}
                      onChange={(e) => setStatusUpdate(prev => ({
                        ...prev,
                        message: e.target.value
                      }))}
                      required
                      rows="6"
                      placeholder="Completed tasks, current progress, upcoming work..."
                    />
                  </div>

                  <button type="submit" disabled={loading} className="tm-submit-btn">
                    {loading ? '📤 Sending...' : '📤 Send Update'}
                  </button>
                </form>
              )}

              {/* Support Request Form */}
              {composeType === 'support' && (
                <form onSubmit={sendSupportRequest} className="tm-compose-form">
                  <div className="form-field">
                    <label>Urgency Level</label>
                    <select
                      value={supportRequest.urgency}
                      onChange={(e) => setSupportRequest(prev => ({
                        ...prev,
                        urgency: e.target.value
                      }))}
                    >
                      <option value="low">📝 Low - General Question</option>
                      <option value="medium">📋 Medium - Need Assistance</option>
                      <option value="high">⚠️ High - Blocking Issue</option>
                      <option value="critical">🚨 Critical - Urgent Help</option>
                    </select>
                  </div>

                  <div className="form-field">
                    <label>Subject</label>
                    <input
                      type="text"
                      value={supportRequest.subject}
                      onChange={(e) => setSupportRequest(prev => ({
                        ...prev,
                        subject: e.target.value
                      }))}
                      required
                      placeholder="Need help with..."
                    />
                  </div>

                  <div className="form-field">
                    <label>Description</label>
                    <textarea
                      value={supportRequest.description}
                      onChange={(e) => setSupportRequest(prev => ({
                        ...prev,
                        description: e.target.value
                      }))}
                      required
                      rows="6"
                      placeholder="Describe your issue or question in detail..."
                    />
                  </div>

                  <button type="submit" disabled={loading} className="tm-submit-btn support">
                    {loading ? '🆘 Sending...' : '🆘 Send Request'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
