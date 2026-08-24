import { useState, useEffect } from 'react';
import axios from '../config/axios';

export default function MetricsSubmissionForm() {
  const [incompleteTickets, setIncompleteTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingTicket, setUpdatingTicket] = useState(null);

  const statusOptions = ['Open', 'In Progress', 'Closed', 'Reopened', 'Escalated to Level'];

  useEffect(() => {
    fetchIncompleteTickets();
  }, []);

  const fetchIncompleteTickets = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/tickets/incomplete', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setIncompleteTickets(response.data.tickets);
        console.log(`Loaded ${response.data.tickets.length} incomplete tickets`);
      }
    } catch (err) {
      console.error('Error fetching incomplete tickets:', err);
      setError(err.response?.data?.message || 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (ticketId, newStatus) => {
    try {
      setUpdatingTicket(ticketId);
      
      const token = localStorage.getItem('token');
      const response = await axios.patch('/api/tickets/update-status', 
        { ticketId, newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        // Show success message
        alert(`✅ Ticket ${ticketId} status updated to: ${newStatus}`);
        
        // Refresh the ticket list
        await fetchIncompleteTickets();
      }
    } catch (err) {
      console.error('Error updating ticket status:', err);
      alert(`❌ Failed to update ticket: ${err.response?.data?.message || err.message}`);
    } finally {
      setUpdatingTicket(null);
    }
  };

  if (loading) {
    return (
      <div style={{
        backgroundColor: '#fff',
        padding: '40px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        textAlign: 'center',
        marginBottom: '24px'
      }}>
        <div style={{
          display: 'inline-block',
          width: '40px',
          height: '40px',
          border: '3px solid #f3f3f3',
          borderTop: '3px solid #1976d2',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        <p style={{ marginTop: '16px', color: '#666' }}>Loading tickets...</p>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        backgroundColor: '#fff',
        padding: '40px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        textAlign: 'center',
        marginBottom: '24px',
        borderLeft: '4px solid #f44336'
      }}>
        <i className="fas fa-exclamation-circle" style={{ fontSize: '48px', color: '#f44336', marginBottom: '16px' }}></i>
        <h3 style={{ color: '#333', margin: '0 0 8px 0' }}>Error Loading Tickets</h3>
        <p style={{ color: '#666', marginBottom: '16px' }}>{error}</p>
        <button
          onClick={fetchIncompleteTickets}
          style={{
            padding: '10px 20px',
            backgroundColor: '#1976d2',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500'
          }}
          onMouseOver={e => e.target.style.backgroundColor = '#1565c0'}
          onMouseOut={e => e.target.style.backgroundColor = '#1976d2'}
        >
          <i className="fas fa-redo" style={{ marginRight: '8px' }}></i>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: '#fff',
      padding: '24px',
      borderRadius: '8px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      marginBottom: '24px'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        paddingBottom: '16px',
        borderBottom: '2px solid #f0f0f0'
      }}>
        <div>
          <h2 style={{
            margin: '0 0 4px 0',
            color: '#1a1a1a',
            fontSize: '20px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <i className="fas fa-tasks" style={{ color: '#1976d2' }}></i>
            Update Ticket Status
          </h2>
          <p style={{
            margin: 0,
            fontSize: '13px',
            color: '#666'
          }}>
            {incompleteTickets.length} incomplete ticket(s) • Update status to track progress
          </p>
        </div>
        <button
          onClick={fetchIncompleteTickets}
          disabled={loading}
          style={{
            padding: '8px 16px',
            backgroundColor: '#f5f5f5',
            color: '#333',
            border: '1px solid #ddd',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontWeight: '500'
          }}
          onMouseOver={e => e.target.style.backgroundColor = '#ebebeb'}
          onMouseOut={e => e.target.style.backgroundColor = '#f5f5f5'}
        >
          <i className="fas fa-sync-alt"></i>
          Refresh
        </button>
      </div>

      {/* Tickets List */}
      {incompleteTickets.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          color: '#999'
        }}>
          <i className="fas fa-check-circle" style={{
            fontSize: '64px',
            color: '#4caf50',
            marginBottom: '16px'
          }}></i>
          <h3 style={{ color: '#666', margin: '0 0 8px 0' }}>All Caught Up!</h3>
          <p style={{ color: '#999', fontSize: '14px', margin: 0 }}>
            You have no incomplete tickets. Great job! 🎉
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gap: '12px'
        }}>
          {incompleteTickets.map((ticket) => (
            <div
              key={ticket.ticketId}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px',
                backgroundColor: '#f8f9fa',
                borderRadius: '6px',
                border: '1px solid #e0e0e0',
                transition: 'all 0.2s'
              }}
              onMouseOver={e => {
                e.currentTarget.style.backgroundColor = '#f0f0f0';
                e.currentTarget.style.borderColor = '#d0d0d0';
              }}
              onMouseOut={e => {
                e.currentTarget.style.backgroundColor = '#f8f9fa';
                e.currentTarget.style.borderColor = '#e0e0e0';
              }}
            >
              {/* Ticket Info */}
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: '15px',
                  fontWeight: '600',
                  color: '#1976d2',
                  marginBottom: '4px'
                }}>
                  {ticket.ticketId}
                </div>
                <div style={{
                  fontSize: '12px',
                  color: '#666',
                  display: 'flex',
                  gap: '16px',
                  flexWrap: 'wrap'
                }}>
                  <span>
                    <i className="fas fa-user" style={{ marginRight: '4px' }}></i>
                    {ticket.agentName || 'No Agent'}
                  </span>
                  <span>
                    <i className="fas fa-folder" style={{ marginRight: '4px' }}></i>
                    {ticket.category || 'No Category'}
                  </span>
                  <span>
                    <i className="fas fa-exclamation-triangle" style={{ marginRight: '4px' }}></i>
                    {ticket.severity || 'N/A'}
                  </span>
                  <span>
                    <i className="fas fa-calendar" style={{ marginRight: '4px' }}></i>
                    {ticket.createdDate || 'N/A'}
                  </span>
                </div>
              </div>

              {/* Status Dropdown */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <span style={{
                  fontSize: '13px',
                  color: '#666',
                  fontWeight: '500'
                }}>
                  Status:
                </span>
                <select
                  value={ticket.status}
                  onChange={(e) => handleStatusUpdate(ticket.ticketId, e.target.value)}
                  disabled={updatingTicket === ticket.ticketId}
                  style={{
                    padding: '8px 32px 8px 12px',
                    fontSize: '13px',
                    fontWeight: '500',
                    border: '2px solid #1976d2',
                    borderRadius: '6px',
                    backgroundColor: 'white',
                    color: '#1976d2',
                    cursor: updatingTicket === ticket.ticketId ? 'wait' : 'pointer',
                    outline: 'none',
                    minWidth: '150px',
                    appearance: 'none',
                    backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%231976d2' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 8px center',
                    backgroundSize: '16px',
                    opacity: updatingTicket === ticket.ticketId ? 0.6 : 1
                  }}
                >
                  {statusOptions.map(status => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                {updatingTicket === ticket.ticketId && (
                  <div style={{
                    width: '20px',
                    height: '20px',
                    border: '2px solid #f3f3f3',
                    borderTop: '2px solid #1976d2',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite'
                  }}></div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info Footer */}
      {incompleteTickets.length > 0 && (
        <div style={{
          marginTop: '20px',
          padding: '12px 16px',
          backgroundColor: '#e3f2fd',
          borderLeft: '4px solid #2196f3',
          borderRadius: '4px'
        }}>
          <p style={{
            margin: 0,
            fontSize: '13px',
            color: '#1565c0',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <i className="fas fa-info-circle"></i>
            <span>
              Select a new status from the dropdown to update. Changes are saved automatically to your Google Sheet.
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

export function MetricsSubmissionFormOLD() {
  const [formData, setFormData] = useState({
    agentName: '',
    ticketId: '',
    ticketCreationDate: new Date().toISOString().split('T')[0],
    ticketCompletionDate: '',
    category: '',
    urgency: '',
    priority: '',
    status: 'Open',
    sla: 'Yes',
    severity: 'Low',
    carriedForward: 'No',
    escalationLevel: 'Level 0',
    reopened: 'No'
  });
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [teamMembers, setTeamMembers] = useState([]);
  const [teamLeadName, setTeamLeadName] = useState('');
  const [generatingTicketId, setGeneratingTicketId] = useState(false);

  // Fetch team members and generate ticket ID on component mount
  useEffect(() => {
    fetchTeamMembers();
    generateTicketId();
    
    // Get logged-in team lead's name
    const userName = localStorage.getItem('userName');
    setTeamLeadName(userName || '');
  }, []);

  // Auto-calculate urgency, priority, severity when dates change
  useEffect(() => {
    if (formData.ticketCreationDate && formData.ticketCompletionDate) {
      calculateTicketMetrics();
    }
  }, [formData.ticketCreationDate, formData.ticketCompletionDate]);

  const fetchTeamMembers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/users/team-members', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTeamMembers(response.data.members || []);
    } catch (err) {
      console.error('Error fetching team members:', err);
    }
  };

  const generateTicketId = async () => {
    setGeneratingTicketId(true);
    try {
      const token = localStorage.getItem('token');
      const userName = localStorage.getItem('userName');
      
      const response = await axios.get('/api/tickets/generate-id', {
        headers: { Authorization: `Bearer ${token}` },
        params: { teamLeadName: userName }
      });
      
      setFormData(prev => ({
        ...prev,
        ticketId: response.data.ticketId
      }));
    } catch (err) {
      console.error('Error generating ticket ID:', err);
      // Fallback: generate client-side ID based on team lead
      const userName = localStorage.getItem('userName');
      let prefix = 'WG-TCK-000';
      
      // Determine prefix based on team lead name
      if (userName && userName.toLowerCase().includes('praveen')) {
        const randomNum = Math.floor(Math.random() * 100);
        prefix = `WG-TCK-${400 + randomNum}`;
      } else if (userName && userName.toLowerCase().includes('kanishkka')) {
        const randomNum = Math.floor(Math.random() * 100);
        prefix = `WG-TCK-${500 + randomNum}`;
      } else {
        // Default fallback
        const timestamp = Date.now().toString().slice(-3);
        prefix = `WG-TCK-${timestamp}`;
      }
      
      setFormData(prev => ({
        ...prev,
        ticketId: prefix
      }));
    } finally {
      setGeneratingTicketId(false);
    }
  };

  const calculateTicketMetrics = () => {
    const creationDate = new Date(formData.ticketCreationDate);
    const completionDate = new Date(formData.ticketCompletionDate);
    
    // Calculate days difference
    const timeDiff = completionDate - creationDate;
    const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
    
    let urgency = '';
    let priority = '';
    let severity = '';
    
    // Logic: Faster resolution = Higher urgency/priority
    if (daysDiff < 0) {
      // Invalid date range
      return;
    } else if (daysDiff === 0) {
      // Same day resolution - Highest urgency
      urgency = '5';
      priority = '5';
      severity = 'Critical';
    } else if (daysDiff === 1) {
      // 1 day resolution - High
      urgency = '4';
      priority = '4';
      severity = 'High';
    } else if (daysDiff <= 3) {
      // 2-3 days - Medium-High
      urgency = '3';
      priority = '3';
      severity = 'Medium';
    } else if (daysDiff <= 7) {
      // 4-7 days - Medium
      urgency = '2';
      priority = '2';
      severity = 'Low';
    } else {
      // More than 7 days - Low priority
      urgency = '1';
      priority = '1';
      severity = 'Low';
    }
    
    setFormData(prev => ({
      ...prev,
      urgency,
      priority,
      severity
    }));
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const resetForm = () => {
    setFormData({
      agentName: '',
      ticketId: formData.ticketId, // Keep the generated ticket ID
      ticketCreationDate: new Date().toISOString().split('T')[0],
      ticketCompletionDate: '',
      category: '',
      urgency: '',
      priority: '',
      status: 'Open',
      sla: 'Yes',
      severity: 'Low',
      carriedForward: 'No',
      escalationLevel: 'Level 0',
      reopened: 'No'
    });
    setMessage('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.ticketId.trim()) {
      setMessage('❌ Please enter a Ticket ID');
      return;
    }
    
    setLoading(true);
    setMessage('');
    
    try {
      const token = localStorage.getItem('token');
      
      // Include team lead name to determine which sheet to update
      const submitData = {
        ...formData,
        teamLeadName: teamLeadName
      };
      
      const response = await axios.post('/api/tickets/submit', submitData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      setMessage(`✅ ${response.data.message || 'Ticket submitted successfully to your designated sheet!'}`);
      resetForm();
      // Generate new ticket ID for next entry
      generateTicketId();
      
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message;
      setMessage(`❌ Error: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      backgroundColor: 'white',
      padding: '24px',
      borderRadius: '12px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      marginBottom: '24px'
    }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        marginBottom: '20px',
        paddingBottom: '16px',
        borderBottom: '2px solid #f0f0f0'
      }}>
        <i className="fas fa-ticket-alt" style={{ 
          fontSize: '24px', 
          color: '#1976d2',
          marginRight: '12px'
        }}></i>
        <h3 style={{ margin: 0, fontSize: '22px', color: '#333' }}>
          Add New Ticket Entry
        </h3>
      </div>
      
      {/* Team Lead Info */}
      <div style={{
        marginBottom: '20px',
        padding: '12px 16px',
        backgroundColor: '#e3f2fd',
        borderRadius: '8px',
        borderLeft: '4px solid #1976d2',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="fas fa-user-tie" style={{ color: '#1976d2', fontSize: '16px' }}></i>
          <span style={{ fontSize: '14px', color: '#333' }}>
            Logged in as: <strong>{teamLeadName || 'Team Lead'}</strong>
          </span>
        </div>
        <span style={{ fontSize: '12px', color: '#666' }}>
          <i className="fas fa-database" style={{ marginRight: '4px' }}></i>
          Data will be saved to your designated sheet
        </span>
      </div>
      
      <form onSubmit={handleSubmit}>
        {/* Row 1: Agent Name and Ticket ID */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
          gap: '16px',
          marginBottom: '16px'
        }}>
          <div>
            <label style={{ 
              display: 'block', 
              marginBottom: '6px', 
              fontWeight: '600',
              color: '#333',
              fontSize: '14px'
            }}>
              <i className="fas fa-user" style={{ marginRight: '6px', color: '#1976d2' }}></i>
              Agent Name *
            </label>
            {teamMembers.length > 0 ? (
              <select
                name="agentName"
                value={formData.agentName}
                onChange={handleInputChange}
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px',
                  backgroundColor: 'white',
                  cursor: 'pointer'
                }}
              >
                <option value="">Select Agent</option>
                {teamMembers.map((member, idx) => (
                  <option key={idx} value={member.name}>{member.name}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                name="agentName"
                value={formData.agentName}
                onChange={handleInputChange}
                placeholder="Enter agent name"
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              />
            )}
          </div>

          <div>
            <label style={{ 
              display: 'block', 
              marginBottom: '6px', 
              fontWeight: '600',
              color: '#333',
              fontSize: '14px'
            }}>
              <i className="fas fa-hashtag" style={{ marginRight: '6px', color: '#1976d2' }}></i>
              Ticket ID * (Auto-generated)
            </label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                name="ticketId"
                value={formData.ticketId}
                readOnly
                required
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px',
                  backgroundColor: '#f5f5f5',
                  cursor: 'not-allowed',
                  color: '#333',
                  fontWeight: '600'
                }}
              />
              <button
                type="button"
                onClick={generateTicketId}
                disabled={generatingTicketId}
                style={{
                  padding: '10px 14px',
                  backgroundColor: generatingTicketId ? '#ccc' : '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: generatingTicketId ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  transition: 'background-color 0.2s'
                }}
                title="Regenerate Ticket ID"
              >
                <i className={`fas ${generatingTicketId ? 'fa-spinner fa-spin' : 'fa-sync-alt'}`}></i>
              </button>
            </div>
            <p style={{ fontSize: '11px', color: '#666', margin: '4px 0 0 0' }}>
              <i className="fas fa-info-circle" style={{ marginRight: '4px' }}></i>
              Sequential ID auto-generated for your team
            </p>
          </div>
        </div>

        {/* Row 2: Creation and Completion Dates */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
          gap: '16px',
          marginBottom: '16px'
        }}>
          <div>
            <label style={{ 
              display: 'block', 
              marginBottom: '6px', 
              fontWeight: '600',
              color: '#333',
              fontSize: '14px'
            }}>
              <i className="fas fa-calendar-plus" style={{ marginRight: '6px', color: '#1976d2' }}></i>
              Ticket Creation Date *
            </label>
            <input
              type="date"
              name="ticketCreationDate"
              value={formData.ticketCreationDate}
              onChange={handleInputChange}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px'
              }}
            />
          </div>

          <div>
            <label style={{ 
              display: 'block', 
              marginBottom: '6px', 
              fontWeight: '600',
              color: '#333',
              fontSize: '14px'
            }}>
              <i className="fas fa-calendar-check" style={{ marginRight: '6px', color: '#28a745' }}></i>
              Ticket Completion Date
            </label>
            <input
              type="date"
              name="ticketCompletionDate"
              value={formData.ticketCompletionDate}
              onChange={handleInputChange}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px'
              }}
            />
          </div>
        </div>

        {/* Row 3: Category, Urgency, Priority */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '16px',
          marginBottom: '16px'
        }}>
          <div>
            <label style={{ 
              display: 'block', 
              marginBottom: '6px', 
              fontWeight: '600',
              color: '#333',
              fontSize: '14px'
            }}>
              <i className="fas fa-folder" style={{ marginRight: '6px', color: '#1976d2' }}></i>
              Category *
            </label>
            <input
              type="text"
              name="category"
              value={formData.category}
              onChange={handleInputChange}
              placeholder="e.g., Technical, Billing"
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px'
              }}
            />
          </div>

          <div>
            <label style={{ 
              display: 'block', 
              marginBottom: '6px', 
              fontWeight: '600',
              color: '#333',
              fontSize: '14px'
            }}>
              <i className="fas fa-exclamation-circle" style={{ marginRight: '6px', color: '#ff9800' }}></i>
              Urgency * (Auto-calculated)
            </label>
            <select
              name="urgency"
              value={formData.urgency}
              disabled
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px',
                backgroundColor: '#f5f5f5',
                cursor: 'not-allowed',
                color: '#333',
                fontWeight: '600'
              }}
            >
              <option value="">Enter completion date</option>
              <option value="1">1 - Lowest</option>
              <option value="2">2 - Low</option>
              <option value="3">3 - Medium</option>
              <option value="4">4 - High</option>
              <option value="5">5 - Highest</option>
            </select>
            <p style={{ fontSize: '11px', color: '#666', margin: '4px 0 0 0' }}>
              <i className="fas fa-magic" style={{ marginRight: '4px' }}></i>
              Calculated from resolution time
            </p>
          </div>

          <div>
            <label style={{ 
              display: 'block', 
              marginBottom: '6px', 
              fontWeight: '600',
              color: '#333',
              fontSize: '14px'
            }}>
              <i className="fas fa-flag" style={{ marginRight: '6px', color: '#f44336' }}></i>
              Priority * (Auto-calculated)
            </label>
            <select
              name="priority"
              value={formData.priority}
              disabled
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px',
                backgroundColor: '#f5f5f5',
                cursor: 'not-allowed',
                color: '#333',
                fontWeight: '600'
              }}
            >
              <option value="">Enter completion date</option>
              <option value="1">1 - Lowest</option>
              <option value="2">2 - Low</option>
              <option value="3">3 - Medium</option>
              <option value="4">4 - High</option>
              <option value="5">5 - Highest</option>
            </select>
            <p style={{ fontSize: '11px', color: '#666', margin: '4px 0 0 0' }}>
              <i className="fas fa-magic" style={{ marginRight: '4px' }}></i>
              Calculated from resolution time
            </p>
          </div>
        </div>

        {/* Row 4: Status, SLA, Severity */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '16px',
          marginBottom: '16px'
        }}>
          <div>
            <label style={{ 
              display: 'block', 
              marginBottom: '6px', 
              fontWeight: '600',
              color: '#333',
              fontSize: '14px'
            }}>
              <i className="fas fa-info-circle" style={{ marginRight: '6px', color: '#1976d2' }}></i>
              Status *
            </label>
            <select
              name="status"
              value={formData.status}
              onChange={handleInputChange}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px',
                backgroundColor: 'white',
                cursor: 'pointer'
              }}
            >
              <option value="Open">Open</option>
              <option value="In Progress">In Progress</option>
              <option value="Resolved">Resolved</option>
              <option value="Closed">Closed</option>
              <option value="Pending">Pending</option>
            </select>
          </div>

          <div>
            <label style={{ 
              display: 'block', 
              marginBottom: '6px', 
              fontWeight: '600',
              color: '#333',
              fontSize: '14px'
            }}>
              <i className="fas fa-clock" style={{ marginRight: '6px', color: '#28a745' }}></i>
              SLA Compliance *
            </label>
            <select
              name="sla"
              value={formData.sla}
              onChange={handleInputChange}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px',
                backgroundColor: 'white',
                cursor: 'pointer'
              }}
            >
              <option value="Yes">Yes - Met SLA</option>
              <option value="No">No - Breached SLA</option>
            </select>
          </div>

          <div>
            <label style={{ 
              display: 'block', 
              marginBottom: '6px', 
              fontWeight: '600',
              color: '#333',
              fontSize: '14px'
            }}>
              <i className="fas fa-exclamation-triangle" style={{ marginRight: '6px', color: '#f44336' }}></i>
              Severity * (Auto-calculated)
            </label>
            <select
              name="severity"
              value={formData.severity}
              disabled
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px',
                backgroundColor: '#f5f5f5',
                cursor: 'not-allowed',
                color: '#333',
                fontWeight: '600'
              }}
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
            <p style={{ fontSize: '11px', color: '#666', margin: '4px 0 0 0' }}>
              <i className="fas fa-magic" style={{ marginRight: '4px' }}></i>
              Calculated from resolution time
            </p>
          </div>
        </div>

        {/* Row 5: Carried Forward, Escalation Level, Reopened */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '16px',
          marginBottom: '24px'
        }}>
          <div>
            <label style={{ 
              display: 'block', 
              marginBottom: '6px', 
              fontWeight: '600',
              color: '#333',
              fontSize: '14px'
            }}>
              <i className="fas fa-forward" style={{ marginRight: '6px', color: '#ff9800' }}></i>
              Carried Forward *
            </label>
            <select
              name="carriedForward"
              value={formData.carriedForward}
              onChange={handleInputChange}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px',
                backgroundColor: 'white',
                cursor: 'pointer'
              }}
            >
              <option value="No">No</option>
              <option value="Yes">Yes</option>
            </select>
          </div>

          <div>
            <label style={{ 
              display: 'block', 
              marginBottom: '6px', 
              fontWeight: '600',
              color: '#333',
              fontSize: '14px'
            }}>
              <i className="fas fa-level-up-alt" style={{ marginRight: '6px', color: '#9c27b0' }}></i>
              Escalation Level *
            </label>
            <select
              name="escalationLevel"
              value={formData.escalationLevel}
              onChange={handleInputChange}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px',
                backgroundColor: 'white',
                cursor: 'pointer'
              }}
            >
              <option value="Level 0">Level 0 - No Escalation</option>
              <option value="Level 1">Level 1</option>
              <option value="Level 2">Level 2</option>
              <option value="Level 3">Level 3</option>
            </select>
          </div>

          <div>
            <label style={{ 
              display: 'block', 
              marginBottom: '6px', 
              fontWeight: '600',
              color: '#333',
              fontSize: '14px'
            }}>
              <i className="fas fa-redo" style={{ marginRight: '6px', color: '#f44336' }}></i>
              Reopened *
            </label>
            <select
              name="reopened"
              value={formData.reopened}
              onChange={handleInputChange}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                fontSize: '14px',
                backgroundColor: 'white',
                cursor: 'pointer'
              }}
            >
              <option value="No">No</option>
              <option value="Yes">Yes</option>
            </select>
          </div>
        </div>

        {/* Submit Button */}
        <div style={{ 
          display: 'flex', 
          gap: '12px', 
          paddingTop: '16px',
          borderTop: '2px solid #f0f0f0'
        }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              backgroundColor: loading ? '#ccc' : '#1976d2',
              color: 'white',
              padding: '12px 32px',
              border: 'none',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '15px',
              fontWeight: '600',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onMouseOver={(e) => {
              if (!loading) e.target.style.backgroundColor = '#1565c0';
            }}
            onMouseOut={(e) => {
              if (!loading) e.target.style.backgroundColor = '#1976d2';
            }}
          >
            {loading ? (
              <>
                <i className="fas fa-spinner fa-spin"></i>
                Submitting...
              </>
            ) : (
              <>
                <i className="fas fa-paper-plane"></i>
                Submit Ticket
              </>
            )}
          </button>

          <button
            type="button"
            onClick={resetForm}
            disabled={loading}
            style={{
              backgroundColor: '#f5f5f5',
              color: '#333',
              padding: '12px 24px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '15px',
              fontWeight: '500',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              if (!loading) e.target.style.backgroundColor = '#e0e0e0';
            }}
            onMouseOut={(e) => {
              if (!loading) e.target.style.backgroundColor = '#f5f5f5';
            }}
          >
            <i className="fas fa-undo" style={{ marginRight: '6px' }}></i>
            Reset Form
          </button>
        </div>

        {/* Message Display */}
        {message && (
          <div style={{
            marginTop: '16px',
            padding: '12px 16px',
            borderRadius: '6px',
            backgroundColor: message.includes('Error') || message.includes('❌') ? '#ffebee' : '#e8f5e9',
            color: message.includes('Error') || message.includes('❌') ? '#c62828' : '#2e7d32',
            border: `1px solid ${message.includes('Error') || message.includes('❌') ? '#ef9a9a' : '#a5d6a7'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '14px',
            fontWeight: '500'
          }}>
            <i className={`fas ${message.includes('Error') || message.includes('❌') ? 'fa-exclamation-circle' : 'fa-check-circle'}`}></i>
            {message}
          </div>
        )}
      </form>
    </div>
  );
}