const express = require('express');
const jwt = require('jsonwebtoken');

// JWT Authentication middleware for vendors
const authenticateVendor = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
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
  
  // All vendor routes require authentication
  router.use(authenticateVendor);
  
  // ============================================
  // VERIFY ENDPOINT
  // ============================================
  router.get('/verify', (req, res) => {
    res.json({
      valid: true,
      vendorName: req.user.vendorCompanyName || req.user.companyName,
      username: req.user.username
    });
  });
  
  // ============================================
  // GET PURCHASE ORDERS
  // ============================================
  router.get('/purchase-orders', async (req, res) => {
    try {
      const db = req.app.locals.db;
      const vendorCompany = req.user.vendorCompanyName || req.user.companyName;
      
      // Get all purchase orders for this vendor
      const result = await db.query(
        `SELECT 
          po.id,
          po.po_number as "poNumber",
          po.vendor_name as "vendorName",
          po.created_at as "createdAt",
          po.due_date as "dueDate",
          po.status,
          po.total_amount as "totalAmount",
          po.notes,
          COUNT(DISTINCT pof.id) as "fileCount"
        FROM purchase_orders po
        LEFT JOIN purchase_order_files pof ON po.id = pof.purchase_order_id
        WHERE LOWER(po.vendor_name) = LOWER($1)
        GROUP BY po.id
        ORDER BY po.created_at DESC`,
        [vendorCompany]
      );
      
      res.json({ data: result.rows });
    } catch (error) {
      console.error('Error fetching purchase orders:', error);
      res.status(500).json({ error: 'Failed to fetch purchase orders' });
    }
  });
  
  // ============================================
  // GET PURCHASE ORDER DETAILS
  // ============================================
  router.get('/purchase-orders/:poNumber', async (req, res) => {
    try {
      const db = req.app.locals.db;
      const { poNumber } = req.params;
      const vendorCompany = req.user.vendorCompanyName || req.user.companyName;
      
      // Get PO details
      const poResult = await db.query(
        `SELECT 
          po.id,
          po.po_number as "poNumber",
          po.vendor_name as "vendorName",
          po.created_at as "createdAt",
          po.due_date as "dueDate",
          po.status,
          po.total_amount as "totalAmount",
          po.notes,
          po.ship_to_address as "shipToAddress"
        FROM purchase_orders po
        WHERE po.po_number = $1 AND LOWER(po.vendor_name) = LOWER($2)`,
        [poNumber, vendorCompany]
      );
      
      if (poResult.rows.length === 0) {
        return res.status(404).json({ error: 'Purchase order not found' });
      }
      
      const po = poResult.rows[0];
      
      // Get line items
      const itemsResult = await db.query(
        `SELECT 
          id,
          line_number as "lineNumber",
          description,
          quantity,
          unit_price as "unitPrice",
          total_price as "totalPrice"
        FROM purchase_order_items
        WHERE purchase_order_id = $1
        ORDER BY line_number`,
        [po.id]
      );
      
      // Get files
      const filesResult = await db.query(
        `SELECT 
          id,
          filename,
          original_name as "originalName",
          file_size as "fileSize",
          mime_type as "mimeType",
          uploaded_at as "uploadedAt"
        FROM purchase_order_files
        WHERE purchase_order_id = $1
        ORDER BY uploaded_at DESC`,
        [po.id]
      );
      
      po.items = itemsResult.rows;
      po.files = filesResult.rows.map(file => ({
        ...file,
        downloadUrl: `/api/vendor/purchase-orders/${poNumber}/files/${file.id}`
      }));
      
      res.json({ data: po });
    } catch (error) {
      console.error('Error fetching PO details:', error);
      res.status(500).json({ error: 'Failed to fetch purchase order details' });
    }
  });
  
  // ============================================
  // DOWNLOAD FILE
  // ============================================
  router.get('/purchase-orders/:poNumber/files/:fileId', async (req, res) => {
    try {
      const db = req.app.locals.db;
      const { poNumber, fileId } = req.params;
      const vendorCompany = req.user.vendorCompanyName || req.user.companyName;
      
      // Verify vendor has access to this PO
      const poResult = await db.query(
        `SELECT id FROM purchase_orders 
         WHERE po_number = $1 AND LOWER(vendor_name) = LOWER($2)`,
        [poNumber, vendorCompany]
      );
      
      if (poResult.rows.length === 0) {
        return res.status(404).json({ error: 'Purchase order not found' });
      }
      
      // Get file details
      const fileResult = await db.query(
        `SELECT filename, original_name, mime_type, file_data
         FROM purchase_order_files
         WHERE id = $1 AND purchase_order_id = $2`,
        [fileId, poResult.rows[0].id]
      );
      
      if (fileResult.rows.length === 0) {
        return res.status(404).json({ error: 'File not found' });
      }
      
      const file = fileResult.rows[0];
      
      res.setHeader('Content-Type', file.mime_type);
      res.setHeader('Content-Disposition', `attachment; filename="${file.original_name}"`);
      res.send(file.file_data);
    } catch (error) {
      console.error('Error downloading file:', error);
      res.status(500).json({ error: 'Failed to download file' });
    }
  });
  
  // ============================================
  // SUBMIT ISSUE
  // ============================================
  router.post('/issues', async (req, res) => {
    try {
      const db = req.app.locals.db;
      const { poNumber, description, priority } = req.body;
      const vendorCompany = req.user.vendorCompanyName || req.user.companyName;
      
      // Verify vendor has access to this PO
      const poResult = await db.query(
        `SELECT id FROM purchase_orders 
         WHERE po_number = $1 AND LOWER(vendor_name) = LOWER($2)`,
        [poNumber, vendorCompany]
      );
      
      if (poResult.rows.length === 0) {
        return res.status(404).json({ error: 'Purchase order not found' });
      }
      
      // Insert issue
      const result = await db.query(
        `INSERT INTO vendor_issues (
          purchase_order_id,
          vendor_name,
          description,
          priority,
          status,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING id, created_at as "createdAt"`,
        [poResult.rows[0].id, vendorCompany, description, priority || 'medium', 'open']
      );
      
      res.json({
        success: true,
        issue: {
          id: result.rows[0].id,
          poNumber,
          description,
          priority: priority || 'medium',
          status: 'open',
          createdAt: result.rows[0].createdAt
        }
      });
    } catch (error) {
      console.error('Error submitting issue:', error);
      res.status(500).json({ error: 'Failed to submit issue' });
    }
  });
  
  // ============================================
  // GET ISSUES
  // ============================================
  router.get('/issues', async (req, res) => {
    try {
      const db = req.app.locals.db;
      const vendorCompany = req.user.vendorCompanyName || req.user.companyName;
      
      const result = await db.query(
        `SELECT 
          vi.id,
          vi.description,
          vi.priority,
          vi.status,
          vi.created_at as "createdAt",
          vi.resolved_at as "resolvedAt",
          po.po_number as "poNumber"
        FROM vendor_issues vi
        JOIN purchase_orders po ON vi.purchase_order_id = po.id
        WHERE LOWER(vi.vendor_name) = LOWER($1)
        ORDER BY vi.created_at DESC`,
        [vendorCompany]
      );
      
      res.json({ data: result.rows });
    } catch (error) {
      console.error('Error fetching issues:', error);
      res.status(500).json({ error: 'Failed to fetch issues' });
    }
  });
  
  app.use('/api/vendor', router);
};
