import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Login.css';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPortalSelection, setShowPortalSelection] = useState(false);
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await axios.post('/api/auth/login', {
        username: username.trim(),
        password: password
      });

      // Save token
      localStorage.setItem('token', response.data.token);

      // Set default auth header
      axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;

      const userData = response.data.user;
      
      // Check if user has both client and vendor access
      const isClient = !userData.isVendor || userData.role === 'admin' || userData.role === 'user';
      const isVendor = userData.isVendor;
      
      if (isClient && isVendor) {
        // User has BOTH access - show selection
        setUser(userData);
        setShowPortalSelection(true);
        setLoading(false);
      } else if (isVendor) {
        // Vendor only
        localStorage.setItem('vendorName', userData.vendorCompanyName || userData.company_name);
        navigate('/vendor/dashboard');
      } else {
        // Client only
        navigate('/dashboard');
      }

    } catch (err) {
      console.error('Login error:', err);
      setError(err.response?.data?.error || 'Failed to login. Please try again.');
      setLoading(false);
    }
  };

  const selectPortal = (portalType) => {
    if (portalType === 'vendor') {
      localStorage.setItem('vendorName', user.vendorCompanyName || user.company_name);
      navigate('/vendor/dashboard');
    } else {
      navigate('/dashboard');
    }
  };

  if (showPortalSelection) {
    return (
      <div className="login-page">
        <div className="login-container">
          <div className="login-header">
            <img src="/logo.png" alt="Carolina Rolling Co Inc" className="login-logo" />
            <h1>Select Portal</h1>
            <p>Welcome, {user.username}! Choose which portal to access:</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '2rem 0' }}>
            <button 
              onClick={() => selectPortal('client')}
              className="login-button"
              style={{
                padding: '1.5rem',
                fontSize: '1.1rem',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>ð¦</div>
              <div style={{ fontWeight: 'bold' }}>Client Portal</div>
              <div style={{ fontSize: '0.9rem', marginTop: '0.25rem', opacity: 0.9 }}>
                View your orders and estimates
              </div>
            </button>

            <button 
              onClick={() => selectPortal('vendor')}
              className="login-button"
              style={{
                padding: '1.5rem',
                fontSize: '1.1rem',
                background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>ð­</div>
              <div style={{ fontWeight: 'bold' }}>Vendor Portal</div>
              <div style={{ fontSize: '0.9rem', marginTop: '0.25rem', opacity: 0.9 }}>
                Manage purchase orders and deliveries
              </div>
            </button>
          </div>

          <div className="login-footer">
            <p>Carolina Rolling - Order Management</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <img src="/logo.png" alt="Carolina Rolling Co Inc" className="login-logo" />
          <h1>Order Portal</h1>
          <p>Sign in to view your orders</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div className="error-message">
              <span>â ï¸</span>
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>

          <button 
            type="submit" 
            className="login-button"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="login-footer">
          <p>Carolina Rolling - Order Management</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
