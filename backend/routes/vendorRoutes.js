const express = require('express');
const jwt = require('jsonwebtoken');
const axios = require('axios');

// JWT Authentication middleware for vendors
const authenticateVendor = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
    
    // Check if user is a vendor
    if (!decoded.isVendor) {
      return res.status(403).json({ error: 'Access denied. Vendor account required.' });
    }
    
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Token verification failed:', error);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

module.exports = (app) => {
  const router = express.Router();
  const CAROLINA_API_URL = process.env.CAROLINA_API_URL || 'https://carolina-rolling-inventory-api-641af96c90aa.herokuapp.com/api';
  
  // All vendor routes require authentication
  router.use(authenticateVendor);
  
  // Helper to get vendor's API key from database
  const getVendorApiKey = async (userId) => {
    try {
      const db = app.locals.db;
      const result = await db.query(
        'SELECT api_key FROM users WHERE id = $1',
        [userId]
      );
      
      if (result.rows.length === 0 || !result.rows[0].api_key) {
        throw new Error('Vendor API key not configured');
      }
      
      return result.rows[0].api_key;
    } catch (error) {
      throw error;
    }
  };
  
  // ============================================
  // VERIFY ENDPOINT
  // ============================================
  router.get('/verify', async (req, res) => {
    try {
      // Get vendor's API key
      const apiKey = await getVendorApiKey(req.user.userId);
      
      // Verify with Carolina API
      const response = await axios.get(`${CAROLINA_API_URL}/vendor-portal/purchase-orders`, {
        headers: {
          'x-api-key': apiKey
        },
        params: { limit: 1 } // Just verify the key works
      });
      
      res.json({
        valid: true,
        vendorName: req.user.vendorCompanyName || req.user.companyName,
        username: req.user.username
      });
    } catch (error) {
      console.error('Verify error:', error.message);
      res.status(500).json({ error: 'Verification failed' });
    }
  });
  
  // ============================================
  // GET PURCHASE ORDERS
  // ============================================
  router.get('/purchase-orders', async (req, res) => {
    try {
      console.log('Fetching purchase orders for vendor:', req.user.username);
      
      // Get vendor's API key
      const apiKey = await getVendorApiKey(req.user.userId);
      
      // Call Carolina API vendor portal
      const response = await axios.get(`${CAROLINA_API_URL}/vendor-portal/purchase-orders`, {
        headers: {
          'x-api-key': apiKey
        }
      });
      
      console.log('Purchase orders fetched:', response.data.data?.length || 0);
      
      res.json(response.data);
    } catch (error) {
      console.error('Error fetching purchase orders:', error.message);
      if (error.response) {
        console.error('API error response:', error.response.data);
        res.status(error.response.status).json(error.response.data);
      } else {
        res.status(500).json({ error: 'Failed to fetch purchase orders' });
      }
    }
  });
  
  // ============================================
  // GET PURCHASE ORDER DETAILS
  // ============================================
  router.get('/purchase-orders/:poNumber', async (req, res) => {
    try {
      const { poNumber } = req.params;
      console.log('Fetching PO details for:', poNumber);
      
      // Get vendor's API key
      const apiKey = await getVendorApiKey(req.user.userId);
      
      // Call Carolina API
      const response = await axios.get(
        `${CAROLINA_API_URL}/vendor-portal/purchase-orders/${poNumber}`,
        {
          headers: {
            'x-api-key': apiKey
          }
        }
      );
      
      console.log('PO details fetched for:', poNumber);
      
      res.json(response.data);
    } catch (error) {
      console.error('Error fetching PO details:', error.message);
      if (error.response) {
        res.status(error.response.status).json(error.response.data);
      } else {
        res.status(500).json({ error: 'Failed to fetch purchase order details' });
      }
    }
  });
  
  // ============================================
  // GET FILE DOWNLOAD URL
  // ============================================
  router.get('/files/:fileId/download', async (req, res) => {
    try {
      const { fileId } = req.params;
      console.log('Getting download URL for file:', fileId);
      
      // Get vendor's API key
      const apiKey = await getVendorApiKey(req.user.userId);
      
      // Call Carolina API to get signed URL
      const response = await axios.get(
        `${CAROLINA_API_URL}/vendor-portal/files/${fileId}/download`,
        {
          headers: {
            'x-api-key': apiKey
          }
        }
      );
      
      console.log('Download URL obtained for file:', fileId);
      
      res.json(response.data);
    } catch (error) {
      console.error('Error getting download URL:', error.message);
      if (error.response) {
        res.status(error.response.status).json(error.response.data);
      } else {
        res.status(500).json({ error: 'Failed to get download URL' });
      }
    }
  });
  
  // ============================================
  // SUBMIT ISSUE
  // ============================================
  router.post('/issues', async (req, res) => {
    try {
      const { workOrderId, workOrderPartId, poNumber, reportedBy, description } = req.body;
      
      console.log('Submitting issue for WO:', workOrderId);
      
      // Get vendor's API key
      const apiKey = await getVendorApiKey(req.user.userId);
      
      // Prepare form data
      const FormData = require('form-data');
      const formData = new FormData();
      
      formData.append('workOrderId', workOrderId);
      if (workOrderPartId) formData.append('workOrderPartId', workOrderPartId);
      if (poNumber) formData.append('poNumber', poNumber);
      if (reportedBy) formData.append('reportedBy', reportedBy);
      formData.append('description', description);
      
      // Handle photo upload if present
      if (req.files && req.files.photo) {
        formData.append('photo', req.files.photo.data, {
          filename: req.files.photo.name,
          contentType: req.files.photo.mimetype
        });
      }
      
      // Call Carolina API
      const response = await axios.post(
        `${CAROLINA_API_URL}/vendor-portal/issues`,
        formData,
        {
          headers: {
            'x-api-key': apiKey,
            ...formData.getHeaders()
          }
        }
      );
      
      console.log('Issue submitted successfully');
      
      res.json(response.data);
    } catch (error) {
      console.error('Error submitting issue:', error.message);
      if (error.response) {
        res.status(error.response.status).json(error.response.data);
      } else {
        res.status(500).json({ error: 'Failed to submit issue' });
      }
    }
  });
  
  // ============================================
  // GET ISSUES
  // ============================================
  router.get('/issues', async (req, res) => {
    try {
      console.log('Fetching issues for vendor:', req.user.username);
      
      // Get vendor's API key
      const apiKey = await getVendorApiKey(req.user.userId);
      
      // Call Carolina API
      const response = await axios.get(`${CAROLINA_API_URL}/vendor-portal/issues`, {
        headers: {
          'x-api-key': apiKey
        }
      });
      
      console.log('Issues fetched:', response.data.data?.length || 0);
      
      res.json(response.data);
    } catch (error) {
      console.error('Error fetching issues:', error.message);
      if (error.response) {
        res.status(error.response.status).json(error.response.data);
      } else {
        res.status(500).json({ error: 'Failed to fetch issues' });
      }
    }
  });
  
  app.use('/api/vendor', router);
};
