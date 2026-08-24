import axios from 'axios';

const API_BASE_URL = 'http://localhost:5001/api';

class EmailService {
  constructor() {
    this.api = axios.create({
      baseURL: API_BASE_URL,
    });

    // Add request interceptor to include auth token
    this.api.interceptors.request.use((config) => {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
  }

  async getInbox(email) {
    try {
      const response = await this.api.get(`/emails/inbox`, { params: { email } });
      return response.data;
    } catch (error) {
      console.error('Error fetching inbox:', error);
      throw error;
    }
  }

  async getSentEmails(email) {
    try {
      const response = await this.api.get(`/emails/sent`, { params: { email } });
      return response.data;
    } catch (error) {
      console.error('Error fetching sent emails:', error);
      throw error;
    }
  }

  async sendEmail(emailData) {
    try {
      const response = await this.api.post(`/emails/send`, emailData);
      return response.data;
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }

  async searchEmails(query, folder, email) {
    try {
      const response = await this.api.get(`/emails/search`, {
        params: { query, folder, email }
      });
      return response.data;
    } catch (error) {
      console.error('Error searching emails:', error);
      throw error;
    }
  }

  async checkEmailConnection() {
    try {
      const response = await this.api.get(`/pm-email/test-connection`);
      return response.data;
    } catch (error) {
      console.error('Error checking email connection:', error);
      throw error;
    }
  }
}

export default new EmailService();