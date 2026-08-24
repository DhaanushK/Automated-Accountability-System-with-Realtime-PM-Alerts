import React, { useState, useEffect } from 'react';
import axios from 'axios';
import PerformanceKPICards from '../components/performance/PerformanceKPICards';
import AgentPerformanceChart from '../components/performance/AgentPerformanceChart';
import SLAComplianceGauge from '../components/performance/SLAComplianceGauge';
import SeverityDistribution from '../components/performance/SeverityDistribution';
import ResolutionTimeTrend from '../components/performance/ResolutionTimeTrend';
import AgentPerformanceTable from '../components/performance/AgentPerformanceTable';
import TicketStatusBoard from '../components/performance/TicketStatusBoard';
import './SupportPerformanceDashboard.css';

const SupportPerformanceDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [dateRange, setDateRange] = useState('30'); // days

  useEffect(() => {
    fetchDashboardData();
  }, [dateRange]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      // Replace with your actual API endpoint
      const response = await axios.get(`/api/performance/dashboard?days=${dateRange}`);
      setDashboardData(response.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      // Use mock data for demonstration
      setDashboardData(getMockData());
    } finally {
      setLoading(false);
    }
  };

  const getMockData = () => {
    return {
      kpiMetrics: {
        totalTickets: 197,
        resolvedTickets: 168,
        slaCompliance: 85.3,
        avgResolutionTime: 22.5,
        criticalTickets: 23,
        pendingTickets: 29
      },
      slaData: {
        compliance: 85.3,
        totalTickets: 197,
        slaMet: 168,
        slaBreached: 29
      },
      statusData: {
        open: 45,
        inProgress: 32,
        resolved: 168,
        pending: 20
      },
      severityData: [
        { name: 'Critical', value: 23 },
        { name: 'High', value: 54 },
        { name: 'Medium', value: 78 },
        { name: 'Low', value: 42 }
      ],
      agentPerformance: [
        {
          name: 'Sarah Johnson',
          ticketsResolved: 45,
          avgResolutionTime: 18.5,
          slaCompliance: 92,
          criticalTickets: 8,
          carryForward: 2,
          performanceScore: 87,
          rank: 1
        },
        {
          name: 'Mike Chen',
          ticketsResolved: 42,
          avgResolutionTime: 20.3,
          slaCompliance: 88,
          criticalTickets: 6,
          carryForward: 3,
          performanceScore: 84,
          rank: 2
        },
        {
          name: 'Emily Rodriguez',
          ticketsResolved: 38,
          avgResolutionTime: 22.1,
          slaCompliance: 85,
          criticalTickets: 5,
          carryForward: 4,
          performanceScore: 79,
          rank: 3
        },
        {
          name: 'David Kim',
          ticketsResolved: 35,
          avgResolutionTime: 24.8,
          slaCompliance: 81,
          criticalTickets: 4,
          carryForward: 5,
          performanceScore: 74,
          rank: 4
        },
        {
          name: 'Lisa Anderson',
          ticketsResolved: 8,
          avgResolutionTime: 28.5,
          slaCompliance: 75,
          criticalTickets: 0,
          carryForward: 6,
          performanceScore: 68,
          rank: 5
        }
      ],
      trendData: Array.from({ length: 30 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (29 - i));
        const randomVariation = Math.random() * 10 - 5;
        const baseTime = 22 + randomVariation;
        return {
          date: date.toISOString().split('T')[0],
          avgResolutionTime: Math.max(10, baseTime),
          movingAverage: 22 + Math.sin(i / 5) * 3
        };
      })
    };
  };

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="spinner"></div>
        <p>Loading Performance Dashboard...</p>
      </div>
    );
  }

  return (
    <div className="support-performance-dashboard">
      <div className="dashboard-header">
        <div className="header-content">
          <h1>Support Team Performance Dashboard</h1>
          <p className="header-subtitle">Real-time analytics and performance metrics</p>
        </div>
        <div className="header-controls">
          <select 
            value={dateRange} 
            onChange={(e) => setDateRange(e.target.value)}
            className="date-range-select"
          >
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
            <option value="365">Last Year</option>
          </select>
          <button className="refresh-btn" onClick={fetchDashboardData}>
            🔄 Refresh
          </button>
          <button className="export-btn">
            📊 Export Report
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <section className="dashboard-section">
        <PerformanceKPICards metrics={dashboardData.kpiMetrics} />
      </section>

      {/* Status Board and SLA Gauge */}
      <section className="dashboard-section">
        <div className="two-column-grid">
          <TicketStatusBoard statusData={dashboardData.statusData} />
          <SLAComplianceGauge {...dashboardData.slaData} />
        </div>
      </section>

      {/* Agent Performance Chart */}
      <section className="dashboard-section">
        <AgentPerformanceChart data={dashboardData.agentPerformance} />
      </section>

      {/* Severity and Trend */}
      <section className="dashboard-section">
        <div className="two-column-grid">
          <SeverityDistribution data={dashboardData.severityData} />
          <ResolutionTimeTrend data={dashboardData.trendData} />
        </div>
      </section>

      {/* Detailed Agent Table */}
      <section className="dashboard-section">
        <AgentPerformanceTable data={dashboardData.agentPerformance} />
      </section>
    </div>
  );
};

export default SupportPerformanceDashboard;
