const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const path = require('path');
const axios = require('axios');
const setupVendorRoutes = require('./routes/vendorRoutes');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Database Connection
// Portal DB - for user authentication
const portalDB = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Test connection
portalDB.query('SELECT NOW()', (err) => {
  if (err) {
    console.error('❌ Portal DB connection failed:', err.message);
  } else {
    console.log('✅ Connected to Portal database');
  }
});

// Carolina API configuration
const CAROLINA_API_URL = process.env.CAROLINA_API_URL || 'https://carolina-rolling-inventory-api-641af96c90aa.herokuapp.com/api';
console.log('📡 Carolina API URL:', CAROLINA_API_URL);

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ============================================
// AUTHENTICATION ROUTES
// ============================================

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // Find user in portal DB
    const result = await portalDB.query(
      'SELECT * FROM users WHERE username = $1 OR email = $1',
      [username]
    );

    if (result.rows.length === 0) {
      console.log('User not found:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    console.log('User found:', user.username);

    // Check password
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      console.log('Invalid password for:', user.username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log('Login successful:', user.username);

    // Generate token
    const token = jwt.sign(
      { 
        userId: user.id, 
        username: user.username, 
        role: user.role || 'user',
        isVendor: user.is_vendor || false,
        vendorCompanyName: user.vendor_company_name || null
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        company_name: user.company_name,
        role: user.role || 'user',
        isVendor: user.is_vendor || false,
        vendorCompanyName: user.vendor_company_name || null
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// Get current user
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const result = await portalDB.query(
      'SELECT id, username, email, company_name, role, is_vendor, vendor_company_name FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      company_name: user.company_name,
      role: user.role,
      isVendor: user.is_vendor || false,
      vendorCompanyName: user.vendor_company_name || null
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// ============================================
// ORDER ROUTES - FROM CAROLINA API
// ============================================

// Get orders for logged-in user
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    // Get user's company name and API key from portal DB
    const userResult = await portalDB.query(
      'SELECT company_name, api_key FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const companyName = userResult.rows[0].company_name;
    const userApiKey = userResult.rows[0].api_key;

    if (!companyName) {
      return res.status(400).json({ error: 'Company name not set' });
    }

    if (!userApiKey) {
      return res.status(400).json({ 
        error: 'API key not configured. Please contact your administrator to set up your Carolina API access.' 
      });
    }

    console.log('Fetching orders for:', companyName);

    // Call Carolina API for estimates (no archived parameter = all statuses for portal clients)
    let estimates = [];
    try {
      console.log('Fetching all estimates (all statuses for portal clients)...');
      const estimatesResponse = await axios.get(`${CAROLINA_API_URL}/estimates`, {
        params: { 
          clientName: companyName
          // No archived parameter = gets all statuses for portal clients
        },
        headers: {
          'X-API-Key': userApiKey
        }
      });
      // New response format: { data: [...], total, limit, offset }
      const responseData = estimatesResponse.data;
      estimates = responseData.data || [];
      console.log('Estimates fetched (all statuses):', estimates.length);
      console.log('Sample estimate data:', estimates.slice(0, 3).map(e => ({
        number: e.estimateNumber,
        createdAt: e.createdAt,
        status: e.status,
        archived: e.archived
      })));
      console.log('All estimate statuses:', [...new Set(estimates.map(e => e.status))]);
    } catch (error) {
      console.error('Error fetching estimates from API:', error.message);
      console.error('Error details:', error.response?.data);
    }

    // Call Carolina API for work orders
    // Need to make TWO calls: one for active, one for shipped/archived
    let workOrders = [];
    try {
      console.log('Fetching active orders...');
      
      // Fetch active orders (default behavior)
      const activeResponse = await axios.get(`${CAROLINA_API_URL}/workorders`, {
        params: { limit: 100 },
        headers: {
          'X-API-Key': userApiKey
        }
      });
      // New response format: { data: [...], total, limit, offset }
      const activeOrders = activeResponse.data.data || [];
      console.log('Active orders fetched:', activeOrders.length);
      
      // Fetch shipped/archived orders (use archived=true)
      console.log('Fetching shipped/archived orders...');
      const shippedResponse = await axios.get(`${CAROLINA_API_URL}/workorders`, {
        params: { archived: true, limit: 100 },
        headers: {
          'X-API-Key': userApiKey
        }
      });
      const shippedOrders = shippedResponse.data.data || [];
      console.log('Shipped/archived orders fetched:', shippedOrders.length);
      
      // Combine both
      workOrders = [...activeOrders, ...shippedOrders];
      console.log('Total work orders (active + shipped):', workOrders.length);
      console.log('All statuses:', workOrders.map(wo => wo.status));
    } catch (error) {
      console.error('Error fetching work orders from API:', error.message);
    }

    res.json({
      estimates: estimates,
      workOrders: workOrders,
      total: estimates.length + workOrders.length
    });

  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders', details: error.message });
  }
});

// Get work order details (including MTRs)
app.get('/api/workorders/:id', authenticateToken, async (req, res) => {
  try {
    const workOrderId = req.params.id;
    
    // Get user's API key from portal DB
    const userResult = await portalDB.query(
      'SELECT api_key FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userApiKey = userResult.rows[0].api_key;

    if (!userApiKey) {
      return res.status(400).json({ 
        error: 'API key not configured. Please contact your administrator.' 
      });
    }
    
    console.log('========================================');
    console.log('FETCHING WORK ORDER DETAILS');
    console.log('Work Order ID:', workOrderId);
    console.log('========================================');

    // Fetch work order details from Carolina API with X-API-Key
    const response = await axios.get(`${CAROLINA_API_URL}/workorders/${workOrderId}`, {
      headers: {
        'X-API-Key': userApiKey
      }
    });
    
    // New response format: { data: { workOrder details } }
    const workOrder = response.data.data;
    console.log('Response status:', response.status);
    console.log('Response has data:', !!workOrder);
    console.log('Work order keys:', Object.keys(workOrder || {}));
    
    // Check documents array
    console.log('');
    console.log('DOCUMENTS ARRAY ANALYSIS:');
    console.log('Has documents property:', 'documents' in workOrder);
    console.log('Documents is array:', Array.isArray(workOrder.documents));
    console.log('Documents count:', workOrder.documents?.length || 0);
    
    if (workOrder.documents && workOrder.documents.length > 0) {
      console.log('');
      console.log('DOCUMENTS DETAILS:');
      workOrder.documents.forEach((doc, index) => {
        console.log(`Document ${index + 1}:`);
        console.log('  - id:', doc.id);
        console.log('  - originalName:', doc.originalName);
        console.log('  - documentType:', doc.documentType);
        console.log('  - mimeType:', doc.mimeType);
        console.log('  - url:', doc.url);
        console.log('  - All keys:', Object.keys(doc));
      });
      
      console.log('');
      console.log('FULL DOCUMENTS JSON:');
      console.log(JSON.stringify(workOrder.documents, null, 2));
    } else {
      console.log('NO DOCUMENTS FOUND!');
      console.log('Documents value:', workOrder.documents);
    }
    
    // Filter MTRs
    const mtrs = workOrder.documents?.filter(d => d.documentType === 'mtr') || [];
    
    console.log('');
    console.log('MTR FILTERING RESULTS:');
    console.log('Found MTRs:', mtrs.length);
    if (mtrs.length > 0) {
      console.log('MTR IDs:', mtrs.map(m => m.id));
      console.log('MTR names:', mtrs.map(m => m.originalName));
      console.log('MTR URLs:', mtrs.map(m => m.url));
      console.log('');
      console.log('FULL MTR JSON:');
      console.log(JSON.stringify(mtrs, null, 2));
    } else {
      console.log('Document types found:', workOrder.documents?.map(d => d.documentType) || []);
    }
    console.log('========================================');

    res.json({
      workOrder: workOrder,
      mtrs: mtrs
    });

  } catch (error) {
    console.error('Error fetching work order details:', error.message);
    res.status(500).json({ error: 'Failed to fetch work order details' });
  }
});

// Download MTR document
app.get('/api/workorders/:workOrderId/documents/:documentId/download', authenticateToken, async (req, res) => {
  try {
    const { workOrderId, documentId } = req.params;
    
    // Get user's API key from portal DB
    const userResult = await portalDB.query(
      'SELECT api_key FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userApiKey = userResult.rows[0].api_key;

    if (!userApiKey) {
      return res.status(400).json({ 
        error: 'API key not configured. Please contact your administrator.' 
      });
    }
    
    console.log('Downloading MTR:', documentId, 'for work order:', workOrderId);

    // Fetch document from Carolina API with X-API-Key
    // The Carolina API download endpoint returns raw PDF binary
    const response = await axios.get(
      `${CAROLINA_API_URL}/workorders/${workOrderId}/documents/${documentId}/download`,
      { 
        responseType: 'arraybuffer',
        headers: {
          'X-API-Key': userApiKey
        }
      }
    );

    // Forward the document to client
    res.set({
      'Content-Type': response.headers['content-type'] || 'application/pdf',
      'Content-Disposition': response.headers['content-disposition'] || 'attachment'
    });
    
    res.send(response.data);

  } catch (error) {
    console.error('Error downloading MTR:', error.message);
    res.status(500).json({ error: 'Failed to download MTR' });
  }
});

// ============================================
// PORTAL DOCUMENTS - Work Orders
// ============================================

// Get portal-visible documents for a work order (by DR number)
app.get('/api/portal/workorders/:drNumber/documents', authenticateToken, async (req, res) => {
  try {
    const { drNumber } = req.params;
    
    // Get user's API key
    const userResult = await portalDB.query(
      'SELECT api_key FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userApiKey = userResult.rows[0].api_key;

    if (!userApiKey) {
      return res.status(400).json({ 
        error: 'API key not configured' 
      });
    }
    
    console.log('Fetching portal documents for DR:', drNumber);

    // Fetch portal documents from Carolina API
    const response = await axios.get(
      `${CAROLINA_API_URL}/portal/${drNumber}/documents`,
      { 
        headers: {
          'X-API-Key': userApiKey
        }
      }
    );

    res.json(response.data);

  } catch (error) {
    console.error('Error fetching portal documents:', error.message);
    if (error.response) {
      res.status(error.response.status).json({ error: error.response.data });
    } else {
      res.status(500).json({ error: 'Failed to fetch portal documents' });
    }
  }
});

// Download portal-visible document for a work order
app.get('/api/portal/workorders/:drNumber/documents/:docId/download', authenticateToken, async (req, res) => {
  try {
    const { drNumber, docId } = req.params;
    
    // Get user's API key
    const userResult = await portalDB.query(
      'SELECT api_key FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userApiKey = userResult.rows[0].api_key;

    if (!userApiKey) {
      return res.status(400).json({ 
        error: 'API key not configured' 
      });
    }
    
    console.log('Downloading portal document:', docId, 'for DR:', drNumber);

    // Fetch document from Carolina API
    const response = await axios.get(
      `${CAROLINA_API_URL}/portal/${drNumber}/documents/${docId}/download`,
      { 
        responseType: 'arraybuffer',
        headers: {
          'X-API-Key': userApiKey
        }
      }
    );

    // Forward the document to client
    res.set({
      'Content-Type': response.headers['content-type'] || 'application/pdf',
      'Content-Disposition': response.headers['content-disposition'] || 'attachment'
    });
    
    res.send(response.data);

  } catch (error) {
    console.error('Error downloading portal document:', error.message);
    res.status(500).json({ error: 'Failed to download document' });
  }
});

// ============================================
// PORTAL DOCUMENTS - Estimates  
// ============================================

// Get portal-visible files for an estimate
app.get('/api/portal/estimates/:estimateNumber/files', authenticateToken, async (req, res) => {
  try {
    const { estimateNumber } = req.params;
    
    // Get user's API key
    const userResult = await portalDB.query(
      'SELECT api_key FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userApiKey = userResult.rows[0].api_key;

    if (!userApiKey) {
      return res.status(400).json({ 
        error: 'API key not configured' 
      });
    }
    
    console.log('Fetching portal files for estimate:', estimateNumber);

    // Fetch portal files from Carolina API
    const response = await axios.get(
      `${CAROLINA_API_URL}/estimates/portal/${estimateNumber}/files`,
      { 
        headers: {
          'X-API-Key': userApiKey
        }
      }
    );

    res.json(response.data);

  } catch (error) {
    console.error('Error fetching portal estimate files:', error.message);
    if (error.response) {
      res.status(error.response.status).json({ error: error.response.data });
    } else {
      res.status(500).json({ error: 'Failed to fetch portal files' });
    }
  }
});

// Get estimate details (including PDF files)
app.get('/api/estimates/:id', authenticateToken, async (req, res) => {
  try {
    const estimateId = req.params.id;
    
    // Get user's API key from portal DB
    const userResult = await portalDB.query(
      'SELECT api_key FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userApiKey = userResult.rows[0].api_key;

    if (!userApiKey) {
      return res.status(400).json({ 
        error: 'API key not configured. Please contact your administrator.' 
      });
    }
    
    console.log('Fetching estimate details:', estimateId);

    // Fetch estimate details from Carolina API with X-API-Key
    const response = await axios.get(`${CAROLINA_API_URL}/estimates/${estimateId}`, {
      headers: {
        'X-API-Key': userApiKey
      }
    });
    
    const estimate = response.data.data;
    
    console.log('Estimate fetched:', estimate.estimateNumber);
    console.log('Files count:', estimate.files?.length || 0);

    res.json({
      estimate: estimate
    });

  } catch (error) {
    console.error('Error fetching estimate details:', error.message);
    res.status(500).json({ error: 'Failed to fetch estimate details' });
  }
});

// Download estimate PDF
app.get('/api/estimates/:estimateId/files/:fileId/download', authenticateToken, async (req, res) => {
  try {
    const { estimateId, fileId } = req.params;
    
    // Get user's API key from portal DB
    const userResult = await portalDB.query(
      'SELECT api_key FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userApiKey = userResult.rows[0].api_key;

    if (!userApiKey) {
      return res.status(400).json({ 
        error: 'API key not configured. Please contact your administrator.' 
      });
    }
    
    console.log('Downloading estimate PDF:', fileId, 'for estimate:', estimateId);

    // Fetch PDF from Carolina API with X-API-Key
    const response = await axios.get(
      `${CAROLINA_API_URL}/estimates/${estimateId}/files/${fileId}/download`,
      { 
        responseType: 'arraybuffer',
        headers: {
          'X-API-Key': userApiKey
        }
      }
    );

    // Forward the PDF to client
    res.set({
      'Content-Type': response.headers['content-type'] || 'application/pdf',
      'Content-Disposition': response.headers['content-disposition'] || 'attachment'
    });
    
    res.send(response.data);

  } catch (error) {
    console.error('Error downloading estimate PDF:', error.message);
    res.status(500).json({ error: 'Failed to download estimate PDF' });
  }
});

// Get statistics
app.get('/api/stats', authenticateToken, async (req, res) => {
  try {
    const userResult = await portalDB.query(
      'SELECT company_name, api_key FROM users WHERE id = $1',
      [req.user.userId]
    );

    const companyName = userResult.rows[0]?.company_name;
    const userApiKey = userResult.rows[0]?.api_key;

    if (!companyName) {
      return res.status(400).json({ error: 'Company name not set' });
    }

    if (!userApiKey) {
      return res.status(400).json({ 
        error: 'API key not configured. Please contact your administrator.' 
      });
    }

    // Fetch from API
    let estimates = [];
    let workOrders = [];

    try {
      const estimatesResponse = await axios.get(`${CAROLINA_API_URL}/estimates`, {
        params: { clientName: companyName },
        headers: {
          'X-API-Key': userApiKey
        }
      });
      // New response format: { data: [...], total, limit, offset }
      estimates = estimatesResponse.data.data || [];
      console.log('Stats: Estimates fetched:', estimates.length);
    } catch (error) {
      console.error('Error fetching estimates for stats:', error.message);
    }

    try {
      console.log('Stats: Fetching active orders...');
      
      // Fetch active orders
      const activeResponse = await axios.get(`${CAROLINA_API_URL}/workorders`, {
        params: { limit: 100 },
        headers: {
          'X-API-Key': userApiKey
        }
      });
      const activeOrders = activeResponse.data.data || [];
      console.log('Stats: Active orders fetched:', activeOrders.length);
      
      // Fetch shipped/archived orders
      console.log('Stats: Fetching shipped/archived orders...');
      const shippedResponse = await axios.get(`${CAROLINA_API_URL}/workorders`, {
        params: { archived: true, limit: 100 },
        headers: {
          'X-API-Key': userApiKey
        }
      });
      const shippedOrders = shippedResponse.data.data || [];
      console.log('Stats: Shipped/archived orders fetched:', shippedOrders.length);
      
      // Combine both
      workOrders = [...activeOrders, ...shippedOrders];
      console.log('Stats: Total work orders (active + shipped):', workOrders.length);
    } catch (error) {
      console.error('Error fetching work orders for stats:', error.message);
    }

    // Calculate stats from API data - ensure estimates and workOrders are arrays
    const estimateStats = {
      total: Array.isArray(estimates) ? estimates.length : 0,
      sent: Array.isArray(estimates) ? estimates.filter(e => e.status?.toLowerCase() === 'sent').length : 0,
      accepted: Array.isArray(estimates) ? estimates.filter(e => e.status?.toLowerCase() === 'accepted').length : 0
    };

    const workOrderStats = {
      total: Array.isArray(workOrders) ? workOrders.length : 0,
      processing: Array.isArray(workOrders) ? workOrders.filter(wo => wo.status?.toLowerCase() === 'processing').length : 0,
      ready: Array.isArray(workOrders) ? workOrders.filter(wo => wo.status?.toLowerCase() === 'stored').length : 0,
      completed: Array.isArray(workOrders) ? workOrders.filter(wo => 
        wo.status?.toLowerCase() === 'shipped' || wo.status?.toLowerCase() === 'picked up'
      ).length : 0
    };

    res.json({
      estimates: estimateStats,
      workOrders: workOrderStats
    });

  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get single order details (simplified)
app.get('/api/order/:type/:id', authenticateToken, async (req, res) => {
  try {
    // For now, return a simple response
    // This can be expanded later to fetch specific order details from API
    res.json({
      message: 'Order details endpoint - to be implemented',
      type: req.params.type,
      id: req.params.id
    });
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).json({ error: 'Failed to fetch order details' });
  }
});

// Refresh/check statuses
app.post('/api/admin/check-statuses', authenticateToken, async (req, res) => {
  try {
    res.json({ 
      success: true, 
      message: 'Data is live from Carolina database' 
    });
  } catch (error) {
    console.error('Check statuses error:', error);
    res.status(500).json({ error: 'Failed to check statuses' });
  }
});

// ============================================
// ONE-CLICK MIGRATION ENDPOINT
// ============================================

// Run database migration (admin only)
app.post('/api/admin/migrate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('========================================');
    console.log('RUNNING DATABASE MIGRATION');
    console.log('Requested by:', req.user.username);
    console.log('========================================');

    // Check if api_key column already exists
    const checkResult = await portalDB.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'api_key'
    `);

    if (checkResult.rows.length > 0) {
      console.log('Migration already complete - api_key column exists');
      return res.json({ 
        success: true, 
        message: 'Migration already complete! The api_key column already exists.',
        alreadyExists: true
      });
    }

    // Add api_key column
    console.log('Adding api_key column to users table...');
    await portalDB.query(`
      ALTER TABLE users 
      ADD COLUMN api_key VARCHAR(500)
    `);

    console.log('Migration successful!');
    console.log('========================================');

    // Log activity
    await logActivity(
      'database_migration',
      'Added api_key column to users table',
      'Migration executed successfully',
      req.user.username
    );

    res.json({ 
      success: true, 
      message: 'Migration successful! The api_key column has been added to the users table. You can now add API keys for each user.'
    });

  } catch (error) {
    console.error('Migration error:', error);
    console.log('========================================');
    
    res.status(500).json({ 
      success: false, 
      error: 'Migration failed', 
      details: error.message 
    });
  }
});

// ============================================
// ADMIN ROUTES
// ============================================

// Create system_logs table if not exists
portalDB.query(`
  CREATE TABLE IF NOT EXISTS system_logs (
    id SERIAL PRIMARY KEY,
    log_type VARCHAR(50),
    message TEXT,
    details TEXT,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`).catch(err => console.error('Error creating logs table:', err));

// Helper function to log activity
async function logActivity(type, message, details = null, username = null) {
  try {
    await portalDB.query(
      'INSERT INTO system_logs (log_type, message, details, created_by) VALUES ($1, $2, $3, $4)',
      [type, message, details, username]
    );
  } catch (error) {
    console.error('Error logging activity:', error);
  }
}

// Get all users (admin only)
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('========================================');
    console.log('FETCHING ADMIN USERS');
    console.log('Requesting user:', req.user.username);
    console.log('Requesting user role:', req.user.role);
    console.log('========================================');
    
    const result = await portalDB.query(
      'SELECT id, username, email, company_name, api_key, role, is_vendor, vendor_company_name, created_at FROM users ORDER BY created_at DESC'
    );
    
    console.log('Users found:', result.rows.length);
    console.log('Users:', result.rows.map(u => ({ username: u.username, role: u.role, has_api_key: !!u.api_key, is_vendor: u.is_vendor })));
    console.log('========================================');
    
    res.json(result.rows);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Create new user (admin only)
app.post('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username, email, password, company_name, api_key, role, is_vendor, vendor_company_name } = req.body;

    if (!username || !password || !company_name) {
      return res.status(400).json({ error: 'Username, password, and company name are required' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const result = await portalDB.query(
      `INSERT INTO users (username, email, password_hash, company_name, api_key, role, is_vendor, vendor_company_name) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING id, username, email, company_name, api_key, role, is_vendor, vendor_company_name`,
      [username, email || null, hashedPassword, company_name, api_key || null, role || 'user', is_vendor || false, vendor_company_name || null]
    );

    // Log activity
    await logActivity(
      'user_created',
      `New user "${username}" created`,
      `Email: ${email || 'N/A'}, Company: ${company_name}, Role: ${role || 'user'}, Vendor: ${is_vendor || false}`,
      req.user.username
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Create user error:', error);
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user (admin only)
app.put('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { email, company_name, api_key, role, is_vendor, vendor_company_name } = req.body;

    console.log('========================================');
    console.log('UPDATING USER');
    console.log('User ID:', id);
    console.log('Email:', email);
    console.log('Company:', company_name);
    console.log('API Key:', api_key ? '***PROVIDED***' : 'null/empty');
    console.log('Role:', role);
    console.log('Is Vendor:', is_vendor);
    console.log('Vendor Company Name:', vendor_company_name);
    console.log('========================================');

    const result = await portalDB.query(
      `UPDATE users 
       SET email = $1, company_name = $2, api_key = $3, role = $4, is_vendor = $5, vendor_company_name = $6
       WHERE id = $7 
       RETURNING id, username, email, company_name, api_key, role, is_vendor, vendor_company_name`,
      [email, company_name, api_key || null, role, is_vendor || false, vendor_company_name || null, id]
    );

    console.log('Update successful, rows affected:', result.rows.length);

    if (result.rows.length === 0) {
      console.log('ERROR: User not found with ID:', id);
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('Updated user:', result.rows[0].username);
    console.log('========================================');

    // Log activity
    await logActivity(
      'user_updated',
      `User "${result.rows[0].username}" updated`,
      `Email: ${email}, Company: ${company_name}, Role: ${role}, Vendor: ${is_vendor || false}`,
      req.user.username
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update user error:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    console.error('========================================');
    
    if (error.code === '23505') {
      return res.status(400).json({ 
        error: 'Email already exists',
        details: 'Another user already has this email address'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to update user',
      details: error.message
    });
  }
});

// Delete user (admin only)
app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Get username before deleting
    const userResult = await portalDB.query('SELECT username FROM users WHERE id = $1', [id]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const username = userResult.rows[0].username;

    // Don't allow deleting yourself
    if (req.user.userId === parseInt(id)) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    await portalDB.query('DELETE FROM users WHERE id = $1', [id]);

    // Log activity
    await logActivity(
      'user_deleted',
      `User "${username}" deleted`,
      null,
      req.user.username
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Reset user password (admin only)
app.post('/api/admin/users/:id/reset-password', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password required' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update password
    const result = await portalDB.query(
      `UPDATE users 
       SET password_hash = $1 
       WHERE id = $2 
       RETURNING username`,
      [hashedPassword, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Log activity
    await logActivity(
      'password_reset',
      `Password reset for user "${result.rows[0].username}"`,
      null,
      req.user.username
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Get activity logs (admin only)
app.get('/api/admin/logs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await portalDB.query(
      'SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 100'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get logs error:', error);
    res.status(500).json({ error: 'Failed to get logs' });
  }
});

// ============================================
// VENDOR PORTAL ROUTES
// ============================================
// VENDOR ROUTES
// ============================================

// Make database available to vendorRoutes
app.locals.db = portalDB;

setupVendorRoutes(app);

// ============================================
// HEALTH CHECK
// ============================================

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    databases: {
      portal: !!process.env.DATABASE_URL,
      carolina: !!process.env.CAROLINA_DATABASE_URL
    }
  });
});

// ============================================
// SERVE FRONTEND
// ============================================

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/build')));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
  });
}

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down');
  portalDB.end();
  process.exit(0);
});

module.exports = { portalDB };
