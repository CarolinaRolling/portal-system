import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getRecipients, addRecipient, deleteRecipient, getSettings, updateSettings } from '../utils/api';
import '../styles/Settings.css';

function Settings({ user, onLogout }) {
  const [recipients, setRecipients] = useState([]);
  const [settings, setSettings] = useState({
    alert_days_threshold: '5',
    check_frequency_minutes: '5'
  });
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [recipientsRes, settingsRes] = await Promise.all([
        getRecipients(),
        getSettings()
      ]);
      setRecipients(recipientsRes.data);
      setSettings(settingsRes.data);
    } catch (err) {
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleAddRecipient = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      await addRecipient(newEmail);
      setNewEmail('');
      setSuccess('Email recipient added successfully!');
      loadData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add recipient');
    }
  };

  const handleDeleteRecipient = async (id) => {
    if (window.confirm('Remove this email recipient?')) {
      try {
        await deleteRecipient(id);
        loadData();
      } catch (err) {
        setError('Failed to delete recipient');
      }
    }
  };

  const handleSaveSettings = async () => {
    setError('');
    setSuccess('');

    try {
      await updateSettings(settings);
      setSuccess('Settings saved successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to save settings');
    }
  };

  return (
    <div className="settings-page">
      <nav className="navbar">
        <div className="nav-brand">
          <span className="nav-icon">📦</span>
          <span className="nav-title">Order Portal - Settings</span>
        </div>
        <div className="nav-menu">
          <Link to="/" className="nav-link">Dashboard</Link>
          <Link to="/admin" className="nav-link">Users</Link>
          <Link to="/settings" className="nav-link active">Settings</Link>
          <span className="nav-user">
            <span className="user-icon">👤</span>
            {user.username}
          </span>
          <button onClick={onLogout} className="logout-btn">Sign Out</button>
        </div>
      </nav>

      <div className="settings-container">
        <header className="settings-header">
          <h1>System Settings</h1>
          <p className="subtitle">Configure alerts and notifications</p>
        </header>

        {error && (
          <div className="alert alert-error">
            <span>⚠️</span> {error}
          </div>
        )}

        {success && (
          <div className="alert alert-success">
            <span>✅</span> {success}
          </div>
        )}

        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading settings...</p>
          </div>
        ) : (
          <>
            <div className="settings-section">
              <div className="section-header">
                <h2>📧 Email Alert Recipients</h2>
                <p>Manage who receives automated alert emails</p>
              </div>

              <form onSubmit={handleAddRecipient} className="add-recipient-form">
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="email@example.com"
                  required
                />
                <button type="submit" className="btn-primary">Add Recipient</button>
              </form>

              <div className="recipients-list">
                {recipients.length === 0 ? (
                  <div className="empty-state-small">
                    <p>No recipients configured</p>
                  </div>
                ) : (
                  <table className="recipients-table">
                    <thead>
                      <tr>
                        <th>Email Address</th>
                        <th>Status</th>
                        <th>Added</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recipients.map(recipient => (
                        <tr key={recipient.id}>
                          <td className="email-cell">{recipient.email}</td>
                          <td>
                            <span className={`status-badge ${recipient.is_active ? 'active' : 'inactive'}`}>
                              {recipient.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>{new Date(recipient.created_at).toLocaleDateString()}</td>
                          <td>
                            <button
                              onClick={() => handleDeleteRecipient(recipient.id)}
                              className="btn-delete-small"
                              title="Remove recipient"
                            >
                              🗑️ Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="settings-section">
              <div className="section-header">
                <h2>⚙️ Alert Configuration</h2>
                <p>Customize when and how alerts are sent</p>
              </div>

              <div className="settings-grid">
                <div className="setting-card">
                  <label>Alert Threshold (Days)</label>
                  <p className="setting-description">
                    Send alerts when orders are not received and due within this many days
                  </p>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={settings.alert_days_threshold || '5'}
                    onChange={(e) => setSettings({...settings, alert_days_threshold: e.target.value})}
                  />
                </div>

                <div className="setting-card">
                  <label>Status Check Frequency</label>
                  <p className="setting-description">
                    How often to check order statuses (in minutes)
                  </p>
                  <select
                    value={settings.check_frequency_minutes || '5'}
                    onChange={(e) => setSettings({...settings, check_frequency_minutes: e.target.value})}
                  >
                    <option value="5">Every 5 minutes</option>
                    <option value="10">Every 10 minutes</option>
                    <option value="15">Every 15 minutes</option>
                    <option value="30">Every 30 minutes</option>
                    <option value="60">Every hour</option>
                  </select>
                  <p className="setting-note">
                    ⚠️ Note: Changing this requires redeploying the app
                  </p>
                </div>
              </div>

              <button onClick={handleSaveSettings} className="btn-save">
                💾 Save Settings
              </button>
            </div>

            <div className="settings-section info-section">
              <div className="section-header">
                <h2>ℹ️ System Information</h2>
              </div>
              
              <div className="info-grid">
                <div className="info-card">
                  <div className="info-label">Status Checks</div>
                  <div className="info-value">
                    Every {settings.check_frequency_minutes || '5'} minutes
                  </div>
                </div>
                <div className="info-card">
                  <div className="info-label">Daily Alert Checks</div>
                  <div className="info-value">9:00 AM & 5:00 PM</div>
                </div>
                <div className="info-card">
                  <div className="info-label">Alert Recipients</div>
                  <div className="info-value">{recipients.filter(r => r.is_active).length} active</div>
                </div>
                <div className="info-card">
                  <div className="info-label">Alert Threshold</div>
                  <div className="info-value">{settings.alert_days_threshold || '5'} days</div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default Settings;
