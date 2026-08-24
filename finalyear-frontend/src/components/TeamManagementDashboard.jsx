import { useState, useEffect } from "react";
import axios from "../config/axios";
import {
  PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  LineChart, Line, ResponsiveContainer, Area, AreaChart
} from "recharts";
import PerformanceKPICards from "./performance/PerformanceKPICards";
import AgentPerformanceChart from "./performance/AgentPerformanceChart";
import SeverityDistribution from "./performance/SeverityDistribution";
import TicketStatusBoard from "./performance/TicketStatusBoard";
import AgentPerformanceTable from "./performance/AgentPerformanceTable";

// Color schemes
const COLORS = {
  Critical: '#f44336',
  High: '#ff9800',
  Medium: '#ffeb3b',
  Low: '#4caf50'
};

const STATUS_COLORS = {
  Open: '#2196f3',
  'In Progress': '#ff9800',
  Closed: '#4caf50',
  Reopened: '#f44336',
  'Escalated to Level': '#9c27b0'
};

export default function TeamManagementDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [teamData, setTeamData] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [viewMode, setViewMode] = useState('overview'); // overview, individual, comparison

  useEffect(() => {
    fetchTeamData();
  }, []);

  const fetchTeamData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await axios.get('/api/metrics/all', {
        timeout: 60000,
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      if (!response.data) {
        throw new Error('No data received from server');
      }

      setTeamData(response.data);
      
      // Set first member as default selected
      if (response.data.teamMembers && response.data.teamMembers.length > 0) {
        setSelectedMember(response.data.teamMembers[0]);
      }
      
    } catch (err) {
      console.error('Error fetching team data:', err);
      setError(err.response?.data?.message || err.message || 'Failed to load team data');
    } finally {
      setLoading(false);
    }
  };

  const getTeamKPIs = () => {
    if (!teamData?.aggregatedKPIs) {
      return {
        totalTickets: 0,
        resolvedTickets: 0,
        slaCompliance: 0,
        avgResolutionTime: 0,
        criticalTickets: 0,
        pendingTickets: 0
      };
    }

    const agg = teamData.aggregatedKPIs;
    return {
      totalTickets: agg.totalTickets || 0,
      resolvedTickets: agg.completedTickets || 0,
      slaCompliance: agg.slaComplianceRate || 0,
      avgResolutionTime: 0, // Can be calculated if we have resolution times
      criticalTickets: agg.severityCounts?.Critical || 0,
      pendingTickets: agg.pendingTickets || 0
    };
  };

  const getMemberPerformanceData = () => {
    if (!teamData?.individualKPIs || !teamData?.teamMembers) return [];

    return teamData.teamMembers.map(memberName => {
      const kpi = teamData.individualKPIs[memberName] || {};
      return {
        name: memberName,
        ticketsResolved: kpi.completedTickets || 0,
        avgResolutionTime: 0, // Can be calculated if we have timestamps
        slaCompliance: kpi.slaComplianceRate || 0,
        criticalTickets: kpi.severityCounts?.Critical || 0,
        totalTickets: kpi.totalTickets || 0,
        pendingTickets: kpi.pendingTickets || 0,
        escalatedTickets: kpi.escalatedTickets || 0,
        reopenedTickets: kpi.reopenedTickets || 0,
        avgUrgencyScore: kpi.avgUrgencyScore || 0,
        performanceScore: calculatePerformanceScore(kpi),
        rank: 0 // Will be set after sorting
      };
    }).sort((a, b) => b.performanceScore - a.performanceScore)
      .map((member, index) => ({ ...member, rank: index + 1 }));
  };

  const calculatePerformanceScore = (kpi) => {
    // Calculate a performance score based on multiple factors
    const completionWeight = 0.4;
    const slaWeight = 0.3;
    const qualityWeight = 0.3;

    const completionScore = (kpi.completionRate || 0) * completionWeight;
    const slaScore = (kpi.slaComplianceRate || 0) * slaWeight;
    
    // Quality: fewer reopened and escalated tickets is better
    const reopenPenalty = (kpi.reopenedTickets || 0) * 5;
    const escalatePenalty = (kpi.escalatedTickets || 0) * 3;
    const qualityScore = Math.max(0, 100 - reopenPenalty - escalatePenalty) * qualityWeight;

    return Math.round(completionScore + slaScore + qualityScore);
  };

  const getSeverityDistributionData = () => {
    if (!teamData?.aggregatedKPIs?.severityCounts) return [];

    const counts = teamData.aggregatedKPIs.severityCounts;
    return [
      { name: 'Critical', value: counts.Critical || 0 },
      { name: 'High', value: counts.High || 0 },
      { name: 'Medium', value: counts.Medium || 0 },
      { name: 'Low', value: counts.Low || 0 }
    ];
  };

  const getStatusData = () => {
    if (!teamData?.aggregatedKPIs?.statusCounts) {
      return {
        open: 0,
        inProgress: 0,
        resolved: 0,
        reopened: 0,
        escalated: 0
      };
    }

    const counts = teamData.aggregatedKPIs.statusCounts;
    return {
      open: counts.Open || 0,
      inProgress: counts['In Progress'] || 0,
      resolved: counts.Closed || 0,
      reopened: counts.Reopened || 0,
      escalated: counts['Escalated to Level'] || 0
    };
  };

  const renderOverviewMode = () => {
    const kpis = getTeamKPIs();
    const severityData = getSeverityDistributionData();
    const statusData = getStatusData();
    const performanceData = getMemberPerformanceData();

    return (
      <div>
        {/* KPI Cards */}
        <div style={{ marginBottom: '30px' }}>
          <PerformanceKPICards metrics={kpis} />
        </div>

        {/* Main Dashboard Grid */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))',
          gap: '20px',
          marginBottom: '30px'
        }}>
          {/* Severity Distribution */}
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px' }}>
              <i className="fas fa-exclamation-triangle" style={{ marginRight: '10px', color: '#ff9800' }}></i>
              Ticket Severity Distribution
            </h3>
            <SeverityDistribution data={severityData} />
          </div>

          {/* Ticket Status Board */}
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px' }}>
              <i className="fas fa-tasks" style={{ marginRight: '10px', color: '#2196f3' }}></i>
              Ticket Status Overview
            </h3>
            <TicketStatusBoard statusData={statusData} />
          </div>
        </div>

        {/* Team Performance Comparison */}
        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          marginBottom: '30px'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '20px' }}>
            <i className="fas fa-chart-bar" style={{ marginRight: '10px', color: '#4caf50' }}></i>
            Team Performance Comparison
          </h3>
          <AgentPerformanceChart data={performanceData} />
        </div>

        {/* Detailed Performance Table */}
        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '20px' }}>
            <i className="fas fa-table" style={{ marginRight: '10px', color: '#673ab7' }}></i>
            Detailed Team Performance
          </h3>
          <AgentPerformanceTable data={performanceData} />
        </div>
      </div>
    );
  };

  const renderIndividualMode = () => {
    if (!selectedMember || !teamData?.individualKPIs) {
      return <div>Select a team member to view details</div>;
    }

    const memberKPI = teamData.individualKPIs[selectedMember] || {};
    const memberTickets = teamData.userMetrics?.[selectedMember] || [];

    // Individual KPI Cards
    const individualMetrics = {
      totalTickets: memberKPI.totalTickets || 0,
      resolvedTickets: memberKPI.completedTickets || 0,
      slaCompliance: memberKPI.slaComplianceRate || 0,
      avgResolutionTime: 0,
      criticalTickets: memberKPI.severityCounts?.Critical || 0,
      pendingTickets: memberKPI.pendingTickets || 0
    };

    // Severity data for this member
    const memberSeverityData = [
      { name: 'Critical', value: memberKPI.severityCounts?.Critical || 0 },
      { name: 'High', value: memberKPI.severityCounts?.High || 0 },
      { name: 'Medium', value: memberKPI.severityCounts?.Medium || 0 },
      { name: 'Low', value: memberKPI.severityCounts?.Low || 0 }
    ];

    // Status data for this member
    const memberStatusData = {
      open: memberKPI.statusCounts?.Open || 0,
      inProgress: memberKPI.statusCounts?.['In Progress'] || 0,
      resolved: memberKPI.statusCounts?.Closed || 0,
      reopened: memberKPI.statusCounts?.Reopened || 0,
      escalated: memberKPI.statusCounts?.['Escalated to Level'] || 0
    };

    return (
      <div>
        {/* Member Selection */}
        <div style={{ 
          backgroundColor: 'white',
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '20px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '15px' }}>Select Team Member</h3>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {teamData.teamMembers.map(member => (
              <button
                key={member}
                onClick={() => setSelectedMember(member)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: selectedMember === member ? '#2196f3' : '#f5f5f5',
                  color: selectedMember === member ? 'white' : '#333',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: selectedMember === member ? 'bold' : 'normal',
                  transition: 'all 0.2s'
                }}
              >
                {member}
              </button>
            ))}
          </div>
        </div>

        {/* Individual KPIs */}
        <div style={{ marginBottom: '30px' }}>
          <h2 style={{ marginBottom: '20px' }}>
            <i className="fas fa-user" style={{ marginRight: '10px' }}></i>
            {selectedMember}'s Performance
          </h2>
          <PerformanceKPICards metrics={individualMetrics} />
        </div>

        {/* Performance Details */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))',
          gap: '20px',
          marginBottom: '30px'
        }}>
          {/* Severity Distribution */}
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ marginTop: 0 }}>Severity Distribution</h3>
            <SeverityDistribution data={memberSeverityData} />
          </div>

          {/* Status Board */}
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ marginTop: 0 }}>Ticket Status</h3>
            <TicketStatusBoard statusData={memberStatusData} />
          </div>
        </div>

        {/* Additional Metrics */}
        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          marginBottom: '30px'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '20px' }}>Performance Metrics</h3>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '20px'
          }}>
            <MetricCard 
              title="Completion Rate"
              value={`${memberKPI.completionRate || 0}%`}
              icon="check-circle"
              color="#4caf50"
            />
            <MetricCard 
              title="SLA Compliance"
              value={`${memberKPI.slaComplianceRate || 0}%`}
              icon="clock"
              color="#2196f3"
            />
            <MetricCard 
              title="SLA Breaches"
              value={memberKPI.slaBreaches || 0}
              icon="exclamation-triangle"
              color="#f44336"
            />
            <MetricCard 
              title="Carried Forward"
              value={memberKPI.carriedForward || 0}
              icon="forward"
              color="#ff9800"
            />
            <MetricCard 
              title="Escalated"
              value={memberKPI.escalatedTickets || 0}
              icon="arrow-up"
              color="#9c27b0"
            />
            <MetricCard 
              title="Reopened"
              value={memberKPI.reopenedTickets || 0}
              icon="redo"
              color="#ff5722"
            />
            <MetricCard 
              title="Avg Urgency Score"
              value={memberKPI.avgUrgencyScore || 0}
              icon="fire"
              color="#ff6f00"
            />
            <MetricCard 
              title="Performance Score"
              value={calculatePerformanceScore(memberKPI)}
              icon="star"
              color="#ffd700"
            />
          </div>
        </div>

        {/* Recent Tickets */}
        <div style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '20px' }}>Recent Tickets</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f5f5f5' }}>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Ticket #</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Created</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Severity</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Status</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>SLA Hours</th>
                  <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Urgency</th>
                </tr>
              </thead>
              <tbody>
                {memberTickets.slice(0, 10).map((ticket, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '12px' }}>{ticket.ticketNo}</td>
                    <td style={{ padding: '12px' }}>{ticket.createdDate}</td>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        backgroundColor: COLORS[ticket.severity] || '#ccc',
                        color: ticket.severity === 'Medium' ? '#333' : 'white',
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}>
                        {ticket.severity}
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        backgroundColor: STATUS_COLORS[ticket.status] || '#ccc',
                        color: 'white',
                        fontSize: '12px'
                      }}>
                        {ticket.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>{ticket.slaHours}h</td>
                    <td style={{ padding: '12px' }}>{ticket.urgencyScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{
          display: 'inline-block',
          width: '50px',
          height: '50px',
          border: '4px solid #f3f3f3',
          borderTop: '4px solid #2196f3',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }}></div>
        <p style={{ marginTop: '20px', fontSize: '16px', color: '#666' }}>Loading team data...</p>
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
        padding: '40px',
        textAlign: 'center',
        backgroundColor: '#ffebee',
        borderRadius: '8px',
        margin: '20px'
      }}>
        <i className="fas fa-exclamation-circle" style={{ fontSize: '48px', color: '#f44336', marginBottom: '20px' }}></i>
        <h3 style={{ color: '#d32f2f', marginBottom: '10px' }}>Error Loading Team Data</h3>
        <p style={{ color: '#666', marginBottom: '20px' }}>{error}</p>
        <button
          onClick={fetchTeamData}
          style={{
            padding: '12px 24px',
            backgroundColor: '#2196f3',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold'
          }}
        >
          <i className="fas fa-redo" style={{ marginRight: '8px' }}></i>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* View Mode Toggle */}
      <div style={{
        backgroundColor: 'white',
        padding: '15px',
        borderRadius: '8px',
        marginBottom: '20px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h2 style={{ margin: 0 }}>
          <i className="fas fa-users" style={{ marginRight: '10px', color: '#2196f3' }}></i>
          Team Management Dashboard
        </h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setViewMode('overview')}
            style={{
              padding: '10px 20px',
              backgroundColor: viewMode === 'overview' ? '#2196f3' : '#f5f5f5',
              color: viewMode === 'overview' ? 'white' : '#333',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: viewMode === 'overview' ? 'bold' : 'normal',
              transition: 'all 0.2s'
            }}
          >
            <i className="fas fa-chart-pie" style={{ marginRight: '8px' }}></i>
            Overview
          </button>
          <button
            onClick={() => setViewMode('individual')}
            style={{
              padding: '10px 20px',
              backgroundColor: viewMode === 'individual' ? '#2196f3' : '#f5f5f5',
              color: viewMode === 'individual' ? 'white' : '#333',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: viewMode === 'individual' ? 'bold' : 'normal',
              transition: 'all 0.2s'
            }}
          >
            <i className="fas fa-user" style={{ marginRight: '8px' }}></i>
            Individual
          </button>
        </div>
      </div>

      {/* Render content based on view mode */}
      {viewMode === 'overview' && renderOverviewMode()}
      {viewMode === 'individual' && renderIndividualMode()}
    </div>
  );
}

// Helper component for metric cards
function MetricCard({ title, value, icon, color }) {
  return (
    <div style={{
      padding: '20px',
      backgroundColor: '#f9f9f9',
      borderRadius: '8px',
      borderLeft: `4px solid ${color}`,
      transition: 'transform 0.2s',
      cursor: 'default'
    }}
    onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
    onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>{title}</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#333' }}>{value}</div>
        </div>
        <i className={`fas fa-${icon}`} style={{ fontSize: '32px', color: color, opacity: 0.3 }}></i>
      </div>
    </div>
  );
}
