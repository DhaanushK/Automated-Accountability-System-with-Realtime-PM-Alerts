import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import './SLAComplianceGauge.css';

const SLAComplianceGauge = ({ compliance, totalTickets, slaMet, slaBreached }) => {
  const complianceValue = parseFloat(compliance) || 0;
  
  // Data for gauge chart
  const data = [
    { name: 'Compliance', value: complianceValue },
    { name: 'Remaining', value: 100 - complianceValue }
  ];

  // Color based on compliance
  const getColor = () => {
    if (complianceValue >= 90) return '#10b981';
    if (complianceValue >= 70) return '#f59e0b';
    return '#ef4444';
  };

  const getStatus = () => {
    if (complianceValue >= 90) return { text: 'Excellent', emoji: '🎉' };
    if (complianceValue >= 70) return { text: 'Good', emoji: '👍' };
    return { text: 'Needs Improvement', emoji: '⚠️' };
  };

  const status = getStatus();
  const color = getColor();

  return (
    <div className="sla-compliance-gauge">
      <div className="gauge-header">
        <h3>SLA Compliance Rate</h3>
        <span className="status-badge" style={{ backgroundColor: color }}>
          {status.emoji} {status.text}
        </span>
      </div>

      <div className="gauge-container">
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              startAngle={180}
              endAngle={0}
              innerRadius={80}
              outerRadius={110}
              paddingAngle={0}
              dataKey="value"
            >
              <Cell fill={color} />
              <Cell fill="#e5e7eb" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        <div className="gauge-center-text">
          <div className="compliance-value" style={{ color }}>
            {complianceValue.toFixed(1)}%
          </div>
          <div className="compliance-label">Compliance</div>
        </div>
      </div>

      <div className="sla-breakdown">
        <div className="sla-item">
          <span className="sla-dot" style={{ backgroundColor: '#10b981' }}></span>
          <div className="sla-info">
            <div className="sla-label">SLA Met</div>
            <div className="sla-value">{slaMet}</div>
          </div>
        </div>
        <div className="sla-divider"></div>
        <div className="sla-item">
          <span className="sla-dot" style={{ backgroundColor: '#ef4444' }}></span>
          <div className="sla-info">
            <div className="sla-label">SLA Breached</div>
            <div className="sla-value">{slaBreached}</div>
          </div>
        </div>
        <div className="sla-divider"></div>
        <div className="sla-item">
          <span className="sla-dot" style={{ backgroundColor: '#3b82f6' }}></span>
          <div className="sla-info">
            <div className="sla-label">Total Tickets</div>
            <div className="sla-value">{totalTickets}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SLAComplianceGauge;
