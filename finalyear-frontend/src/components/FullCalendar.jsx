import { useState, useEffect } from "react";
import axios from "../config/axios";
import "./FullCalendar.css";

export default function FullCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('month'); // month, week, day, agenda
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [error, setError] = useState(null);

  // Form state for creating events
  const [newEvent, setNewEvent] = useState({
    summary: '',
    description: '',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: '',
    location: '',
    attendees: '',
    color: '1'
  });

  useEffect(() => {
    fetchEvents();
  }, [currentDate, view]);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      
      let days;
      if (view === 'month') days = 35;
      else if (view === 'week') days = 7;
      else if (view === 'day') days = 1;
      else days = 30; // agenda

      const response = await axios.get(`/api/calendar/upcoming?days=${days}`);
      setEvents(response.data.events || []);
    } catch (err) {
      console.error('Error fetching events:', err);
      setError(err.response?.data?.message || 'Failed to load events');
    } finally {
      setLoading(false);
    }
  };

  // Calendar navigation
  const previousPeriod = () => {
    const newDate = new Date(currentDate);
    if (view === 'month') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else if (view === 'week') {
      newDate.setDate(newDate.getDate() - 7);
    } else if (view === 'day') {
      newDate.setDate(newDate.getDate() - 1);
    }
    setCurrentDate(newDate);
  };

  const nextPeriod = () => {
    const newDate = new Date(currentDate);
    if (view === 'month') {
      newDate.setMonth(newDate.getMonth() + 1);
    } else if (view === 'week') {
      newDate.setDate(newDate.getDate() + 7);
    } else if (view === 'day') {
      newDate.setDate(newDate.getDate() + 1);
    }
    setCurrentDate(newDate);
  };

  const today = () => {
    setCurrentDate(new Date());
  };

  // Get calendar days for month view
  const getCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    const days = [];
    
    // Previous month days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthLastDay - i),
        isCurrentMonth: false
      });
    }
    
    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true
      });
    }
    
    // Next month days
    const remainingDays = 42 - days.length; // 6 rows × 7 days
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false
      });
    }
    
    return days;
  };

  // Get events for a specific date
  const getEventsForDate = (date) => {
    return events.filter(event => {
      const eventDate = new Date(event.start?.dateTime || event.start?.date);
      return eventDate.toDateString() === date.toDateString();
    });
  };

  // Format date header
  const formatDateHeader = () => {
    if (view === 'month') {
      return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else if (view === 'week') {
      const weekStart = new Date(currentDate);
      weekStart.setDate(currentDate.getDate() - currentDate.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      return `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    } else if (view === 'day') {
      return currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
    return 'Agenda';
  };

  // Handle event creation
  const handleCreateEvent = async (e) => {
    e.preventDefault();
    
    try {
      const startDateTime = new Date(`${newEvent.startDate}T${newEvent.startTime}`);
      const endDateTime = new Date(`${newEvent.endDate}T${newEvent.endTime}`);
      
      const attendeesList = newEvent.attendees 
        ? newEvent.attendees.split(',').map(email => ({ email: email.trim() }))
        : [];

      const response = await axios.post('/api/calendar/event', {
        summary: newEvent.summary,
        description: newEvent.description,
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString(),
        location: newEvent.location,
        attendees: attendeesList,
        colorId: newEvent.color
      });

      alert('Event created successfully!');
      setShowCreateModal(false);
      resetEventForm();
      fetchEvents();
    } catch (err) {
      console.error('Error creating event:', err);
      alert(err.response?.data?.message || 'Failed to create event');
    }
  };

  const resetEventForm = () => {
    setNewEvent({
      summary: '',
      description: '',
      startDate: '',
      startTime: '',
      endDate: '',
      endTime: '',
      location: '',
      attendees: '',
      color: '1'
    });
  };

  const handleDateClick = (date) => {
    setSelectedDate(date);
    setNewEvent({
      ...newEvent,
      startDate: date.toISOString().split('T')[0],
      endDate: date.toISOString().split('T')[0],
      startTime: '09:00',
      endTime: '10:00'
    });
    setShowCreateModal(true);
  };

  const handleEventClick = (event) => {
    setSelectedEvent(event);
    setShowEventModal(true);
  };

  const handleDeleteEvent = async (eventId) => {
    if (!confirm('Are you sure you want to delete this event?')) return;
    
    try {
      await axios.delete(`/api/calendar/event/${eventId}`);
      alert('Event deleted successfully!');
      setShowEventModal(false);
      setSelectedEvent(null);
      fetchEvents();
    } catch (err) {
      console.error('Error deleting event:', err);
      alert(err.response?.data?.message || 'Failed to delete event');
    }
  };

  const getEventColor = (colorId) => {
    const colors = {
      '1': '#a4bdfc', // Lavender
      '2': '#7ae7bf', // Sage
      '3': '#dbadff', // Grape
      '4': '#ff887c', // Flamingo
      '5': '#fbd75b', // Banana
      '6': '#ffb878', // Tangerine
      '7': '#46d6db', // Peacock
      '8': '#e1e1e1', // Graphite
      '9': '#5484ed', // Blueberry
      '10': '#51b749', // Basil
      '11': '#dc2127'  // Tomato
    };
    return colors[colorId] || colors['1'];
  };

  // Render month view
  const renderMonthView = () => {
    const days = getCalendarDays();
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return (
      <div className="calendar-month-view">
        <div className="calendar-weekdays">
          {weekDays.map(day => (
            <div key={day} className="calendar-weekday">{day}</div>
          ))}
        </div>
        <div className="calendar-days">
          {days.map((day, index) => {
            const dayEvents = getEventsForDate(day.date);
            const isToday = day.date.toDateString() === new Date().toDateString();
            
            return (
              <div
                key={index}
                className={`calendar-day ${!day.isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}`}
                onClick={() => handleDateClick(day.date)}
              >
                <div className="day-number">{day.date.getDate()}</div>
                <div className="day-events">
                  {dayEvents.slice(0, 3).map((event, i) => (
                    <div
                      key={i}
                      className="day-event"
                      style={{ backgroundColor: getEventColor(event.colorId) }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEventClick(event);
                      }}
                    >
                      {event.summary}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <div className="more-events">+{dayEvents.length - 3} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Render agenda view
  const renderAgendaView = () => {
    const sortedEvents = [...events].sort((a, b) => {
      const dateA = new Date(a.start?.dateTime || a.start?.date);
      const dateB = new Date(b.start?.dateTime || b.start?.date);
      return dateA - dateB;
    });

    return (
      <div className="calendar-agenda-view">
        {sortedEvents.length === 0 ? (
          <div className="no-events">
            <i className="fas fa-calendar-check"></i>
            <p>No upcoming events</p>
          </div>
        ) : (
          sortedEvents.map((event, index) => {
            const startDate = new Date(event.start?.dateTime || event.start?.date);
            const endDate = new Date(event.end?.dateTime || event.end?.date);
            
            return (
              <div
                key={index}
                className="agenda-event"
                onClick={() => handleEventClick(event)}
              >
                <div className="event-date">
                  <div className="date-day">{startDate.getDate()}</div>
                  <div className="date-month">{startDate.toLocaleDateString('en-US', { month: 'short' })}</div>
                </div>
                <div
                  className="event-indicator"
                  style={{ backgroundColor: getEventColor(event.colorId) }}
                ></div>
                <div className="event-details">
                  <h4>{event.summary}</h4>
                  <p className="event-time">
                    {startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    {' - '}
                    {endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {event.location && <p className="event-location"><i className="fas fa-map-marker-alt"></i> {event.location}</p>}
                  {event.description && <p className="event-description">{event.description}</p>}
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  };

  if (loading && events.length === 0) {
    return (
      <div className="calendar-loading">
        <div className="spinner"></div>
        <p>Loading calendar...</p>
      </div>
    );
  }

  return (
    <div className="full-calendar">
      {/* Header */}
      <div className="calendar-header">
        <div className="calendar-nav">
          <button onClick={previousPeriod} className="nav-btn">
            <i className="fas fa-chevron-left"></i>
          </button>
          <button onClick={today} className="today-btn">Today</button>
          <button onClick={nextPeriod} className="nav-btn">
            <i className="fas fa-chevron-right"></i>
          </button>
          <h2 className="calendar-title">{formatDateHeader()}</h2>
        </div>

        <div className="calendar-actions">
          <div className="view-switcher">
            <button
              className={view === 'day' ? 'active' : ''}
              onClick={() => setView('day')}
            >
              Day
            </button>
            <button
              className={view === 'week' ? 'active' : ''}
              onClick={() => setView('week')}
            >
              Week
            </button>
            <button
              className={view === 'month' ? 'active' : ''}
              onClick={() => setView('month')}
            >
              Month
            </button>
            <button
              className={view === 'agenda' ? 'active' : ''}
              onClick={() => setView('agenda')}
            >
              Agenda
            </button>
          </div>

          <button
            className="create-event-btn"
            onClick={() => {
              setSelectedDate(new Date());
              setNewEvent({
                ...newEvent,
                startDate: new Date().toISOString().split('T')[0],
                endDate: new Date().toISOString().split('T')[0],
                startTime: '09:00',
                endTime: '10:00'
              });
              setShowCreateModal(true);
            }}
          >
            <i className="fas fa-plus"></i> Create Event
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="calendar-error">
          <i className="fas fa-exclamation-triangle"></i>
          {error}
          <button onClick={fetchEvents}>Retry</button>
        </div>
      )}

      {/* Calendar View */}
      <div className="calendar-body">
        {view === 'month' && renderMonthView()}
        {view === 'agenda' && renderAgendaView()}
        {(view === 'week' || view === 'day') && (
          <div className="coming-soon">
            <i className="fas fa-tools"></i>
            <p>{view.charAt(0).toUpperCase() + view.slice(1)} view coming soon!</p>
            <p>For now, please use Month or Agenda view.</p>
          </div>
        )}
      </div>

      {/* Create Event Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create New Event</h3>
              <button className="close-btn" onClick={() => setShowCreateModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            <form onSubmit={handleCreateEvent} className="event-form">
              <div className="form-group">
                <label>Event Title *</label>
                <input
                  type="text"
                  value={newEvent.summary}
                  onChange={(e) => setNewEvent({ ...newEvent, summary: e.target.value })}
                  required
                  placeholder="Enter event title"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Start Date *</label>
                  <input
                    type="date"
                    value={newEvent.startDate}
                    onChange={(e) => setNewEvent({ ...newEvent, startDate: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Start Time *</label>
                  <input
                    type="time"
                    value={newEvent.startTime}
                    onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>End Date *</label>
                  <input
                    type="date"
                    value={newEvent.endDate}
                    onChange={(e) => setNewEvent({ ...newEvent, endDate: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>End Time *</label>
                  <input
                    type="time"
                    value={newEvent.endTime}
                    onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={newEvent.description}
                  onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                  placeholder="Add event description"
                  rows="3"
                />
              </div>

              <div className="form-group">
                <label>Location</label>
                <input
                  type="text"
                  value={newEvent.location}
                  onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                  placeholder="Add location"
                />
              </div>

              <div className="form-group">
                <label>Attendees (comma-separated emails)</label>
                <input
                  type="text"
                  value={newEvent.attendees}
                  onChange={(e) => setNewEvent({ ...newEvent, attendees: e.target.value })}
                  placeholder="email1@example.com, email2@example.com"
                />
              </div>

              <div className="form-group">
                <label>Color</label>
                <div className="color-picker">
                  {['1', '2', '3', '4', '5', '6', '7', '9', '10', '11'].map(colorId => (
                    <button
                      key={colorId}
                      type="button"
                      className={`color-option ${newEvent.color === colorId ? 'selected' : ''}`}
                      style={{ backgroundColor: getEventColor(colorId) }}
                      onClick={() => setNewEvent({ ...newEvent, color: colorId })}
                    />
                  ))}
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" onClick={() => setShowCreateModal(false)} className="cancel-btn">
                  Cancel
                </button>
                <button type="submit" className="submit-btn">
                  <i className="fas fa-check"></i> Create Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Event Modal */}
      {showEventModal && selectedEvent && (
        <div className="modal-overlay" onClick={() => setShowEventModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedEvent.summary}</h3>
              <button className="close-btn" onClick={() => setShowEventModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="event-details-modal">
              <div className="detail-row">
                <i className="fas fa-clock"></i>
                <div>
                  <strong>Time</strong>
                  <p>
                    {new Date(selectedEvent.start?.dateTime || selectedEvent.start?.date).toLocaleString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                    {' - '}
                    {new Date(selectedEvent.end?.dateTime || selectedEvent.end?.date).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>

              {selectedEvent.description && (
                <div className="detail-row">
                  <i className="fas fa-align-left"></i>
                  <div>
                    <strong>Description</strong>
                    <p>{selectedEvent.description}</p>
                  </div>
                </div>
              )}

              {selectedEvent.location && (
                <div className="detail-row">
                  <i className="fas fa-map-marker-alt"></i>
                  <div>
                    <strong>Location</strong>
                    <p>{selectedEvent.location}</p>
                  </div>
                </div>
              )}

              {selectedEvent.attendees && selectedEvent.attendees.length > 0 && (
                <div className="detail-row">
                  <i className="fas fa-users"></i>
                  <div>
                    <strong>Attendees</strong>
                    <ul>
                      {selectedEvent.attendees.map((attendee, i) => (
                        <li key={i}>{attendee.email}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button
                onClick={() => handleDeleteEvent(selectedEvent.id)}
                className="delete-btn"
              >
                <i className="fas fa-trash"></i> Delete Event
              </button>
              <button onClick={() => setShowEventModal(false)} className="cancel-btn">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
