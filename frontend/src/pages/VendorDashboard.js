import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './Dashboard.css';

const VendorDashboard = ({ user }) => {
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [completedOrders, setCompletedOrders] = useState([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dadJoke, setDadJoke] = useState('');
  const [showJoke, setShowJoke] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchPurchaseOrders();

    // Auto-refresh every 5 minutes
    const interval = setInterval(() => {
      fetchPurchaseOrders();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  const fetchPurchaseOrders = async () => {
    console.log('========================================');
    console.log('ð­ VENDOR PORTAL - FETCHING PURCHASE ORDERS');
    console.log('========================================');
    
    try {
      setLoading(true);
      setError(null);
      
      const response = await axios.get('/api/vendor/purchase-orders', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      console.log('ð¦ RAW RESPONSE FROM VENDOR API:');
      console.log('Response object:', response);
      console.log('Response data:', response.data);
      console.log('Response status:', response.status);
      
      // Carolina API returns { data: [...work orders with POs...] }
      const workOrders = response.data.data || response.data || [];
      
      console.log('ð WORK ORDERS WITH POs:');
      console.log('Total work orders:', workOrders.length);
      console.log('Work orders data:', workOrders);
      
      if (workOrders.length > 0) {
        console.log('ð FIRST WORK ORDER SAMPLE:');
        console.log(JSON.stringify(workOrders[0], null, 2));
      }
      
      // Flatten work orders with their POs for easier display
      const activePOs = [];
      const completed = [];
      
      workOrders.forEach((wo, index) => {
        console.log(`\nð WORK ORDER #${index + 1}:`);
        console.log('  ID:', wo.id);
        console.log('  DR Number:', wo.drNumber);
        console.log('  Work Order Number:', wo.workOrderNumber);
        console.log('  Status:', wo.status);
        console.log('  Promised Date:', wo.promisedDate);
        console.log('  Purchase Orders:', wo.purchaseOrders?.length || 0);
        
        if (wo.purchaseOrders && Array.isArray(wo.purchaseOrders)) {
          wo.purchaseOrders.forEach((po, poIndex) => {
            console.log(`\n  ð¦ PO #${poIndex + 1}:`);
            console.log('    PO Number:', po.poNumber);
            console.log('    PO Type:', po.poType);
            console.log('    Service Type:', po.serviceType);
            console.log('    Part Number:', po.partNumber);
            console.log('    Quantity:', po.quantity);
            console.log('    Sent At:', po.sentAt);
            
            const poData = {
              ...po,
              workOrder: {
                id: wo.id,
                drNumber: wo.drNumber,
                workOrderNumber: wo.workOrderNumber,
                orderNumber: wo.orderNumber,
                status: wo.status,
                promisedDate: wo.promisedDate,
                requestedDueDate: wo.requestedDueDate,
                createdAt: wo.createdAt
              }
            };
            
            if (wo.status === 'completed' || wo.status === 'shipped') {
              completed.push(poData);
              console.log('    â Added to COMPLETED');
            } else {
              activePOs.push(poData);
              console.log('    ð Added to ACTIVE');
            }
          });
        } else {
          console.log('  â ï¸ No purchase orders array found!');
        }
      });
      
      console.log('\nð FINAL RESULTS:');
      console.log('Active POs:', activePOs.length);
      console.log('Completed POs:', completed.length);
      console.log('\nActive POs data:', activePOs);
      console.log('Completed POs data:', completed);
      
      setPurchaseOrders(activePOs);
      setCompletedOrders(completed);
      
      // Calculate stats
      const vendorStats = {
        totalPOs: activePOs.length,
        completedPOs: completed.length,
        pastDue: activePOs.filter(po => 
          po.workOrder.promisedDate && new Date(po.workOrder.promisedDate) < new Date()
        ).length
      };
      
      console.log('\nð VENDOR STATS:');
      console.log(vendorStats);
      
      setStats(vendorStats);
      setLoading(false);
      
      console.log('========================================');
      console.log('â VENDOR PORTAL FETCH COMPLETE');
      console.log('========================================\n');
      
    } catch (err) {
      console.error('â ERROR FETCHING VENDOR PURCHASE ORDERS:');
      console.error('Error object:', err);
      console.error('Error message:', err.message);
      console.error('Error response:', err.response);
      console.error('Error response data:', err.response?.data);
      console.error('Error response status:', err.response?.status);
      
      setError('Failed to load purchase orders. Please try again.');
      
      if (err.response?.status === 401) {
        console.log('ð Unauthorized - redirecting to login');
        navigate('/login');
      }
      
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchPurchaseOrders();
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('vendorName');
    delete axios.defaults.headers.common['Authorization'];
    window.location.href = '/login';
  };

  const fetchDadJoke = async () => {
    try {
      const response = await fetch('https://icanhazdadjoke.com/', {
        headers: { 'Accept': 'application/json' }
      });
      const data = await response.json();
      setDadJoke(data.joke);
      setShowJoke(true);
    } catch (error) {
      console.error('Error fetching dad joke:', error);
      setDadJoke("Why don't scientists trust atoms? Because they make up everything!");
      setShowJoke(true);
    }
  };

  const closeDadJoke = () => {
    setShowJoke(false);
  };

  const filterPOs = (pos) => {
    if (!pos || !Array.isArray(pos)) return [];
    if (!searchTerm || !searchTerm.trim()) return pos;
    
    const term = searchTerm.toLowerCase().trim();
    
    return pos.filter(po => {
      return (
        po.poNumber?.toLowerCase().includes(term) ||
        po.workOrder?.drNumber?.toString().includes(term) ||
        po.workOrder?.workOrderNumber?.toLowerCase().includes(term) ||
        po.serviceType?.toLowerCase().includes(term) ||
        po.leg?.toLowerCase().includes(term) ||
        po.clientPartNumber?.toLowerCase().includes(term)
      );
    });
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const isPastDue = (dateString) => {
    if (!dateString) return false;
    return new Date(dateString) < new Date();
  };

  const getStatusColor = (status) => {
    const colors = {
      'received': '#3498db',
      'processing': '#f39c12',
      'in_progress': '#9b59b6',
      'completed': '#27ae60',
      'shipped': '#16a085',
      'cancelled': '#95a5a6',
      'voided': '#e74c3c'
    };
    return colors[status] || '#95a5a6';
  };

  if (loading) {
    return (
      <div className="dashboard" style={{background: '#fef3c7'}}>
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading your purchase orders...</p>
        </div>
      </div>
    );
  }

  const filteredActivePOs = filterPOs(purchaseOrders);
  const filteredCompletedPOs = filterPOs(completedOrders);

  return (
    <div className="dashboard" style={{background: '#fef3c7'}}>
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-content">
          <div className="header-left">
            <img src="/logo.png" alt="Carolina Rolling Co Inc" className="dashboard-logo" />
            <div>
              <h1>ð­ Vendor Portal</h1>
              {user && <p className="welcome">Welcome, {user.username} â¢ {user.vendorCompanyName || user.company_name}</p>}
            </div>
          </div>
          <div className="header-actions">
            <button 
              type="button"
              onClick={fetchDadJoke} 
              className="btn-walter-easter-egg"
              title="Click for a surprise!"
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                width: '45px',
                height: '45px',
                cursor: 'pointer',
                transition: 'transform 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              <img 
                src="/walter.png" 
                alt="?"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  display: 'block'
                }}
              />
            </button>

            {/* Only show client portal link for dual-access users (admin vendors) */}
            {user?.role === 'admin' && (
              <Link to="/dashboard">
                <button type="button" className="btn-admin">
                  ð¦ Client Portal
                </button>
              </Link>
            )}

            <button type="button" onClick={handleRefresh} className="btn-refresh" disabled={loading}>
              {loading ? 'ð Refreshing...' : 'ð Refresh'}
            </button>

            <Link to="/vendor/issues">
              <button type="button" className="btn-admin">
                â ï¸ Issues
              </button>
            </Link>

            <button type="button" onClick={handleLogout} className="btn-logout">
              Logout
            </button>
          </div>
        </div>
        
        {/* Search Bar */}
        <div className="search-container" style={{marginTop: '1rem', position: 'relative'}}>
          <input
            type="text"
            placeholder="ð Search by PO#, DR#, Service Type, Part#..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              fontSize: '1rem',
              border: '2px solid #e0e0e0',
              borderRadius: '8px',
              outline: 'none',
              transition: 'border-color 0.2s'
            }}
            onFocus={(e) => e.target.style.borderColor = '#f59e0b'}
            onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              style={{
                position: 'absolute',
                right: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1.2rem',
                color: '#666'
              }}
            >
              â
            </button>
          )}
        </div>
        
        {/* Dad Joke Display */}
        {showJoke && dadJoke && (
          <div style={{marginTop: '1rem', position: 'relative', display: 'flex', gap: '1rem', alignItems: 'flex-start'}}>
            <img 
              src="/walter.png" 
              alt="Walter" 
              style={{
                width: '100px',
                height: '100px',
                borderRadius: '50%',
                objectFit: 'cover',
                border: '4px solid white',
                boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
                flexShrink: 0
              }}
            />
            <div className="dad-joke-banner" style={{
              flex: 1,
              padding: '1.25rem 3rem 1.25rem 1.5rem',
              background: 'white',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              position: 'relative',
              animation: 'slideIn 0.3s ease-out'
            }}>
              <button 
                onClick={closeDadJoke}
                style={{
                  position: 'absolute',
                  top: '0.75rem',
                  right: '0.75rem',
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#666',
                  lineHeight: 1,
                  padding: 0
                }}
              >
                â
              </button>
              <p style={{
                margin: 0,
                fontSize: '1.1rem',
                color: '#333',
                lineHeight: '1.6'
              }}>
                {dadJoke}
              </p>
              <div style={{
                position: 'absolute',
                left: '-20px',
                top: '40px',
                width: 0,
                height: 0,
                borderTop: '10px solid transparent',
                borderBottom: '10px solid transparent',
                borderRight: '20px solid white',
                filter: 'drop-shadow(-2px 0 2px rgba(0,0,0,0.1))'
              }}></div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="error-banner">
          <span>â ï¸</span> {error}
        </div>
      )}

      {/* Statistics Grid */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">ð¦</div>
            <div className="stat-content">
              <div className="stat-value">{stats.totalPOs}</div>
              <div className="stat-label">Active Purchase Orders</div>
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon">â</div>
            <div className="stat-content">
              <div className="stat-value">{stats.completedPOs}</div>
              <div className="stat-label">Completed Orders</div>
            </div>
          </div>
          
          {stats.pastDue > 0 && (
            <div className="stat-card">
              <div className="stat-icon">â ï¸</div>
              <div className="stat-content">
                <div className="stat-value" style={{color: '#e74c3c'}}>{stats.pastDue}</div>
                <div className="stat-label">Past Due</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Active Purchase Orders */}
      <div className="section">
        <h2 className="section-title">ð Active Purchase Orders</h2>
        
        {filteredActivePOs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">ð­</div>
            <h3>No active purchase orders</h3>
            <p>You'll see purchase orders here when work is assigned to you.</p>
          </div>
        ) : (
          <div className="cards-grid">
            {filteredActivePOs.map((po) => (
              <div key={`${po.workOrder.id}-${po.poNumber}`} className="order-card">
                <div className="card-header">
                  <div>
                    <h3>
                      {po.poType === 'outside_processing' ? 'ð¦' : 'ð'} {po.poNumber}
                    </h3>
                    <p className="wo-number">
                      DR-{po.workOrder.drNumber} â¢ {po.workOrder.workOrderNumber}
                    </p>
                  </div>
                  <span 
                    className="status-badge" 
                    style={{background: getStatusColor(po.workOrder.status)}}
                  >
                    {po.workOrder.status}
                  </span>
                </div>

                <div className="card-body">
                  {po.serviceType && (
                    <p><strong>Service:</strong> {po.serviceType}</p>
                  )}
                  
                  {po.leg && (
                    <p><strong>Transport:</strong> {po.leg}</p>
                  )}
                  
                  {po.partNumber && (
                    <p>
                      <strong>Part #{po.partNumber}</strong>
                      {po.clientPartNumber && ` â¢ ${po.clientPartNumber}`}
                      {po.quantity && ` â¢ Qty: ${po.quantity}`}
                    </p>
                  )}
                  
                  {po.sentAt && (
                    <p className="date">
                      <strong>Sent:</strong> {formatDate(po.sentAt)}
                    </p>
                  )}
                  
                  {po.workOrder.promisedDate && (
                    <p 
                      className="date promised" 
                      style={{
                        color: isPastDue(po.workOrder.promisedDate) ? '#e74c3c' : '#f39c12',
                        fontWeight: '600'
                      }}
                    >
                      <strong>Due:</strong> {formatDate(po.workOrder.promisedDate)}
                      {isPastDue(po.workOrder.promisedDate) && ' â ï¸ PAST DUE'}
                    </p>
                  )}

                  <div style={{marginTop: '1rem', display: 'flex', gap: '0.5rem'}}>
                    <button 
                      onClick={() => navigate(`/vendor/po/${po.poNumber}`)}
                      style={{
                        flex: 1,
                        padding: '0.75rem',
                        background: '#f59e0b',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: '600'
                      }}
                    >
                      View Details
                    </button>
                    <button 
                      onClick={() => navigate(`/vendor/po/${po.poNumber}`)}
                      style={{
                        padding: '0.75rem 1rem',
                        background: '#f59e0b',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        opacity: 0.8
                      }}
                    >
                      ð Files
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completed Orders (Toggle) */}
      {completedOrders.length > 0 && (
        <div className="section">
          <div className="section-header-toggle">
            <h2 className="section-title">â Completed Orders ({completedOrders.length})</h2>
            <button 
              onClick={() => setShowCompleted(!showCompleted)} 
              className="toggle-btn"
            >
              {showCompleted ? 'Hide Completed' : 'Show Completed'}
            </button>
          </div>

          {showCompleted && (
            <div className="cards-grid">
              {filteredCompletedPOs.map((po) => (
                <div key={`${po.workOrder.id}-${po.poNumber}`} className="order-card completed-card">
                  <div className="card-header">
                    <div>
                      <h3>
                        {po.poType === 'outside_processing' ? 'ð¦' : 'ð'} {po.poNumber}
                      </h3>
                      <p className="wo-number">
                        DR-{po.workOrder.drNumber} â¢ {po.workOrder.workOrderNumber}
                      </p>
                    </div>
                    <span 
                      className="status-badge" 
                      style={{background: getStatusColor(po.workOrder.status)}}
                    >
                      {po.workOrder.status}
                    </span>
                  </div>

                  <div className="card-body">
                    {po.serviceType && (
                      <p><strong>Service:</strong> {po.serviceType}</p>
                    )}
                    
                    {po.partNumber && (
                      <p>
                        <strong>Part #{po.partNumber}</strong>
                        {po.clientPartNumber && ` â¢ ${po.clientPartNumber}`}
                      </p>
                    )}
                    
                    <p className="date completed">
                      â Completed
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VendorDashboard;
