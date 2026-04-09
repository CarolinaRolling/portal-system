const axios = require('axios');
const { pool } = require('../database/migrate');
const { sendEmail } = require('./emailService');

// Configuration for your Carolina Rolling Inventory API
const INVENTORY_API_URL = process.env.INVENTORY_API_URL || 'https://carolina-rolling-inventory-api-641af96c90aa.herokuapp.com/api';

/**
 * Check a single order status from your Carolina Rolling Inventory API
 * 
 * This function searches both shipments and inbound orders for the PO number
 * AND matches the client name to prevent confusion between different clients
 * who might have similar purchase order numbers.
 * 
 * Matching logic:
 * - PO Number must match exactly (clientPurchaseOrderNumber field)
 * - Client Name must match or be contained (clientName field)
 * - Both conditions must be true for a match
 */
async function checkInventoryStatus(poNumber, clientName) {
  try {
    // First, try to find in shipments
    const shipmentsResponse = await axios.get(`${INVENTORY_API_URL}/shipments`, {
      timeout: 10000
    });

    if (shipmentsResponse.data && shipmentsResponse.data.length > 0) {
      // Search for matching PO number AND client name to ensure correct match
      // This prevents confusion if multiple clients have similar PO numbers
      const shipment = shipmentsResponse.data.find(s => {
        const poMatches = s.clientPurchaseOrderNumber === poNumber;
        const clientMatches = !clientName || s.clientName === clientName || 
                              (s.clientName && s.clientName.toLowerCase().includes(clientName.toLowerCase()));
        return poMatches && clientMatches;
      });

      if (shipment) {
        console.log(`✅ Found shipment match: PO "${shipment.clientPurchaseOrderNumber}" for client "${shipment.clientName}"`);
        
        let status = 'pending';
        
        // Map your shipment status to portal status
        // IMPORTANT: Update these based on your actual status values
        // Check your database to see what status values you're using
        
        if (shipment.status === 'delivered' || shipment.status === 'received') {
          status = 'received';
        } else if (shipment.status === 'shipped' || shipment.status === 'in_transit' || shipment.status === 'out_for_delivery') {
          status = 'shipped';
        } else if (shipment.status === 'processing' || shipment.status === 'preparing') {
          status = 'processing';
        } else if (shipment.status === 'pending' || shipment.status === 'awaiting') {
          status = 'pending';
        }

        return {
          found: true,
          status: status,
          details: {
            id: shipment.id,
            clientName: shipment.clientName,
            clientPurchaseOrderNumber: shipment.clientPurchaseOrderNumber,
            location: shipment.location,
            qrCode: shipment.qrCode,
            description: shipment.description,
            quantity: shipment.quantity,
            updatedAt: shipment.updatedAt
          }
        };
      }
    }

    // If not found in shipments, try inbound orders
    const inboundResponse = await axios.get(`${INVENTORY_API_URL}/inbound`, {
      timeout: 10000
    });

    if (inboundResponse.data && inboundResponse.data.length > 0) {
      // Search for matching PO number AND client name in inbound orders
      const inbound = inboundResponse.data.find(i => {
        const poMatches = i.clientPurchaseOrderNumber === poNumber;
        const clientMatches = !clientName || i.clientName === clientName || 
                              (i.clientName && i.clientName.toLowerCase().includes(clientName.toLowerCase()));
        return poMatches && clientMatches;
      });

      if (inbound) {
        console.log(`✅ Found inbound order match: PO "${inbound.clientPurchaseOrderNumber}" for client "${inbound.clientName}"`);
        
        let status = 'pending';
        
        // Map your inbound order status to portal status
        if (inbound.status === 'received' || inbound.status === 'completed') {
          status = 'received';
        } else if (inbound.status === 'shipped' || inbound.status === 'in_transit') {
          status = 'shipped';
        } else if (inbound.status === 'processing' || inbound.status === 'ordered') {
          status = 'processing';
        } else if (inbound.status === 'pending' || inbound.status === 'awaiting') {
          status = 'pending';
        }

        return {
          found: true,
          status: status,
          details: {
            id: inbound.id,
            clientName: inbound.clientName,
            clientPurchaseOrderNumber: inbound.clientPurchaseOrderNumber,
            supplier: inbound.supplier,
            expectedDate: inbound.expectedDate,
            quantity: inbound.quantity,
            description: inbound.description,
            updatedAt: inbound.updatedAt
          }
        };
      }
    }

    // Not found in either shipments or inbound orders
    return { found: false };

  } catch (error) {
    console.error(`Error checking inventory for PO ${poNumber}:`, error.message);
    
    // Return null to indicate we couldn't check (don't update status)
    return null;
  }
}

/**
 * Alternative: Check by QR code if that's what clients will provide
 */
