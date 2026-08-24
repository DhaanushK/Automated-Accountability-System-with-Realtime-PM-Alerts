import React, { useState, useEffect } from 'react';
import axios from '../config/axios';

export default function TeamMemberMailbox() {
  const userEmail = localStorage.getItem('email') || '';
  const [activeFolder, setActiveFolder] = useState('inbox');
  const [emails, setEmails] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    unread: 0,
    totalInbox: 0,
    totalOutbox: 0,
    failed: 0
  });
  const [pagination, setPagination] = useState({
    page: 1,
    total: 0,
    pages: 0,
    hasMore: false
  });
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    fetchEmails();
    fetchStats();
  }, [activeFolder, pagination.page]);

  const fetchEmails = async () => {
    try {
      setLoading(true);
      const endpoint = activeFolder === 'outbox' 
        ? `/api/tm-email/outbox` 
        : `/api/tm-email/inbox`;
      
      const params = {
        page: pagination.page,
        limit: 20
      };

      const response = await axios.get(endpoint, { params });
      
      if (response.data.success) {
        setEmails(response.data.data || response.data.emails || []);
        if (response.data.pagination) {
          setPagination(response.data.pagination);
        }
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: 'Failed to fetch emails'
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get('/api/tm-email/stats');
      if (response.data.success) {
        setStats(response.data.data || response.data.stats || {});
      }
    } catch (error) {
      console.error('Failed to fetch mailbox stats:', error);
    }
  };

  const handleEmailClick = async (email) => {
    setSelectedEmail(email);
    
    // Mark as read if unread
    if (!email.isRead) {
      try {
        await axios.patch(`/api/tm-email/${email._id}/read-status`, { isRead: true });
        fetchEmails();
        fetchStats();
      } catch (error) {
        console.error('Failed to mark email as read:', error);
      }
    }
  };

  const handleRefresh = () => {
    fetchEmails();
    fetchStats();
    setMessage({ type: 'success', text: 'Refreshed successfully!' });
    setTimeout(() => setMessage({ type: '', text: '' }), 3000);
  };

  return (
    <div className="tm-mailbox">
      {/* Header */}
      <div className="mailbox-header">
        <h3>
          <span className="icon">📬</span>
          Team Member Mailbox
        </h3>
        <button className="refresh-btn" onClick={handleRefresh} disabled={loading}>
          🔄 Refresh
        </button>
      </div>

      {/* Message Toast */}
      {message.text && (
        <div className={`message-toast ${message.type}`}>
          {message.text}
        </div>
      )}

      {/* Statistics */}
      <div className="mailbox-stats">
        <div className="stat-item">
          <span className="stat-label">📥 Inbox</span>
          <span className="stat-value">{stats.inbox || stats.totalInbox || 0}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">📤 Outbox</span>
          <span className="stat-value">{stats.outbox || stats.totalOutbox || 0}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">✉️ Unread</span>
          <span className="stat-value">{stats.unread || 0}</span>
        </div>
      </div>

      {/* Main content */}
      <div className="mailbox-content">
        {/* Left sidebar */}
        <div className="mailbox-sidebar">
          <div className="folder-list">
            <button
              className={activeFolder === 'inbox' ? 'active' : ''}
              onClick={() => setActiveFolder('inbox')}
            >
              📥 Inbox {stats.unread > 0 && <span className="badge">{stats.unread}</span>}
            </button>
            <button
              className={activeFolder === 'outbox' ? 'active' : ''}
              onClick={() => setActiveFolder('outbox')}
            >
              📤 Outbox
            </button>
          </div>
        </div>

        {/* Email list */}
        <div className="email-list">
          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Loading emails...</p>
            </div>
          ) : emails.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">📭</span>
              <p>No emails found</p>
            </div>
          ) : (
            emails.map(email => (
              <div
                key={email._id}
                className={`email-item ${!email.isRead ? 'unread' : ''} ${
                  selectedEmail?._id === email._id ? 'selected' : ''
                }`}
                onClick={() => handleEmailClick(email)}
              >
                <div className="email-item-header">
                  <span className="sender">
                    {activeFolder === 'inbox' ? email.sender?.name || 'Unknown' : `To: ${email.recipients?.[0]?.name || 'Unknown'}`}
                  </span>
                  <span className="date">
                    {new Date(email.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="subject">{email.subject}</div>
                <div className="preview">
                  {email.content?.text?.substring(0, 100) || 
                   email.content?.html?.substring(0, 100).replace(/<[^>]*>/g, '') || 
                   'No preview available'}...
                </div>
              </div>
            ))
          )}
        </div>

        {/* Email view */}
        {selectedEmail && (
          <div className="email-view">
            <div className="email-view-header">
              <h3>{selectedEmail.subject}</h3>
            </div>
            <div className="email-metadata">
              <p>
                <strong>From:</strong> {selectedEmail.sender?.name} ({selectedEmail.sender?.email})
              </p>
              {selectedEmail.recipients && selectedEmail.recipients.length > 0 && (
                <p>
                  <strong>To:</strong> {selectedEmail.recipients[0].name} ({selectedEmail.recipients[0].email})
                </p>
              )}
              <p>
                <strong>Date:</strong>{' '}
                {new Date(selectedEmail.createdAt).toLocaleString()}
              </p>
              <p>
                <strong>Priority:</strong>{' '}
                <span className={`priority-${selectedEmail.priority || 'normal'}`}>
                  {selectedEmail.priority || 'Normal'}
                </span>
              </p>
            </div>
            <div className="email-body">
              {selectedEmail.content?.text || (
                <div dangerouslySetInnerHTML={{ __html: selectedEmail.content?.html || 'No content available' }} />
              )}
            </div>
            {selectedEmail.attachments?.length > 0 && (
              <div className="email-attachments">
                <h4>📎 Attachments</h4>
                <ul>
                  {selectedEmail.attachments.map((att, index) => (
                    <li key={index}>
                      <a href={att.path} target="_blank" rel="noopener noreferrer">
                        {att.filename}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="pagination">
          <button 
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
            disabled={pagination.page === 1}
          >
            ← Previous
          </button>
          <span>Page {pagination.page} of {pagination.pages}</span>
          <button 
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
            disabled={pagination.page === pagination.pages}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
