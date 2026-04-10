import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Login.css';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginMode, setLoginMode] = useState('client'); // 'client' or 'vendor'
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      console.log(`🔐 LOGIN ATTEMPT (${loginMode} mode):`);
      console.log('Username:', username);
      
      const response = await axios.post('/api/auth/login', {
        username,
        password
      });

      console.log('✅ LOGIN SUCCESSFUL');
      console.log('Response data:', response.data);

      const { token, user: userData } = response.data;

      console.log('👤 USER DATA:');
      console.log('  Username:', userData.username);
      console.log('  Company:', userData.company_name);
      console.log('  Role:', userData.role);
      console.log('  Is Vendor:', userData.isVendor);
      console.log('  Vendor Company:', userData.vendorCompanyName);

      // VALIDATE LOGIN MODE MATCHES USER TYPE
      if (loginMode === 'vendor') {
        // User clicked "Vendor Login" - must be a vendor
        if (!userData.isVendor) {
          console.log('❌ User is not a vendor - rejecting login');
          setError('This account is not a vendor account. Please use Client Login.');
          setLoading(false);
          return;
        }
        console.log('✅ Vendor login validated');
      } else {
        // User clicked "Client Login" - must NOT be vendor-only
        if (userData.isVendor && userData.role !== 'admin') {
          console.log('❌ User is vendor-only - rejecting client login');
          setError('This is a vendor account. Please use Vendor Login.');
          setLoading(false);
          return;
        }
        console.log('✅ Client login validated');
      }

      // Store token
      localStorage.setItem('token', token);
      
      // Store vendor name if vendor
      if (userData.isVendor) {
        localStorage.setItem('vendorName', userData.vendorCompanyName || userData.company_name);
        console.log('🏭 Vendor account detected - stored vendor name');
      }

      // Set default authorization header
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      console.log('🔄 Redirecting to dashboard...');
      
      // Always go to dashboard - App.js routing handles the rest
      window.location.href = '/dashboard';
      
    } catch (err) {
      console.error('❌ LOGIN ERROR:');
      console.error('Error:', err);
      console.error('Error response:', err.response?.data);
      
      setError(err.response?.data?.error || 'Invalid username or password');
      setLoading(false);
    }
  };

  const toggleLoginMode = () => {
    setLoginMode(loginMode === 'client' ? 'vendor' : 'client');
    setError(''); // Clear any errors when switching
  };

  // Style configuration based on mode
  const modeStyles = {
    client: {
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      buttonColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      accentColor: '#667eea',
      title: 'Order Portal',
      subtitle: 'Sign in to your account'
    },
    vendor: {
      background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      buttonColor: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      accentColor: '#f59e0b',
      title: '🏭 Vendor Login',
      subtitle: 'Sign in to vendor portal'
    }
  };

  const currentStyle = modeStyles[loginMode];

  return (
    <div className="login-container" style={{ background: currentStyle.background }}>
      {/* Mode Toggle Button */}
      <button
        onClick={toggleLoginMode}
        className="mode-toggle-btn"
        style={{
          position: 'absolute',
          top: '2rem',
          right: '2rem',
          background: 'rgba(255, 255, 255, 0.2)',
          backdropFilter: 'blur(10px)',
          border: '2px solid rgba(255, 255, 255, 0.3)',
          color: 'white',
          padding: '0.75rem 1.5rem',
          borderRadius: '8px',
          fontSize: '0.95rem',
          fontWeight: '600',
          cursor: 'pointer',
          transition: 'all 0.3s',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        {loginMode === 'client' ? '🏭 Vendor Login' : '📦 Client Login'}
      </button>

      <div className="login-box">
        <div className="login-header">
          <img src="/logo.png" alt="Carolina Rolling Co Inc" className="login-logo" />
          <h1 style={{ 
            transition: 'color 0.3s',
            color: currentStyle.accentColor 
          }}>
            {currentStyle.title}
          </h1>
          <p>{currentStyle.subtitle}</p>
        </div>

        {error && (
          <div className="error-message">
            <span>⚠️</span> {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="login-form">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              disabled={loading}
              style={{
                transition: 'border-color 0.2s'
              }}
              onFocus={(e) => e.target.style.borderColor = currentStyle.accentColor}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              style={{
                transition: 'border-color 0.2s'
              }}
              onFocus={(e) => e.target.style.borderColor = currentStyle.accentColor}
            />
          </div>

          <button 
            type="submit" 
            className="login-button"
            disabled={loading}
            style={{
              background: currentStyle.buttonColor,
              transition: 'all 0.3s'
            }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="login-footer">
          <p>&copy; 2026 Carolina Rolling. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
