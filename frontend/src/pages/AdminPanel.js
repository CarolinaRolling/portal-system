import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getUsers, register, updateUser, changeUserPassword, generatePassword, triggerStatusCheck } from '../utils/api';
import { format } from 'date-fns';
import '../styles/AdminPanel.css';

function AdminPanel({ user, onLogout }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    email: '',
    company_name: '',
    role: 'client'
  });
  const [editFormData, setEditFormData] = useState({
    email: '',
    company_name: '',
    is_active: true,
    new_password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [copiedText, setCopiedText] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const response = await getUsers();
      setUsers(response.data);
    } catch (err) {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      await register(formData);
      setFormData({ username: '', password: '', email: '', company_name: '', role: 'client' });
      setShowForm(false);
      setSuccess(`User created! Username: ${formData.username}, Password: ${formData.password}`);
      loadUsers();
      setTimeout(() => setSuccess(''), 10000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create user');
    }
  };

  const handleEditUser = (userToEdit) => {
    setEditingUser(userToEdit);
    setEditFormData({
      email: userToEdit.email,
      company_name: userToEdit.company_name || '',
      is_active: userToEdit.is_active,
      new_password: ''
    });
    setShowEditModal(true);
    setError('');
    setSuccess('');
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      // Update user details
      await updateUser(editingUser.id, {
        email: editFormData.email,
        company_name: editFormData.company_name,
        is_active: editFormData.is_active
      });

      // Update password if provided
      if (editFormData.new_password) {
        await changeUserPassword(editingUser.id, editFormData.new_password);
      }

      setShowEditModal(false);
      setEditingUser(null);
      setSuccess('User updated successfully!');
      loadUsers();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update user');
    }
  };

  const handleGeneratePassword = async () => {
    try {
      const response = await generatePassword();
      setFormData({ ...formData, password: response.data.password });
      setShowPassword(true);
    } catch (err) {
      setError('Failed to generate password');
    }
  };

  const handleGeneratePasswordEdit = async () => {
    try {
      const response = await generatePassword();
      setEditFormData({ ...editFormData, new_password: response.data.password });
    } catch (err) {
      setError('Failed to generate password');
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(''), 2000);
  };

  const copyLoginInfo = (username, password) => {
    const loginInfo = `Portal Login Information:
Username: ${username}
Password: ${password}
Login URL: ${window.location.origin}/login

Please keep this information secure and change your password after first login.`;
    
    navigator.clipboard.writeText(loginInfo);
    setCopiedText('login-info');
    setTimeout(() => setCopiedText(''), 2000);
  };

  const handleToggleActive = async (userId, currentStatus) => {
    try {
      const userToUpdate = users.find(u => u.id === userId);
      await updateUser(userId, {
        email: userToUpdate.email,
        company_name: userToUpdate.company_name,
        is_active: !currentStatus
      });
      loadUsers();
    } catch (err) {
      setError('Failed to update user status');
    }
  };

  const handleManualCheck = async () => {
    setSuccess('');
    setError('');
    try {
      await triggerStatusCheck();
      setSuccess('Status check triggered! Orders will be updated shortly.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to trigger status check');
    }
  };

  return (
    <div className="admin-panel">
      <nav className="navbar">
        <div className="nav-brand">
          <span className="nav-icon">📦</span>
          <span className="nav-title">Order Portal - Admin</span>
        </div>
        <div className="nav-menu">
          <Link to="/" className="nav-link">Dashboard</Link>
          <Link to="/admin" className="nav-link active">Users</Link>
          <Link to="/settings" className="nav-link">Settings</Link>
          <span className="nav-user">
            <span className="user-icon">👤</span>
            {user.username}
          </span>
          <button onClick={onLogout} className="logout-btn">Sign Out</button>
        </div>
      </nav>

      <div className="admin-container">
        <header className="admin-header">
          <div>
            <h1>User Management</h1>
            <p className="subtitle">Manage client accounts and permissions</p>
          </div>
          <div className="header-actions">
            <button onClick={handleManualCheck} className="btn-secondary">
              🔄 Check Statuses Now
            </button>
            <button onClick={() => setShowForm(!showForm)} className="btn-primary">
              {showForm ? '✕ Cancel' : '+ New User'}
            </button>
          </div>
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

        {showForm && (
          <div className="user-form-card">
            <h3>Create New User</h3>
            <form onSubmit={handleSubmit} className="user-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Username *</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({...formData, username: e.target.value})}
                    required
                    placeholder="username"
                  />
                </div>
                <div className="form-group">
                  <label>Password *</label>
                  <div className="password-input-group">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={formData.password}
                      onChange={(e) => setFormData({...formData, password: e.target.value})}
                      required
                      placeholder="Strong password"
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowPassword(!showPassword)}
                      className="btn-toggle-password"
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? '👁️' : '👁️‍🗨️'}
                    </button>
                    <button 
                      type="button" 
                      onClick={handleGeneratePassword}
                      className="btn-generate"
                      title="Generate random password"
                    >
                      🎲 Generate
                    </button>
                  </div>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Email *</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    required
                    placeholder="user@company.com"
                  />
                </div>
                <div className="form-group">
                  <label>Company Name</label>
                  <input
                    type="text"
                    value={formData.company_name}
                    onChange={(e) => setFormData({...formData, company_name: e.target.value})}
                    placeholder="Must match clientName in inventory!"
                  />
                  <small className="field-hint">⚠️ Must match exactly with inventory clientName</small>
                </div>
              </div>
              <div className="form-group">
                <label>Role *</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({...formData, role: e.target.value})}
                >
                  <option value="client">Client</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn-submit">Create User</button>
                {formData.username && formData.password && (
                  <button 
                    type="button" 
                    onClick={() => copyLoginInfo(formData.username, formData.password)}
                    className="btn-copy-info"
                  >
                    {copiedText === 'login-info' ? '✓ Copied!' : '📋 Copy Login Info'}
                  </button>
                )}
              </div>
            </form>
          </div>
        )}

        {showEditModal && editingUser && (
          <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Edit User: {editingUser.username}</h3>
                <button onClick={() => setShowEditModal(false)} className="btn-close">✕</button>
              </div>
              <form onSubmit={handleUpdateUser} className="edit-form">
                <div className="form-group">
                  <label>Email *</label>
                  <input
                    type="email"
                    value={editFormData.email}
                    onChange={(e) => setEditFormData({...editFormData, email: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Company Name</label>
                  <input
                    type="text"
                    value={editFormData.company_name}
                    onChange={(e) => setEditFormData({...editFormData, company_name: e.target.value})}
                    placeholder="Must match clientName in inventory!"
                  />
                  <small className="field-hint">⚠️ Must match exactly with inventory clientName</small>
                </div>
                <div className="form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={editFormData.is_active}
                      onChange={(e) => setEditFormData({...editFormData, is_active: e.target.checked})}
                    />
                    {' '}Active User
                  </label>
                </div>
                <div className="form-group">
                  <label>New Password (optional)</label>
                  <div className="password-input-group">
                    <input
                      type="text"
                      value={editFormData.new_password}
                      onChange={(e) => setEditFormData({...editFormData, new_password: e.target.value})}
                      placeholder="Leave blank to keep current password"
                    />
                    <button 
                      type="button" 
                      onClick={handleGeneratePasswordEdit}
                      className="btn-generate"
                      title="Generate random password"
                    >
                      🎲 Generate
                    </button>
                  </div>
                  {editFormData.new_password && (
                    <div className="password-display">
                      <span className="password-text">{editFormData.new_password}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(editFormData.new_password, 'password')}
                        className="btn-copy-small"
                      >
                        {copiedText === 'password' ? '✓' : '📋'}
                      </button>
                    </div>
                  )}
                </div>
                <div className="modal-actions">
                  <button type="button" onClick={() => setShowEditModal(false)} className="btn-cancel">
                    Cancel
                  </button>
                  <button type="submit" className="btn-save">
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="users-section">
          <h2>All Users ({users.length})</h2>

          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Loading users...</p>
            </div>
          ) : users.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">👥</div>
              <h3>No users yet</h3>
              <p>Create your first user to get started</p>
            </div>
          ) : (
            <div className="users-table">
              <table>
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Company</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className={!u.is_active ? 'inactive-row' : ''}>
                      <td className="username-cell">{u.username}</td>
                      <td>{u.email}</td>
                      <td>{u.company_name || '-'}</td>
                      <td>
                        <span className={`role-badge ${u.role}`}>
                          {u.role === 'admin' ? '🛡️ Admin' : '👤 Client'}
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge ${u.is_active ? 'active' : 'inactive'}`}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>{format(new Date(u.created_at), 'MMM dd, yyyy')}</td>
                      <td>
                        <div className="action-buttons">
                          <button
                            onClick={() => handleEditUser(u)}
                            className="btn-edit"
                            title="Edit user"
                          >
                            ✏️ Edit
                          </button>
                          <button
                            onClick={() => handleToggleActive(u.id, u.is_active)}
                            className={u.is_active ? 'btn-deactivate' : 'btn-activate'}
                            title={u.is_active ? 'Deactivate user' : 'Activate user'}
                          >
                            {u.is_active ? '🔒' : '🔓'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminPanel;
