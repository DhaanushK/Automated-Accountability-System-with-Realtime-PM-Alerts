import React from 'react';
import './TicketStatusBoard.css';

const TicketStatusBoard = ({ statusData }) => {
  const { open = 0, inProgress = 0, resolved = 0, pending = 0 } = statusData;

  const total = open + inProgress + resolved + pending;

  const boards = [
    {
      title: 'Open',
      count: open,
      icon: '📥',
      color: '#3b82f6',
      bgColor: '#dbeafe'
    },
    {
      title: 'In Progress',
      count: inProgress,
      icon: '⚙️',
      color: '#f59e0b',
      bgColor: '#fef3c7'
    },
    {
      title: 'Resolved',
      count: resolved,
      icon: '✅',
      color: '#10b981',
      bgColor: '#d1fae5'
    },
    {
      title: 'Pending',
      count: pending,
      icon: '⏳',
      color: '#6b7280',
      bgColor: '#f3f4f6'
    }
  ];

  return (
    <div className="ticket-status-board">
      <div className="board-header">
        <h3>Ticket Status Overview</h3>
        <span className="total-badge">Total: {total}</span>
      </div>

      <div className="board-grid">
        {boards.map((board, index) => (
          <div 
            key={index} 
            className="status-card"
            style={{ 
              borderTop: `4px solid ${board.color}`,
              background: `linear-gradient(to bottom, ${board.bgColor}, white)`
            }}
          >
            <div className="status-card-header">
              <span className="status-icon">{board.icon}</span>
              <span className="status-title">{board.title}</span>
            </div>

            <div className="status-count" style={{ color: board.color }}>
              {board.count}
            </div>

            <div className="status-percentage">
              <div className="percentage-bar-bg">
                <div 
                  className="percentage-bar" 
                  style={{ 
                    width: `${total > 0 ? (board.count / total) * 100 : 0}%`,
                    backgroundColor: board.color
                  }}
                ></div>
              </div>
              <span className="percentage-text">
                {total > 0 ? ((board.count / total) * 100).toFixed(1) : 0}%
              </span>
            </div>

            <div className="status-footer">
              <span className="footer-text">of total tickets</span>
            </div>
          </div>
        ))}
      </div>

      <div className="board-summary">
        <div className="summary-item">
          <span className="summary-label">Resolution Rate</span>
          <span className="summary-value" style={{ color: '#10b981' }}>
            {total > 0 ? ((resolved / total) * 100).toFixed(1) : 0}%
          </span>
        </div>
        <div className="summary-divider"></div>
        <div className="summary-item">
          <span className="summary-label">Active Workload</span>
          <span className="summary-value" style={{ color: '#f59e0b' }}>
            {open + inProgress + pending}
          </span>
        </div>
      </div>
    </div>
  );
};

export default TicketStatusBoard;
