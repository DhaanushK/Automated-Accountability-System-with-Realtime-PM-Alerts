import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import './SeverityDistribution.css';

const SeverityDistribution = ({ data }) => {
  const COLORS = {
    'Critical': '#dc2626',
    'High': '#f59e0b',
    'Medium': '#3b82f6',
    'Low': '#10b981'
  };

  const RADIAN = Math.PI / 180;
  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text 
        x={x} 
        y={y} 
        fill="white" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central"
        fontSize="14"
        fontWeight="600"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      return (
        <div className="custom-tooltip">
          <p className="tooltip-label">{data.name}</p>
          <p className="tooltip-value">Count: {data.value}</p>
          <p className="tooltip-value">Percentage: {((data.value / data.payload.total) * 100).toFixed(1)}%</p>
        </div>
      );
    }
    return null;
  };

  // Calculate total for percentage
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const dataWithTotal = data.map(item => ({ ...item, total }));

  return (
    <div className="severity-distribution">
      <div className="severity-header">
        <h3>Ticket Distribution by Severity</h3>
        <span className="total-count">Total: {total}</span>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={dataWithTotal}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={renderCustomizedLabel}
            outerRadius={100}
            fill="#8884d8"
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[entry.name] || '#6b7280'} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            verticalAlign="bottom" 
            height={36}
            formatter={(value, entry) => `${value}: ${entry.payload.value}`}
          />
        </PieChart>
      </ResponsiveContainer>

      <div className="severity-list">
        {data.map((item, index) => (
          <div key={index} className="severity-item">
            <div className="severity-bar-container">
              <div className="severity-info">
                <span className="severity-dot" style={{ backgroundColor: COLORS[item.name] }}></span>
                <span className="severity-name">{item.name}</span>
              </div>
              <span className="severity-count">{item.value}</span>
            </div>
            <div className="severity-progress">
              <div 
                className="severity-progress-bar" 
                style={{ 
                  width: `${(item.value / total) * 100}%`,
                  backgroundColor: COLORS[item.name]
                }}
              ></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SeverityDistribution;