async function checkInventoryByQR(qrCode) {
  try {
    const response = await axios.get(`${INVENTORY_API_URL}/shipments/qr/${qrCode}`, {
      timeout: 10000
    });

    if (response.data) {
      const shipment = response.data;
      let status = 'pending';
      
      if (shipment.status === 'delivered' || shipment.status === 'received') {
        status = 'received';
      } else if (shipment.status === 'shipped' || shipment.status === 'in_transit') {
        status = 'shipped';
      } else if (shipment.status === 'processing') {
        status = 'processing';
      }

      return {
        found: true,
        status: status,
        details: shipment
      };
    }

    return { found: false };
  } catch (error) {
    console.error(`Error checking by QR ${qrCode}:`, error.message);
    return null;
  }
}

/**
 * Check all pending/shipped orders and update their statuses
 */
async function checkOrderStatuses() {
  const client = await pool.connect();
  
  try {
    // Get all orders that aren't received yet
    const result = await client.query(
      `SELECT o.*, u.email, u.company_name as user_company_name
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       WHERE o.status IN ('pending', 'processing', 'shipped')
       ORDER BY o.id`
    );

    console.log(`Checking ${result.rows.length} orders against Carolina Rolling Inventory API...`);

    for (const order of result.rows) {
      console.log(`🔍 Checking: PO "${order.po_number}" for client "${order.client_name}"`);
      const inventoryStatus = await checkInventoryStatus(order.po_number, order.client_name);

      if (inventoryStatus === null) {
        // API error - skip this order
        console.log(`⚠️  Could not check order ${order.po_number} - API error`);
        continue;
      }

      if (!inventoryStatus.found) {
        // Order not found in inventory - no change
        console.log(`ℹ️  Order ${order.po_number} not found in inventory yet`);
        await client.query(
          'UPDATE orders SET last_checked = CURRENT_TIMESTAMP WHERE id = $1',
          [order.id]
        );
        continue;
      }

      // Check if status changed
      if (inventoryStatus.status !== order.status) {
        console.log(`✅ Order ${order.po_number} status changed: ${order.status} → ${inventoryStatus.status}`);

        // Update order status
        await client.query(
          `UPDATE orders 
           SET status = $1, last_checked = CURRENT_TIMESTAMP, 
               last_status_change = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [inventoryStatus.status, order.id]
        );

        // Log status change
        await client.query(
          'INSERT INTO status_history (order_id, old_status, new_status) VALUES ($1, $2, $3)',
          [order.id, order.status, inventoryStatus.status]
        );

        // Send email notification to user
        if (order.email) {
          await sendStatusChangeEmail(order, inventoryStatus.status, inventoryStatus.details);
        }
      } else {
        // Status unchanged - just update last_checked
        await client.query(
          'UPDATE orders SET last_checked = CURRENT_TIMESTAMP WHERE id = $1',
          [order.id]
        );
      }
    }

    console.log('✅ Status check completed');
  } catch (error) {
    console.error('❌ Error checking order statuses:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Send status change notification email
 */
async function sendStatusChangeEmail(order, newStatus, details) {
  const statusMessages = {
    'processing': 'is being processed',
    'shipped': 'has been shipped',
    'received': 'has been received'
  };

  const subject = `Order Update: PO #${order.po_number}`;
  
  let detailsHtml = '';
  if (details) {
    detailsHtml = `
      <h3>Additional Details:</h3>
      <ul>
        ${details.clientName ? `<li><strong>Client Name (from inventory):</strong> ${details.clientName}</li>` : ''}
        ${details.clientPurchaseOrderNumber ? `<li><strong>PO Number (from inventory):</strong> ${details.clientPurchaseOrderNumber}</li>` : ''}
        ${details.location ? `<li><strong>Location:</strong> ${details.location}</li>` : ''}
        ${details.qrCode ? `<li><strong>QR Code:</strong> ${details.qrCode}</li>` : ''}
        ${details.quantity ? `<li><strong>Quantity:</strong> ${details.quantity}</li>` : ''}
        ${details.description ? `<li><strong>Description:</strong> ${details.description}</li>` : ''}
      </ul>
    `;
  }

  const message = `
    <h2>Order Status Update</h2>
    <p>Your order <strong>${order.po_number}</strong> ${statusMessages[newStatus] || 'status has been updated'}.</p>
    
    <h3>Order Details:</h3>
    <ul>
      <li><strong>PO Number:</strong> ${order.po_number}</li>
      <li><strong>Client Name:</strong> ${order.client_name || 'N/A'}</li>
      <li><strong>New Status:</strong> ${newStatus.toUpperCase()}</li>
      <li><strong>Date Required:</strong> ${new Date(order.date_required).toLocaleDateString()}</li>
    </ul>
    
    ${detailsHtml}
    
    <p>You can view your order details by logging into the portal.</p>
  `;

  await sendEmail(order.email, subject, message);
}

/**
 * Check for orders approaching due date and send alerts
 */
async function sendDelayAlerts() {
  const client = await pool.connect();
  
  try {
    // Get alert threshold from settings
    const settingsResult = await client.query(
      "SELECT setting_value FROM email_settings WHERE setting_key = 'alert_days_threshold'"
    );
    const daysThreshold = parseInt(settingsResult.rows[0]?.setting_value || '5');

    // Get orders that are not received and due within threshold
    const result = await client.query(
      `SELECT o.*, u.email, u.company_name as user_company_name
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       WHERE o.status != 'received'
       AND o.date_required <= CURRENT_DATE + INTERVAL '${daysThreshold} days'
       AND o.date_required >= CURRENT_DATE
       ORDER BY o.date_required`
    );

    if (result.rows.length === 0) {
      console.log('No delayed orders to alert about');
      return;
    }

    console.log(`Found ${result.rows.length} orders approaching due date`);

    // Get alert recipients
    const recipientsResult = await client.query(
      'SELECT email FROM alert_recipients WHERE is_active = true'
    );
    const recipients = recipientsResult.rows.map(r => r.email);

    if (recipients.length === 0) {
      console.log('⚠️  No alert recipients configured - skipping admin alerts');
    }

    // Group orders by user
    const ordersByUser = {};
    for (const order of result.rows) {
      if (!ordersByUser[order.email]) {
        ordersByUser[order.email] = [];
      }
      ordersByUser[order.email].push(order);
    }

    // Send alerts to each client
    for (const [userEmail, orders] of Object.entries(ordersByUser)) {
      await sendDelayAlertEmail(userEmail, orders, daysThreshold);
    }

    // Send summary to admin recipients
    if (recipients.length > 0) {
      await sendAdminDelayAlert(recipients, result.rows, daysThreshold);
    }

    console.log('✅ Delay alerts sent');
  } catch (error) {
    console.error('❌ Error sending delay alerts:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Send delay alert email to client
 */
async function sendDelayAlertEmail(userEmail, orders, daysThreshold) {
  const subject = `⚠️ Order Delivery Alert - ${orders.length} Order(s) Not Received`;
  
  const ordersList = orders.map(order => {
    const daysUntilDue = Math.ceil((new Date(order.date_required) - new Date()) / (1000 * 60 * 60 * 24));
    return `
      <li>
        <strong>PO #${order.po_number}</strong><br>
        Status: ${order.status.toUpperCase()}<br>
        Due Date: ${new Date(order.date_required).toLocaleDateString()} 
        <span style="color: ${daysUntilDue <= 2 ? '#e74c3c' : '#f39c12'};">
          (${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''} remaining)
        </span><br>
        Client: ${order.client_name || 'N/A'}
      </li>
    `;
  }).join('');

  const message = `
    <h2>⚠️ Order Delivery Alert</h2>
    <p>The following order(s) have not been received and are due within ${daysThreshold} days:</p>
    
    <ul style="line-height: 2;">
      ${ordersList}
    </ul>
    
    <p>Please check on the status of these orders to ensure timely delivery.</p>
    <p>You can view more details by logging into the portal.</p>
  `;

  await sendEmail(userEmail, subject, message);
}

/**
 * Send summary delay alert to admin recipients
 */
async function sendAdminDelayAlert(recipients, orders, daysThreshold) {
  const subject = `Admin Alert: ${orders.length} Order(s) Not Received`;
  
  const ordersList = orders.map(order => {
    const daysUntilDue = Math.ceil((new Date(order.date_required) - new Date()) / (1000 * 60 * 60 * 24));
    return `
      <li>
        <strong>PO #${order.po_number}</strong> - ${order.user_company_name || 'Unknown Company'}<br>
        Status: ${order.status.toUpperCase()}<br>
        Due: ${new Date(order.date_required).toLocaleDateString()} (${daysUntilDue} days)<br>
        Client Email: ${order.email}
      </li>
    `;
  }).join('');

  const message = `
    <h2>Admin: Order Delivery Alert Summary</h2>
    <p>${orders.length} order(s) have not been received and are due within ${daysThreshold} days:</p>
    
    <ul style="line-height: 2.5;">
      ${ordersList}
    </ul>
    
    <p>Clients have been notified automatically.</p>
  `;

  // Send to all admin recipients
  for (const recipient of recipients) {
    await sendEmail(recipient, subject, message);
  }
}

module.exports = {
  checkOrderStatuses,
  sendDelayAlerts,
  checkInventoryStatus,
  checkInventoryByQR
};
