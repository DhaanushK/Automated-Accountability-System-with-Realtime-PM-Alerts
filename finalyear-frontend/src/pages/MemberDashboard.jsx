import { useState } from "react";
import TeamMemberTicketForm from "../components/TeamMemberTicketForm";
import TeamMemberEmailDashboard from "../components/TeamMemberEmailDashboard";
import TeamMemberPerformanceAnalysis from "../components/TeamMemberPerformanceAnalysis";
import TeamMemberSheetViewer from "../components/TeamMemberSheetViewer";
import TopBar from "../components/TopBar";
import ISTClock from "../components/ISTClock";
import CalendarWidget from "../components/CalendarWidget.jsx";
import CompactCalendar from "../components/CompactCalendar.jsx";

export default function MemberDashboard() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div style={{ backgroundColor: "#f5f5f5", minHeight: "100vh" }}>
      <TopBar 
        title="Team Member Dashboard" 
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        userRole="team_member"
      />
      <div style={{ padding: "20px" }}>
        {activeTab === 'dashboard' && (
          <>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', 
              gap: '20px',
              marginBottom: '20px'
            }}>
              {/* IST Clock */}
              <div>
                <ISTClock />
              </div>
              
              {/* Calendar Widget - Events (View Only) */}
              <div>
                <CalendarWidget userRole="team_member" />
              </div>
              
              {/* Month Calendar */}
              <div>
                <CompactCalendar />
              </div>
            </div>
            <TeamMemberTicketForm />
          </>
        )}
        {activeTab === 'performance' && <TeamMemberPerformanceAnalysis />}
        {activeTab === 'data-sheet' && (
          <div>
            <h2 style={{ marginBottom: "20px", color: "#333" }}>
              <i className="fas fa-table mr-2"></i> Data Sheet
            </h2>
            <TeamMemberSheetViewer />
          </div>
        )}
        {activeTab === 'email' && <TeamMemberEmailDashboard />}
      </div>
    </div>
  );
}