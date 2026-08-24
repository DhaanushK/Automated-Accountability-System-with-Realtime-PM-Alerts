import { useState } from "react";
import TopBar from "../components/TopBar";
import TeamLeadMetrics from "../components/TeamLeadMetrics";
import MetricsSubmissionForm from "../components/MetricsSubmissionForm";
import ActivityLogs from "../components/ActivityLogs";
import TeamLeaderEmailDashboard from "../components/TeamLeaderEmailDashboard";
import TeamManagementDashboard from "../components/TeamManagementDashboard.jsx";
import TeamLeadSheetViewer from "../components/TeamLeadSheetViewer";
import CalendarWidget from "../components/CalendarWidget.jsx";
import ISTClock from "../components/ISTClock.jsx";
import CompactCalendar from "../components/CompactCalendar.jsx";

export default function LeadDashboard() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div style={{ backgroundColor: "#f5f5f5", minHeight: "100vh" }}>
      <TopBar 
        title="Team Lead Dashboard" 
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        userRole="team_lead"
      />
      
      <div style={{ padding: "20px" }}>
        {/* Render content based on active tab */}
        {activeTab === 'dashboard' && (
          <>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', 
              gap: '20px',
              marginBottom: '20px'
            }}>
              {/* IST Clock - Takes more space */}
              <div>
                <ISTClock />
              </div>
              
              {/* Calendar Widget - Events */}
              <div>
                <CalendarWidget userRole="team_lead" />
              </div>
              
              {/* Month Calendar */}
              <div>
                <CompactCalendar />
              </div>
            </div>
            <MetricsSubmissionForm />
            <TeamLeadMetrics />
          </>
        )}

        {activeTab === 'performance' && (
          <div>
            <h2 style={{ marginBottom: "20px", color: "#333" }}>
              <i className="fas fa-chart-line mr-2"></i> Performance Analysis
            </h2>
            <TeamManagementDashboard />
          </div>
        )}

        {activeTab === 'data-sheet' && (
          <div>
            <h2 style={{ marginBottom: "20px", color: "#333" }}>
              <i className="fas fa-table mr-2"></i> Data Sheet
            </h2>
            <TeamLeadSheetViewer />
          </div>
        )}

        {activeTab === 'email' && (
          <div>
            <TeamLeaderEmailDashboard />
          </div>
        )}

        {activeTab === 'activity-logs' && (
          <div>
            <h2 style={{ marginBottom: "20px", color: "#333" }}>📋 Activity Logs</h2>
            <ActivityLogs />
          </div>
        )}
      </div>
    </div>
  );
}