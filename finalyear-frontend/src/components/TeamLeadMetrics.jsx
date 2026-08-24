import { useState, useEffect } from 'react';
import axios from '../config/axios';

const styles = {
  container: {
    padding: '20px'
  },
  gridContainer: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "20px",
    marginBottom: "30px"
  },
  card: {
    background: "white",
    padding: "20px",
    borderRadius: "8px",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
  },
  cardTitle: {
    margin: "0 0 10px 0",
    color: "#333"
  },
  tableHeader: {
    backgroundColor: "#f8f9fa",
    padding: "12px 15px",
    textAlign: "left",
    borderBottom: "2px solid #dee2e6",
    color: "#333"
  },
  tableCell: {
    padding: "12px 15px",
    borderBottom: "1px solid #dee2e6",
    color: "#666"
  },
  errorMessage: {
    color: 'red',
    padding: '20px',
    backgroundColor: '#fff3f3',
    borderRadius: '4px',
    marginBottom: '20px'
  }
};

export default function TeamLeadMetrics() {
  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    const fetchTeamLeadMetrics = async () => {
      try {
        const token = localStorage.getItem('token');
        const username = localStorage.getItem('userName');
        
        const response = await axios.get('/api/metrics/user', {
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.data.metrics || response.data.metrics.length === 0) {
          console.warn('No metrics data received');
        }
        
        setMetrics(response.data.metrics || []);
        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    };

    fetchTeamLeadMetrics();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  // Calculate metrics summary
  const calculateSummary = () => {
    if (!Array.isArray(metrics)) {
      return {
        totalTasks: 0,
        completedTasks: 0,
        pendingTasks: 0,
        lateTasks: 0,
        completionRate: 0,
        lateRate: 0
      };
    }

    // Use simple for loop
    let totalTasks = 0;
    let completedTasks = 0;
    let lateTasks = 0;
    
    for (let i = 0; i < metrics.length; i++) {
      const m = metrics[i];
      totalTasks += m.totalTasks || 0;
      completedTasks += m.completed || 0;
      lateTasks += m.late || 0;
    }
    
    const pendingTasks = totalTasks - completedTasks;
    
    return {
      totalTasks,
      completedTasks,
      pendingTasks,
      lateTasks,
      completionRate: totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0,
      lateRate: totalTasks ? Math.round((lateTasks / totalTasks) * 100) : 0
    };
  };

  const summary = calculateSummary();

  return (
    <div>
    </div>
  );
}

