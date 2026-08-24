import { useState, useEffect } from "react";
import axios from "../config/axios";
import {
  PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  LineChart, Line, ResponsiveContainer
} from "recharts";

// Add loading spinner animation
const spinnerStyle = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

// Add the style to the document
if (!document.querySelector('#team-lead-spinner-styles')) {
  const styleSheet = document.createElement("style");
  styleSheet.type = "text/css";
  styleSheet.id = "team-lead-spinner-styles";
  styleSheet.innerText = spinnerStyle;
  document.head.appendChild(styleSheet);
}

export default function TeamLeadPerformanceAnalysis() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [kpis, setKPIs] = useState(null);
  const [userName, setUserName] = useState('');
  const [activeSubSection, setActiveSubSection] = useState('overview');

  useEffect(() => {
    fetchTeamLeadMetrics();
  }, []);

  const fetchTeamLeadMetrics = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Fetching team lead metrics...');
      const response = await axios.get('/api/metrics/user', {
        timeout: 30000,
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      console.log('Team Lead metrics response:', response.data);
      setTickets(response.data.tickets || []);
      setKPIs(response.data.kpis || null);
      setUserName(response.data.userName || 'Team Lead');
      
    } catch (err) {
      console.error('Error fetching team lead metrics:', err);
      setError('Unable to load performance data. This feature may require additional permissions.');
    } finally {
      setLoading(false);
    }
  };

  // Get severity distribution data
  const getSeverityDistributionData = () => {
    if (!kpis?.severityCounts) return [];
    return [
      { name: "Critical", value: kpis.severityCounts.Critical || 0, color: "#d32f2f" },
      { name: "High", value: kpis.severityCounts.High || 0, color: "#f57c00" },
      { name: "Medium", value: kpis.severityCounts.Medium || 0, color: "#fbc02d" },
      { name: "Low", value: kpis.severityCounts.Low || 0, color: "#388e3c" }
    ].filter(item => item.value > 0);
  };

  // Get status distribution data
  const getStatusDistributionData = () => {
    if (!kpis?.statusCounts) return [];
    return [
      { name: "Closed", value: kpis.statusCounts.Closed || 0, color: "#4caf50" },
      { name: "In Progress", value: kpis.statusCounts['In Progress'] || 0, color: "#2196f3" },
      { name: "Open", value: kpis.statusCounts.Open || 0, color: "#ff9800" },
      { name: "Reopened", value: kpis.statusCounts.Reopened || 0, color: "#f44336" },
      { name: "Escalated", value: kpis.statusCounts['Escalated to Level'] || 0, color: "#9c27b0" }
    ].filter(item => item.value > 0);
  };

  // Get ticket completion data
  const getCompletionData = () => {
    if (!kpis) return [];
    return [
      { name: "Completed", value: kpis.completedTickets || 0, color: "#4caf50" },
      { name: "Pending", value: kpis.pendingTickets || 0, color: "#ff9800" }
    ].filter(item => item.value > 0);
  };

  const subSections = [
    { id: 'overview', label: 'Overview', icon: 'fas fa-chart-pie' },
    { id: 'visualizations', label: 'Charts & Analytics', icon: 'fas fa-chart-line' },
    { id: 'tickets', label: 'Ticket Details', icon: 'fas fa-ticket-alt' }
  ];

  const renderOverviewSection = () => (
    <div>
      {/* Summary KPI Cards - Row 1 */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
        gap: "15px", 
        marginBottom: "20px" 
      }}>
        <div style={{ 
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", 
          padding: "20px", 
          borderRadius: "12px",
          color: "white",
          boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <h4 style={{ margin: 0, fontSize: "14px", opacity: 0.9 }}>Total Tickets</h4>
            <i className="fas fa-ticket-alt" style={{ fontSize: "24px", opacity: 0.7 }}></i>
          </div>
          <p style={{ fontSize: "32px", fontWeight: "bold", margin: 0 }}>
            {kpis?.totalTickets || 0}
          </p>
        </div>

        <div style={{ 
          background: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)", 
          padding: "20px", 
          borderRadius: "12px",
          color: "white",
          boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <h4 style={{ margin: 0, fontSize: "14px", opacity: 0.9 }}>Completed</h4>
            <i className="fas fa-check-circle" style={{ fontSize: "24px", opacity: 0.7 }}></i>
          </div>
          <p style={{ fontSize: "32px", fontWeight: "bold", margin: 0 }}>
            {kpis?.completedTickets || 0}
          </p>
        </div>

        <div style={{ 
          background: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)", 
          padding: "20px", 
          borderRadius: "12px",
          color: "white",
          boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <h4 style={{ margin: 0, fontSize: "14px", opacity: 0.9 }}>Pending</h4>
            <i className="fas fa-clock" style={{ fontSize: "24px", opacity: 0.7 }}></i>
          </div>
          <p style={{ fontSize: "32px", fontWeight: "bold", margin: 0 }}>
            {kpis?.pendingTickets || 0}
          </p>
        </div>

        <div style={{ 
          background: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)", 
          padding: "20px", 
          borderRadius: "12px",
          color: "white",
          boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <h4 style={{ margin: 0, fontSize: "14px", opacity: 0.9 }}>Completion Rate</h4>
            <i className="fas fa-percentage" style={{ fontSize: "24px", opacity: 0.7 }}></i>
          </div>
          <p style={{ fontSize: "32px", fontWeight: "bold", margin: 0 }}>
            {kpis?.completionRate || 0}%
          </p>
        </div>
      </div>

      {/* Summary KPI Cards - Row 2 */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
        gap: "15px", 
        marginBottom: "30px" 
      }}>
        <div style={{ background: "#e8f5e9", padding: "20px", borderRadius: "12px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <h4 style={{ margin: 0, fontSize: "14px", color: "#2e7d32" }}>SLA Compliance</h4>
            <i className="fas fa-shield-alt" style={{ fontSize: "20px", color: "#2e7d32" }}></i>
          </div>
          <p style={{ fontSize: "28px", fontWeight: "bold", margin: 0, color: "#2e7d32" }}>
            {kpis?.slaComplianceRate || 0}%
          </p>
          <p style={{ fontSize: "12px", margin: "5px 0 0 0", color: "#666" }}>
            {kpis?.slaBreaches || 0} breaches
          </p>
        </div>

        <div style={{ background: "#fff3e0", padding: "20px", borderRadius: "12px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <h4 style={{ margin: 0, fontSize: "14px", color: "#e65100" }}>Avg Urgency</h4>
            <i className="fas fa-exclamation-triangle" style={{ fontSize: "20px", color: "#e65100" }}></i>
          </div>
          <p style={{ fontSize: "28px", fontWeight: "bold", margin: 0, color: "#e65100" }}>
            {kpis?.avgUrgencyScore || 0}/5
          </p>
          <p style={{ fontSize: "12px", margin: "5px 0 0 0", color: "#666" }}>
            Average score
          </p>
        </div>

        <div style={{ background: "#ffebee", padding: "20px", borderRadius: "12px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <h4 style={{ margin: 0, fontSize: "14px", color: "#c62828" }}>Reopened</h4>
            <i className="fas fa-redo" style={{ fontSize: "20px", color: "#c62828" }}></i>
          </div>
          <p style={{ fontSize: "28px", fontWeight: "bold", margin: 0, color: "#c62828" }}>
            {kpis?.reopenedTickets || 0}
          </p>
          <p style={{ fontSize: "12px", margin: "5px 0 0 0", color: "#666" }}>
            Total reopened
          </p>
        </div>

        <div style={{ background: "#f3e5f5", padding: "20px", borderRadius: "12px", boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <h4 style={{ margin: 0, fontSize: "14px", color: "#6a1b9a" }}>Escalated</h4>
            <i className="fas fa-level-up-alt" style={{ fontSize: "20px", color: "#6a1b9a" }}></i>
          </div>
          <p style={{ fontSize: "28px", fontWeight: "bold", margin: 0, color: "#6a1b9a" }}>
            {kpis?.escalatedTickets || 0}
          </p>
          <p style={{ fontSize: "12px", margin: "5px 0 0 0", color: "#666" }}>
            Total escalated
          </p>
        </div>
      </div>

      {/* Performance Insights */}
      {kpis && (
        <div style={{ 
          background: "#f8f9fa", 
          padding: "24px",
          borderRadius: "12px",
          border: "1px solid #e0e0e0"
        }}>
          <h3 style={{ margin: "0 0 16px 0", color: "#333", display: "flex", alignItems: "center", gap: "10px" }}>
            <i className="fas fa-lightbulb" style={{ color: "#ffc107" }}></i>
            Performance Insights
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {kpis.completionRate >= 90 && (
              <div style={{ 
                padding: "12px 16px", 
                background: "#e8f5e9", 
                borderLeft: "4px solid #4caf50",
                borderRadius: "4px",
                color: "#2e7d32", 
                fontWeight: "500" 
              }}>
                <i className="fas fa-trophy" style={{ marginRight: "8px" }}></i>
                Excellent performance! You're maintaining a {kpis.completionRate}% completion rate.
              </div>
            )}
            {kpis.completionRate >= 70 && kpis.completionRate < 90 && (
              <div style={{ 
                padding: "12px 16px", 
                background: "#fff3e0", 
                borderLeft: "4px solid #ff9800",
                borderRadius: "4px",
                color: "#e65100", 
                fontWeight: "500" 
              }}>
                <i className="fas fa-thumbs-up" style={{ marginRight: "8px" }}></i>
                Good performance with {kpis.completionRate}% completion rate. Room for improvement!
              </div>
            )}
            {kpis.completionRate < 70 && kpis.totalTickets > 0 && (
              <div style={{ 
                padding: "12px 16px", 
                background: "#ffebee", 
                borderLeft: "4px solid #f44336",
                borderRadius: "4px",
                color: "#c62828", 
                fontWeight: "500" 
              }}>
                <i className="fas fa-exclamation-triangle" style={{ marginRight: "8px" }}></i>
                Consider focusing on task completion. Current rate: {kpis.completionRate}%.
              </div>
            )}
            {kpis.slaComplianceRate >= 90 && (
              <div style={{ 
                padding: "12px 16px", 
                background: "#e8f5e9", 
                borderLeft: "4px solid #4caf50",
                borderRadius: "4px",
                color: "#2e7d32" 
              }}>
                <i className="fas fa-check-circle" style={{ marginRight: "8px" }}></i>
                Excellent SLA compliance at {kpis.slaComplianceRate}%!
              </div>
            )}
            {kpis.slaBreaches > 0 && kpis.slaComplianceRate < 90 && (
              <div style={{ 
                padding: "12px 16px", 
                background: "#fff3e0", 
                borderLeft: "4px solid #ff9800",
                borderRadius: "4px",
                color: "#e65100" 
              }}>
                <i className="fas fa-clock" style={{ marginRight: "8px" }}></i>
                {kpis.slaBreaches} SLA breach(es) detected. Focus on timely resolution.
              </div>
            )}
            {kpis.reopenedTickets > 0 && (
              <div style={{ 
                padding: "12px 16px", 
                background: "#ffebee", 
                borderLeft: "4px solid #f44336",
                borderRadius: "4px",
                color: "#c62828" 
              }}>
                <i className="fas fa-redo" style={{ marginRight: "8px" }}></i>
                {kpis.reopenedTickets} ticket(s) reopened. Review resolution quality.
              </div>
            )}
            {kpis.escalatedTickets > 0 && (
              <div style={{ 
                padding: "12px 16px", 
                background: "#f3e5f5", 
                borderLeft: "4px solid #9c27b0",
                borderRadius: "4px",
                color: "#6a1b9a" 
              }}>
                <i className="fas fa-level-up-alt" style={{ marginRight: "8px" }}></i>
                {kpis.escalatedTickets} ticket(s) escalated to higher levels.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const renderVisualizationsSection = () => (
    <div>
      {kpis ? (
        <>
          {/* Charts Row 1: Status and Severity Distribution */}
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", 
            gap: "20px", 
            marginBottom: "30px" 
          }}>
            {/* Status Distribution */}
            <div style={{ 
              background: "white", 
              padding: "24px",
              borderRadius: "12px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
            }}>
              <h3 style={{ margin: "0 0 20px 0", color: "#333", fontSize: "18px", fontWeight: "600" }}>
                <i className="fas fa-tasks" style={{ marginRight: "8px", color: "#2196f3" }}></i>
                Ticket Status Distribution
              </h3>
              {getStatusDistributionData().length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={getStatusDistributionData()}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                      labelLine={true}
                    >
                      {getStatusDistributionData().map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ textAlign: "center", padding: "40px", color: "#999" }}>
                  No status data available
                </div>
              )}
            </div>

            {/* Severity Distribution */}
            <div style={{ 
              background: "white", 
              padding: "24px",
              borderRadius: "12px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
            }}>
              <h3 style={{ margin: "0 0 20px 0", color: "#333", fontSize: "18px", fontWeight: "600" }}>
                <i className="fas fa-exclamation-circle" style={{ marginRight: "8px", color: "#f44336" }}></i>
                Severity Distribution
              </h3>
              {getSeverityDistributionData().length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={getSeverityDistributionData()}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                      labelLine={true}
                    >
                      {getSeverityDistributionData().map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ textAlign: "center", padding: "40px", color: "#999" }}>
                  No severity data available
                </div>
              )}
            </div>
          </div>

          {/* Charts Row 2: Completion and Metrics Comparison */}
          <div style={{ 
            display: "grid", 
            gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", 
            gap: "20px", 
            marginBottom: "30px" 
          }}>
            {/* Completion Breakdown */}
            <div style={{ 
              background: "white", 
              padding: "24px",
              borderRadius: "12px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
            }}>
              <h3 style={{ margin: "0 0 20px 0", color: "#333", fontSize: "18px", fontWeight: "600" }}>
                <i className="fas fa-chart-pie" style={{ marginRight: "8px", color: "#4caf50" }}></i>
                Ticket Completion
              </h3>
              {getCompletionData().length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={getCompletionData()}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                    >
                      {getCompletionData().map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ textAlign: "center", padding: "40px", color: "#999" }}>
                  No completion data available
                </div>
              )}
            </div>

            {/* Key Metrics Comparison */}
            <div style={{ 
              background: "white", 
              padding: "24px",
              borderRadius: "12px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
            }}>
              <h3 style={{ margin: "0 0 20px 0", color: "#333", fontSize: "18px", fontWeight: "600" }}>
                <i className="fas fa-chart-bar" style={{ marginRight: "8px", color: "#9c27b0" }}></i>
                Key Metrics Overview
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={[
                  { metric: 'Completion', value: kpis.completionRate, color: '#4caf50' },
                  { metric: 'SLA Compliance', value: kpis.slaComplianceRate, color: '#2196f3' },
                  { metric: 'Urgency (×20)', value: kpis.avgUrgencyScore * 20, color: '#ff9800' }
                ]}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="metric" />
                  <YAxis domain={[0, 100]} label={{ value: 'Percentage (%)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value, name) => {
                    if (name === 'Urgency (×20)') {
                      return [(value / 20).toFixed(1), 'Avg Urgency Score'];
                    }
                    return [`${value}%`, name];
                  }} />
                  <Bar dataKey="value" fill="#8884d8">
                    {[
                      { metric: 'Completion', value: kpis.completionRate, color: '#4caf50' },
                      { metric: 'SLA Compliance', value: kpis.slaComplianceRate, color: '#2196f3' },
                      { metric: 'Urgency (×20)', value: kpis.avgUrgencyScore * 20, color: '#ff9800' }
                    ].map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      ) : (
        <div style={{ 
          textAlign: "center",
          padding: "60px 20px",
          color: "#666",
          background: "white",
          borderRadius: "12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
        }}>
          <i className="fas fa-chart-line" style={{ fontSize: "48px", color: "#ddd", marginBottom: "16px" }}></i>
          <p style={{ fontSize: "18px", margin: "0 0 8px 0" }}>No analytics data available</p>
          <p style={{ fontSize: "14px", margin: 0 }}>Submit tickets to see visualizations and trends here.</p>
        </div>
      )}
    </div>
  );

  const renderTicketsSection = () => (
    <div>
      <div style={{ 
        background: "white", 
        padding: "24px",
        borderRadius: "12px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ margin: 0, color: "#333", fontSize: "18px", fontWeight: "600" }}>
            <i className="fas fa-list" style={{ marginRight: "8px", color: "#2196f3" }}></i>
            All Tickets ({tickets.length})
          </h3>
        </div>
        
        {tickets.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
              <thead>
                <tr style={{ backgroundColor: "#f5f7fa" }}>
                  <th style={{ padding: "14px 12px", textAlign: "left", fontWeight: "600", color: "#333", borderBottom: "2px solid #e0e0e0" }}>
                    Ticket No
                  </th>
                  <th style={{ padding: "14px 12px", textAlign: "left", fontWeight: "600", color: "#333", borderBottom: "2px solid #e0e0e0" }}>
                    Created
                  </th>
                  <th style={{ padding: "14px 12px", textAlign: "left", fontWeight: "600", color: "#333", borderBottom: "2px solid #e0e0e0" }}>
                    Severity
                  </th>
                  <th style={{ padding: "14px 12px", textAlign: "left", fontWeight: "600", color: "#333", borderBottom: "2px solid #e0e0e0" }}>
                    Status
                  </th>
                  <th style={{ padding: "14px 12px", textAlign: "left", fontWeight: "600", color: "#333", borderBottom: "2px solid #e0e0e0" }}>
                    Urgency
                  </th>
                  <th style={{ padding: "14px 12px", textAlign: "left", fontWeight: "600", color: "#333", borderBottom: "2px solid #e0e0e0" }}>
                    Resolution
                  </th>
                  <th style={{ padding: "14px 12px", textAlign: "left", fontWeight: "600", color: "#333", borderBottom: "2px solid #e0e0e0" }}>
                    Assigned To
                  </th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket, index) => {
                  const severityColor = 
                    ticket.severity === 'Critical' ? '#d32f2f' :
                    ticket.severity === 'High' ? '#f57c00' :
                    ticket.severity === 'Medium' ? '#fbc02d' : '#388e3c';
                  
                  const statusColor =
                    ticket.status === 'Closed' ? '#4caf50' :
                    ticket.status === 'In Progress' ? '#2196f3' :
                    ticket.status === 'Open' ? '#ff9800' :
                    ticket.status === 'Reopened' ? '#f44336' : '#9c27b0';

                  return (
                    <tr key={index} style={{ borderBottom: "1px solid #f0f0f0" }}>
                      <td style={{ padding: "14px 12px", color: "#1976d2", fontWeight: "500" }}>
                        {ticket.ticketNo}
                      </td>
                      <td style={{ padding: "14px 12px", color: "#666" }}>
                        {ticket.createdDate}
                      </td>
                      <td style={{ padding: "14px 12px" }}>
                        <span style={{
                          padding: "4px 12px",
                          borderRadius: "12px",
                          fontSize: "12px",
                          fontWeight: "600",
                          backgroundColor: `${severityColor}20`,
                          color: severityColor
                        }}>
                          {ticket.severity}
                        </span>
                      </td>
                      <td style={{ padding: "14px 12px" }}>
                        <span style={{
                          padding: "4px 12px",
                          borderRadius: "12px",
                          fontSize: "12px",
                          fontWeight: "600",
                          backgroundColor: `${statusColor}20`,
                          color: statusColor
                        }}>
                          {ticket.status}
                        </span>
                      </td>
                      <td style={{ padding: "14px 12px", color: "#666" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span>{ticket.urgencyScore}</span>
                          <div style={{ 
                            width: "40px", 
                            height: "6px", 
                            backgroundColor: "#e0e0e0", 
                            borderRadius: "3px",
                            overflow: "hidden"
                          }}>
                            <div style={{
                              width: `${(ticket.urgencyScore / 5) * 100}%`,
                              height: "100%",
                              backgroundColor: ticket.urgencyScore >= 4 ? '#f44336' : ticket.urgencyScore >= 3 ? '#ff9800' : '#4caf50',
                              borderRadius: "3px"
                            }}></div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "14px 12px", color: "#666" }}>
                        {ticket.resolutionDate || '-'}
                      </td>
                      <td style={{ padding: "14px 12px", color: "#666" }}>
                        {ticket.assignedTo}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ 
            textAlign: "center",
            padding: "60px 20px",
            color: "#999"
          }}>
            <i className="fas fa-inbox" style={{ fontSize: "48px", marginBottom: "16px", opacity: 0.3 }}></i>
            <p style={{ fontSize: "16px", margin: "0 0 8px 0" }}>No tickets found</p>
            <p style={{ fontSize: "14px", margin: 0 }}>Start creating tickets to see them here.</p>
          </div>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div style={{ padding: "60px 20px", textAlign: "center" }}>
        <div style={{ 
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px'
        }}>
          <div style={{
            width: '50px',
            height: '50px',
            border: '4px solid #f3f3f3',
            borderTop: '4px solid #1976d2',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}></div>
          <p style={{ color: "#666", fontSize: "16px" }}>Loading performance data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "20px" }}>
        <div style={{ 
          color: "#d32f2f",
          padding: "24px",
          background: "#ffebee",
          borderRadius: "12px",
          maxWidth: "700px",
          margin: "40px auto",
          textAlign: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
        }}>
          <i className="fas fa-exclamation-circle" style={{ fontSize: "48px", marginBottom: "16px" }}></i>
          <h3 style={{ margin: "0 0 12px 0", fontSize: "20px" }}>Unable to Load Data</h3>
          <p style={{ marginBottom: "20px", color: "#666" }}>{error}</p>
          <button 
            onClick={fetchTeamLeadMetrics}
            style={{
              padding: '12px 24px',
              backgroundColor: '#1976d2',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              transition: 'background-color 0.2s'
            }}
            onMouseOver={e => e.target.style.backgroundColor = '#1565c0'}
            onMouseOut={e => e.target.style.backgroundColor = '#1976d2'}
          >
            <i className="fas fa-redo" style={{ marginRight: "8px" }}></i>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px" }}>
      <div style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0, color: "#333", fontSize: "24px", fontWeight: "600" }}>
          <i className="fas fa-chart-line" style={{ marginRight: "12px", color: "#1976d2" }}></i>
          Performance Analysis - {userName}
        </h2>
        <button
          onClick={fetchTeamLeadMetrics}
          style={{
            padding: '10px 20px',
            backgroundColor: '#1976d2',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'background-color 0.2s'
          }}
          onMouseOver={e => e.target.style.backgroundColor = '#1565c0'}
          onMouseOut={e => e.target.style.backgroundColor = '#1976d2'}
        >
          <i className="fas fa-sync-alt"></i>
          Refresh
        </button>
      </div>
      
      {/* Subsection Navigation */}
      <div style={{ 
        marginBottom: "24px",
        display: "flex",
        gap: "12px",
        borderBottom: "2px solid #e0e0e0",
        paddingBottom: "0"
      }}>
        {subSections.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSubSection(section.id)}
            style={{
              padding: "14px 24px",
              border: "none",
              backgroundColor: "transparent",
              color: activeSubSection === section.id ? "#1976d2" : "#666",
              borderBottom: activeSubSection === section.id ? "3px solid #1976d2" : "3px solid transparent",
              cursor: "pointer",
              fontWeight: activeSubSection === section.id ? "600" : "normal",
              fontSize: "15px",
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "-2px"
            }}
            onMouseOver={e => {
              if (activeSubSection !== section.id) {
                e.target.style.color = "#1976d2";
              }
            }}
            onMouseOut={e => {
              if (activeSubSection !== section.id) {
                e.target.style.color = "#666";
              }
            }}
          >
            <i className={section.icon}></i>
            {section.label}
          </button>
        ))}
      </div>

      {/* Render Active Subsection */}
      {activeSubSection === 'overview' && renderOverviewSection()}
      {activeSubSection === 'visualizations' && renderVisualizationsSection()}
      {activeSubSection === 'tickets' && renderTicketsSection()}
    </div>
  );
}
