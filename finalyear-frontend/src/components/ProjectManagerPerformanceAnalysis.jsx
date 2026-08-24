import { useState, useEffect } from "react";
import axios from "../config/axios";
import {
  PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  LineChart, Line, ResponsiveContainer, Area, AreaChart
} from "recharts";

// Add loading spinner animation
const spinnerStyle = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

// Add the style to the document
if (!document.querySelector('#project-manager-spinner-styles')) {
  const styleSheet = document.createElement("style");
  styleSheet.type = "text/css";
  styleSheet.id = "project-manager-spinner-styles";
  styleSheet.innerText = spinnerStyle;
  document.head.appendChild(styleSheet);
}

export default function ProjectManagerPerformanceAnalysis() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [teamData, setTeamData] = useState(null);
  const [activeSubSection, setActiveSubSection] = useState('overview');

  useEffect(() => {
    fetchProjectManagerMetrics();
  }, []);

  const fetchProjectManagerMetrics = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Fetching project manager metrics...');
      const response = await axios.get('/api/metrics/all', {
        timeout: 60000,
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      console.log('Project Manager metrics response:', response.data);
      setTeamData(response.data);
      
    } catch (err) {
      console.error('Error fetching project manager metrics:', err);
      setError('Unable to load team performance data. Please check your connection and permissions.');
    } finally {
      setLoading(false);
    }
  };

  const calculateTeamKPIs = () => {
    if (!teamData?.individualKPIs) {
      return { totalTasks: 0, completedTasks: 0, pendingTasks: 0, lateTasks: 0, completionRate: 0, totalInteractions: 0 };
    }

    let totalTasks = 0;
    let completedTasks = 0;
    let lateTasks = 0;
    let totalInteractions = 0;

    Object.values(teamData.individualKPIs).forEach(kpi => {
      totalTasks += kpi.totalTasks || 0;
      completedTasks += kpi.completedTasks || 0;
      lateTasks += kpi.lateTasks || 0;
      totalInteractions += kpi.totalClientInteractions || 0;
    });

    const pendingTasks = totalTasks - completedTasks;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return { totalTasks, completedTasks, pendingTasks, lateTasks, completionRate, totalInteractions };
  };

  const getTeamPerformanceTrendData = () => {
    if (!teamData?.userMetrics || Object.keys(teamData.userMetrics).length === 0) return [];

    // Get all unique dates from all team members
    const allDates = new Set();
    Object.values(teamData.userMetrics).forEach(userMetrics => {
      userMetrics.forEach(metric => {
        if (metric.date) allDates.add(metric.date);
      });
    });

    // Sort dates and take the last 14
    const sortedDates = Array.from(allDates).sort().slice(-14);

    return sortedDates.map(date => {
      let totalTasks = 0;
      let completed = 0;
      let late = 0;
      let interactions = 0;

      Object.values(teamData.userMetrics).forEach(userMetrics => {
        const dayMetric = userMetrics.find(m => m.date === date);
        if (dayMetric) {
          totalTasks += dayMetric.totalTasks || 0;
          completed += dayMetric.completed || 0;
          late += dayMetric.late || 0;
          interactions += dayMetric.clientInteractions || 0;
        }
      });

      return {
        date,
        totalTasks,
        completed,
        pending: totalTasks - completed,
        late,
        completionRate: totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0,
        interactions
      };
    });
  };

  const getTeamDistributionData = () => {
    const kpis = calculateTeamKPIs();
    return [
      { name: "Completed", value: kpis.completedTasks, color: "#4caf50" },
      { name: "Pending", value: kpis.pendingTasks, color: "#ff9800" },
      { name: "Late", value: kpis.lateTasks, color: "#f44336" }
    ].filter(item => item.value > 0);
  };

  const getTeamMemberPerformanceData = () => {
    if (!teamData?.individualKPIs) return [];

    return Object.entries(teamData.individualKPIs).map(([username, kpi]) => ({
      name: username,
      totalTasks: kpi.totalTasks || 0,
      completed: kpi.completedTasks || 0,
      late: kpi.lateTasks || 0,
      completionRate: kpi.totalTasks > 0 ? Math.round((kpi.completedTasks / kpi.totalTasks) * 100) : 0,
      interactions: kpi.totalClientInteractions || 0
    }));
  };

  const getWeeklyTeamAverages = () => {
    const trendData = getTeamPerformanceTrendData();
    if (trendData.length === 0) return [];

    const weeks = [];
    for (let i = 0; i < trendData.length; i += 7) {
      const weekData = trendData.slice(i, i + 7);
      if (weekData.length > 0) {
        const weekTotal = weekData.reduce((acc, day) => ({
          totalTasks: acc.totalTasks + day.totalTasks,
          completed: acc.completed + day.completed,
          late: acc.late + day.late,
          interactions: acc.interactions + day.interactions
        }), { totalTasks: 0, completed: 0, late: 0, interactions: 0 });

        weeks.push({
          week: `Week ${Math.floor(i / 7) + 1}`,
          avgTasks: weekData.length > 0 ? Math.round(weekTotal.totalTasks / weekData.length) : 0,
          avgCompletion: weekData.length > 0 ? Math.round(weekTotal.completed / weekData.length) : 0,
          avgInteractions: weekData.length > 0 ? Math.round(weekTotal.interactions / weekData.length) : 0,
          totalLate: weekTotal.late
        });
      }
    }
    return weeks;
  };

  const getIndividualMemberMetrics = (username) => {
    if (!teamData?.userMetrics?.[username]) return [];
    return teamData.userMetrics[username].slice(-14); // Last 14 entries
  };

  const getIndividualMemberKPIs = (username) => {
    if (!teamData?.individualKPIs?.[username]) {
      return { totalTasks: 0, completedTasks: 0, pendingTasks: 0, lateTasks: 0, completionRate: 0, totalInteractions: 0 };
    }
    
    const kpi = teamData.individualKPIs[username];
    return {
      totalTasks: kpi.totalTasks || 0,
      completedTasks: kpi.completedTasks || 0,
      pendingTasks: (kpi.totalTasks || 0) - (kpi.completedTasks || 0),
      lateTasks: kpi.lateTasks || 0,
      completionRate: kpi.totalTasks > 0 ? Math.round((kpi.completedTasks / kpi.totalTasks) * 100) : 0,
      totalInteractions: kpi.totalClientInteractions || 0
    };
  };

  const getIndividualTrendData = (username) => {
    const metrics = getIndividualMemberMetrics(username);
    return metrics.map(metric => ({
      date: metric.date,
      totalTasks: metric.totalTasks || 0,
      completed: metric.completed || 0,
      pending: (metric.totalTasks || 0) - (metric.completed || 0),
      late: metric.late || 0,
      completionRate: (metric.totalTasks || 0) > 0 ? Math.round(((metric.completed || 0) / metric.totalTasks) * 100) : 0,
      interactions: metric.clientInteractions || 0
    }));
  };

  const getIndividualDistributionData = (username) => {
    const kpis = getIndividualMemberKPIs(username);
    return [
      { name: "Completed", value: kpis.completedTasks, color: "#4caf50" },
      { name: "Pending", value: kpis.pendingTasks, color: "#ff9800" },
      { name: "Late", value: kpis.lateTasks, color: "#f44336" }
    ].filter(item => item.value > 0);
  };

  const subSections = [
    { id: 'overview', label: 'Overview', icon: 'fas fa-chart-pie' },
    { id: 'visualizations', label: 'Charts & Trends', icon: 'fas fa-chart-line' },
    { id: 'data', label: 'Detailed Data', icon: 'fas fa-table' },
    { id: 'individual-charts', label: 'Individual Charts', icon: 'fas fa-user-friends' },
    { id: 'individual-data', label: 'Individual Data', icon: 'fas fa-users' }
  ];

  const renderOverviewSection = () => {
    const kpis = calculateTeamKPIs();
    
    return (
      <div>
        {/* Team Summary KPIs */}
        <div style={{ display: "flex", gap: "15px", marginBottom: "30px", flexWrap: "wrap" }}>
          <div style={{ background: "#e3f2fd", padding: "20px", borderRadius: "8px", minWidth: "180px", flex: 1 }}>
            <h4 style={{ margin: "0 0 10px 0", fontSize: "16px", color: "#1976d2" }}>Total Tasks</h4>
            <p style={{ fontSize: "28px", fontWeight: "bold", margin: 0, color: "#1976d2" }}>
              {kpis.totalTasks}
            </p>
          </div>
          <div style={{ background: "#e8f5e9", padding: "20px", borderRadius: "8px", minWidth: "180px", flex: 1 }}>
            <h4 style={{ margin: "0 0 10px 0", fontSize: "16px", color: "#2e7d32" }}>Completed</h4>
            <p style={{ fontSize: "28px", fontWeight: "bold", margin: 0, color: "#2e7d32" }}>
              {kpis.completedTasks}
            </p>
          </div>
          <div style={{ background: "#fff3e0", padding: "20px", borderRadius: "8px", minWidth: "180px", flex: 1 }}>
            <h4 style={{ margin: "0 0 10px 0", fontSize: "16px", color: "#f57c00" }}>Team Completion Rate</h4>
            <p style={{ fontSize: "28px", fontWeight: "bold", margin: 0, color: "#f57c00" }}>
              {kpis.completionRate}%
            </p>
          </div>
          <div style={{ background: "#ffebee", padding: "20px", borderRadius: "8px", minWidth: "180px", flex: 1 }}>
            <h4 style={{ margin: "0 0 10px 0", fontSize: "16px", color: "#c62828" }}>Late Tasks</h4>
            <p style={{ fontSize: "28px", fontWeight: "bold", margin: 0, color: "#c62828" }}>
              {kpis.lateTasks}
            </p>
          </div>
          <div style={{ background: "#f3e5f5", padding: "20px", borderRadius: "8px", minWidth: "180px", flex: 1 }}>
            <h4 style={{ margin: "0 0 10px 0", fontSize: "16px", color: "#7b1fa2" }}>Total Interactions</h4>
            <p style={{ fontSize: "28px", fontWeight: "bold", margin: 0, color: "#7b1fa2" }}>
              {kpis.totalInteractions}
            </p>
          </div>
        </div>

        {/* Team Performance Insights */}
        <div style={{ 
          background: "#f8f9fa", 
          padding: "20px",
          borderRadius: "8px",
          marginTop: "20px"
        }}>
          <h3 style={{ margin: "0 0 15px 0", color: "#333" }}>Team Performance Insights</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {kpis.completionRate >= 85 && (
              <div style={{ color: "#2e7d32", fontWeight: "500" }}>
                🎉 Excellent team performance! Your team is maintaining a {kpis.completionRate}% completion rate.
              </div>
            )}
            {kpis.completionRate >= 70 && kpis.completionRate < 85 && (
              <div style={{ color: "#f57c00", fontWeight: "500" }}>
                👍 Good team performance with {kpis.completionRate}% completion rate. Consider identifying areas for improvement.
              </div>
            )}
            {kpis.completionRate < 70 && (
              <div style={{ color: "#c62828", fontWeight: "500" }}>
                ⚠️ Team completion rate needs attention. Current rate: {kpis.completionRate}%. Consider team support strategies.
              </div>
            )}
            {kpis.lateTasks > 0 && (
              <div style={{ color: "#c62828" }}>
                📅 {kpis.lateTasks} late task(s) across the team. Consider reviewing workload distribution and deadlines.
              </div>
            )}
            {kpis.lateTasks === 0 && kpis.totalTasks > 0 && (
              <div style={{ color: "#2e7d32" }}>
                ✅ No late submissions across the team! Excellent project management.
              </div>
            )}
            {teamData?.teamMembers && (
              <div style={{ color: "#1976d2" }}>
                👥 Managing {teamData.teamMembers.length} team member(s) with {kpis.totalInteractions} total client interactions.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderVisualizationsSection = () => {
    const trendData = getTeamPerformanceTrendData();
    const distributionData = getTeamDistributionData();
    const memberData = getTeamMemberPerformanceData();
    const weeklyData = getWeeklyTeamAverages();

    return (
      <div>
        {trendData.length > 0 ? (
          <>
            {/* Charts Row 1: Team Task Distribution & Performance Trend */}
            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", 
              gap: "20px", 
              marginBottom: "30px" 
            }}>
              {/* Team Task Distribution */}
              <div style={{ 
                background: "white", 
                padding: "20px",
                borderRadius: "8px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
              }}>
                <h3 style={{ margin: "0 0 20px 0", color: "#333" }}>Team Task Distribution</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={distributionData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                    >
                      {distributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Team Performance Trend */}
              <div style={{ 
                background: "white", 
                padding: "20px",
                borderRadius: "8px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
              }}>
                <h3 style={{ margin: "0 0 20px 0", color: "#333" }}>Team Performance Trend (Last 14 Days)</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" angle={-45} textAnchor="end" height={80} fontSize={11} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="completed" stroke="#4caf50" name="Completed" strokeWidth={2} />
                    <Line type="monotone" dataKey="totalTasks" stroke="#2196f3" name="Total Tasks" strokeWidth={2} />
                    <Line type="monotone" dataKey="late" stroke="#f44336" name="Late" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Charts Row 2: Team Completion Rate & Client Interactions */}
            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", 
              gap: "20px", 
              marginBottom: "30px" 
            }}>
              {/* Team Completion Rate */}
              <div style={{ 
                background: "white", 
                padding: "20px",
                borderRadius: "8px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
              }}>
                <h3 style={{ margin: "0 0 20px 0", color: "#333" }}>Daily Team Completion Rate</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" angle={-45} textAnchor="end" height={80} fontSize={11} />
                    <YAxis domain={[0, 100]} />
                    <Tooltip formatter={(value) => [`${value}%`, 'Completion Rate']} />
                    <Area 
                      type="monotone" 
                      dataKey="completionRate" 
                      stroke="#4caf50" 
                      fill="#4caf50" 
                      fillOpacity={0.3}
                      name="Team Completion Rate (%)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Team Client Interactions */}
              <div style={{ 
                background: "white", 
                padding: "20px",
                borderRadius: "8px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
              }}>
                <h3 style={{ margin: "0 0 20px 0", color: "#333" }}>Team Client Interactions</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" angle={-45} textAnchor="end" height={80} fontSize={11} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="interactions" fill="#9c27b0" name="Client Interactions" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Team Member Comparison Chart */}
            {memberData.length > 0 && (
              <div style={{ 
                background: "white", 
                padding: "20px",
                borderRadius: "8px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                marginBottom: "30px"
              }}>
                <h3 style={{ margin: "0 0 20px 0", color: "#333" }}>Team Member Performance Comparison</h3>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={memberData} margin={{ bottom: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} fontSize={11} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="completed" fill="#4caf50" name="Completed Tasks" />
                    <Bar dataKey="totalTasks" fill="#2196f3" name="Total Tasks" />
                    <Bar dataKey="interactions" fill="#9c27b0" name="Client Interactions" />
                    <Bar dataKey="late" fill="#f44336" name="Late Tasks" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Weekly Team Analysis */}
            {weeklyData.length > 0 && (
              <div style={{ 
                background: "white", 
                padding: "20px",
                borderRadius: "8px",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                marginBottom: "30px"
              }}>
                <h3 style={{ margin: "0 0 20px 0", color: "#333" }}>Weekly Team Performance Analysis</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={weeklyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="avgTasks" fill="#2196f3" name="Avg Daily Tasks" />
                    <Bar dataKey="avgCompletion" fill="#4caf50" name="Avg Daily Completion" />
                    <Bar dataKey="avgInteractions" fill="#9c27b0" name="Avg Daily Interactions" />
                    <Bar dataKey="totalLate" fill="#f44336" name="Total Late Tasks" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        ) : (
          <div style={{ 
            textAlign: "center",
            padding: "40px",
            color: "#666"
          }}>
            <p>No data available for team visualizations.</p>
            <p style={{ fontSize: "14px" }}>Team performance charts will appear here once team members start submitting metrics.</p>
          </div>
        )}
      </div>
    );
  };

  const renderDataSection = () => {
    const memberData = getTeamMemberPerformanceData();
    const trendData = getTeamPerformanceTrendData();

    return (
      <div>
        {/* Team Member Performance Table */}
        <div style={{ 
          background: "white", 
          padding: "20px",
          borderRadius: "8px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
          marginBottom: "30px"
        }}>
          <h3 style={{ margin: "0 0 20px 0", color: "#333" }}>Team Member Performance Summary</h3>
          
          {memberData.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ 
                      padding: "12px",
                      borderBottom: "2px solid #ddd",
                      backgroundColor: "#f5f5f5",
                      textAlign: "left",
                      fontWeight: "600"
                    }}>Team Member</th>
                    <th style={{ 
                      padding: "12px",
                      borderBottom: "2px solid #ddd",
                      backgroundColor: "#f5f5f5",
                      textAlign: "left",
                      fontWeight: "600"
                    }}>Total Tasks</th>
                    <th style={{ 
                      padding: "12px",
                      borderBottom: "2px solid #ddd",
                      backgroundColor: "#f5f5f5",
                      textAlign: "left",
                      fontWeight: "600"
                    }}>Completed</th>
                    <th style={{ 
                      padding: "12px",
                      borderBottom: "2px solid #ddd",
                      backgroundColor: "#f5f5f5",
                      textAlign: "left",
                      fontWeight: "600"
                    }}>Late Tasks</th>
                    <th style={{ 
                      padding: "12px",
                      borderBottom: "2px solid #ddd",
                      backgroundColor: "#f5f5f5",
                      textAlign: "left",
                      fontWeight: "600"
                    }}>Completion Rate</th>
                    <th style={{ 
                      padding: "12px",
                      borderBottom: "2px solid #ddd",
                      backgroundColor: "#f5f5f5",
                      textAlign: "left",
                      fontWeight: "600"
                    }}>Client Interactions</th>
                  </tr>
                </thead>
                <tbody>
                  {memberData.map((member, index) => (
                    <tr key={index}>
                      <td style={{ 
                        padding: "12px",
                        borderBottom: "1px solid #eee",
                        fontWeight: "500"
                      }}>{member.name}</td>
                      <td style={{ 
                        padding: "12px",
                        borderBottom: "1px solid #eee"
                      }}>{member.totalTasks}</td>
                      <td style={{ 
                        padding: "12px",
                        borderBottom: "1px solid #eee",
                        color: "#2e7d32",
                        fontWeight: "500"
                      }}>{member.completed}</td>
                      <td style={{ 
                        padding: "12px",
                        borderBottom: "1px solid #eee",
                        color: member.late > 0 ? "#c62828" : "#666",
                        fontWeight: member.late > 0 ? "500" : "normal"
                      }}>{member.late}</td>
                      <td style={{ 
                        padding: "12px",
                        borderBottom: "1px solid #eee",
                        color: "#2196f3",
                        fontWeight: "500"
                      }}>{member.completionRate}%</td>
                      <td style={{ 
                        padding: "12px",
                        borderBottom: "1px solid #eee"
                      }}>{member.interactions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ 
              textAlign: "center",
              padding: "40px",
              color: "#666"
            }}>
              <p>No team member data available.</p>
              <p style={{ fontSize: "14px" }}>Team performance data will appear here once team members start submitting metrics.</p>
            </div>
          )}
        </div>

        {/* Daily Team Performance Table */}
        {trendData.length > 0 && (
          <div style={{ 
            background: "white", 
            padding: "20px",
            borderRadius: "8px",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
          }}>
            <h3 style={{ margin: "0 0 20px 0", color: "#333" }}>Daily Team Performance</h3>
            
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ 
                      padding: "12px",
                      borderBottom: "2px solid #ddd",
                      backgroundColor: "#f5f5f5",
                      textAlign: "left",
                      fontWeight: "600"
                    }}>Date</th>
                    <th style={{ 
                      padding: "12px",
                      borderBottom: "2px solid #ddd",
                      backgroundColor: "#f5f5f5",
                      textAlign: "left",
                      fontWeight: "600"
                    }}>Total Tasks</th>
                    <th style={{ 
                      padding: "12px",
                      borderBottom: "2px solid #ddd",
                      backgroundColor: "#f5f5f5",
                      textAlign: "left",
                      fontWeight: "600"
                    }}>Completed</th>
                    <th style={{ 
                      padding: "12px",
                      borderBottom: "2px solid #ddd",
                      backgroundColor: "#f5f5f5",
                      textAlign: "left",
                      fontWeight: "600"
                    }}>Pending</th>
                    <th style={{ 
                      padding: "12px",
                      borderBottom: "2px solid #ddd",
                      backgroundColor: "#f5f5f5",
                      textAlign: "left",
                      fontWeight: "600"
                    }}>Late</th>
                    <th style={{ 
                      padding: "12px",
                      borderBottom: "2px solid #ddd",
                      backgroundColor: "#f5f5f5",
                      textAlign: "left",
                      fontWeight: "600"
                    }}>Team Completion Rate</th>
                    <th style={{ 
                      padding: "12px",
                      borderBottom: "2px solid #ddd",
                      backgroundColor: "#f5f5f5",
                      textAlign: "left",
                      fontWeight: "600"
                    }}>Total Interactions</th>
                  </tr>
                </thead>
                <tbody>
                  {trendData.map((day, index) => (
                    <tr key={index}>
                      <td style={{ 
                        padding: "12px",
                        borderBottom: "1px solid #eee"
                      }}>{day.date}</td>
                      <td style={{ 
                        padding: "12px",
                        borderBottom: "1px solid #eee"
                      }}>{day.totalTasks}</td>
                      <td style={{ 
                        padding: "12px",
                        borderBottom: "1px solid #eee",
                        color: "#2e7d32",
                        fontWeight: "500"
                      }}>{day.completed}</td>
                      <td style={{ 
                        padding: "12px",
                        borderBottom: "1px solid #eee"
                      }}>{day.pending}</td>
                      <td style={{ 
                        padding: "12px",
                        borderBottom: "1px solid #eee",
                        color: day.late > 0 ? "#c62828" : "#666",
                        fontWeight: day.late > 0 ? "500" : "normal"
                      }}>{day.late}</td>
                      <td style={{ 
                        padding: "12px",
                        borderBottom: "1px solid #eee",
                        color: "#2196f3",
                        fontWeight: "500"
                      }}>{day.completionRate}%</td>
                      <td style={{ 
                        padding: "12px",
                        borderBottom: "1px solid #eee"
                      }}>{day.interactions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderIndividualChartsSection = () => {
    const teamMembers = teamData?.teamMembers || [];
    
    if (teamMembers.length === 0) {
      return (
        <div style={{ 
          textAlign: "center",
          padding: "40px",
          color: "#666"
        }}>
          <p>No team members found.</p>
          <p style={{ fontSize: "14px" }}>Individual performance charts will appear here once team members are added.</p>
        </div>
      );
    }

    return (
      <div>
        {teamMembers.map((username, memberIndex) => {
          const memberKPIs = getIndividualMemberKPIs(username);
          const memberTrendData = getIndividualTrendData(username);
          const memberDistributionData = getIndividualDistributionData(username);

          return (
            <div key={username} style={{ 
              marginBottom: "40px",
              border: "1px solid #e0e0e0",
              borderRadius: "8px",
              overflow: "hidden"
            }}>
              {/* Member Header */}
              <div style={{
                background: "linear-gradient(135deg, #1976d2 0%, #42a5f5 100%)",
                color: "white",
                padding: "20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between"
              }}>
                <div>
                  <h3 style={{ margin: "0 0 5px 0", fontSize: "20px" }}>
                    <i className="fas fa-user mr-2"></i>{username}
                  </h3>
                  <div style={{ fontSize: "14px", opacity: 0.9 }}>
                    {memberKPIs.totalTasks} total tasks • {memberKPIs.completionRate}% completion rate
                  </div>
                </div>
                <div style={{
                  background: "rgba(255,255,255,0.2)",
                  padding: "10px 15px",
                  borderRadius: "20px",
                  fontSize: "14px"
                }}>
                  Team Member #{memberIndex + 1}
                </div>
              </div>

              {/* Member Content */}
              <div style={{ padding: "20px", background: "white" }}>
                {memberTrendData.length > 0 ? (
                  <>
                    {/* Individual KPI Cards */}
                    <div style={{ display: "flex", gap: "15px", marginBottom: "25px", flexWrap: "wrap" }}>
                      <div style={{ background: "#e3f2fd", padding: "15px", borderRadius: "6px", minWidth: "140px", flex: 1 }}>
                        <h5 style={{ margin: "0 0 5px 0", fontSize: "14px", color: "#1976d2" }}>Total Tasks</h5>
                        <p style={{ fontSize: "22px", fontWeight: "bold", margin: 0, color: "#1976d2" }}>
                          {memberKPIs.totalTasks}
                        </p>
                      </div>
                      <div style={{ background: "#e8f5e9", padding: "15px", borderRadius: "6px", minWidth: "140px", flex: 1 }}>
                        <h5 style={{ margin: "0 0 5px 0", fontSize: "14px", color: "#2e7d32" }}>Completed</h5>
                        <p style={{ fontSize: "22px", fontWeight: "bold", margin: 0, color: "#2e7d32" }}>
                          {memberKPIs.completedTasks}
                        </p>
                      </div>
                      <div style={{ background: "#fff3e0", padding: "15px", borderRadius: "6px", minWidth: "140px", flex: 1 }}>
                        <h5 style={{ margin: "0 0 5px 0", fontSize: "14px", color: "#f57c00" }}>Completion Rate</h5>
                        <p style={{ fontSize: "22px", fontWeight: "bold", margin: 0, color: "#f57c00" }}>
                          {memberKPIs.completionRate}%
                        </p>
                      </div>
                      <div style={{ background: "#ffebee", padding: "15px", borderRadius: "6px", minWidth: "140px", flex: 1 }}>
                        <h5 style={{ margin: "0 0 5px 0", fontSize: "14px", color: "#c62828" }}>Late Tasks</h5>
                        <p style={{ fontSize: "22px", fontWeight: "bold", margin: 0, color: "#c62828" }}>
                          {memberKPIs.lateTasks}
                        </p>
                      </div>
                    </div>

                    {/* Individual Charts Row */}
                    <div style={{ 
                      display: "grid", 
                      gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", 
                      gap: "20px",
                      marginBottom: "20px"
                    }}>
                      {/* Individual Task Distribution */}
                      {memberDistributionData.length > 0 && (
                        <div style={{ 
                          background: "#fafafa", 
                          padding: "15px",
                          borderRadius: "6px",
                          border: "1px solid #e0e0e0"
                        }}>
                          <h4 style={{ margin: "0 0 15px 0", color: "#333", fontSize: "16px" }}>Task Distribution</h4>
                          <ResponsiveContainer width="100%" height={250}>
                            <PieChart>
                              <Pie
                                data={memberDistributionData}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                outerRadius={80}
                                label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                              >
                                {memberDistributionData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Pie>
                              <Tooltip />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      {/* Individual Performance Trend */}
                      <div style={{ 
                        background: "#fafafa", 
                        padding: "15px",
                        borderRadius: "6px",
                        border: "1px solid #e0e0e0"
                      }}>
                        <h4 style={{ margin: "0 0 15px 0", color: "#333", fontSize: "16px" }}>Performance Trend</h4>
                        <ResponsiveContainer width="100%" height={250}>
                          <LineChart data={memberTrendData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" angle={-45} textAnchor="end" height={60} fontSize={10} />
                            <YAxis fontSize={10} />
                            <Tooltip />
                            <Legend />
                            <Line type="monotone" dataKey="completed" stroke="#4caf50" name="Completed" strokeWidth={2} />
                            <Line type="monotone" dataKey="totalTasks" stroke="#2196f3" name="Total" strokeWidth={2} />
                            <Line type="monotone" dataKey="late" stroke="#f44336" name="Late" strokeWidth={2} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Individual Completion Rate & Interactions Row */}
                    <div style={{ 
                      display: "grid", 
                      gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", 
                      gap: "20px"
                    }}>
                      {/* Individual Completion Rate */}
                      <div style={{ 
                        background: "#fafafa", 
                        padding: "15px",
                        borderRadius: "6px",
                        border: "1px solid #e0e0e0"
                      }}>
                        <h4 style={{ margin: "0 0 15px 0", color: "#333", fontSize: "16px" }}>Daily Completion Rate</h4>
                        <ResponsiveContainer width="100%" height={250}>
                          <AreaChart data={memberTrendData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" angle={-45} textAnchor="end" height={60} fontSize={10} />
                            <YAxis domain={[0, 100]} fontSize={10} />
                            <Tooltip formatter={(value) => [`${value}%`, 'Completion Rate']} />
                            <Area 
                              type="monotone" 
                              dataKey="completionRate" 
                              stroke="#4caf50" 
                              fill="#4caf50" 
                              fillOpacity={0.3}
                              name="Completion Rate (%)"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Individual Client Interactions */}
                      <div style={{ 
                        background: "#fafafa", 
                        padding: "15px",
                        borderRadius: "6px",
                        border: "1px solid #e0e0e0"
                      }}>
                        <h4 style={{ margin: "0 0 15px 0", color: "#333", fontSize: "16px" }}>Client Interactions</h4>
                        <ResponsiveContainer width="100%" height={250}>
                          <BarChart data={memberTrendData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" angle={-45} textAnchor="end" height={60} fontSize={10} />
                            <YAxis fontSize={10} />
                            <Tooltip />
                            <Bar dataKey="interactions" fill="#9c27b0" name="Interactions" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ 
                    textAlign: "center",
                    padding: "30px",
                    color: "#666",
                    background: "#fafafa",
                    borderRadius: "6px"
                  }}>
                    <p>No performance data available for {username}</p>
                    <p style={{ fontSize: "14px" }}>Charts will appear once this team member starts submitting metrics.</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderIndividualDataSection = () => {
    const teamMembers = teamData?.teamMembers || [];
    
    if (teamMembers.length === 0) {
      return (
        <div style={{ 
          textAlign: "center",
          padding: "40px",
          color: "#666"
        }}>
          <p>No team members found.</p>
          <p style={{ fontSize: "14px" }}>Individual performance data will appear here once team members are added.</p>
        </div>
      );
    }

    return (
      <div>
        {teamMembers.map((username, memberIndex) => {
          const memberMetrics = getIndividualMemberMetrics(username);
          const memberKPIs = getIndividualMemberKPIs(username);

          return (
            <div key={username} style={{ 
              marginBottom: "30px",
              border: "1px solid #e0e0e0",
              borderRadius: "8px",
              overflow: "hidden"
            }}>
              {/* Member Header */}
              <div style={{
                background: "linear-gradient(135deg, #4caf50 0%, #66bb6a 100%)",
                color: "white",
                padding: "20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between"
              }}>
                <div>
                  <h3 style={{ margin: "0 0 5px 0", fontSize: "20px" }}>
                    <i className="fas fa-user-tie mr-2"></i>{username} - Performance Data
                  </h3>
                  <div style={{ fontSize: "14px", opacity: 0.9 }}>
                    {memberKPIs.totalTasks} tasks • {memberKPIs.completionRate}% completion • {memberKPIs.totalInteractions} interactions
                  </div>
                </div>
                <div style={{
                  background: "rgba(255,255,255,0.2)",
                  padding: "10px 15px",
                  borderRadius: "20px",
                  fontSize: "14px"
                }}>
                  Member #{memberIndex + 1}
                </div>
              </div>

              {/* Member Content */}
              <div style={{ padding: "20px", background: "white" }}>
                {/* Summary KPIs Row */}
                <div style={{ display: "flex", gap: "12px", marginBottom: "25px", flexWrap: "wrap" }}>
                  <div style={{ background: "#e3f2fd", padding: "12px", borderRadius: "6px", minWidth: "120px", flex: 1 }}>
                    <h6 style={{ margin: "0 0 5px 0", fontSize: "12px", color: "#1976d2", textTransform: "uppercase" }}>Total</h6>
                    <p style={{ fontSize: "18px", fontWeight: "bold", margin: 0, color: "#1976d2" }}>
                      {memberKPIs.totalTasks}
                    </p>
                  </div>
                  <div style={{ background: "#e8f5e9", padding: "12px", borderRadius: "6px", minWidth: "120px", flex: 1 }}>
                    <h6 style={{ margin: "0 0 5px 0", fontSize: "12px", color: "#2e7d32", textTransform: "uppercase" }}>Completed</h6>
                    <p style={{ fontSize: "18px", fontWeight: "bold", margin: 0, color: "#2e7d32" }}>
                      {memberKPIs.completedTasks}
                    </p>
                  </div>
                  <div style={{ background: "#fff3e0", padding: "12px", borderRadius: "6px", minWidth: "120px", flex: 1 }}>
                    <h6 style={{ margin: "0 0 5px 0", fontSize: "12px", color: "#f57c00", textTransform: "uppercase" }}>Pending</h6>
                    <p style={{ fontSize: "18px", fontWeight: "bold", margin: 0, color: "#f57c00" }}>
                      {memberKPIs.pendingTasks}
                    </p>
                  </div>
                  <div style={{ background: "#ffebee", padding: "12px", borderRadius: "6px", minWidth: "120px", flex: 1 }}>
                    <h6 style={{ margin: "0 0 5px 0", fontSize: "12px", color: "#c62828", textTransform: "uppercase" }}>Late</h6>
                    <p style={{ fontSize: "18px", fontWeight: "bold", margin: 0, color: "#c62828" }}>
                      {memberKPIs.lateTasks}
                    </p>
                  </div>
                  <div style={{ background: "#f3e5f5", padding: "12px", borderRadius: "6px", minWidth: "120px", flex: 1 }}>
                    <h6 style={{ margin: "0 0 5px 0", fontSize: "12px", color: "#7b1fa2", textTransform: "uppercase" }}>Interactions</h6>
                    <p style={{ fontSize: "18px", fontWeight: "bold", margin: 0, color: "#7b1fa2" }}>
                      {memberKPIs.totalInteractions}
                    </p>
                  </div>
                </div>

                {/* Daily Performance Table */}
                {memberMetrics.length > 0 ? (
                  <div style={{ 
                    background: "#fafafa", 
                    padding: "15px",
                    borderRadius: "6px",
                    border: "1px solid #e0e0e0"
                  }}>
                    <h4 style={{ margin: "0 0 15px 0", color: "#333", fontSize: "16px" }}>
                      Daily Performance (Last {memberMetrics.length} Days)
                    </h4>
                    
                    <div style={{ overflowX: "auto", maxHeight: "400px", overflowY: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead style={{ position: "sticky", top: 0, background: "#f5f5f5" }}>
                          <tr>
                            <th style={{ 
                              padding: "10px",
                              borderBottom: "2px solid #ddd",
                              backgroundColor: "#f5f5f5",
                              textAlign: "left",
                              fontWeight: "600",
                              fontSize: "14px"
                            }}>Date</th>
                            <th style={{ 
                              padding: "10px",
                              borderBottom: "2px solid #ddd",
                              backgroundColor: "#f5f5f5",
                              textAlign: "left",
                              fontWeight: "600",
                              fontSize: "14px"
                            }}>Total</th>
                            <th style={{ 
                              padding: "10px",
                              borderBottom: "2px solid #ddd",
                              backgroundColor: "#f5f5f5",
                              textAlign: "left",
                              fontWeight: "600",
                              fontSize: "14px"
                            }}>Completed</th>
                            <th style={{ 
                              padding: "10px",
                              borderBottom: "2px solid #ddd",
                              backgroundColor: "#f5f5f5",
                              textAlign: "left",
                              fontWeight: "600",
                              fontSize: "14px"
                            }}>Pending</th>
                            <th style={{ 
                              padding: "10px",
                              borderBottom: "2px solid #ddd",
                              backgroundColor: "#f5f5f5",
                              textAlign: "left",
                              fontWeight: "600",
                              fontSize: "14px"
                            }}>Late</th>
                            <th style={{ 
                              padding: "10px",
                              borderBottom: "2px solid #ddd",
                              backgroundColor: "#f5f5f5",
                              textAlign: "left",
                              fontWeight: "600",
                              fontSize: "14px"
                            }}>Interactions</th>
                            <th style={{ 
                              padding: "10px",
                              borderBottom: "2px solid #ddd",
                              backgroundColor: "#f5f5f5",
                              textAlign: "left",
                              fontWeight: "600",
                              fontSize: "14px"
                            }}>Rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {memberMetrics.map((metric, index) => (
                            <tr key={index} style={{ 
                              backgroundColor: index % 2 === 0 ? "#ffffff" : "#f9f9f9" 
                            }}>
                              <td style={{ 
                                padding: "10px",
                                borderBottom: "1px solid #eee",
                                fontSize: "13px"
                              }}>{metric.date}</td>
                              <td style={{ 
                                padding: "10px",
                                borderBottom: "1px solid #eee",
                                fontSize: "13px"
                              }}>{metric.totalTasks || 0}</td>
                              <td style={{ 
                                padding: "10px",
                                borderBottom: "1px solid #eee",
                                color: "#2e7d32",
                                fontWeight: "500",
                                fontSize: "13px"
                              }}>{metric.completed || 0}</td>
                              <td style={{ 
                                padding: "10px",
                                borderBottom: "1px solid #eee",
                                fontSize: "13px"
                              }}>{(metric.totalTasks || 0) - (metric.completed || 0)}</td>
                              <td style={{ 
                                padding: "10px",
                                borderBottom: "1px solid #eee",
                                color: (metric.late || 0) > 0 ? "#c62828" : "#666",
                                fontWeight: (metric.late || 0) > 0 ? "500" : "normal",
                                fontSize: "13px"
                              }}>{metric.late || 0}</td>
                              <td style={{ 
                                padding: "10px",
                                borderBottom: "1px solid #eee",
                                fontSize: "13px"
                              }}>{metric.clientInteractions || 0}</td>
                              <td style={{ 
                                padding: "10px",
                                borderBottom: "1px solid #eee",
                                color: "#2196f3",
                                fontWeight: "500",
                                fontSize: "13px"
                              }}>{(metric.totalTasks || 0) > 0 ? Math.round(((metric.completed || 0) / metric.totalTasks) * 100) : 0}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Individual Performance Insights */}
                    <div style={{ 
                      marginTop: "15px",
                      padding: "15px",
                      background: "white",
                      borderRadius: "6px",
                      border: "1px solid #e0e0e0"
                    }}>
                      <h5 style={{ margin: "0 0 10px 0", color: "#333", fontSize: "14px" }}>Performance Insights</h5>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px" }}>
                        {memberKPIs.completionRate >= 90 && (
                          <div style={{ color: "#2e7d32", fontWeight: "500" }}>
                            ✅ {username} is performing excellently with {memberKPIs.completionRate}% completion rate
                          </div>
                        )}
                        {memberKPIs.completionRate >= 70 && memberKPIs.completionRate < 90 && (
                          <div style={{ color: "#f57c00", fontWeight: "500" }}>
                            📈 {username} is performing well ({memberKPIs.completionRate}%) but has room for improvement
                          </div>
                        )}
                        {memberKPIs.completionRate < 70 && memberKPIs.totalTasks > 0 && (
                          <div style={{ color: "#c62828", fontWeight: "500" }}>
                            ⚠️ {username} may need support - completion rate is {memberKPIs.completionRate}%
                          </div>
                        )}
                        {memberKPIs.lateTasks > 0 && (
                          <div style={{ color: "#c62828" }}>
                            ⏰ {memberKPIs.lateTasks} late task(s) - consider workload review
                          </div>
                        )}
                        {memberKPIs.lateTasks === 0 && memberKPIs.totalTasks > 0 && (
                          <div style={{ color: "#2e7d32" }}>
                            🎯 No late tasks - excellent time management
                          </div>
                        )}
                        {memberKPIs.totalInteractions > 0 && (
                          <div style={{ color: "#1976d2" }}>
                            💬 {memberKPIs.totalInteractions} client interactions - good engagement
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ 
                    textAlign: "center",
                    padding: "30px",
                    color: "#666",
                    background: "#fafafa",
                    borderRadius: "6px"
                  }}>
                    <p>No daily performance data available for {username}</p>
                    <p style={{ fontSize: "14px" }}>Data will appear once this team member starts submitting metrics.</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
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
          <p>Loading team performance data...</p>
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
          <h3 style={{ margin: "0 0 10px 0" }}>Unable to Load Team Data</h3>
          <p style={{ marginBottom: "15px" }}>{error}</p>
          <button 
            onClick={fetchProjectManagerMetrics}
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

  return (
    <div style={{ padding: "20px" }}>
      <h2 style={{ marginBottom: "20px", color: "#333" }}>
        <i className="fas fa-chart-line mr-2"></i> Performance Analysis - Project Manager Overview
      </h2>
      
      {/* Subsection Navigation */}
      <div style={{ 
        marginBottom: "20px",
        display: "flex",
        gap: "10px",
        borderBottom: "1px solid #eee",
        paddingBottom: "10px"
      }}>
        {subSections.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSubSection(section.id)}
            style={{
              padding: "12px 20px",
              border: "none",
              backgroundColor: activeSubSection === section.id ? "#2196f3" : "#f5f5f5",
              color: activeSubSection === section.id ? "white" : "#333",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: activeSubSection === section.id ? "600" : "normal",
              transition: "all 0.2s ease",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}
            onMouseOver={e => {
              if (activeSubSection !== section.id) {
                e.target.style.backgroundColor = "#e0e0e0";
              }
            }}
            onMouseOut={e => {
              if (activeSubSection !== section.id) {
                e.target.style.backgroundColor = "#f5f5f5";
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
      {activeSubSection === 'data' && renderDataSection()}
      {activeSubSection === 'individual-charts' && renderIndividualChartsSection()}
      {activeSubSection === 'individual-data' && renderIndividualDataSection()}
    </div>
  );
}