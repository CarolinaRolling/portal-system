// Add these routes to your existing vendorRoutes.js file

// GET /api/vendor/purchase-orders/:poNumber - Get specific PO details
router.get('/purchase-orders/:poNumber', async (req, res) => {
  console.log('========================================');
  console.log('ð¦ FETCHING SINGLE PO DETAILS');
  console.log('PO Number:', req.params.poNumber);
  console.log('User:', req.user.username);
  console.log('========================================');

  try {
    // Get user's vendor API key
    const userResult = await pool.query(
      'SELECT api_key, vendor_company_name FROM users WHERE id = $1',
      [req.user.id]
    );

    if (!userResult.rows[0] || !userResult.rows[0].api_key) {
      console.log('â No API key found for user');
      return res.status(400).json({ error: 'No Carolina API key configured' });
    }

    const apiKey = userResult.rows[0].api_key;
    console.log('â API key found');

    // Call Carolina API to get specific PO
    const carolinaUrl = `https://carolina-rolling-inventory-api-641af96c90aa.herokuapp.com/api/vendor-portal/purchase-orders/${req.params.poNumber}`;
    console.log('Calling Carolina API:', carolinaUrl);

    const response = await axios.get(carolinaUrl, {
      headers: {
        'x-api-key': apiKey
      }
    });

    console.log('ð¦ Carolina API Response:');
    console.log('Status:', response.status);
    console.log('Data:', response.data);

    res.json(response.data);

  } catch (error) {
    console.error('â ERROR FETCHING PO DETAILS:');
    console.error('Error:', error.message);
    console.error('Response:', error.response?.data);
    
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch purchase order details',
      details: error.response?.data || error.message
    });
  }
});

// GET /api/vendor/files/:fileId/download - Download file
router.get('/files/:fileId/download', async (req, res) => {
  console.log('========================================');
  console.log('â¬ï¸ GETTING FILE DOWNLOAD URL');
  console.log('File ID:', req.params.fileId);
  console.log('User:', req.user.username);
  console.log('========================================');

  try {
    // Get user's vendor API key
    const userResult = await pool.query(
      'SELECT api_key FROM users WHERE id = $1',
      [req.user.id]
    );

    if (!userResult.rows[0] || !userResult.rows[0].api_key) {
      console.log('â No API key found for user');
      return res.status(400).json({ error: 'No Carolina API key configured' });
    }

    const apiKey = userResult.rows[0].api_key;
    console.log('â API key found');

    // Call Carolina API to get signed download URL
    const carolinaUrl = `https://carolina-rolling-inventory-api-641af96c90aa.herokuapp.com/api/vendor-portal/files/${req.params.fileId}/download`;
    console.log('Calling Carolina API:', carolinaUrl);

    const response = await axios.get(carolinaUrl, {
      headers: {
        'x-api-key': apiKey
      }
    });

    console.log('â Signed URL received from Carolina API');
    console.log('Response data:', response.data);

    // Return the signed URL to the frontend
    res.json(response.data);

  } catch (error) {
    console.error('â ERROR GETTING FILE URL:');
    console.error('Error:', error.message);
    console.error('Response:', error.response?.data);
    
    res.status(error.response?.status || 500).json({
      error: 'Failed to get file download URL',
      details: error.response?.data || error.message
    });
  }
});

module.exports = router;
