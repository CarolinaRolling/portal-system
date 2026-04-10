import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';

// Import both dashboards
import Dashboard from './pages/Dashboard';
import VendorDashboard from './pages/VendorDashboard';
import VendorPODetails from './pages/VendorPODetails';
import Login from './pages/Login';
import AdminPanel from './pages/AdminPanel';

// Import vendor-specific pages (create these as needed)
// import VendorIssues from './pages/VendorIssues';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('token');
    
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      const response = await axios.get('/api/auth/me');
      setUser(response.data);
      console.log('â User authenticated:', response.data);
    } catch (error) {
      console.error('â Auth check failed:', error);
      localStorage.removeItem('token');
      delete axios.defaults.headers.common['Authorization'];
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh'
      }}>
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        {/* Login Route */}
        <Route 
          path="/login" 
          element={!user ? <Login /> : <Navigate to="/dashboard" replace />} 
        />

        {/* Client Portal Routes */}
        <Route
          path="/dashboard"
          element={
            user ? (
              // If vendor-only user, redirect to vendor portal
              user.isVendor && user.role !== 'admin' ? (
                <Navigate to="/vendor/dashboard" replace />
              ) : (
                <Dashboard user={user} />
              )
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="/admin"
          element={
            user && user.role === 'admin' ? (
              <AdminPanel user={user} />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />

        {/* Vendor Portal Routes */}
        <Route
          path="/vendor/dashboard"
          element={
            user && user.isVendor ? (
              <VendorDashboard user={user} />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />

        <Route
          path="/vendor/po/:poNumber"
          element={
            user && user.isVendor ? (
              <VendorPODetails user={user} />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />

        {/* Add more vendor routes as needed */}
        {/* <Route path="/vendor/issues" element={<VendorIssues user={user} />} /> */}

        {/* Root redirect */}
        <Route
          path="/"
          element={
            user ? (
              // Vendor-only users go to vendor portal
              user.isVendor && user.role !== 'admin' ? (
                <Navigate to="/vendor/dashboard" replace />
              ) : (
                // Everyone else goes to client portal
                <Navigate to="/dashboard" replace />
              )
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* Catch all - redirect to login */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
