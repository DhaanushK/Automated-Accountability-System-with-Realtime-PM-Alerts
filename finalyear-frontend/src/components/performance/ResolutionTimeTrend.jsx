import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';
import './ResolutionTimeTrend.css';

const ResolutionTimeTrend = ({ data, showMovingAverage = true }) => {
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="custom-tooltip">
          <p className="tooltip-label">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="tooltip-value" style={{ color: entry.color }}>
              {entry.name}: {entry.value.toFixed(2)}h
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="resolution-time-trend">
      <div className="trend-header">
        <h3>Resolution Time Trend</h3>
        <div className="trend-legend">
          <span className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: '#3b82f6' }}></span>
            Avg Resolution Time
          </span>
          {showMovingAverage && (
            <span className="legend-item">
              <span className="legend-dot" style={{ backgroundColor: '#10b981' }}></span>
              7-Day Moving Avg
            </span>
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={350}>
        <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorResolution" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis 
            dataKey="date" 
            tick={{ fontSize: 12 }}
            tickFormatter={(value) => {
              // Format date to show only day/month
              const date = new Date(value);
              return `${date.getDate()}/${date.getMonth() + 1}`;
            }}
          />
          <YAxis 
            tick={{ fontSize: 12 }}
            label={{ value: 'Hours', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area 
            type="monotone" 
            dataKey="avgResolutionTime" 
            stroke="#3b82f6" 
            fillOpacity={1} 
            fill="url(#colorResolution)"
            name="Avg Resolution Time"
            strokeWidth={2}
          />
          {showMovingAverage && (
            <Line 
              type="monotone" 
              dataKey="movingAverage" 
              stroke="#10b981" 
              strokeWidth={2}
              dot={false}
              name="7-Day Moving Avg"
            />
          )}
        </AreaChart>
      </ResponsiveContainer>

      <div className="trend-stats">
        <div className="stat-item">
          <span className="stat-label">Current Avg</span>
          <span className="stat-value">
            {data.length > 0 ? data[data.length - 1].avgResolutionTime.toFixed(2) : 0}h
          </span>
        </div>
        <div className="stat-divider"></div>
        <div className="stat-item">
          <span className="stat-label">Best</span>
          <span className="stat-value" style={{ color: '#10b981' }}>
            {data.length > 0 ? Math.min(...data.map(d => d.avgResolutionTime)).toFixed(2) : 0}h
          </span>
        </div>
        <div className="stat-divider"></div>
        <div className="stat-item">
          <span className="stat-label">Worst</span>
          <span className="stat-value" style={{ color: '#ef4444' }}>
            {data.length > 0 ? Math.max(...data.map(d => d.avgResolutionTime)).toFixed(2) : 0}h
          </span>
        </div>
      </div>
    </div>
  );
};

export default ResolutionTimeTrend;
