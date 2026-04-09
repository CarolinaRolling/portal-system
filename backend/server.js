const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cron = require('node-cron');
const path = require('path');
require('dotenv').config();

const { pool } = require('./database/migrate');
const { checkOrderStatuses, sendDelayAlerts } = require('./services/orderService');
const { sendEmail } = require('./services/emailService');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from React build in production
//if (process.env.NODE_ENV === 'production') {
//  app.use(express.static(path.join(__dirname, '../frontend/build')));
//}

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

// Auth Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Admin Middleware
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// ==================== AUTH ROUTES ====================

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND is_active = true',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        company_name: user.company_name
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Register (Admin only)
app.post('/api/auth/register', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username, password, email, company_name, role } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (username, password_hash, email, company_name, role)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, username, email, role, company_name`,
      [username, hashedPassword, email, company_name, role || 'client']
    );

    res.status(201).json({ user: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Username already exists' });
    }
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== ORDER ROUTES ====================

// Create/Submit Order
app.post('/api/orders', authenticateToken, async (req, res) => {
  try {
    const { po_number, date_required, client_name, notes } = req.body;

    const result = await pool.query(
      `INSERT INTO orders (user_id, po_number, date_required, client_name, notes, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       ON CONFLICT (user_id, po_number) 
       DO UPDATE SET date_required = $3, client_name = $4, notes = $5, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [req.user.id, po_number, date_required, client_name, notes]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Order creation error:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Get user's orders
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const query = req.user.role === 'admin'
      ? 'SELECT o.*, u.username, u.company_name FROM orders o LEFT JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC'
      : 'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC';
    
    const params = req.user.role === 'admin' ? [] : [req.user.id];
    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get single order
app.get('/api/orders/:id', authenticateToken, async (req, res) => {
  try {
    const query = req.user.role === 'admin'
      ? 'SELECT * FROM orders WHERE id = $1'
      : 'SELECT * FROM orders WHERE id = $1 AND user_id = $2';
    
    const params = req.user.role === 'admin' 
      ? [req.params.id]
      : [req.params.id, req.user.id];

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Delete order
app.delete('/api/orders/:id', authenticateToken, async (req, res) => {
  try {
    const query = req.user.role === 'admin'
      ? 'DELETE FROM orders WHERE id = $1 RETURNING *'
      : 'DELETE FROM orders WHERE id = $1 AND user_id = $2 RETURNING *';
    
    const params = req.user.role === 'admin'
      ? [req.params.id]
      : [req.params.id, req.user.id];

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    console.error('Delete order error:', error);
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

// ==================== ADMIN ROUTES ====================

// Get all users
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, company_name, role, is_active, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Update user
app.put('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { email, company_name, is_active } = req.body;
    
    const result = await pool.query(
      `UPDATE users SET email = $1, company_name = $2, is_active = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 RETURNING id, username, email, company_name, role, is_active`,
      [email, company_name, is_active, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Change user password (Admin only)
app.put('/api/admin/users/:id/password', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { new_password } = req.body;

    if (!new_password || new_password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);

    const result = await pool.query(
      `UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING id, username, email`,
      [hashedPassword, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ 
      message: 'Password updated successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Password update error:', error);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

// Generate random password (helper for admin)
app.get('/api/admin/generate-password', authenticateToken, requireAdmin, (req, res) => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  res.json({ password });
});

// Get email recipients
app.get('/api/admin/recipients', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM alert_recipients ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get recipients error:', error);
    res.status(500).json({ error: 'Failed to fetch recipients' });
  }
});

// Add email recipient
app.post('/api/admin/recipients', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { email } = req.body;
    
    const result = await pool.query(
      'INSERT INTO alert_recipients (email) VALUES ($1) RETURNING *',
      [email]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    console.error('Add recipient error:', error);
    res.status(500).json({ error: 'Failed to add recipient' });
  }
});

// Delete email recipient
app.delete('/api/admin/recipients/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM alert_recipients WHERE id = $1', [req.params.id]);
    res.json({ message: 'Recipient deleted successfully' });
  } catch (error) {
    console.error('Delete recipient error:', error);
    res.status(500).json({ error: 'Failed to delete recipient' });
  }
});

// Get settings
app.get('/api/admin/settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM email_settings');
    const settings = {};
    result.rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });
    res.json(settings);
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update settings
app.put('/api/admin/settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const settings = req.body;
    
    for (const [key, value] of Object.entries(settings)) {
      await pool.query(
        `INSERT INTO email_settings (setting_key, setting_value, updated_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP`,
        [key, String(value)]
      );
    }
    
    res.json({ message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Manual trigger for status check
app.post('/api/admin/check-statuses', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await checkOrderStatuses();
    res.json({ message: 'Status check triggered successfully' });
  } catch (error) {
    console.error('Manual check error:', error);
    res.status(500).json({ error: 'Failed to check statuses' });
  }
});

// ==================== SCHEDULED JOBS ====================

// Check order statuses every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  console.log('Running scheduled status check...');
  try {
    await checkOrderStatuses();
  } catch (error) {
    console.error('Scheduled check error:', error);
  }
});

// Send delay alerts twice daily (9 AM and 5 PM)
cron.schedule('0 9,17 * * *', async () => {
  console.log('Running scheduled delay alert check...');
  try {
    await sendDelayAlerts();
  } catch (error) {
    console.error('Scheduled alert error:', error);
  }
});

// ==================== HEALTH CHECK ====================

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

//app.get('/', (req, res) => {
//  res.json({ 
//    message: 'Order Portal API',
//    status: 'running',
//    endpoints: {
//      health: '/health',
//      login: '/api/auth/login'
//    }
//  });
//});

// ==================== SERVE REACT APP ====================

// Serve React app for all other routes (must be last)
//if (process.env.NODE_ENV === 'production') {
//  app.get('*', (req, res) => {
//    res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
//  });
//}

// ==================== START SERVER ====================

// Serve static files from React build in production
if (process.env.NODE_ENV === 'production') {
  const path = require('path');
  app.use(express.static(path.join(__dirname, '../frontend/build')));
  
  // Serve React app for all other routes (must be last)
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
});
