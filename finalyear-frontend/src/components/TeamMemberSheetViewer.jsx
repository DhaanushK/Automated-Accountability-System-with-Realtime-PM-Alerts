import React, { useState, useEffect } from 'react';
import axios from '../config/axios';

const TeamMemberSheetViewer = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [sheetData, setSheetData] = useState({ headers: [], data: [] });
  const [error, setError] = useState(null);
  const spreadsheetId = '1KDj8ixj9oF5jSFEh-KXakLgJXjTwkgXn8uiHdxajaOc';

  useEffect(() => {
    const storedUserName = localStorage.getItem('userName');
    if (storedUserName) {
      setUserName(storedUserName);
      fetchSheetData();
    } else {
      setError('User name not found. Please log in again.');
      setIsLoading(false);
    }
  }, []);

  const fetchSheetData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/users/sheet-data', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setSheetData({
          headers: response.data.headers || [],
          data: response.data.data || []
        });
        setUserName(response.data.sheetName);
        console.log(`Loaded ${response.data.totalRows} rows for ${response.data.sheetName}`);
      } else {
        setError(response.data.message || 'Failed to load sheet data');
      }
    } catch (err) {
      console.error('Error fetching sheet data:', err);
      setError(
        err.response?.data?.message || 
        'Unable to load your sheet data. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const getEditUrl = () => {
    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  };

  const handleRefresh = () => {
    fetchSheetData();
  };

  return (
    <div style={{ 
      padding: '0 0 24px 0',
      maxWidth: '100%',
      margin: '0 auto'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
        backgroundColor: '#fff',
        padding: '16px 20px',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div>
          <h2 style={{
            fontSize: '20px',
            color: '#1a1a1a',
            margin: '0 0 4px 0',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <i className="fas fa-table" style={{ color: '#1976d2' }}></i>
            My Ticket Data
          </h2>
          <p style={{
            fontSize: '13px',
            color: '#666',
            margin: 0
          }}>
            {userName ? `Viewing ${sheetData.data.length} ticket(s) for ${userName}` : 'View your ticket data'}
          </p>
        </div>
        <div style={{
          display: 'flex',
          gap: '12px'
        }}>
          <a 
            href={getEditUrl()}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '10px 18px',
              backgroundColor: '#1976d2',
              color: 'white',
              borderRadius: '6px',
              textDecoration: 'none',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'background-color 0.2s',
              fontWeight: '500',
              boxShadow: '0 2px 4px rgba(25,118,210,0.2)'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#1565c0'}
            onMouseOut={(e) => e.target.style.backgroundColor = '#1976d2'}
          >
            <i className="fas fa-external-link-alt"></i>
            Open in Google Sheets
          </a>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            style={{
              padding: '10px 18px',
              backgroundColor: '#f5f5f5',
              color: '#333',
              border: '1px solid #ddd',
              borderRadius: '6px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s',
              fontWeight: '500',
              opacity: isLoading ? 0.6 : 1
            }}
            onMouseOver={(e) => {
              if (!isLoading) {
                e.target.style.backgroundColor = '#ebebeb';
                e.target.style.borderColor = '#ccc';
              }
            }}
            onMouseOut={(e) => {
              if (!isLoading) {
                e.target.style.backgroundColor = '#f5f5f5';
                e.target.style.borderColor = '#ddd';
              }
            }}
          >
            <i className={isLoading ? "fas fa-spinner fa-spin" : "fas fa-sync-alt"}></i>
            Refresh
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div style={{
          backgroundColor: '#fff',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          padding: '40px',
          textAlign: 'center'
        }}>
          <i className="fas fa-exclamation-circle" style={{ fontSize: '48px', color: '#f44336', marginBottom: '20px' }}></i>
          <h3 style={{ color: '#333', marginBottom: '10px' }}>Unable to Load Data</h3>
          <p style={{ color: '#666', marginBottom: '20px' }}>{error}</p>
          <button
            onClick={handleRefresh}
            style={{
              padding: '10px 20px',
              backgroundColor: '#1976d2',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#1565c0'}
            onMouseOut={(e) => e.target.style.backgroundColor = '#1976d2'}
          >
            <i className="fas fa-redo" style={{ marginRight: '8px' }}></i>
            Try Again
          </button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && !error && (
        <div style={{
          backgroundColor: '#fff',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          padding: '60px',
          textAlign: 'center'
        }}>
          <div style={{
            display: 'inline-block',
            width: '50px',
            height: '50px',
            border: '4px solid #f3f3f3',
            borderTop: '4px solid #1976d2',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }}></div>
          <p style={{
            marginTop: '20px',
            color: '#666',
            fontSize: '14px'
          }}>
            Loading your ticket data...
          </p>
        </div>
      )}

      {/* Data Table */}
      {!isLoading && !error && (
        <div style={{
          backgroundColor: '#fff',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          overflow: 'hidden'
        }}>
          {sheetData.data.length === 0 ? (
            <div style={{
              padding: '60px',
              textAlign: 'center'
            }}>
              <i className="fas fa-inbox" style={{ fontSize: '48px', color: '#bbb', marginBottom: '20px' }}></i>
              <h3 style={{ color: '#666', marginBottom: '10px' }}>No Tickets Yet</h3>
              <p style={{ color: '#999', fontSize: '14px' }}>
                You haven't submitted any tickets yet. Submit your first ticket from the Dashboard tab.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '13px'
              }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa' }}>
                    {sheetData.headers.map((header, index) => (
                      <th
                        key={index}
                        style={{
                          padding: '14px 12px',
                          textAlign: 'left',
                          fontWeight: '600',
                          color: '#1a1a1a',
                          borderBottom: '2px solid #e0e0e0',
                          whiteSpace: 'nowrap',
                          position: 'sticky',
                          top: 0,
                          backgroundColor: '#f8f9fa',
                          zIndex: 1
                        }}
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheetData.data.map((row, rowIndex) => (
                    <tr
                      key={rowIndex}
                      style={{
                        borderBottom: '1px solid #f0f0f0',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                      onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      {row.map((cell, cellIndex) => (
                        <td
                          key={cellIndex}
                          style={{
                            padding: '12px',
                            color: '#333',
                            whiteSpace: 'nowrap',
                            maxWidth: '200px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                          title={cell} // Show full text on hover
                        >
                          {cell || '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!error && !isLoading && sheetData.data.length > 0 && (
        <div style={{
          marginTop: '16px',
          padding: '12px 16px',
          backgroundColor: '#e8f5e9',
          borderLeft: '4px solid #4caf50',
          borderRadius: '4px'
        }}>
          <p style={{
            margin: 0,
            fontSize: '13px',
            color: '#2e7d32',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <i className="fas fa-check-circle"></i>
            <span>
              Successfully loaded <strong>{sheetData.data.length} ticket(s)</strong> for <strong>{userName}</strong>. 
              This data is exclusive to your account.
            </span>
          </p>
        </div>
      )}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default TeamMemberSheetViewer;
