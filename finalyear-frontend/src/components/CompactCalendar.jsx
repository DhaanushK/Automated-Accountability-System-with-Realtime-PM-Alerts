import { useState } from "react";

export default function CompactCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    
    // Add empty cells for days before the first day of month
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    
    // Add all days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }
    
    return days;
  };

  const isToday = (day) => {
    const today = new Date();
    return (
      day === today.getDate() &&
      currentDate.getMonth() === today.getMonth() &&
      currentDate.getFullYear() === today.getFullYear()
    );
  };

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const days = getDaysInMonth(currentDate);

  return (
    <div style={{
      backgroundColor: '#fff',
      padding: '20px',
      borderRadius: '8px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      height: '100%'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px'
      }}>
        <h3 style={{ 
          margin: 0, 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px',
          fontSize: '18px',
          color: '#333'
        }}>
          <i className="fas fa-calendar"></i> Calendar
        </h3>
        <button
          onClick={goToToday}
          style={{
            padding: '6px 12px',
            backgroundColor: '#1976d2',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            transition: 'background-color 0.2s'
          }}
          onMouseOver={e => e.target.style.backgroundColor = '#1565c0'}
          onMouseOut={e => e.target.style.backgroundColor = '#1976d2'}
        >
          Today
        </button>
      </div>

      {/* Month Navigation */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px',
        padding: '8px 12px',
        backgroundColor: '#f5f5f5',
        borderRadius: '6px'
      }}>
        <button
          onClick={previousMonth}
          style={{
            padding: '4px 8px',
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: '18px',
            color: '#666',
            transition: 'color 0.2s'
          }}
          onMouseOver={e => e.target.style.color = '#1976d2'}
          onMouseOut={e => e.target.style.color = '#666'}
        >
          <i className="fas fa-chevron-left"></i>
        </button>
        
        <div style={{
          fontSize: '16px',
          fontWeight: '600',
          color: '#333'
        }}>
          {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
        </div>
        
        <button
          onClick={nextMonth}
          style={{
            padding: '4px 8px',
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: '18px',
            color: '#666',
            transition: 'color 0.2s'
          }}
          onMouseOver={e => e.target.style.color = '#1976d2'}
          onMouseOut={e => e.target.style.color = '#666'}
        >
          <i className="fas fa-chevron-right"></i>
        </button>
      </div>

      {/* Calendar Grid */}
      <div>
        {/* Days of Week Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '4px',
          marginBottom: '8px'
        }}>
          {daysOfWeek.map((day, index) => (
            <div
              key={index}
              style={{
                textAlign: 'center',
                fontSize: '12px',
                fontWeight: '600',
                color: index === 0 || index === 6 ? '#f44336' : '#666',
                padding: '4px'
              }}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '4px'
        }}>
          {days.map((day, index) => (
            <div
              key={index}
              style={{
                aspectRatio: '1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                borderRadius: '6px',
                backgroundColor: day && isToday(day) ? '#1976d2' : day ? '#f9f9f9' : 'transparent',
                color: day && isToday(day) ? 'white' : day ? '#333' : 'transparent',
                fontWeight: day && isToday(day) ? '700' : '500',
                cursor: day ? 'pointer' : 'default',
                transition: 'all 0.2s',
                border: day && isToday(day) ? '2px solid #1565c0' : 'none'
              }}
              onMouseOver={e => {
                if (day && !isToday(day)) {
                  e.target.style.backgroundColor = '#e3f2fd';
                  e.target.style.transform = 'scale(1.05)';
                }
              }}
              onMouseOut={e => {
                if (day && !isToday(day)) {
                  e.target.style.backgroundColor = '#f9f9f9';
                  e.target.style.transform = 'scale(1)';
                }
              }}
            >
              {day || ''}
            </div>
          ))}
        </div>
      </div>

      {/* Footer Info */}
      <div style={{
        marginTop: '16px',
        padding: '12px',
        backgroundColor: '#f5f5f5',
        borderRadius: '6px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '12px',
        color: '#666'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{
            width: '12px',
            height: '12px',
            backgroundColor: '#1976d2',
            borderRadius: '50%'
          }}></div>
          <span>Today</span>
        </div>
        <div style={{ fontWeight: '500' }}>
          {new Date().toLocaleDateString('en-IN', { 
            weekday: 'long',
            day: 'numeric',
            month: 'short',
            year: 'numeric'
          })}
        </div>
      </div>
    </div>
  );
}
