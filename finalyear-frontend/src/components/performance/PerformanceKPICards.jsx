import React from 'react';
import './PerformanceKPICards.css';

const PerformanceKPICards = ({ metrics }) => {
  const {
    totalTickets = 0,
    resolvedTickets = 0,
    slaCompliance = 0,
    avgResolutionTime = 0,
    criticalTickets = 0,
    pendingTickets = 0
  } = metrics;

  const getComplianceColor = (compliance) => {
    if (compliance >= 90) return '#10b981'; // Green
    if (compliance >= 70) return '#f59e0b'; // Yellow
    return '#ef4444'; // Red
  };

  const cards = [
    {
      title: 'Total Tickets',
      value: totalTickets,
      icon: '🎫',
      trend: '+12%',
      trendUp: true
    },
    {
      title: 'Resolved',
      value: resolvedTickets,
      icon: '✅',
      subtitle: `${totalTickets > 0 ? ((resolvedTickets / totalTickets) * 100).toFixed(1) : 0}% resolution rate`
    },
    {
      title: 'SLA Compliance',
      value: `${slaCompliance.toFixed(1)}%`,
      icon: '🎯',
      color: getComplianceColor(slaCompliance),
      subtitle: slaCompliance >= 90 ? 'Excellent' : slaCompliance >= 70 ? 'Good' : 'Needs Improvement'
    },
    {
      title: 'Avg Resolution Time',
      value: `${avgResolutionTime.toFixed(1)}h`,
      icon: '⏱️',
      subtitle: 'Hours to resolve'
    },
    {
      title: 'Critical Tickets',
      value: criticalTickets,
      icon: '🔴',
      color: criticalTickets > 10 ? '#ef4444' : '#6b7280'
    },
    {
      title: 'Pending',
      value: pendingTickets,
      icon: '⏳',
      color: pendingTickets > 20 ? '#f59e0b' : '#6b7280'
    }
  ];

  return (
    <div className="kpi-cards-container">
      {cards.map((card, index) => (
        <div key={index} className="kpi-card" style={{ borderTop: `4px solid ${card.color || '#3b82f6'}` }}>
          <div className="kpi-card-header">
            <span className="kpi-icon">{card.icon}</span>
            <span className="kpi-title">{card.title}</span>
          </div>
          <div className="kpi-value" style={{ color: card.color || '#1f2937' }}>
            {card.value}
          </div>
          {card.subtitle && (
            <div className="kpi-subtitle">{card.subtitle}</div>
          )}
          {card.trend && (
            <div className={`kpi-trend ${card.trendUp ? 'trend-up' : 'trend-down'}`}>
              {card.trendUp ? '↑' : '↓'} {card.trend}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default PerformanceKPICards;
