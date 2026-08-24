import React, { useState } from 'react';
import './AgentPerformanceTable.css';

const AgentPerformanceTable = ({ data }) => {
  const [sortConfig, setSortConfig] = useState({ key: 'performanceScore', direction: 'desc' });
  const [searchTerm, setSearchTerm] = useState('');

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedData = [...data].sort((a, b) => {
    if (a[sortConfig.key] < b[sortConfig.key]) {
      return sortConfig.direction === 'asc' ? -1 : 1;
    }
    if (a[sortConfig.key] > b[sortConfig.key]) {
      return sortConfig.direction === 'asc' ? 1 : -1;
    }
    return 0;
  });

  const filteredData = sortedData.filter(agent =>
    agent.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getSLABadge = (compliance) => {
    if (compliance >= 90) return { class: 'badge-success', text: 'Excellent' };
    if (compliance >= 70) return { class: 'badge-warning', text: 'Good' };
    return { class: 'badge-danger', text: 'Low' };
  };

  const getPerformanceColor = (score) => {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#f59e0b';
    return '#ef4444';
  };

  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) {
      return <span className="sort-icon">⇅</span>;
    }
    return (
      <span className="sort-icon active">
        {sortConfig.direction === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  return (
    <div className="agent-performance-table">
      <div className="table-header">
        <h3>Detailed Agent Performance</h3>
        <div className="search-box">
          <input
            type="text"
            placeholder="Search agent..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <span className="search-icon">🔍</span>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th onClick={() => handleSort('rank')}>
                Rank <SortIcon columnKey="rank" />
              </th>
              <th onClick={() => handleSort('name')}>
                Agent Name <SortIcon columnKey="name" />
              </th>
              <th onClick={() => handleSort('ticketsResolved')}>
                Resolved <SortIcon columnKey="ticketsResolved" />
              </th>
              <th onClick={() => handleSort('avgResolutionTime')}>
                Avg Time (h) <SortIcon columnKey="avgResolutionTime" />
              </th>
              <th onClick={() => handleSort('slaCompliance')}>
                SLA % <SortIcon columnKey="slaCompliance" />
              </th>
              <th onClick={() => handleSort('criticalTickets')}>
                Critical <SortIcon columnKey="criticalTickets" />
              </th>
              <th onClick={() => handleSort('carryForward')}>
                Carry Forward <SortIcon columnKey="carryForward" />
              </th>
              <th onClick={() => handleSort('performanceScore')}>
                Score <SortIcon columnKey="performanceScore" />
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((agent, index) => {
              const slaBadge = getSLABadge(agent.slaCompliance);
              return (
                <tr key={index}>
                  <td>
                    <div className="rank-cell">
                      {index === 0 && '🥇'}
                      {index === 1 && '🥈'}
                      {index === 2 && '🥉'}
                      {index > 2 && <span className="rank-number">#{index + 1}</span>}
                    </div>
                  </td>
                  <td className="agent-name-cell">
                    <div className="agent-avatar">
                      {agent.name.charAt(0).toUpperCase()}
                    </div>
                    <span>{agent.name}</span>
                  </td>
                  <td>
                    <span className="metric-value">{agent.ticketsResolved}</span>
                  </td>
                  <td>
                    <span className="metric-value">{agent.avgResolutionTime.toFixed(1)}</span>
                  </td>
                  <td>
                    <span className={`badge ${slaBadge.class}`}>
                      {agent.slaCompliance.toFixed(1)}%
                    </span>
                  </td>
                  <td>
                    <span className="critical-badge">{agent.criticalTickets}</span>
                  </td>
                  <td>
                    <span className={agent.carryForward > 5 ? 'warning-text' : ''}>
                      {agent.carryForward}
                    </span>
                  </td>
                  <td>
                    <div className="score-cell">
                      <div className="score-bar-bg">
                        <div 
                          className="score-bar" 
                          style={{ 
                            width: `${agent.performanceScore}%`,
                            backgroundColor: getPerformanceColor(agent.performanceScore)
                          }}
                        ></div>
                      </div>
                      <span className="score-text">{agent.performanceScore}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredData.length === 0 && (
        <div className="no-results">
          <p>No agents found matching "{searchTerm}"</p>
        </div>
      )}
    </div>
  );
};

export default AgentPerformanceTable;
