import { useState, useCallback } from 'react';
import axios from 'axios';

const API_BASE_URL = 'http://localhost:5001/api';

export const useMailbox = () => {
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchEmails = useCallback(async (folder) => {
    setLoading(true);
    try {
      const email = localStorage.getItem('userEmail'); // Get logged in user's email
      const token = localStorage.getItem('token'); // Get auth token
      
      const response = await axios.get(`${API_BASE_URL}/emails/${folder}`, {
        params: { email },
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      setEmails(response.data);
      setError(null);
    } catch (err) {
      setError(err.message);
      setEmails([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const sendEmail = useCallback(async (emailData) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_BASE_URL}/emails/send`, emailData, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, []);

  const searchEmails = useCallback(async (query, folder) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const email = localStorage.getItem('userEmail');
      
      const response = await axios.get(`${API_BASE_URL}/emails/search`, {
        params: { query, folder, email },
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      setEmails(response.data);
      setError(null);
    } catch (err) {
      setError(err.message);
      setEmails([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    emails,
    loading,
    error,
    fetchEmails,
    sendEmail,
    searchEmails
  };
};