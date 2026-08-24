import { useState, useEffect } from 'react';
import axios from '../config/axios';

export default function TeamMemberTicketForm() {
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
