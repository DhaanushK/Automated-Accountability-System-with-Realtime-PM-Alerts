import React, { useState, useEffect } from 'react';

const TeamLeadSheetViewer = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const spreadsheetId = '1KDj8ixj9oF5jSFEh-KXakLgJXjTwkgXn8uiHdxajaOc';
  
  // Map team lead names to their sheet gids (tab IDs)
  const sheetGidMap = {
    'praveen': '396619131', // Praveen J A's sheet tab
    'kanishkka': '1584332552', // Kanishkka R's sheet tab
  };

  useEffect(() => {
    // Get the logged-in user's name from localStorage
    const storedUserName = localStorage.getItem('userName');
    if (storedUserName) {
      setUserName(storedUserName);
    }
  }, []);

  // Determine which sheet to show based on the logged-in user
  const getSheetGid = () => {
    const nameLower = userName.toLowerCase();
    if (nameLower.includes('praveen')) {
      return sheetGidMap.praveen;
    } else if (nameLower.includes('kanishkka')) {
      return sheetGidMap.kanishkka;
    }
    return sheetGidMap.praveen; // Default to first sheet
  };

  const sheetGid = getSheetGid();
  const embedUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/preview?gid=${sheetGid}&rm=minimal`;
  const editUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetGid}`;

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
            My Ticket Sheet
          </h2>
          <p style={{
            fontSize: '13px',
            color: '#666',
            margin: 0
          }}>
            View and manage your team's ticket data
          </p>
        </div>
        <div style={{
          display: 'flex',
          gap: '12px'
        }}>
          <a 
            href={editUrl}
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
        </div>
      </div>
      
      <div style={{
        width: '100%',
        height: '600px',
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        overflow: 'hidden',
        backgroundColor: 'white',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
        position: 'relative'
      }}>
        {isLoading && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#666',
            fontSize: '14px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px'
          }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: '24px', color: '#1976d2' }}></i>
            Loading your ticket sheet...
          </div>
        )}
        <iframe
          title="Team Lead Google Sheet"
          src={embedUrl}
          style={{
            width: '100%',
            height: '100%',
            border: 'none'
          }}
          onLoad={() => setIsLoading(false)}
        />
      </div>
      
      <div style={{
        marginTop: '12px',
        padding: '12px 16px',
        backgroundColor: '#f8f9fa',
        borderRadius: '6px',
        borderLeft: '3px solid #1976d2',
        fontSize: '13px',
        color: '#555'
      }}>
        <i className="fas fa-info-circle" style={{ color: '#1976d2', marginRight: '8px' }}></i>
        <strong>Note:</strong> This sheet displays your team's ticket data. You can view it here or open it in Google Sheets for full editing capabilities.
      </div>
    </div>
  );
};

export default TeamLeadSheetViewer;
