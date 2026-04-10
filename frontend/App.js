import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import Dashboard from './pages/Dashboard';
import AdminPanel from './pages/AdminPanel';
import Login from './pages/Login';
import VendorDashboard from './pages/VendorDashboard';
import VendorPODetail from './pages/VendorPODetail';
import VendorIssues from './pages/VendorIssues';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('token');

    if (!token) {
      setIsAuthenticated(false);
      setLoading(false);
      return;
    }

    // Set token in axios headers
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    try {
      // Verify token is valid and get user info
      const response = await axios.get('/api/auth/me');
      setUser(response.data);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('Auth check failed:', error);
      localStorage.removeItem('token');
      delete axios.defaults.headers.common['Authorization'];
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <Router>
      <div className="app">
        <Routes>
          {/* Login Route - same for everyone */}
          <Route path="/login" element={<Login />} />
          
          {/* Client Portal Routes */}
          <Route 
            path="/dashboard" 
            element={isAuthenticated && !user?.isVendor ? <Dashboard user={user} /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/admin" 
            element={isAuthenticated && !user?.isVendor ? <AdminPanel /> : <Navigate to="/login" />} 
          />

          {/* Vendor Portal Routes */}
          <Route 
            path="/vendor/dashboard" 
            element={isAuthenticated && user?.isVendor ? <VendorDashboard /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/vendor/po/:poNumber" 
            element={isAuthenticated && user?.isVendor ? <VendorPODetail /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/vendor/issues" 
            element={isAuthenticated && user?.isVendor ? <VendorIssues /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/vendor/issues/new" 
            element={isAuthenticated && user?.isVendor ? <VendorIssues /> : <Navigate to="/login" />} 
          />
          
          {/* Root redirect based on user type */}
          <Route 
            path="/" 
            element={
              isAuthenticated 
                ? (user?.isVendor ? <Navigate to="/vendor/dashboard" /> : <Navigate to="/dashboard" />) 
                : <Navigate to="/login" />
            } 
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
