import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import IndividualDashboard from './components/IndividualDashboard';
import VisualizationDashboard from './components/VisualizationDashboard';
import GoogleSheetsViewer from './components/GoogleSheetsViewer';
import MemberDashboard from './pages/MemberDashboard';
import LeadDashboard from './pages/LeadDashboard';
import PMDashboard from './pages/PMDashboard';
import CalendarPage from './pages/CalendarPage';
import SupportPerformanceDashboard from './pages/SupportPerformanceDashboard';
import { useEffect } from 'react';

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = location.pathname.split('/')[1]; // Gets 'member', 'lead', or 'pm'

  // Determine which dashboard component to show based on role
  const getDashboardComponent = () => {
    switch (basePath) {
      case 'member':
        return MemberDashboard;
      case 'lead':
        return LeadDashboard;
      case 'pm':
        return PMDashboard;
      default:
        return IndividualDashboard;
    }
  };

  const DashboardComponent = getDashboardComponent();

  return (
    <div>
      <Routes>
        <Route index element={<Navigate to={`/${basePath}/dashboard`} replace />} />
        <Route path="/">
          <Route index element={<Navigate to={`/${basePath}/dashboard`} replace />} />
          <Route path="dashboard" element={<DashboardComponent />} />
          {/* Performance route only for non-PM users */}
          {basePath !== 'pm' && (
            <Route path="dashboard/performance" element={<VisualizationDashboard />} />
          )}
        </Route>
        {/* Redirect /performance to /dashboard/performance for non-PM users */}
        {basePath !== 'pm' && (
          <Route path="performance" element={<Navigate to={`/${basePath}/dashboard/performance`} replace />} />
        )}
        {/* Google Sheets viewer route */}
        <Route path="sheets" element={<GoogleSheetsViewer />} />
        {/* Calendar route - available for all users */}
        <Route path="calendar" element={<CalendarPage />} />
        {/* Support Performance Dashboard - NEW! */}
        <Route path="support-performance" element={<SupportPerformanceDashboard />} />
      </Routes>
    </div>
  );
}

export default App;
