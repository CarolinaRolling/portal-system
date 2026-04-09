import axios from 'axios';
import { getToken } from './auth';

//const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const API_URL = process.env.REACT_APP_API_URL || (
  window.location.hostname === 'localhost' 
    ? 'http://localhost:5000/api'
    : '/api'
);

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to requests
api.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle response errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth APIs
export const login = (username, password) => 
  api.post('/auth/login', { username, password });

export const register = (userData) => 
  api.post('/auth/register', userData);

// Order APIs
export const getOrders = () => 
  api.get('/orders');

export const getOrder = (id) => 
  api.get(`/orders/${id}`);

export const createOrder = (orderData) => 
  api.post('/orders', orderData);

export const deleteOrder = (id) => 
  api.delete(`/orders/${id}`);

// Admin APIs
export const getUsers = () => 
  api.get('/admin/users');

export const updateUser = (id, userData) => 
  api.put(`/admin/users/${id}`, userData);

export const changeUserPassword = (id, newPassword) =>
  api.put(`/admin/users/${id}/password`, { new_password: newPassword });

export const generatePassword = () =>
  api.get('/admin/generate-password');

export const getRecipients = () => 
  api.get('/admin/recipients');

export const addRecipient = (email) => 
  api.post('/admin/recipients', { email });

export const deleteRecipient = (id) => 
  api.delete(`/admin/recipients/${id}`);

export const getSettings = () => 
  api.get('/admin/settings');

export const updateSettings = (settings) => 
  api.put('/admin/settings', settings);

export const triggerStatusCheck = () => 
  api.post('/admin/check-statuses');

export default api;
