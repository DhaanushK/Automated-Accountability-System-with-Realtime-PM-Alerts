import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import FullCalendar from "../components/FullCalendar";
import CalendarWidget from "../components/CalendarWidget";

export default function CalendarPage() {
  const [view, setView] = useState('full'); // 'full' or 'widget'
  const navigate = useNavigate();
  const location = useLocation();
  
  // Get the base path (member, lead, or pm) from the current location
  const basePath = location.pathname.split('/')[1];
  
  const handleBackToDashboard = () => {
    // Navigate back to the appropriate dashboard based on role
    navigate(`/${basePath}/dashboard`);
  };

  return (
    <div style={{
      padding: '20px',
      maxWidth: '1400px',
      margin: '0 auto'
    }}>
      {/* Page Header */}
      <div style={{
        marginBottom: '24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={handleBackToDashboard}
            style={{
              padding: '10px 16px',
              background: 'white',
              border: '2px solid #1976d2',
              borderRadius: '8px',
              cursor: 'pointer',
              color: '#1976d2',
              fontWeight: '600',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = '#1976d2';
              e.currentTarget.style.color = 'white';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'white';
              e.currentTarget.style.color = '#1976d2';
            }}
          >
            <i className="fas fa-arrow-left"></i>
            Back to Dashboard
          </button>
          
          <div>
            <h1 style={{ margin: '0 0 8px 0', fontSize: '28px', color: '#333' }}>
              <i className="fas fa-calendar-alt" style={{ marginRight: '12px', color: '#1976d2' }}></i>
              Calendar
            </h1>
            <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
              Manage your events, meetings, and schedules
            </p>
          </div>
        </div>

        <div style={{
          display: 'flex',
          gap: '8px',
          background: '#f5f5f5',
          padding: '4px',
          borderRadius: '8px'
        }}>
          <button
            onClick={() => setView('full')}
            style={{
              padding: '8px 16px',
              background: view === 'full' ? 'white' : 'transparent',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: view === 'full' ? '600' : '400',
              color: view === 'full' ? '#1976d2' : '#666',
              transition: 'all 0.2s',
              boxShadow: view === 'full' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            <i className="fas fa-th" style={{ marginRight: '6px' }}></i>
            Full Calendar
          </button>
          <button
            onClick={() => setView('widget')}
            style={{
              padding: '8px 16px',
              background: view === 'widget' ? 'white' : 'transparent',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: view === 'widget' ? '600' : '400',
              color: view === 'widget' ? '#1976d2' : '#666',
              transition: 'all 0.2s',
              boxShadow: view === 'widget' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            <i className="fas fa-list" style={{ marginRight: '6px' }}></i>
            List View
          </button>
        </div>
      </div>

      {/* Calendar Content */}
      {view === 'full' ? (
        <FullCalendar />
      ) : (
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <CalendarWidget />
        </div>
      )}

      {/* Quick Info */}
      <div style={{
        marginTop: '32px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '16px'
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
        }}>
          <i className="fas fa-calendar-plus" style={{ fontSize: '32px', opacity: 0.9 }}></i>
          <h3 style={{ margin: '12px 0 4px 0' }}>Create Events</h3>
          <p style={{ margin: 0, fontSize: '13px', opacity: 0.9 }}>
            Schedule meetings, milestones, and important dates
          </p>
        </div>

        <div style={{
          background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
          color: 'white',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(240, 147, 251, 0.3)'
        }}>
          <i className="fas fa-bell" style={{ fontSize: '32px', opacity: 0.9 }}></i>
          <h3 style={{ margin: '12px 0 4px 0' }}>Smart Reminders</h3>
          <p style={{ margin: 0, fontSize: '13px', opacity: 0.9 }}>
            Get email and popup notifications for upcoming events
          </p>
        </div>

        <div style={{
          background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
          color: 'white',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(79, 172, 254, 0.3)'
        }}>
          <i className="fas fa-sync-alt" style={{ fontSize: '32px', opacity: 0.9 }}></i>
          <h3 style={{ margin: '12px 0 4px 0' }}>Google Sync</h3>
          <p style={{ margin: 0, fontSize: '13px', opacity: 0.9 }}>
            Seamlessly synced with your Google Calendar
          </p>
        </div>

        <div style={{
          background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
          color: 'white',
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 4px 12px rgba(250, 112, 154, 0.3)'
        }}>
          <i className="fas fa-users" style={{ fontSize: '32px', opacity: 0.9 }}></i>
          <h3 style={{ margin: '12px 0 4px 0' }}>Team Collaboration</h3>
          <p style={{ margin: 0, fontSize: '13px', opacity: 0.9 }}>
            Invite team members and track attendance
          </p>
        </div>
      </div>
    </div>
  );
}
