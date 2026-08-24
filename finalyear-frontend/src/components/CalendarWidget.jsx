import { useState, useEffect } from "react";
import axios from "../config/axios";

export default function CalendarWidget({ userRole }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  
  // Form state for new event
  const [eventName, setEventName] = useState('');
  const [attendees, setAttendees] = useState([]);
  const [alertTiming, setAlertTiming] = useState('15');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  // Users list for dropdown
  const [allUsers, setAllUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    fetchUpcomingEvents();
    fetchAllUsers();
    
    // Auto-refresh events every 30 seconds to show newly created events
    const refreshInterval = setInterval(() => {
      fetchUpcomingEvents();
    }, 30000); // 30 seconds
    
    return () => clearInterval(refreshInterval);
  }, []);

  const fetchUpcomingEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get('/api/calendar/upcoming?days=7');
      setEvents(response.data.events || []);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error fetching calendar events:', err);
      // Only show error if it's not a token issue (silent fail for auth issues)
      if (err.response?.status !== 401 && err.response?.status !== 500) {
        setError(err.response?.data?.message || 'Failed to load calendar events');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchAllUsers = async () => {
    try {
      setLoadingUsers(true);
      const response = await axios.get('/api/users/all');
      if (response.data.success) {
        setAllUsers(response.data.users || []);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const scheduleWeeklyReport = async () => {
    try {
      const response = await axios.post('/api/calendar/schedule-weekly-report');
      alert(response.data.message || 'Weekly report scheduled successfully!');
      fetchUpcomingEvents();
      setShowScheduleModal(false);
    } catch (err) {
      console.error('Error scheduling report:', err);
      alert(err.response?.data?.message || 'Failed to schedule report');
    }
  };

  const toggleAttendee = (email) => {
    if (attendees.includes(email)) {
      setAttendees(attendees.filter(e => e !== email));
    } else {
      setAttendees([...attendees, email]);
    }
  };

  const resetForm = () => {
    setEventName('');
    setAttendees([]);
    setAlertTiming('15');
    setEventDate('');
    setEventTime('');
  };

  const handleScheduleEvent = async () => {
    // Validation
    if (!eventName.trim()) {
      alert('Please enter an event name');
      return;
    }
    if (!eventDate) {
      alert('Please select a date');
      return;
    }
    if (!eventTime) {
      alert('Please select a time');
      return;
    }

    // Use selected attendees directly
    const validAttendees = attendees;

    try {
      setSubmitting(true);
      const response = await axios.post('/api/calendar/create-event', {
        summary: eventName,
        attendees: validAttendees,
        alertMinutes: parseInt(alertTiming),
        date: eventDate,
        time: eventTime
      });
      
      alert(response.data.message || 'Event scheduled successfully!');
      fetchUpcomingEvents();
      setShowScheduleModal(false);
      resetForm();
    } catch (err) {
      console.error('Error scheduling event:', err);
      alert(err.response?.data?.message || 'Failed to schedule event');
    } finally {
      setSubmitting(false);
    }
  };

  const formatEventTime = (event) => {
    const startDate = new Date(event.start?.dateTime || event.start?.date);
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const isToday = startDate.toDateString() === now.toDateString();
    const isTomorrow = startDate.toDateString() === tomorrow.toDateString();

    if (isToday) {
      return `Today, ${startDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (isTomorrow) {
      return `Tomorrow, ${startDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      return startDate.toLocaleString('en-IN', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  const getEventIcon = (summary) => {
    if (summary.includes('Report') || summary.includes('📊')) return '📊';
    if (summary.includes('Alert') || summary.includes('⚠️')) return '⚠️';
    if (summary.includes('Milestone') || summary.includes('🎯')) return '🎯';
    if (summary.includes('Meeting')) return '🤝';
    return '📅';
  };

  const getEventColor = (event) => {
    const summary = event.summary?.toLowerCase() || '';
    const startDate = new Date(event.start?.dateTime || event.start?.date);
    const isToday = startDate.toDateString() === new Date().toDateString();

    if (isToday) return { bg: '#e8f5e9', border: '#4caf50' };
    if (summary.includes('alert') || summary.includes('⚠️')) return { bg: '#ffebee', border: '#f44336' };
    if (summary.includes('milestone') || summary.includes('🎯')) return { bg: '#e3f2fd', border: '#2196f3' };
    if (summary.includes('report') || summary.includes('📊')) return { bg: '#f3e5f5', border: '#9c27b0' };
    return { bg: '#f5f5f5', border: '#9e9e9e' };
  };

  if (loading) {
    return (
      <div style={{
        backgroundColor: '#fff',
        padding: '20px',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        textAlign: 'center'
      }}>
        <div style={{
          display: 'inline-block',
          width: '30px',
          height: '30px',
          border: '3px solid #f3f3f3',
          borderTop: '3px solid #1976d2',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        <p style={{ marginTop: '10px', color: '#666' }}>Loading calendar...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        backgroundColor: '#fff',
        padding: '20px',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px'
        }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fas fa-calendar-alt"></i> Calendar & Events
          </h3>
        </div>
        <div style={{
          padding: '20px',
          backgroundColor: '#fff3e0',
          borderRadius: '6px',
          border: '1px solid #ff9800',
          textAlign: 'center'
        }}>
          <p style={{ margin: '0 0 10px 0', color: '#f57c00' }}>
            <i className="fas fa-exclamation-triangle"></i> {error}
          </p>
          <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>
            Calendar integration requires Google Calendar authorization
          </p>
          <button
            onClick={fetchUpcomingEvents}
            style={{
              marginTop: '10px',
              padding: '6px 12px',
              backgroundColor: '#ff9800',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: '#fff',
      padding: '20px',
      borderRadius: '8px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px'
      }}>
        <div>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fas fa-calendar-alt"></i> Calendar & Events
          </h3>
          {lastUpdated && (
            <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#999' }}>
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={fetchUpcomingEvents}
            style={{
              padding: '6px 12px',
              backgroundColor: '#f5f5f5',
              color: '#333',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              transition: 'all 0.2s'
            }}
            onMouseOver={e => e.target.style.backgroundColor = '#e0e0e0'}
            onMouseOut={e => e.target.style.backgroundColor = '#f5f5f5'}
            title="Refresh events"
          >
            <i className="fas fa-sync-alt"></i>
          </button>
          {/* Only show Schedule button for project_manager */}
          {userRole === 'project_manager' && (
            <button
              onClick={() => setShowScheduleModal(true)}
              style={{
                padding: '6px 12px',
                backgroundColor: '#1976d2',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                transition: 'background-color 0.2s'
              }}
              onMouseOver={e => e.target.style.backgroundColor = '#1565c0'}
              onMouseOut={e => e.target.style.backgroundColor = '#1976d2'}
            >
              <i className="fas fa-plus mr-1"></i> Schedule
            </button>
          )}
        </div>
      </div>

      {/* Events List */}
      {events.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '40px 20px',
          color: '#666'
        }}>
          <i className="fas fa-calendar-check" style={{ fontSize: '48px', color: '#ddd', marginBottom: '16px' }}></i>
          <p style={{ margin: '0 0 8px 0', fontWeight: '500' }}>No upcoming events</p>
          <p style={{ margin: 0, fontSize: '14px', color: '#999' }}>
            {userRole === 'project_manager' 
              ? 'Schedule your first event to get started' 
              : 'No events scheduled at the moment'}
          </p>
        </div>
      ) : (
        <div style={{
          maxHeight: '400px',
          overflowY: 'auto',
          paddingRight: '4px'
        }}>
          {events.map((event, index) => {
            const colors = getEventColor(event);
            const icon = getEventIcon(event.summary);

            return (
              <div
                key={index}
                style={{
                  padding: '12px',
                  marginBottom: '8px',
                  backgroundColor: colors.bg,
                  borderLeft: `4px solid ${colors.border}`,
                  borderRadius: '6px',
                  transition: 'all 0.2s',
                  cursor: 'pointer'
                }}
                onMouseOver={e => e.target.style.transform = 'translateX(4px)'}
                onMouseOut={e => e.target.style.transform = 'translateX(0)'}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px'
                }}>
                  <span style={{ fontSize: '24px' }}>{icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontWeight: '600',
                      marginBottom: '4px',
                      color: '#333'
                    }}>
                      {event.summary}
                    </div>
                    <div style={{
                      fontSize: '13px',
                      color: '#666',
                      marginBottom: '4px'
                    }}>
                      <i className="fas fa-clock mr-1"></i>
                      {formatEventTime(event)}
                    </div>
                    {event.description && (
                      <div style={{
                        fontSize: '13px',
                        color: '#888',
                        marginTop: '4px',
                        paddingTop: '4px',
                        borderTop: '1px solid rgba(0,0,0,0.1)'
                      }}>
                        {event.description}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Schedule Modal - Only for Project Managers */}
      {showScheduleModal && userRole === 'project_manager' && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '28px',
            borderRadius: '12px',
            maxWidth: '500px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '20px'
            }}>
              <h3 style={{ margin: 0, fontSize: '20px', color: '#333' }}>
                <i className="fas fa-calendar-plus" style={{ marginRight: '8px', color: '#1976d2' }}></i>
                Create New Event
              </h3>
              <button
                onClick={() => {
                  setShowScheduleModal(false);
                  resetForm();
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  color: '#999',
                  padding: '4px'
                }}
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            {/* Event Name */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontWeight: '600',
                color: '#333',
                fontSize: '14px'
              }}>
                <i className="fas fa-tag" style={{ marginRight: '6px', color: '#1976d2' }}></i>
                Event Name *
              </label>
              <input
                type="text"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="e.g., Team Meeting, Project Review"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = '#1976d2'}
                onBlur={(e) => e.target.style.borderColor = '#ddd'}
              />
            </div>

            {/* Date and Time */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontWeight: '600',
                  color: '#333',
                  fontSize: '14px'
                }}>
                  <i className="fas fa-calendar" style={{ marginRight: '6px', color: '#1976d2' }}></i>
                  Date *
                </label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    outline: 'none'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#1976d2'}
                  onBlur={(e) => e.target.style.borderColor = '#ddd'}
                />
              </div>
              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontWeight: '600',
                  color: '#333',
                  fontSize: '14px'
                }}>
                  <i className="fas fa-clock" style={{ marginRight: '6px', color: '#1976d2' }}></i>
                  Time *
                </label>
                <input
                  type="time"
                  value={eventTime}
                  onChange={(e) => setEventTime(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    outline: 'none'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#1976d2'}
                  onBlur={(e) => e.target.style.borderColor = '#ddd'}
                />
              </div>
            </div>

            {/* Add People */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontWeight: '600',
                color: '#333',
                fontSize: '14px'
              }}>
                <i className="fas fa-users" style={{ marginRight: '6px', color: '#1976d2' }}></i>
                Add People (Select Team Members & Leaders)
              </label>
              
              {loadingUsers ? (
                <div style={{ padding: '10px', color: '#666', textAlign: 'center' }}>
                  Loading users...
                </div>
              ) : (
                <div style={{
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  maxHeight: '250px',
                  overflowY: 'auto',
                  backgroundColor: 'white'
                }}>
                  {allUsers.length === 0 ? (
                    <div style={{ padding: '10px', color: '#666', textAlign: 'center' }}>
                      No users available
                    </div>
                  ) : (
                    allUsers.map((user) => (
                      <label
                        key={user.email}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '10px 12px',
                          cursor: 'pointer',
                          borderBottom: '1px solid #f0f0f0',
                          transition: 'background-color 0.2s',
                          backgroundColor: attendees.includes(user.email) ? '#e3f2fd' : 'transparent'
                        }}
                        onMouseEnter={(e) => {
                          if (!attendees.includes(user.email)) {
                            e.currentTarget.style.backgroundColor = '#f5f5f5';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!attendees.includes(user.email)) {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={attendees.includes(user.email)}
                          onChange={() => toggleAttendee(user.email)}
                          style={{
                            marginRight: '10px',
                            cursor: 'pointer',
                            width: '16px',
                            height: '16px'
                          }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '500', color: '#333', fontSize: '14px' }}>
                            {user.name}
                          </div>
                          <div style={{ fontSize: '12px', color: '#666' }}>
                            {user.email}
                            <span style={{
                              marginLeft: '8px',
                              padding: '2px 6px',
                              backgroundColor: user.role === 'team_lead' ? '#2196f3' : '#4caf50',
                              color: 'white',
                              borderRadius: '3px',
                              fontSize: '10px',
                              fontWeight: '600'
                            }}>
                              {user.role === 'team_lead' ? 'Team Lead' : 'Team Member'}
                            </span>
                          </div>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              )}
              
              {attendees.length > 0 && (
                <div style={{
                  marginTop: '8px',
                  padding: '8px 12px',
                  backgroundColor: '#e3f2fd',
                  borderRadius: '4px',
                  fontSize: '13px',
                  color: '#1976d2'
                }}>
                  <i className="fas fa-check-circle" style={{ marginRight: '6px' }}></i>
                  {attendees.length} {attendees.length === 1 ? 'person' : 'people'} selected
                </div>
              )}
            </div>

            {/* Alert Notification Timing */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontWeight: '600',
                color: '#333',
                fontSize: '14px'
              }}>
                <i className="fas fa-bell" style={{ marginRight: '6px', color: '#1976d2' }}></i>
                Alert Notification
              </label>
              <select
                value={alertTiming}
                onChange={(e) => setAlertTiming(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  fontSize: '14px',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                  outline: 'none'
                }}
                onFocus={(e) => e.target.style.borderColor = '#1976d2'}
                onBlur={(e) => e.target.style.borderColor = '#ddd'}
              >
                <option value="5">5 minutes before</option>
                <option value="10">10 minutes before</option>
                <option value="15">15 minutes before</option>
                <option value="30">30 minutes before</option>
                <option value="60">1 hour before</option>
                <option value="120">2 hours before</option>
                <option value="1440">1 day before</option>
              </select>
              <p style={{
                margin: '6px 0 0 0',
                fontSize: '12px',
                color: '#666'
              }}>
                All attendees will receive a notification at this time
              </p>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => {
                  setShowScheduleModal(false);
                  resetForm();
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: '#f5f5f5',
                  color: '#333',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleScheduleEvent}
                disabled={submitting}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: submitting ? '#ccc' : '#1976d2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => {
                  if (!submitting) e.target.style.backgroundColor = '#1565c0';
                }}
                onMouseOut={(e) => {
                  if (!submitting) e.target.style.backgroundColor = '#1976d2';
                }}
              >
                {submitting ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-1"></i> Creating...
                  </>
                ) : (
                  <>
                    <i className="fas fa-check mr-1"></i> Create Event
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
