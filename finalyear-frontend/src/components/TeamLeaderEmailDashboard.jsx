import React, { useState, useEffect } from 'react';
import axios from '../config/axios';
import TeamLeaderMailbox from './TeamLeaderMailbox';
import './TeamLeaderEmailDashboard.css';

export default function TeamLeaderEmailDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [connectionStatus, setConnectionStatus] = useState('checking');
  const [teamMembers, setTeamMembers] = useState([]);
  const [allContacts, setAllContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [showComposeModal, setShowComposeModal] = useState(false);
  const [composeType, setComposeType] = useState('');

  // Form states
  const [teamUpdateForm, setTeamUpdateForm] = useState({
    subject: '',
    message: '',
    priority: 'normal'
  });

  const [reminderForm, setReminderForm] = useState({
    targetDate: new Date().toISOString().split('T')[0],
    selectedMembers: []
  });

  const [alertForm, setAlertForm] = useState({
    subject: '',
    message: '',
    priority: 'medium'
  });

  const [customEmailForm, setCustomEmailForm] = useState({
    recipientEmail: '',
    subject: '',
    message: '',
    priority: 'normal'
  });

  useEffect(() => {
    checkEmailConnection();
    fetchTeamMembers();
    fetchAllContacts();
  }, []);

  const checkEmailConnection = async () => {
    try {
      const response = await axios.get('/api/tl-email/test-connection');
      setConnectionStatus(response.data.status);
    } catch (error) {
      setConnectionStatus('disconnected');
      console.error('Email connection test failed:', error);
    }
  };

  const fetchTeamMembers = async () => {
    try {
      const response = await axios.get('/api/tl-email/team-members');
      setTeamMembers(response.data.teamMembers || []);
    } catch (error) {
      console.error('Failed to fetch team members:', error);
    }
  };

  const fetchAllContacts = async () => {
    try {
      const response = await axios.get('/api/tl-email/all-contacts');
      setAllContacts(response.data.contacts || []);
    } catch (error) {
      console.error('Failed to fetch contacts:', error);
    }
  };

  const sendTeamUpdate = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setMessage('');
      
      const response = await axios.post('/api/tl-email/send-team-update', teamUpdateForm);
      
      setMessage({ type: 'success', text: `Team update sent to ${response.data.emailsSent} members` });
      setTeamUpdateForm({ subject: '', message: '', priority: 'normal' });
      setShowComposeModal(false);
      
      setTimeout(() => setMessage(''), 5000);
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to send update' });
    } finally {
      setLoading(false);
    }
  };

  const sendMetricsReminder = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setMessage('');

      if (reminderForm.selectedMembers.length === 0) {
        setMessage({ type: 'error', text: 'Please select team members' });
        setLoading(false);
        return;
      }

      const response = await axios.post('/api/tl-email/send-metrics-reminder', {
        targetDate: reminderForm.targetDate,
        selectedMembers: reminderForm.selectedMembers
      });
      
      setMessage({ type: 'success', text: `Reminders sent to ${response.data.results.length} members` });
      setReminderForm({ targetDate: new Date().toISOString().split('T')[0], selectedMembers: [] });
      setShowComposeModal(false);
      
      setTimeout(() => setMessage(''), 5000);
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to send reminders' });
    } finally {
      setLoading(false);
    }
  };

  const sendTeamAlert = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setMessage('');

      const response = await axios.post('/api/tl-email/send-team-alert', alertForm);
      
      setMessage({ type: 'success', text: `Alert sent to ${response.data.results.length} members` });
      setAlertForm({ subject: '', message: '', priority: 'medium' });
      setShowComposeModal(false);
      
      setTimeout(() => setMessage(''), 5000);
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to send alert' });
    } finally {
      setLoading(false);
    }
  };

  const sendCustomEmail = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setMessage('');

      const response = await axios.post('/api/tl-email/send-custom-email', customEmailForm);
      
      setMessage({ type: 'success', text: `Email sent to ${response.data.recipient.name}` });
      setCustomEmailForm({ recipientEmail: '', subject: '', message: '', priority: 'normal' });
      setShowComposeModal(false);
      
      setTimeout(() => setMessage(''), 5000);
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to send email' });
    } finally {
      setLoading(false);
    }
  };

  const toggleMemberSelection = (member) => {
    setReminderForm(prev => ({
      ...prev,
      selectedMembers: prev.selectedMembers.find(m => m.email === member.email)
        ? prev.selectedMembers.filter(m => m.email !== member.email)
        : [...prev.selectedMembers, { name: member.name, email: member.email }]
    }));
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
    <div className="tl-email-dashboard">
      {/* Header */}
      <div className="tl-dashboard-header">
        <div className="header-content">
          <h2>
            <span className="icon">📧</span>
            Team Leader Email Hub
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
        <div className={`tl-message-toast ${message.type}`}>
          <span className="toast-icon">
            {message.type === 'success' ? '✅' : '❌'}
          </span>
          <span className="toast-text">{message.text}</span>
          <button className="toast-close" onClick={() => setMessage('')}>×</button>
        </div>
      )}

      {/* Tabs */}
      <div className="tl-tabs">
        <button 
          className={`tl-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <span className="tab-icon">📊</span>
          <span className="tab-label">Overview</span>
        </button>
        <button 
          className={`tl-tab ${activeTab === 'mailbox' ? 'active' : ''}`}
          onClick={() => setActiveTab('mailbox')}
        >
          <span className="tab-icon">📬</span>
          <span className="tab-label">Mailbox</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="tl-tab-content">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="tl-overview">
            {/* Stats Cards */}
            <div className="tl-stats-grid">
              <div className="tl-stat-card team">
                <div className="stat-icon">👥</div>
                <div className="stat-info">
                  <div className="stat-value">{teamMembers.length}</div>
                  <div className="stat-label">Team Members</div>
                </div>
              </div>
              <div className="tl-stat-card active">
                <div className="stat-icon">✅</div>
                <div className="stat-info">
                  <div className="stat-value">{teamMembers.filter(m => m.role === 'team_member').length}</div>
                  <div className="stat-label">Active Members</div>
                </div>
              </div>
              <div className="tl-stat-card status">
                <div className="stat-icon">🔗</div>
                <div className="stat-info">
                  <div className="stat-value">{connectionStatus === 'connected' ? 'Active' : 'Offline'}</div>
                  <div className="stat-label">Email Service</div>
                </div>
              </div>
            </div>

            {/* Quick Compose Section */}
            <div className="tl-quick-compose">
              <h3>
                <span className="section-icon">✉️</span>
                Quick Compose
              </h3>
              <div className="compose-actions">
                <button 
                  className="compose-btn custom-email"
                  onClick={() => openComposeModal('custom')}
                  disabled={connectionStatus !== 'connected'}
                >
                  <div className="btn-icon">✉️</div>
                  <div className="btn-content">
                    <div className="btn-title">Compose Email</div>
                    <div className="btn-subtitle">Send to specific person</div>
                  </div>
                </button>
                <button 
                  className="compose-btn team-update"
                  onClick={() => openComposeModal('update')}
                  disabled={connectionStatus !== 'connected'}
                >
                  <span className="btn-icon">📢</span>
                  <div className="btn-content">
                    <div className="btn-title">Team Update</div>
                    <div className="btn-subtitle">Send updates to all members</div>
                  </div>
                </button>
                <button 
                  className="compose-btn reminder"
                  onClick={() => openComposeModal('reminder')}
                  disabled={connectionStatus !== 'connected'}
                >
                  <span className="btn-icon">📋</span>
                  <div className="btn-content">
                    <div className="btn-title">Metrics Reminder</div>
                    <div className="btn-subtitle">Remind members to submit</div>
                  </div>
                </button>
                <button 
                  className="compose-btn alert"
                  onClick={() => openComposeModal('alert')}
                  disabled={connectionStatus !== 'connected'}
                >
                  <span className="btn-icon">🚨</span>
                  <div className="btn-content">
                    <div className="btn-title">Team Alert</div>
                    <div className="btn-subtitle">Send urgent notifications</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Team Members List */}
            <div className="tl-team-section">
              <h3>
                <span className="section-icon">👥</span>
                My Team
              </h3>
              <div className="tl-team-grid">
                {teamMembers.map((member, index) => (
                  <div key={index} className="tl-team-card">
                    <div className="member-avatar">
                      {member.name?.charAt(0) || '?'}
                    </div>
                    <div className="member-details">
                      <div className="member-name">{member.name}</div>
                      <div className="member-email">{member.email}</div>
                      <div className={`member-role ${member.role}`}>
                        {member.role === 'team_member' ? '👤 Member' : '👨‍💼 Lead'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Mailbox Tab */}
        {activeTab === 'mailbox' && (
          <div className="tl-mailbox-section">
            <TeamLeaderMailbox />
          </div>
        )}
      </div>

      {/* Compose Modal */}
      {showComposeModal && (
        <div className="tl-modal-overlay" onClick={closeComposeModal}>
          <div className="tl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tl-modal-header">
              <h3>
                {composeType === 'custom' && '✉️ Compose Email'}
                {composeType === 'update' && '📢 Send Team Update'}
                {composeType === 'reminder' && '📋 Send Metrics Reminder'}
                {composeType === 'alert' && '🚨 Send Team Alert'}
              </h3>
              <button className="modal-close" onClick={closeComposeModal}>×</button>
            </div>
            
            <div className="tl-modal-body">
              {/* Custom Email Form */}
              {composeType === 'custom' && (
                <form onSubmit={sendCustomEmail} className="tl-compose-form">
                  <div className="form-field">
                    <label>To (Select Recipient)</label>
                    <select
                      value={customEmailForm.recipientEmail}
                      onChange={(e) => setCustomEmailForm(prev => ({
                        ...prev,
                        recipientEmail: e.target.value
                      }))}
                      required
                    >
                      <option value="">-- Select a recipient --</option>
                      {allContacts.map((contact, index) => (
                        <option key={index} value={contact.email}>
                          {contact.displayName}
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

                  <button type="submit" disabled={loading} className="tl-submit-btn">
                    {loading ? '📤 Sending...' : '📤 Send Email'}
                  </button>
                </form>
              )}

              {/* Team Update Form */}
              {composeType === 'update' && (
                <form onSubmit={sendTeamUpdate} className="tl-compose-form">
                  <div className="form-field">
                    <label>Priority Level</label>
                    <select
                      value={teamUpdateForm.priority}
                      onChange={(e) => setTeamUpdateForm(prev => ({
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
                      value={teamUpdateForm.subject}
                      onChange={(e) => setTeamUpdateForm(prev => ({
                        ...prev,
                        subject: e.target.value
                      }))}
                      required
                      placeholder="Team Meeting Tomorrow at 2 PM"
                    />
                  </div>

                  <div className="form-field">
                    <label>Message</label>
                    <textarea
                      value={teamUpdateForm.message}
                      onChange={(e) => setTeamUpdateForm(prev => ({
                        ...prev,
                        message: e.target.value
                      }))}
                      required
                      rows="6"
                      placeholder="Hi team, I wanted to update you on..."
                    />
                  </div>

                  <button type="submit" disabled={loading} className="tl-submit-btn">
                    {loading ? '📤 Sending...' : '📤 Send Update'}
                  </button>
                </form>
              )}

              {/* Metrics Reminder Form */}
              {composeType === 'reminder' && (
                <form onSubmit={sendMetricsReminder} className="tl-compose-form">
                  <div className="form-field">
                    <label>Target Date</label>
                    <input
                      type="date"
                      value={reminderForm.targetDate}
                      onChange={(e) => setReminderForm(prev => ({
                        ...prev,
                        targetDate: e.target.value
                      }))}
                      required
                    />
                  </div>

                  <div className="form-field">
                    <label>Select Team Members</label>
                    <div className="member-checklist">
                      {teamMembers.filter(member => member.role === 'team_member').map((member, index) => (
                        <label key={index} className="member-checkbox-label">
                          <input
                            type="checkbox"
                            checked={reminderForm.selectedMembers.some(m => m.email === member.email)}
                            onChange={() => toggleMemberSelection(member)}
                          />
                          <div className="checkbox-content">
                            <span className="checkbox-name">{member.name}</span>
                            <span className="checkbox-email">{member.email}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <button type="submit" disabled={loading} className="tl-submit-btn">
                    {loading ? '📤 Sending...' : '📤 Send Reminders'}
                  </button>
                </form>
              )}

              {/* Team Alert Form */}
              {composeType === 'alert' && (
                <form onSubmit={sendTeamAlert} className="tl-compose-form">
                  <div className="form-field">
                    <label>Alert Priority</label>
                    <select
                      value={alertForm.priority}
                      onChange={(e) => setAlertForm(prev => ({
                        ...prev,
                        priority: e.target.value
                      }))}
                    >
                      <option value="medium">📋 Medium</option>
                      <option value="high">⚠️ High</option>
                      <option value="critical">🚨 Critical</option>
                    </select>
                  </div>

                  <div className="form-field">
                    <label>Alert Subject</label>
                    <input
                      type="text"
                      value={alertForm.subject}
                      onChange={(e) => setAlertForm(prev => ({
                        ...prev,
                        subject: e.target.value
                      }))}
                      required
                      placeholder="Urgent: Deadline Extended"
                    />
                  </div>

                  <div className="form-field">
                    <label>Alert Message</label>
                    <textarea
                      value={alertForm.message}
                      onChange={(e) => setAlertForm(prev => ({
                        ...prev,
                        message: e.target.value
                      }))}
                      required
                      rows="6"
                      placeholder="This is an urgent notification..."
                    />
                  </div>

                  <button type="submit" disabled={loading} className="tl-submit-btn alert">
                    {loading ? '🚨 Sending...' : '🚨 Send Alert'}
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
