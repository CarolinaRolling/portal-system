import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './AdminPanel.css';

const AdminPanel = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [migrationStatus, setMigrationStatus] = useState(null);
  const [migrationLoading, setMigrationLoading] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '',
    email: '',
    password: '',
    company_name: '',
    api_key: '',
    role: 'user',
    is_vendor: false,
    vendor_company_name: ''
  });

  useEffect(() => {
    fetchUsers();
    fetchLogs();
  }, []);

  const fetchUsers = async () => {
    try {
      console.log('Fetching users from /api/admin/users...');
      setLoading(true);
      const response = await axios.get('/api/admin/users');
      console.log('Users fetched successfully:', response.data.length, 'users');
      console.log('Users data:', response.data);
      setUsers(response.data);
      setError(null);
    } catch (error) {
      console.error('Error fetching users:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);
      
      if (error.response?.status === 403) {
        setError('Access denied. You must be an admin to view users.');
      } else if (error.response?.status === 401) {
        setError('Not authenticated. Please login again.');
      } else {
        setError('Failed to load users: ' + (error.response?.data?.error || error.message));
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    try {
      const response = await axios.get('/api/admin/logs');
      setLogs(response.data);
    } catch (error) {
      console.error('Error fetching logs:', error);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      // Send null instead of empty string for email to avoid uniqueness issues
      const userData = {
        ...newUser,
        email: newUser.email.trim() || null
      };
      
      await axios.post('/api/admin/users', userData);
      setShowAddUser(false);
      setNewUser({
        username: '',
        email: '',
        password: '',
        company_name: '',
        api_key: '',
        role: 'user',
        is_vendor: false,
        vendor_company_name: ''
      });
      fetchUsers();
      fetchLogs();
      alert('User added successfully!');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to add user');
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    try {
      console.log('Updating user:', editingUser.id);
      
      // Send null instead of empty string for email
      const userData = {
        ...editingUser,
        email: editingUser.email?.trim() || null
      };
      
      console.log('User data:', {
        email: userData.email,
        company_name: userData.company_name,
        api_key: userData.api_key ? '***PROVIDED***' : 'empty',
        role: userData.role,
        is_vendor: userData.is_vendor,
        vendor_company_name: userData.vendor_company_name
      });
      
      await axios.put(`/api/admin/users/${editingUser.id}`, userData);
      
      console.log('User updated successfully');
      setEditingUser(null);
      fetchUsers();
      fetchLogs();
      alert('User updated successfully!');
    } catch (error) {
      console.error('Update user error:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);
      
      const errorMessage = error.response?.data?.error || error.response?.data?.details || error.message || 'Failed to update user';
      alert(`Failed to update user: ${errorMessage}`);
    }
  };

  const handleDeleteUser = async (userId, username) => {
    if (!window.confirm(`Are you sure you want to delete user "${username}"?`)) {
      return;
    }

    try {
      await axios.delete(`/api/admin/users/${userId}`);
      fetchUsers();
      fetchLogs();
      alert('User deleted successfully!');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete user');
    }
  };

  const handleResetPassword = async (userId, username) => {
    const newPassword = window.prompt(`Enter new password for ${username}:`);
    if (!newPassword) return;

    try {
      await axios.post(`/api/admin/users/${userId}/reset-password`, {
        password: newPassword
      });
      fetchLogs();
      alert('Password reset successfully!');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to reset password');
    }
  };

  const runMigration = async () => {
    if (!window.confirm('Run database migration to add api_key column?\n\nThis is safe to run and will only add the column if it doesn\'t exist.')) {
      return;
    }

    try {
      setMigrationLoading(true);
      setMigrationStatus(null);
      
      console.log('Running migration...');
      const response = await axios.post('/api/admin/migrate');
      
      console.log('Migration response:', response.data);
      setMigrationStatus({
        success: true,
        message: response.data.message,
        alreadyExists: response.data.alreadyExists
      });

      // Refresh users to show api_key column
      if (!response.data.alreadyExists) {
        setTimeout(() => {
          fetchUsers();
        }, 500);
      }
    } catch (error) {
      console.error('Migration error:', error);
      setMigrationStatus({
        success: false,
        message: error.response?.data?.details || error.message || 'Migration failed'
      });
    } finally {
      setMigrationLoading(false);
    }
  };

  return (
    <div className="admin-panel">
      {/* Header */}
      <div className="admin-header">
        <div className="header-content">
          <div className="header-left">
            <img src="/logo.png" alt="Carolina Rolling Co Inc" className="admin-logo" />
            <div>
              <h1>⚙️ Admin Panel</h1>
              <p>Manage users and view system logs</p>
            </div>
          </div>
          <div className="header-buttons">
            <button 
              onClick={runMigration} 
              className="btn-migrate-header"
              disabled={migrationLoading}
              title="Run database migration to add api_key column"
            >
              {migrationLoading ? '⏳ Migrating...' : '🔧 Run Migration'}
            </button>
            <button onClick={() => navigate('/dashboard')} className="btn-back">
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span>⚠️</span> {error}
        </div>
      )}

      {/* Migration Section */}
      {migrationStatus && (
        <div className={`migration-status ${migrationStatus.success ? 'success' : 'error'}`}>
          <span>{migrationStatus.success ? '✅' : '❌'}</span>
          <div>
            <strong>{migrationStatus.success ? 'Success!' : 'Error!'}</strong>
            <p>{migrationStatus.message}</p>
          </div>
          <button onClick={() => setMigrationStatus(null)} className="btn-close">✕</button>
        </div>
      )}

      {/* Migration Button - Show if error mentions api_key */}
      {error && error.includes('api_key') && (
        <div className="migration-prompt">
          <div>
            <strong>🔧 Database Migration Required</strong>
            <p>The api_key column needs to be added to support multi-client features.</p>
          </div>
          <button 
            onClick={runMigration} 
            className="btn-migrate"
            disabled={migrationLoading}
          >
            {migrationLoading ? '⏳ Running Migration...' : '🚀 Run Migration Now'}
          </button>
        </div>
      )}

      {/* User Management Section */}
      <div className="admin-section">
        <div className="section-header">
          <h2>👥 User Management</h2>
          <button
            onClick={() => setShowAddUser(!showAddUser)}
            className="btn-add"
          >
            {showAddUser ? 'Cancel' : '+ Add New User'}
          </button>
        </div>

        {/* Add User Form */}
        {showAddUser && (
          <div className="user-form-card">
            <h3>Add New User</h3>
            <form onSubmit={handleAddUser} className="user-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Username *</label>
                  <input
                    type="text"
                    value={newUser.username}
                    onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Password *</label>
                  <input
                    type="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Company Name *</label>
                  <input
                    type="text"
                    value={newUser.company_name}
                    onChange={(e) => setNewUser({ ...newUser, company_name: e.target.value })}
                    placeholder="Company name (for Carolina DB search)"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Carolina API Key *</label>
                  <input
                    type="text"
                    value={newUser.api_key}
                    onChange={(e) => setNewUser({ ...newUser, api_key: e.target.value })}
                    placeholder="X-API-Key for Carolina Rolling API"
                    required
                  />
                </div>
              </div>
              
              {/* VENDOR SECTION */}
              <div className="form-row vendor-section" style={{
                background: '#f8fafc',
                padding: '1rem',
                borderRadius: '8px',
                border: '2px solid #e2e8f0'
              }}>
                <div className="form-group" style={{width: '100%'}}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    fontWeight: '500'
                  }}>
                    <input
                      type="checkbox"
                      checked={newUser.is_vendor}
                      onChange={(e) => setNewUser({ 
                        ...newUser, 
                        is_vendor: e.target.checked,
                        vendor_company_name: e.target.checked ? newUser.vendor_company_name : ''
                      })}
                      style={{
                        width: '20px',
                        height: '20px',
                        cursor: 'pointer'
                      }}
                    />
                    🏭 Vendor Account
                  </label>
                  <p style={{
                    fontSize: '0.85rem',
                    color: '#64748b',
                    marginTop: '0.5rem',
                    marginLeft: '28px'
                  }}>
                    Check this if the user should have access to the vendor portal
                  </p>
                </div>
                
                {newUser.is_vendor && (
                  <div className="form-group" style={{width: '100%', marginTop: '1rem'}}>
                    <label>Vendor Company Name (Optional)</label>
                    <input
                      type="text"
                      value={newUser.vendor_company_name}
                      onChange={(e) => setNewUser({ ...newUser, vendor_company_name: e.target.value })}
                      placeholder="Leave blank to use Company Name above"
                      style={{width: '100%'}}
                    />
                    <p style={{
                      fontSize: '0.85rem',
                      color: '#64748b',
                      marginTop: '0.25rem'
                    }}>
                      Optional: Different name for vendor purchase orders (defaults to Company Name if empty)
                    </p>
                  </div>
                )}
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label>Role</label>
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn-primary">
                  Create User
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddUser(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Users Table */}
        {loading ? (
          <div className="loading">Loading users...</div>
        ) : (
          <div className="users-table-container">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Company Name</th>
                  <th>API Key</th>
                  <th>Type</th>
                  <th>Role</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    {editingUser?.id === user.id ? (
                      <>
                        <td>{user.username}</td>
                        <td>
                          <input
                            type="email"
                            value={editingUser.email}
                            onChange={(e) =>
                              setEditingUser({ ...editingUser, email: e.target.value })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={editingUser.company_name}
                            onChange={(e) =>
                              setEditingUser({ ...editingUser, company_name: e.target.value })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={editingUser.api_key || ''}
                            onChange={(e) =>
                              setEditingUser({ ...editingUser, api_key: e.target.value })
                            }
                            placeholder="X-API-Key"
                          />
                        </td>
                        <td>
                          <label style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                            <input
                              type="checkbox"
                              checked={editingUser.is_vendor || false}
                              onChange={(e) =>
                                setEditingUser({ ...editingUser, is_vendor: e.target.checked })
                              }
                            />
                            Vendor
                          </label>
                          {editingUser.is_vendor && (
                            <input
                              type="text"
                              value={editingUser.vendor_company_name || ''}
                              onChange={(e) =>
                                setEditingUser({ ...editingUser, vendor_company_name: e.target.value })
                              }
                              placeholder="Vendor company name"
                              style={{marginTop: '0.5rem', fontSize: '0.85rem'}}
                            />
                          )}
                        </td>
                        <td>
                          <select
                            value={editingUser.role}
                            onChange={(e) =>
                              setEditingUser({ ...editingUser, role: e.target.value })
                            }
                          >
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td>{new Date(user.created_at).toLocaleDateString()}</td>
                        <td>
                          <button
                            onClick={handleUpdateUser}
                            className="btn-save"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingUser(null)}
                            className="btn-cancel"
                          >
                            Cancel
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>
                          <strong>{user.username}</strong>
                          {user.role === 'admin' && <span className="badge-admin">Admin</span>}
                        </td>
                        <td>{user.email}</td>
                        <td>
                          <span className="company-badge">{user.company_name}</span>
                        </td>
                        <td>
                          <span style={{fontSize: '11px', color: user.api_key ? '#10b981' : '#ef4444'}}>
                            {user.api_key ? '✓ Configured' : '✗ Not Set'}
                          </span>
                        </td>
                        <td>
                          {user.is_vendor ? (
                            <span style={{
                              background: '#fbbf24',
                              color: '#78350f',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: '600'
                            }}>
                              🏭 VENDOR
                            </span>
                          ) : (
                            <span style={{
                              background: '#3b82f6',
                              color: 'white',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: '600'
                            }}>
                              📦 CLIENT
                            </span>
                          )}
                        </td>
                        <td>{user.role}</td>
                        <td>{new Date(user.created_at).toLocaleDateString()}</td>
                        <td className="actions-cell">
                          <button
                            onClick={() => setEditingUser(user)}
                            className="btn-edit"
                            title="Edit user"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleResetPassword(user.id, user.username)}
                            className="btn-reset"
                            title="Reset password"
                          >
                            🔑
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user.id, user.username)}
                            className="btn-delete"
                            title="Delete user"
                          >
                            🗑️
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Activity Logs Section */}
      <div className="admin-section">
        <div className="section-header">
          <h2>📝 Activity Logs</h2>
          <button onClick={fetchLogs} className="btn-refresh">
            🔄 Refresh
          </button>
        </div>

        <div className="logs-container">
          {logs.length === 0 ? (
            <p className="no-logs">No activity logs yet</p>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="log-entry">
                <div className="log-time">
                  {new Date(log.created_at).toLocaleString()}
                </div>
                <div className="log-content">
                  <span className={`log-type log-type-${log.log_type}`}>
                    {log.log_type}
                  </span>
                  <span className="log-message">{log.message}</span>
                  {log.created_by && (
                    <span className="log-user">by {log.created_by}</span>
                  )}
                </div>
                {log.details && (
                  <div className="log-details">
                    {typeof log.details === 'string' 
                      ? log.details 
                      : JSON.stringify(log.details, null, 2)}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
