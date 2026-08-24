import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import './AgentPerformanceChart.css';

const AgentPerformanceChart = ({ data }) => {
  const [sortBy, setSortBy] = useState('ticketsResolved');

  // Sort data based on selected metric
  const sortedData = [...data].sort((a, b) => b[sortBy] - a[sortBy]);

  // Color scale for performance
  const getBarColor = (value, metric) => {
    if (metric === 'slaCompliance') {
      if (value >= 90) return '#10b981';
      if (value >= 70) return '#f59e0b';
      return '#ef4444';
    }
    return '#3b82f6';
  };

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="custom-tooltip">
          <p className="tooltip-label">{data.name}</p>
          <p className="tooltip-value">Tickets Resolved: {data.ticketsResolved}</p>
          <p className="tooltip-value">Avg Resolution: {data.avgResolutionTime}h</p>
          <p className="tooltip-value">SLA Compliance: {data.slaCompliance}%</p>
          <p className="tooltip-value">Critical: {data.criticalTickets}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="agent-performance-chart">
      <div className="chart-header">
        <h3>Agent Performance Comparison</h3>
        <div className="sort-controls">
          <label>Sort by:</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="ticketsResolved">Tickets Resolved</option>
            <option value="slaCompliance">SLA Compliance</option>
            <option value="avgResolutionTime">Resolution Time</option>
            <option value="criticalTickets">Critical Tickets</option>
          </select>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={sortedData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis 
            dataKey="name" 
            angle={-45} 
            textAnchor="end" 
            height={100}
            tick={{ fontSize: 12 }}
          />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ paddingTop: '20px' }} />
          <Bar dataKey="ticketsResolved" name="Tickets Resolved" fill="#3b82f6" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default AgentPerformanceChart;
