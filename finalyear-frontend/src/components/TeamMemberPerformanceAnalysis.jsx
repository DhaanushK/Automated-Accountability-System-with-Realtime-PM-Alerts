import { useState, useEffect } from "react";
import axios from "../config/axios";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, ResponsiveContainer, AreaChart, Area
} from "recharts";

// Add loading spinner animation
const spinnerStyle = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

// Add the style to the document
if (!document.querySelector('#team-member-spinner-styles')) {
  const styleSheet = document.createElement("style");
  styleSheet.type = "text/css";
  styleSheet.id = "team-member-spinner-styles";
  styleSheet.innerText = spinnerStyle;
  document.head.appendChild(styleSheet);
}

export default function TeamMemberPerformanceAnalysis() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    fetchIndividualPerformance();
  }, []);

  const fetchIndividualPerformance = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await axios.get('/api/metrics/user', {
        timeout: 30000,
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      console.log('Individual performance response:', response.data);
      setTickets(response.data.tickets || []);
      setKpis(response.data.kpis || null);
      setUserName(response.data.userName || localStorage.getItem('userName') || 'Team Member');
      
    } catch (err) {
      console.error('Error fetching individual performance:', err);
      setError(err.response?.data?.message || 'Unable to load performance data');
    } finally {
      setLoading(false);
    }
  };

  const calculateSummaryKPIs = () => {
    if (!kpis) {
      return {
        totalTickets: 0,
        completedTickets: 0,
        pendingTickets: 0,
        reopenedTickets: 0,
        escalatedTickets: 0,
        slaBreaches: 0,
        slaComplianceRate: 0,
        completionRate: 0,
        avgUrgencyScore: 0
      };
    }

    const completionRate = kpis.totalTickets > 0 
      ? Math.round((kpis.completedTickets / kpis.totalTickets) * 100) 
      : 0;

    return {
      totalTickets: kpis.totalTickets || 0,
      completedTickets: kpis.completedTickets || 0,
      pendingTickets: kpis.pendingTickets || 0,
      reopenedTickets: kpis.reopenedTickets || 0,
      escalatedTickets: kpis.escalatedTickets || 0,
      slaBreaches: kpis.slaBreaches || 0,
      slaComplianceRate: kpis.slaComplianceRate || 0,
      completionRate: completionRate,
      avgUrgencyScore: kpis.avgUrgencyScore || 0
    };
  };

  const getSeverityData = () => {
    if (!kpis || !kpis.severityCounts) return [];
    
    const severityCounts = kpis.severityCounts;
    return [
      { name: 'Critical', value: severityCounts.Critical || 0, fill: '#f44336' },
      { name: 'High', value: severityCounts.High || 0, fill: '#ff9800' },
      { name: 'Medium', value: severityCounts.Medium || 0, fill: '#ffc107' },
      { name: 'Low', value: severityCounts.Low || 0, fill: '#4caf50' }
    ];
  };

  const getStatusData = () => {
    if (!kpis || !kpis.statusCounts) return [];
    
    const statusCounts = kpis.statusCounts;
    return [
      { name: 'Open', value: statusCounts.Open || 0, fill: '#2196f3' },
      { name: 'In Progress', value: statusCounts['In Progress'] || 0, fill: '#ff9800' },
      { name: 'Closed', value: statusCounts.Closed || 0, fill: '#4caf50' },
      { name: 'Reopened', value: statusCounts.Reopened || 0, fill: '#f44336' }
    ];
  };

  const getCategoryData = () => {
    if (!tickets || tickets.length === 0) return [];
    
    const categoryCounts = {};
    tickets.forEach(ticket => {
      const category = ticket.Category || ticket.category || 'Uncategorized';
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    });
    
    return Object.entries(categoryCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6); // Top 6 categories
  };

  const getPerformanceTrend = () => {
    if (!tickets || tickets.length === 0) return [];
    
    // Group tickets by date
    const dateCounts = {};
    tickets.forEach(ticket => {
      const dateStr = ticket['Created Date'] || ticket.createdDate;
      if (dateStr) {
        // Extract just the date part (MM/DD/YY)
        const date = dateStr.split(' ')[0];
        if (date) {
          dateCounts[date] = (dateCounts[date] || 0) + 1;
        }
      }
    });
    
    // Convert to array and sort by date
    return Object.entries(dateCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(-10); // Last 10 days with activity
  };

  if (loading) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <div style={{ 
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid #f3f3f3',
            borderTop: '3px solid #1976d2',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}></div>
          <p>Loading performance data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <div style={{ 
          color: "#d32f2f",
          padding: "20px",
          background: "#ffebee",
          borderRadius: "8px",
          maxWidth: "600px",
          margin: "0 auto"
        }}>
          <h3 style={{ margin: "0 0 10px 0" }}>Unable to Load Data</h3>
          <p style={{ marginBottom: "15px" }}>{error}</p>
          <button 
            onClick={fetchIndividualPerformance}
            style={{
              padding: '8px 16px',
              backgroundColor: '#1976d2',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'background-color 0.2s',
              marginTop: '10px'
            }}
            onMouseOver={e => e.target.style.backgroundColor = '#1565c0'}
            onMouseOut={e => e.target.style.backgroundColor = '#1976d2'}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const summaryKPIs = calculateSummaryKPIs();
  const severityData = getSeverityData();
  const statusData = getStatusData();
  const categoryData = getCategoryData();
  const trendData = getPerformanceTrend();

  return (
    <div style={{ padding: "0" }}>
      {/* Header */}
      <div style={{ 
        marginBottom: "24px", 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center",
        backgroundColor: "#fff",
        padding: "20px",
        borderRadius: "8px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
      }}>
        <div>
          <h2 style={{ margin: "0 0 4px 0", color: "#1a1a1a", fontSize: "20px", fontWeight: "600" }}>
            <i className="fas fa-chart-line" style={{ marginRight: "10px", color: "#1976d2" }}></i> 
            Performance Overview
          </h2>
          <p style={{ margin: 0, fontSize: "13px", color: "#666" }}>
            Individual metrics for {userName}
          </p>
        </div>
        <button 
          onClick={fetchIndividualPerformance}
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

      {/* Compact KPI Cards - 4 Essential Metrics */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", 
        gap: "16px", 
        marginBottom: "24px" 
      }}>
        <div style={{ 
          background: "white", 
          padding: "20px", 
          borderRadius: "8px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          borderLeft: "4px solid #1976d2"
        }}>
          <div style={{ 
            fontSize: "12px", 
            color: "#666", 
            textTransform: "uppercase", 
            letterSpacing: "0.5px",
            marginBottom: "8px",
            fontWeight: "600"
          }}>
            Total Tickets
          </div>
          <div style={{ 
            fontSize: "36px", 
            fontWeight: "700", 
            color: "#1976d2",
            lineHeight: "1"
          }}>
            {summaryKPIs.totalTickets}
          </div>
        </div>

        <div style={{ 
          background: "white", 
          padding: "20px", 
          borderRadius: "8px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          borderLeft: "4px solid #4caf50"
        }}>
          <div style={{ 
            fontSize: "12px", 
            color: "#666", 
            textTransform: "uppercase", 
            letterSpacing: "0.5px",
            marginBottom: "8px",
            fontWeight: "600"
          }}>
            Completed
          </div>
          <div style={{ 
            fontSize: "36px", 
            fontWeight: "700", 
            color: "#4caf50",
            lineHeight: "1"
          }}>
            {summaryKPIs.completedTickets}
          </div>
        </div>

        <div style={{ 
          background: "white", 
          padding: "20px", 
          borderRadius: "8px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          borderLeft: "4px solid #ff9800"
        }}>
          <div style={{ 
            fontSize: "12px", 
            color: "#666", 
            textTransform: "uppercase", 
            letterSpacing: "0.5px",
            marginBottom: "8px",
            fontWeight: "600"
          }}>
            Completion Rate
          </div>
          <div style={{ 
            fontSize: "36px", 
            fontWeight: "700", 
            color: "#ff9800",
            lineHeight: "1"
          }}>
            {summaryKPIs.completionRate}%
          </div>
        </div>

        <div style={{ 
          background: "white", 
          padding: "20px", 
          borderRadius: "8px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          borderLeft: summaryKPIs.slaComplianceRate >= 95 ? "4px solid #4caf50" : "4px solid #f44336"
        }}>
          <div style={{ 
            fontSize: "12px", 
            color: "#666", 
            textTransform: "uppercase", 
            letterSpacing: "0.5px",
            marginBottom: "8px",
            fontWeight: "600"
          }}>
            SLA Compliance
          </div>
          <div style={{ 
            fontSize: "36px", 
            fontWeight: "700", 
            color: summaryKPIs.slaComplianceRate >= 95 ? "#4caf50" : "#f44336",
            lineHeight: "1"
          }}>
            {summaryKPIs.slaComplianceRate}%
          </div>
        </div>
      </div>

      {/* Quick Stats Bar */}
      {summaryKPIs.totalTickets > 0 && (
        <div style={{
          backgroundColor: "#f8f9fa",
          padding: "12px 16px",
          borderRadius: "6px",
          marginBottom: "24px",
          display: "flex",
          gap: "24px",
          flexWrap: "wrap",
          fontSize: "13px",
          color: "#666"
        }}>
          <div>
            <i className="fas fa-clock" style={{ marginRight: "6px", color: "#ff9800" }}></i>
            <strong>{summaryKPIs.pendingTickets}</strong> Pending
          </div>
          <div>
            <i className="fas fa-exclamation-triangle" style={{ marginRight: "6px", color: "#f44336" }}></i>
            <strong>{summaryKPIs.slaBreaches}</strong> SLA Breaches
          </div>
          <div>
            <i className="fas fa-redo" style={{ marginRight: "6px", color: "#9c27b0" }}></i>
            <strong>{summaryKPIs.reopenedTickets}</strong> Reopened
          </div>
          <div>
            <i className="fas fa-level-up-alt" style={{ marginRight: "6px", color: "#ff5722" }}></i>
            <strong>{summaryKPIs.escalatedTickets}</strong> Escalated
          </div>
        </div>
      )}

      {/* Charts Row - Bar Charts */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", 
        gap: "20px", 
        marginBottom: "24px" 
      }}>
        {/* Severity Distribution - Bar Chart */}
        <div style={{ 
          background: "white", 
          padding: "20px",
          borderRadius: "8px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)"
        }}>
          <h3 style={{ 
            margin: "0 0 16px 0", 
            color: "#333", 
            fontSize: "16px",
            fontWeight: "600"
          }}>
            <i className="fas fa-exclamation-triangle" style={{ marginRight: "8px", color: "#ff9800" }}></i>
            Severity Breakdown
          </h3>
          {severityData.some(d => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={severityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {severityData.map((entry, index) => (
                    <Bar key={`bar-${index}`} dataKey="value" fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#999" }}>
              <i className="fas fa-inbox" style={{ fontSize: "36px", marginBottom: "12px", display: "block" }}></i>
              No data available
            </div>
          )}
        </div>

        {/* Status Distribution - Bar Chart */}
        <div style={{ 
          background: "white", 
          padding: "20px",
          borderRadius: "8px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)"
        }}>
          <h3 style={{ 
            margin: "0 0 16px 0", 
            color: "#333", 
            fontSize: "16px",
            fontWeight: "600"
          }}>
            <i className="fas fa-tasks" style={{ marginRight: "8px", color: "#2196f3" }}></i>
            Status Breakdown
          </h3>
          {statusData.some(d => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={statusData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {statusData.map((entry, index) => (
                    <Bar key={`bar-${index}`} dataKey="value" fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#999" }}>
              <i className="fas fa-inbox" style={{ fontSize: "36px", marginBottom: "12px", display: "block" }}></i>
              No data available
            </div>
          )}
        </div>
      </div>

      {/* Additional Analytics */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", 
        gap: "20px" 
      }}>
        {/* Category Breakdown */}
        <div style={{ 
          background: "white", 
          padding: "20px",
          borderRadius: "8px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)"
        }}>
          <h3 style={{ 
            margin: "0 0 16px 0", 
            color: "#333", 
            fontSize: "16px",
            fontWeight: "600"
          }}>
            <i className="fas fa-folder-open" style={{ marginRight: "8px", color: "#9c27b0" }}></i>
            Category Distribution
          </h3>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={categoryData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#9c27b0" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#999" }}>
              <i className="fas fa-inbox" style={{ fontSize: "36px", marginBottom: "12px", display: "block" }}></i>
              No category data available
            </div>
          )}
        </div>

        {/* Performance Trend */}
        <div style={{ 
          background: "white", 
          padding: "20px",
          borderRadius: "8px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)"
        }}>
          <h3 style={{ 
            margin: "0 0 16px 0", 
            color: "#333", 
            fontSize: "16px",
            fontWeight: "600"
          }}>
            <i className="fas fa-chart-area" style={{ marginRight: "8px", color: "#00bcd4" }}></i>
            Activity Trend
          </h3>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00bcd4" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#00bcd4" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Area 
                  type="monotone" 
                  dataKey="count" 
                  stroke="#00bcd4" 
                  fillOpacity={1} 
                  fill="url(#colorCount)" 
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#999" }}>
              <i className="fas fa-chart-line" style={{ fontSize: "36px", marginBottom: "12px", display: "block" }}></i>
              No trend data available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}