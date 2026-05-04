import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import './Dashboard.css';

const Dashboard = ({ user }) => {
  const [recentEstimates, setRecentEstimates] = useState([]);
  const [olderEstimates, setOlderEstimates] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [recentlyShipped, setRecentlyShipped] = useState([]);
  const [completedOrders, setCompletedOrders] = useState([]);
  const [showRecent, setShowRecent] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showOlderEstimates, setShowOlderEstimates] = useState(false);
  const [workOrderMTRs, setWorkOrderMTRs] = useState({}); // Store MTRs by work order ID
  const [expandedMTRs, setExpandedMTRs] = useState({}); // Track which work orders have MTRs expanded
  const [workOrderPortalDocs, setWorkOrderPortalDocs] = useState({}); // Store portal documents by DR number (all types)
  const [expandedPortalDocs, setExpandedPortalDocs] = useState({}); // Track which work orders have COC/portal docs expanded
  const [expandedShippingDocs, setExpandedShippingDocs] = useState({}); // Track which work orders have shipping docs expanded
  const [estimatePDFs, setEstimatePDFs] = useState({}); // Store PDF files by estimate ID
  const [estimatePortalFiles, setEstimatePortalFiles] = useState({}); // Store portal files by estimate number
  const [expandedEstimateFiles, setExpandedEstimateFiles] = useState({}); // Track which estimates have files expanded
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dadJoke, setDadJoke] = useState('');
  const [showJoke, setShowJoke] = useState(false);

  useEffect(() => {
    fetchOrders();
    fetchStats();

    // Auto-refresh every 5 minutes
    const interval = setInterval(() => {
      fetchOrders();
      fetchStats();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get('/api/orders');
      const fetchedWorkOrders = response.data.workOrders || [];
      const fetchedEstimates = response.data.estimates || [];
      
      // Log all work orders to see what we have
      console.log('Total work orders fetched:', fetchedWorkOrders.length);
      console.log('Total estimates fetched:', fetchedEstimates.length);
      console.log('All work orders:', fetchedWorkOrders);
      
      // Deduplicate work orders by ID (API sometimes returns duplicates)
      const uniqueWorkOrders = Array.from(
        new Map(fetchedWorkOrders.map(wo => [wo.id, wo])).values()
      );
      
      if (fetchedWorkOrders.length !== uniqueWorkOrders.length) {
        console.warn(`⚠️ Removed ${fetchedWorkOrders.length - uniqueWorkOrders.length} duplicate work orders from API response`);
        console.log(`Before deduplication: ${fetchedWorkOrders.length} work orders`);
        console.log(`After deduplication: ${uniqueWorkOrders.length} work orders`);
      }
      
      // Use deduplicated work orders for all processing
      const workOrdersToProcess = uniqueWorkOrders;
      
      // DEBUG: Log estimate details
      console.log('========================================');
      console.log('ESTIMATE DETAILS:');
      console.log('Total estimates:', fetchedEstimates.length);
      console.log('Estimate statuses:', fetchedEstimates.map(e => ({
        number: e.estimateNumber,
        status: e.status,
        createdAt: e.createdAt
      })));
      fetchedEstimates.forEach(est => {
        console.log(`Estimate ${est.estimateNumber}:`, {
          createdAt: est.createdAt,
          status: est.status,
          archived: est.archived,
          age: est.createdAt ? Math.floor((new Date() - new Date(est.createdAt)) / (1000 * 60 * 60 * 24)) + ' days' : 'unknown'
        });
      });
      console.log('========================================');
      
      // Split work orders into THREE categories:
      // 1. Active = not shipped at all (in progress)
      // 2. Recently Shipped = shipped within last 30 days
      // 3. Completed = shipped between 30-90 days ago (3-month limit)
      
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      
      // Helper function to check if order is shipped
      const isShipped = (wo) => {
        const status = (wo.status || '').toLowerCase();
        return (
          status === 'shipped' || 
          status === 'picked up' ||
          status === 'completed' ||
          status === 'done' ||
          status === 'delivered' ||
          status === 'picked_up' ||
          wo.shippedAt || 
          wo.pickedUpAt
        );
      };
      
      // 1. Active orders - NOT shipped at all
      const active = workOrdersToProcess.filter(wo => !isShipped(wo));
      
      // 2. Recently shipped - shipped within 30 days
      const recent = workOrdersToProcess.filter(wo => {
        if (!isShipped(wo)) return false;
        
        const shippedDate = wo.shippedAt || wo.pickedUpAt || wo.completedAt;
        if (!shippedDate) return false;
        
        const shipDate = new Date(shippedDate);
        return shipDate >= thirtyDaysAgo; // Shipped within last 30 days
      });
      
      // 3. Completed - shipped between 30-90 days ago (3-month limit)
      const completed = workOrdersToProcess.filter(wo => {
        if (!isShipped(wo)) return false;
        
        const shippedDate = wo.shippedAt || wo.pickedUpAt || wo.completedAt;
        if (!shippedDate) return false;
        
        const shipDate = new Date(shippedDate);
        return shipDate < thirtyDaysAgo && shipDate >= ninetyDaysAgo; // Between 30-90 days
      });
      
      console.log('Active orders (in progress):', active.length);
      console.log('Recently shipped (< 30 days):', recent.length);
      console.log('Archived orders (30-90 days):', completed.length);
      console.log('Sample statuses:', workOrdersToProcess.map(wo => wo.status));
      console.log('Sample shipped dates:', workOrdersToProcess.map(wo => ({ 
        dr: wo.drNumber, 
        shippedAt: wo.shippedAt, 
        pickedUpAt: wo.pickedUpAt 
      })));

      // DEBUG: Log all keys on a picked-up work order so we can identify the
      // exact "picked up by" field name from Carolina. Also expands pickupHistory
      // because Carolina stores the real pickup details there.
      // Remove these logs once getPickedUpBy() is locked to the canonical field name.
      const samplePickedUp = workOrdersToProcess.find(wo => wo.pickedUpAt);
      if (samplePickedUp) {
        console.log('🔍 PICKED-UP WO ALL KEYS:', Object.keys(samplePickedUp).sort());
        console.log('🔍 PICKED-UP WO pickedUpBy (top-level):', samplePickedUp.pickedUpBy);
        if (Array.isArray(samplePickedUp.pickupHistory) && samplePickedUp.pickupHistory.length > 0) {
          const last = samplePickedUp.pickupHistory[samplePickedUp.pickupHistory.length - 1];
          console.log('🔍 pickupHistory entry count:', samplePickedUp.pickupHistory.length);
          console.log('🔍 pickupHistory[latest] KEYS:', Object.keys(last || {}).sort());
          console.log('🔍 pickupHistory[latest] FULL:', last);
        } else {
          console.log('🔍 pickupHistory is empty or missing');
        }
      }
      
      // DEBUG: Check for duplicates in recently shipped
      const recentIds = recent.map(wo => wo.id);
      const recentDrNumbers = recent.map(wo => wo.drNumber);
      const uniqueIds = new Set(recentIds);
      const uniqueDrNumbers = new Set(recentDrNumbers);
      console.log('Recently shipped - Total:', recent.length);
      console.log('Recently shipped - Unique IDs:', uniqueIds.size);
      console.log('Recently shipped - Unique DR numbers:', uniqueDrNumbers.size);
      if (recent.length !== uniqueIds.size) {
        console.warn('⚠️ DUPLICATE IDs DETECTED IN RECENTLY SHIPPED!');
        console.log('IDs:', recentIds);
        console.log('DR Numbers:', recentDrNumbers);
      }
      
      // Split estimates into recent (< 30 days) and older (30-90 days, 3-month limit)
      const recentEst = fetchedEstimates.filter(est => {
        if (!est.createdAt) return true; // If no date, keep as recent
        const estDate = new Date(est.createdAt);
        return estDate >= thirtyDaysAgo; // Created within last 30 days
      });
      
      const olderEst = fetchedEstimates.filter(est => {
        if (!est.createdAt) return false; // If no date, don't put in older
        const estDate = new Date(est.createdAt);
        return estDate < thirtyDaysAgo && estDate >= ninetyDaysAgo; // Between 30-90 days
      });
      
      console.log('Recent estimates (< 30 days):', recentEst.length);
      console.log('Older estimates (30-90 days):', olderEst.length);
      
      setWorkOrders(active);
      setRecentlyShipped(recent);
      setCompletedOrders(completed);
      setRecentEstimates(recentEst);
      setOlderEstimates(olderEst);
      
      // Fetch MTRs for all work orders (using deduplicated list)
      fetchMTRsForWorkOrders(workOrdersToProcess);
      
      // Fetch portal documents for all work orders (using deduplicated list)
      fetchPortalDocsForWorkOrders(workOrdersToProcess);
      
      // Fetch PDFs for all estimates
      fetchEstimatePDFs(fetchedEstimates);
      
      // Fetch portal files for all estimates
      fetchPortalFilesForEstimates(fetchedEstimates);
    } catch (error) {
      console.error('Error fetching orders:', error);
      setError('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  const fetchMTRsForWorkOrders = async (workOrders) => {
    console.log('========================================');
    console.log('FETCHING MTRs FOR ALL WORK ORDERS');
    console.log('Total work orders:', workOrders.length);
    console.log('========================================');
    
    const mtrData = {};
    
    for (const wo of workOrders) {
      try {
        console.log(`Fetching MTRs for WO ${wo.drNumber} (ID: ${wo.id})`);
        const response = await axios.get(`/api/workorders/${wo.id}`);
        console.log(`Response for ${wo.drNumber}:`, response.data);
        
        const mtrs = response.data.mtrs || [];
        console.log(`MTRs found for ${wo.drNumber}:`, mtrs.length);
        if (mtrs.length > 0) {
          console.log(`MTR details for ${wo.drNumber}:`, mtrs);
        }
        
        mtrData[wo.id] = mtrs;
      } catch (error) {
        console.error(`Error fetching MTRs for work order ${wo.drNumber}:`, error);
        mtrData[wo.id] = [];
      }
    }
    
    console.log('');
    console.log('FINAL MTR DATA:');
    console.log('Total work orders with MTRs:', Object.keys(mtrData).filter(id => mtrData[id].length > 0).length);
    console.log('MTR data by work order:', mtrData);
    console.log('========================================');
    
    setWorkOrderMTRs(mtrData);
  };

  const handleDownloadMTR = async (workOrderId, documentId, fileName) => {
    try {
      const response = await axios.get(
        `/api/workorders/${workOrderId}/documents/${documentId}/download`,
        { responseType: 'blob' }
      );
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading MTR:', error);
      alert('Failed to download MTR');
    }
  };

  const handleViewMTR = async (workOrderId, documentId, fileName) => {
    try {
      console.log('Opening MTR:', fileName);
      
      const response = await axios.get(
        `/api/workorders/${workOrderId}/documents/${documentId}/download`,
        { responseType: 'blob' }
      );
      
      // Create blob URL and open in new tab
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
      
      // Clean up after a delay to allow the new tab to load
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 1000);
      
      console.log('MTR opened in new tab');
    } catch (error) {
      console.error('Error viewing MTR:', error);
      alert('Failed to view MTR');
    }
  };

  const toggleMTRs = (workOrderId) => {
    setExpandedMTRs(prev => ({
      ...prev,
      [workOrderId]: !prev[workOrderId]
    }));
  };

  // ============================================
  // PORTAL DOCUMENTS - Work Orders
  // ============================================

  const fetchPortalDocsForWorkOrders = async (workOrders) => {
    console.log('========================================');
    console.log('FETCHING PORTAL DOCUMENTS FOR WORK ORDERS');
    console.log('Total work orders:', workOrders.length);
    console.log('========================================');
    
    const portalDocsData = {};
    
    for (const wo of workOrders) {
      try {
        console.log(`Fetching portal docs for DR ${wo.drNumber}...`);
        const response = await axios.get(`/api/portal/workorders/${wo.drNumber}/documents`);
        console.log(`Response for ${wo.drNumber}:`, response.data);
        
        // New API format: { data: [...] } with downloadUrl included
        let docs = [];
        if (response.data && response.data.data && Array.isArray(response.data.data)) {
          docs = response.data.data;
        } else if (Array.isArray(response.data)) {
          // Fallback: direct array
          docs = response.data;
        }
        
        portalDocsData[wo.drNumber] = docs;
        console.log(`Portal docs count for ${wo.drNumber}:`, docs.length);
        console.log(`Portal docs structure check - Is array?`, Array.isArray(docs));
        if (docs.length > 0) {
          console.log(`Portal docs details:`, docs);
          console.log(`Sample doc:`, docs[0]);
        }
      } catch (error) {
        console.error(`Error fetching portal docs for ${wo.drNumber}:`, error.message);
        console.error('Full error:', error);
        portalDocsData[wo.drNumber] = [];
      }
    }
    
    console.log('');
    console.log('FINAL PORTAL DOCS DATA:');
    console.log('Work orders with portal docs:', Object.keys(portalDocsData).filter(dr => portalDocsData[dr].length > 0).length);
    console.log('Portal docs by DR:', portalDocsData);
    console.log('========================================');
    
    setWorkOrderPortalDocs(portalDocsData);
  };

  const togglePortalDocs = (drNumber) => {
    setExpandedPortalDocs(prev => ({
      ...prev,
      [drNumber]: !prev[drNumber]
    }));
  };

  const toggleShippingDocs = (drNumber) => {
    setExpandedShippingDocs(prev => ({
      ...prev,
      [drNumber]: !prev[drNumber]
    }));
  };

  // Split portal docs into shipping docs vs everything else (COC + other).
  // Carolina API tags shipping documents with documentType === 'shipping_doc'.
  // Anything else from the portal endpoint (COCs, etc.) goes in the "COC" bucket.
  const isShippingDoc = (doc) => {
    const t = (doc.documentType || doc.type || '').toLowerCase();
    return t === 'shipping_doc' || t === 'shipping' || t === 'bol';
  };
  const getShippingDocs = (drNumber) =>
    (workOrderPortalDocs[drNumber] || []).filter(isShippingDoc);
  const getCocDocs = (drNumber) =>
    (workOrderPortalDocs[drNumber] || []).filter(d => !isShippingDoc(d));

  // Render a portal-doc section (COC or Shipping). Returns null when empty so
  // the section disappears entirely if there are no docs of that type.
  const renderPortalDocSection = ({ drNumber, docs, title, isExpanded, onToggle }) => {
    if (!docs || docs.length === 0) return null;
    return (
      <div className="mtr-section" style={{ marginTop: '1rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.5rem',
            cursor: 'pointer'
          }}
          onClick={onToggle}
        >
          <p className="mtr-title" style={{ margin: 0 }}>
            {title} ({docs.length})
          </p>
          <button
            className="toggle-btn"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.9rem',
              padding: '0.25rem 0.5rem'
            }}
          >
            {isExpanded ? '▼ Hide' : '▶ Show'}
          </button>
        </div>

        {isExpanded && (
          <div className="mtr-list">
            {docs.map((doc) => (
              <div key={doc.id} style={{ marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem' }}>
                  {doc.name}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    className="mtr-download-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleViewPortalDoc(drNumber, doc.id, doc.name, doc.downloadUrl);
                    }}
                    title={`View ${doc.name}`}
                  >
                    👁️ View
                  </button>
                  <button
                    className="mtr-download-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownloadPortalDoc(drNumber, doc.id, doc.name, doc.downloadUrl);
                    }}
                    title={`Download ${doc.name}`}
                  >
                    📥 Download
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // True if the value is a real name (not null, empty, or a placeholder like "unknown").
  // Carolina's API returns the literal string "unknown" as a default when no name was
  // captured at pickup, so we have to filter it out explicitly.
  const isMeaningfulName = (v) => {
    if (!v || typeof v !== 'string') return false;
    const t = v.trim().toLowerCase();
    return t.length > 0 && t !== 'unknown' && t !== 'n/a' && t !== 'none' && t !== 'null';
  };

  // Resolve "picked up by" — prefer the pickupHistory array (which cradmin reads from),
  // fall back to the top-level pickedUpBy field. The exact field name inside a
  // pickupHistory entry isn't confirmed yet; we try the most likely names and the
  // debug log in fetchOrders() shows the actual structure for verification.
  const getPickedUpBy = (wo) => {
    if (Array.isArray(wo.pickupHistory) && wo.pickupHistory.length > 0) {
      // Most recent pickup is likely the last entry; fall back to first if needed.
      const candidates = [
        wo.pickupHistory[wo.pickupHistory.length - 1],
        wo.pickupHistory[0]
      ];
      for (const entry of candidates) {
        if (!entry || typeof entry !== 'object') continue;
        const name =
          entry.pickedUpBy || entry.name || entry.pickedBy ||
          entry.personName || entry.recipientName ||
          entry.signedBy || entry.signedByName ||
          entry.driverName || entry.carrierName ||
          (entry.signature && (entry.signature.name || entry.signature.signedBy)) ||
          null;
        if (isMeaningfulName(name)) return name;
      }
    }
    if (isMeaningfulName(wo.pickedUpBy)) return wo.pickedUpBy;
    return null;
  };

  const handleViewPortalDoc = async (drNumber, docId, fileName, downloadUrl) => {
    try {
      console.log('Attempting to view document:', fileName);
      console.log('Download URL:', downloadUrl);
      
      // Try to fetch and create blob URL (to avoid download header)
      try {
        const response = await fetch(downloadUrl);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const blob = await response.blob();
        // Create a new blob with explicit PDF type to ensure inline viewing
        const pdfBlob = new Blob([blob], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(pdfBlob);
        console.log('Successfully created blob URL, opening...');
        window.open(url, '_blank');
        
        // Clean up the object URL after a delay
        setTimeout(() => {
          window.URL.revokeObjectURL(url);
        }, 1000);
      } catch (fetchError) {
        console.warn('Blob fetch failed (likely CORS), falling back to direct URL:', fetchError);
        console.log('Opening direct URL instead...');
        // Fallback: open the URL directly (may download instead of view)
        window.open(downloadUrl, '_blank');
      }
    } catch (error) {
      console.error('Error viewing portal document:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack
      });
      alert(`Failed to view document: ${error.message}`);
    }
  };

  const handleDownloadPortalDoc = async (drNumber, docId, fileName, downloadUrl) => {
    try {
      // For download, use the downloadUrl directly (it has attachment header)
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Error downloading portal document:', error);
      alert('Failed to download document');
    }
  };

  // ============================================
  // PORTAL FILES - Estimates
  // ============================================

  const fetchPortalFilesForEstimates = async (estimates) => {
    console.log('========================================');
    console.log('FETCHING PORTAL FILES FOR ESTIMATES');
    console.log('Total estimates:', estimates.length);
    console.log('========================================');
    
    const portalFilesData = {};
    
    for (const est of estimates) {
      try {
        console.log(`Fetching portal files for Estimate ${est.estimateNumber}...`);
        const response = await axios.get(`/api/portal/estimates/${est.estimateNumber}/files`);
        console.log(`Response for ${est.estimateNumber}:`, response.data);
        
        // New API format: { data: [...] } with downloadUrl included
        let files = [];
        if (response.data && response.data.data && Array.isArray(response.data.data)) {
          files = response.data.data;
        } else if (Array.isArray(response.data)) {
          // Fallback: direct array
          files = response.data;
        }
        
        portalFilesData[est.estimateNumber] = files;
        console.log(`Portal files count for ${est.estimateNumber}:`, files.length);
        console.log(`Portal files structure check - Is array?`, Array.isArray(files));
        if (files.length > 0) {
          console.log(`Portal files details:`, files);
          console.log(`Sample file:`, files[0]);
        }
      } catch (error) {
        console.error(`Error fetching portal files for ${est.estimateNumber}:`, error.message);
        console.error('Full error:', error);
        portalFilesData[est.estimateNumber] = [];
      }
    }
    
    console.log('');
    console.log('FINAL PORTAL FILES DATA:');
    console.log('Estimates with portal files:', Object.keys(portalFilesData).filter(num => portalFilesData[num].length > 0).length);
    console.log('Portal files by estimate:', portalFilesData);
    console.log('========================================');
    
    setEstimatePortalFiles(portalFilesData);
  };

  const toggleEstimateFiles = (estimateNumber) => {
    setExpandedEstimateFiles(prev => ({
      ...prev,
      [estimateNumber]: !prev[estimateNumber]
    }));
  };

  const handleViewEstimateFile = async (estimateNumber, fileId, fileName, downloadUrl) => {
    try {
      console.log('Attempting to view estimate file:', fileName);
      console.log('Download URL:', downloadUrl);
      
      // Try to fetch and create blob URL (to avoid download header)
      try {
        const response = await fetch(downloadUrl);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const blob = await response.blob();
        // Create a new blob with explicit PDF type to ensure inline viewing
        const pdfBlob = new Blob([blob], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(pdfBlob);
        console.log('Successfully created blob URL, opening...');
        window.open(url, '_blank');
        
        // Clean up the object URL after a delay
        setTimeout(() => {
          window.URL.revokeObjectURL(url);
        }, 1000);
      } catch (fetchError) {
        console.warn('Blob fetch failed (likely CORS), falling back to direct URL:', fetchError);
        console.log('Opening direct URL instead...');
        // Fallback: open the URL directly (may download instead of view)
        window.open(downloadUrl, '_blank');
      }
    } catch (error) {
      console.error('Error viewing estimate file:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack
      });
      alert(`Failed to view file: ${error.message}`);
    }
  };

  const handleDownloadEstimateFile = async (estimateNumber, fileId, fileName, downloadUrl) => {
    try {
      // For download, use the downloadUrl directly (it has attachment header)
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Error downloading estimate file:', error);
      alert('Failed to download file');
    }
  };

  const fetchDadJoke = async () => {
    try {
      const response = await fetch('https://icanhazdadjoke.com/', {
        headers: { 'Accept': 'application/json' }
      });
      const data = await response.json();
      setDadJoke(data.joke);
      setShowJoke(true);
      
      // No auto-hide - stays until user closes it
    } catch (error) {
      console.error('Error fetching dad joke:', error);
      setDadJoke("Why don't scientists trust atoms? Because they make up everything!");
      setShowJoke(true);
      // No auto-hide - stays until user closes it
    }
  };

  const closeDadJoke = () => {
    setShowJoke(false);
  };

  const filterOrders = (orders, type) => {
    // Safety check: if no orders or invalid input, return empty array
    if (!orders || !Array.isArray(orders)) return [];
    if (!searchTerm || !searchTerm.trim()) return orders;
    
    try {
      const search = searchTerm.toLowerCase().trim();
      
      // DEBUG: Log first item to see field names
      if (orders.length > 0) {
        console.log('=== SEARCH DEBUG ===');
        console.log('Search term:', search);
        console.log('Type:', type);
        console.log('First item fields:', Object.keys(orders[0]));
        console.log('First item sample:', {
          drNumber: orders[0].drNumber,
          clientPurchaseOrderNumber: orders[0].clientPurchaseOrderNumber,
          estimateNumber: orders[0].estimateNumber,
          orderNumber: orders[0].orderNumber,
          status: orders[0].status
        });
      }
      
      return orders.filter(item => {
        if (!item) return false; // Skip null/undefined items
        
        try {
          if (type === 'workorder') {
            const matches = (
              (item.drNumber && String(item.drNumber).toLowerCase().includes(search)) ||
              (item.orderNumber && String(item.orderNumber).toLowerCase().includes(search)) ||
              (item.clientPurchaseOrderNumber && String(item.clientPurchaseOrderNumber).toLowerCase().includes(search)) ||
              (item.estimateNumber && String(item.estimateNumber).toLowerCase().includes(search)) ||
              (item.status && String(item.status).toLowerCase().includes(search))
            );
            
            // DEBUG: Log matches
            if (matches) {
              console.log('MATCH FOUND:', {
                drNumber: item.drNumber,
                clientPO: item.clientPurchaseOrderNumber,
                estimateNumber: item.estimateNumber,
                search: search
              });
            }
            
            return matches;
          } else if (type === 'estimate') {
            const matches = (
              (item.estimateNumber && String(item.estimateNumber).toLowerCase().includes(search)) ||
              (item.status && String(item.status).toLowerCase().includes(search))
            );
            return matches;
          }
          return false;
        } catch (innerError) {
          console.error('Error filtering item:', innerError, item);
          return false; // Skip items that cause errors
        }
      });
    } catch (error) {
      console.error('Error in filterOrders:', error);
      return orders; // Return unfiltered if error
    }
  };

  // Safe wrapper to get filtered results with length
  const getFiltered = (orders, type) => {
    try {
      const filtered = filterOrders(orders, type);  // Call filterOrders, not getFiltered!
      return Array.isArray(filtered) ? filtered : [];
    } catch (error) {
      console.error('Error getting filtered results:', error);
      return Array.isArray(orders) ? orders : [];
    }
  };

  const fetchEstimatePDFs = async (estimates) => {
    console.log('========================================');
    console.log('FETCHING PDFs FOR ALL ESTIMATES');
    console.log('Total estimates:', estimates.length);
    console.log('========================================');
    
    const pdfData = {};
    
    for (const estimate of estimates) {
      try {
        console.log(`Fetching PDF for estimate ${estimate.estimateNumber} (ID: ${estimate.id})`);
        
        const response = await axios.get(`/api/estimates/${estimate.id}`);
        const estimateDetails = response.data.estimate;
        
        // Look for the generated PDF in the files array
        const pdfFile = estimateDetails.files?.find(f => 
          (f.originalName || f.filename || '').startsWith('Generated-Estimate-')
        );
        
        if (pdfFile) {
          console.log(`PDF found for ${estimate.estimateNumber}:`, pdfFile.originalName || pdfFile.filename);
          pdfData[estimate.id] = pdfFile;
        } else {
          console.log(`No PDF found for ${estimate.estimateNumber}`);
        }
      } catch (error) {
        console.error(`Error fetching PDF for estimate ${estimate.estimateNumber}:`, error);
      }
    }
    
    console.log('');
    console.log('FINAL PDF DATA:');
    console.log('Total estimates with PDFs:', Object.keys(pdfData).length);
    console.log('PDF data by estimate:', pdfData);
    console.log('========================================');
    
    setEstimatePDFs(pdfData);
  };

  const handleDownloadEstimatePDF = async (estimateId, fileId, fileName) => {
    try {
      console.log('Downloading estimate PDF:', fileName);
      
      const response = await axios.get(
        `/api/estimates/${estimateId}/files/${fileId}/download`,
        { responseType: 'blob' }
      );
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName || 'estimate.pdf');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      console.log('PDF downloaded successfully');
    } catch (error) {
      console.error('Error downloading estimate PDF:', error);
      alert('Failed to download estimate PDF');
    }
  };

  const handleViewEstimatePDF = async (estimateId, fileId, fileName) => {
    try {
      console.log('Opening estimate PDF:', fileName);
      
      const response = await axios.get(
        `/api/estimates/${estimateId}/files/${fileId}/download`,
        { responseType: 'blob' }
      );
      
      // Create blob URL and open in new tab
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
      
      // Clean up after a delay to allow the new tab to load
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 1000);
      
      console.log('PDF opened in new tab');
    } catch (error) {
      console.error('Error viewing estimate PDF:', error);
      alert('Failed to view estimate PDF');
    }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get('/api/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleRefresh = async () => {
    await Promise.all([fetchOrders(), fetchStats()]);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  const getStatusColor = (status) => {
    const statusLower = (status || '').toLowerCase();
    if (statusLower === 'sent') return '#3498db';
    if (statusLower === 'accepted') return '#27ae60';
    if (statusLower === 'declined') return '#e74c3c';
    if (statusLower === 'processing') return '#9b59b6';
    if (statusLower === 'stored') return '#27ae60';
    if (statusLower === 'shipped' || statusLower === 'picked up') return '#16a085';
    return '#95a5a6';
  };

  const getStatusIcon = (status) => {
    const statusLower = (status || '').toLowerCase();
    if (statusLower === 'sent') return '📧';
    if (statusLower === 'accepted') return '✅';
    if (statusLower === 'declined') return '❌';
    if (statusLower === 'processing') return '🔧';
    if (statusLower === 'stored') return '📦';
    if (statusLower === 'shipped') return '🚚';
    if (statusLower === 'picked up') return '✅';
    if (statusLower === 'waiting for material') return '⏳';
    return '📋';
  };

  if (loading && !recentEstimates.length && !olderEstimates.length && !workOrders.length) {
    return (
      <div className="dashboard">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading your orders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-content">
          <div className="header-left">
            <img src="/logo.png" alt="Carolina Rolling Co Inc" className="dashboard-logo" />
            <div>
              <h1>Order Portal</h1>
              {user && <p className="welcome">Welcome, {user.username} • {user.company_name}</p>}
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
            <button type="button" onClick={handleRefresh} className="btn-refresh" disabled={loading}>
              {loading ? '🔄 Refreshing...' : '🔄 Refresh'}
            </button>
            {user?.role === 'admin' && (
              <Link to="/admin">
              <button type="button" className="btn-admin">
                ⚙️ Admin Panel
              </button>
            </Link>
          )}
            <button type="button" onClick={handleLogout} className="btn-logout">
              Logout
            </button>
          </div>
        </div>
        
        {/* Search Bar */}
        <div className="search-container" style={{marginTop: '1rem', position: 'relative'}}>
          <input
            type="text"
            placeholder="🔍 Search by DR#, PO#, Estimate#, Work Order#..."
            value={searchTerm}
            onChange={(e) => {
              try {
                setSearchTerm(e.target.value);
              } catch (error) {
                console.error('Search input error:', error);
              }
            }}
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
            onFocus={(e) => e.target.style.borderColor = '#7c3aed'}
            onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
          />
          {searchTerm && (
            <button
              onClick={() => {
                try {
                  setSearchTerm('');
                } catch (error) {
                  console.error('Clear search error:', error);
                }
              }}
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
              ✕
            </button>
          )}
        </div>
        
        {/* Dad Joke Display */}
        {showJoke && dadJoke && (
          <div style={{marginTop: '1rem', position: 'relative', display: 'flex', gap: '1rem', alignItems: 'flex-start'}}>
            {/* Walter's Image */}
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
            
            {/* Speech Bubble */}
            <div className="dad-joke-banner" style={{
              flex: 1,
              padding: '1.25rem 3rem 1.25rem 1.5rem',
              background: 'white',
              borderRadius: '12px',
              color: '#333',
              fontSize: '1.15rem',
              fontWeight: '500',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              animation: 'slideIn 0.3s ease-out',
              position: 'relative',
              border: '3px solid #667eea'
            }}>
              {/* Speech bubble pointer */}
              <div style={{
                position: 'absolute',
                left: '-15px',
                top: '20px',
                width: 0,
                height: 0,
                borderTop: '15px solid transparent',
                borderBottom: '15px solid transparent',
                borderRight: '15px solid #667eea'
              }}></div>
              <div style={{
                position: 'absolute',
                left: '-10px',
                top: '23px',
                width: 0,
                height: 0,
                borderTop: '12px solid transparent',
                borderBottom: '12px solid transparent',
                borderRight: '12px solid white'
              }}></div>
              
              {dadJoke}
              
              <button
                onClick={closeDadJoke}
                style={{
                  position: 'absolute',
                  right: '1rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: '#667eea',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '1.3rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s',
                  fontWeight: 'bold'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = '#5568d3';
                  e.target.style.transform = 'translateY(-50%) scale(1.1)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = '#667eea';
                  e.target.style.transform = 'translateY(-50%) scale(1)';
                }}
                title="Close"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Statistics */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">📋</div>
            <div className="stat-content">
              <div className="stat-value">{stats.estimates.total || 0}</div>
              <div className="stat-label">Total Estimates</div>
              <div className="stat-details">
                {stats.estimates.sent || 0} sent • {stats.estimates.accepted || 0} accepted
              </div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">🔧</div>
            <div className="stat-content">
              <div className="stat-value">{stats.workOrders.processing || 0}</div>
              <div className="stat-label">In Production</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">📦</div>
            <div className="stat-content">
              <div className="stat-value">{stats.workOrders.ready || 0}</div>
              <div className="stat-label">Ready for Pickup</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">✅</div>
            <div className="stat-content">
              <div className="stat-value">{stats.workOrders.completed || 0}</div>
              <div className="stat-label">Completed</div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="error-banner">
          <span>⚠️</span> {error}
        </div>
      )}

      {/* Active Work Orders Section - FIRST */}
      {getFiltered(workOrders, 'workorder').length > 0 && (
        <div className="section">
          <h2 className="section-title">🔧 Orders In Progress ({getFiltered(workOrders, 'workorder').length})</h2>
          <p style={{fontSize: '0.9rem', color: '#666', marginBottom: '1rem'}}>
            Orders currently being processed
          </p>
          <div className="cards-grid">
            {getFiltered(workOrders, 'workorder').map((wo) => (
              <div key={wo.id} className="order-card">
                {wo.thumbnailUrl && (
                  <div className="card-image">
                    <img src={wo.thumbnailUrl} alt={`Shipment ${wo.drNumber}`} />
                  </div>
                )}
                <div className="card-header">
                  <h3>DR #{wo.drNumber}</h3>
                  <span 
                    className="status-badge"
                    style={{ backgroundColor: getStatusColor(wo.status) }}
                  >
                    {getStatusIcon(wo.status)} {wo.status}
                  </span>
                </div>
                <div className="card-body">
                  {wo.clientPurchaseOrderNumber && (
                    <p className="po-number">📋 Client PO: {wo.clientPurchaseOrderNumber}</p>
                  )}
                  {wo.estimateNumber && (
                    <p className="estimate-ref">📊 Estimate: {wo.estimateNumber}</p>
                  )}
                  {wo.orderNumber && (
                    <p className="wo-number">🔧 Work Order: {wo.orderNumber}</p>
                  )}
                  {wo.promisedDate && (
                    <p className="date promised">
                      📅 Anticipated Completion Date: {new Date(wo.promisedDate).toLocaleDateString()}
                    </p>
                  )}
                  {wo.receivedAt && (
                    <p className="date">✅ Material Received: {new Date(wo.receivedAt).toLocaleDateString()}</p>
                  )}
                  {wo.completedAt && (
                    <p className="date completed">🎉 Completed: {new Date(wo.completedAt).toLocaleDateString()}</p>
                  )}
                  {wo.shippedAt && (
                    <p className="date shipped">🚚 Shipped: {new Date(wo.shippedAt).toLocaleDateString()}</p>
                  )}
                  {wo.pickedUpAt && (
                    <p className="date picked-up">
                      ✅ Picked Up: {new Date(wo.pickedUpAt).toLocaleDateString()}
                      {getPickedUpBy(wo) && <> — by {getPickedUpBy(wo)}</>}
                    </p>
                  )}
                  
                  {/* MTR Documents */}
                  {workOrderMTRs[wo.id] && workOrderMTRs[wo.id].length > 0 && (
                    <div className="mtr-section">
                      <div 
                        style={{
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          marginBottom: '0.5rem',
                          cursor: 'pointer'
                        }}
                        onClick={() => toggleMTRs(wo.id)}
                      >
                        <p className="mtr-title" style={{margin: 0}}>
                          📄 Material Test Reports ({workOrderMTRs[wo.id].length})
                        </p>
                        <button 
                          className="toggle-btn"
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            padding: '0.25rem 0.5rem'
                          }}
                        >
                          {expandedMTRs[wo.id] ? '▼ Hide' : '▶ Show'}
                        </button>
                      </div>
                      
                      {expandedMTRs[wo.id] && (
                        <div className="mtr-list">
                          {workOrderMTRs[wo.id].map((mtr) => (
                            <div key={mtr.id} style={{marginBottom: '0.5rem'}}>
                              <div style={{fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem'}}>
                                {mtr.originalName}
                              </div>
                              <div style={{display: 'flex', gap: '0.5rem', flexWrap: 'wrap'}}>
                                <button
                                  className="mtr-download-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleViewMTR(wo.id, mtr.id, mtr.originalName);
                                  }}
                                  title={`View ${mtr.originalName}`}
                                >
                                  👁️ View
                                </button>
                                <button
                                  className="mtr-download-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownloadMTR(wo.id, mtr.id, mtr.originalName);
                                  }}
                                  title={`Download ${mtr.originalName}`}
                                >
                                  📥 Download
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* COC + Shipping Documents (split from Carolina portal docs by documentType) */}
                  {renderPortalDocSection({
                    drNumber: wo.drNumber,
                    docs: getCocDocs(wo.drNumber),
                    title: '📜 Certificates of Conformance (COC)',
                    isExpanded: !!expandedPortalDocs[wo.drNumber],
                    onToggle: () => togglePortalDocs(wo.drNumber)
                  })}
                  {renderPortalDocSection({
                    drNumber: wo.drNumber,
                    docs: getShippingDocs(wo.drNumber),
                    title: '🚚 Shipping Documents',
                    isExpanded: !!expandedShippingDocs[wo.drNumber],
                    onToggle: () => toggleShippingDocs(wo.drNumber)
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recently Shipped Section - SECOND */}
      {getFiltered(recentlyShipped, 'workorder').length > 0 && (
        <div className="section">
          <div className="section-header-toggle">
            <h2 className="section-title">📦 Recently Shipped ({getFiltered(recentlyShipped, 'workorder').length})</h2>
            <button 
              className="toggle-btn"
              onClick={() => setShowRecent(!showRecent)}
            >
              {showRecent ? '▼ Hide' : '▶ Show'}
            </button>
          </div>
          <p style={{fontSize: '0.9rem', color: '#666', marginBottom: '1rem', marginTop: '0.5rem'}}>
            Orders shipped within the last 30 days
          </p>
          
          {showRecent && (
            <div className="cards-grid">
              {getFiltered(recentlyShipped, 'workorder').map((wo) => (
                <div key={wo.id} className="order-card shipped">
                  {wo.thumbnailUrl && (
                    <div className="card-image">
                      <img src={wo.thumbnailUrl} alt={`Shipment ${wo.drNumber}`} />
                    </div>
                  )}
                  <div className="card-header">
                    <h3>DR #{wo.drNumber}</h3>
                    <span 
                      className="status-badge"
                      style={{ backgroundColor: getStatusColor(wo.status) }}
                    >
                      {getStatusIcon(wo.status)} {wo.status}
                    </span>
                  </div>
                  <div className="card-body">
                    {wo.clientPurchaseOrderNumber && (
                      <p className="po-number">📋 Client PO: {wo.clientPurchaseOrderNumber}</p>
                    )}
                    {wo.estimateNumber && (
                      <p className="estimate-ref">📊 Estimate: {wo.estimateNumber}</p>
                    )}
                    {wo.orderNumber && (
                      <p className="wo-number">🔧 Work Order: {wo.orderNumber}</p>
                    )}
                    {wo.promisedDate && (
                      <p className="date promised">
                        📅 Anticipated Completion Date: {new Date(wo.promisedDate).toLocaleDateString()}
                      </p>
                    )}
                    {wo.receivedAt && (
                      <p className="date">✅ Material Received: {new Date(wo.receivedAt).toLocaleDateString()}</p>
                    )}
                    {wo.completedAt && (
                      <p className="date completed">🎉 Completed: {new Date(wo.completedAt).toLocaleDateString()}</p>
                    )}
                    {wo.shippedAt && (
                      <p className="date shipped">🚚 Shipped: {new Date(wo.shippedAt).toLocaleDateString()}</p>
                    )}
                    {wo.pickedUpAt && (
                      <p className="date picked-up">
                        ✅ Picked Up: {new Date(wo.pickedUpAt).toLocaleDateString()}
                        {getPickedUpBy(wo) && <> — by {getPickedUpBy(wo)}</>}
                      </p>
                    )}
                    
                    {/* MTR Documents */}
                    {workOrderMTRs[wo.id] && workOrderMTRs[wo.id].length > 0 && (
                      <div className="mtr-section">
                        <div 
                          style={{
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            marginBottom: '0.5rem',
                            cursor: 'pointer'
                          }}
                          onClick={() => toggleMTRs(wo.id)}
                        >
                          <p className="mtr-title" style={{margin: 0}}>
                            📄 Material Test Reports ({workOrderMTRs[wo.id].length})
                          </p>
                          <button 
                            className="toggle-btn"
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: '0.9rem',
                              padding: '0.25rem 0.5rem'
                            }}
                          >
                            {expandedMTRs[wo.id] ? '▼ Hide' : '▶ Show'}
                          </button>
                        </div>
                        
                        {expandedMTRs[wo.id] && (
                          <div className="mtr-list">
                            {workOrderMTRs[wo.id].map((mtr) => (
                              <div key={mtr.id} style={{marginBottom: '0.5rem'}}>
                                <div style={{fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem'}}>
                                  {mtr.originalName}
                                </div>
                                <div style={{display: 'flex', gap: '0.5rem', flexWrap: 'wrap'}}>
                                  <button
                                    className="mtr-download-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleViewMTR(wo.id, mtr.id, mtr.originalName);
                                    }}
                                    title={`View ${mtr.originalName}`}
                                  >
                                    👁️ View
                                  </button>
                                  <button
                                    className="mtr-download-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDownloadMTR(wo.id, mtr.id, mtr.originalName);
                                    }}
                                    title={`Download ${mtr.originalName}`}
                                  >
                                    📥 Download
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* COC + Shipping Documents (split from Carolina portal docs by documentType) */}
                    {renderPortalDocSection({
                      drNumber: wo.drNumber,
                      docs: getCocDocs(wo.drNumber),
                      title: '📜 Certificates of Conformance (COC)',
                      isExpanded: !!expandedPortalDocs[wo.drNumber],
                      onToggle: () => togglePortalDocs(wo.drNumber)
                    })}
                    {renderPortalDocSection({
                      drNumber: wo.drNumber,
                      docs: getShippingDocs(wo.drNumber),
                      title: '🚚 Shipping Documents',
                      isExpanded: !!expandedShippingDocs[wo.drNumber],
                      onToggle: () => toggleShippingDocs(wo.drNumber)
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Order History Section - THIRD */}
      {getFiltered(completedOrders, 'workorder').length > 0 && (
        <div className="section">
          {!showCompleted && (
            <div style={{display: 'flex', justifyContent: 'center', padding: '2rem 0'}}>
              <button 
                className="toggle-btn"
                onClick={() => setShowCompleted(true)}
                style={{
                  padding: '1rem 2rem',
                  fontSize: '1rem',
                  fontWeight: '500',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = 'translateY(-2px)';
                  e.target.style.boxShadow = '0 6px 12px rgba(0,0,0,0.15)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
                }}
              >
                Load Older Shipments ({getFiltered(completedOrders, 'workorder').length})
              </button>
            </div>
          )}
          
          {showCompleted && (
            <>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
                <h2 className="section-title">📦 Order History ({getFiltered(completedOrders, 'workorder').length})</h2>
                <button 
                  className="toggle-btn"
                  onClick={() => setShowCompleted(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    fontSize: '0.9rem',
                    background: '#f0f0f0',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  ▲ Hide
                </button>
              </div>
              <div className="cards-grid">
              {getFiltered(completedOrders, 'workorder').map((wo) => (
                <div key={wo.id} className="order-card completed-card">
                  {wo.thumbnailUrl && (
                    <div className="card-image">
                      <img src={wo.thumbnailUrl} alt={`Shipment ${wo.drNumber}`} />
                    </div>
                  )}
                  <div className="card-header">
                    <h3>DR #{wo.drNumber}</h3>
                    <span 
                      className="status-badge"
                      style={{ backgroundColor: getStatusColor(wo.status) }}
                    >
                      {getStatusIcon(wo.status)} {wo.status}
                    </span>
                  </div>
                  <div className="card-body">
                    {wo.clientPurchaseOrderNumber && (
                      <p className="po-number">📋 Client PO: {wo.clientPurchaseOrderNumber}</p>
                    )}
                    {wo.estimateNumber && (
                      <p className="estimate-ref">📊 Estimate: {wo.estimateNumber}</p>
                    )}
                    {wo.orderNumber && (
                      <p className="wo-number">🔧 Work Order: {wo.orderNumber}</p>
                    )}
                    {wo.receivedAt && (
                      <p className="date">✅ Material Received: {new Date(wo.receivedAt).toLocaleDateString()}</p>
                    )}
                    {wo.completedAt && (
                      <p className="date completed">🎉 Completed: {new Date(wo.completedAt).toLocaleDateString()}</p>
                    )}
                    {wo.shippedAt && (
                      <p className="date shipped">🚚 Shipped: {new Date(wo.shippedAt).toLocaleDateString()}</p>
                    )}
                    {wo.pickedUpAt && (
                      <p className="date picked-up">
                        ✅ Picked Up: {new Date(wo.pickedUpAt).toLocaleDateString()}
                        {getPickedUpBy(wo) && <> — by {getPickedUpBy(wo)}</>}
                      </p>
                    )}
                    
                    {/* MTR Documents */}
                    {workOrderMTRs[wo.id] && workOrderMTRs[wo.id].length > 0 && (
                      <div className="mtr-section">
                        <div 
                          style={{
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            marginBottom: '0.5rem',
                            cursor: 'pointer'
                          }}
                          onClick={() => toggleMTRs(wo.id)}
                        >
                          <p className="mtr-title" style={{margin: 0}}>
                            📄 Material Test Reports ({workOrderMTRs[wo.id].length})
                          </p>
                          <button 
                            className="toggle-btn"
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: '0.9rem',
                              padding: '0.25rem 0.5rem'
                            }}
                          >
                            {expandedMTRs[wo.id] ? '▼ Hide' : '▶ Show'}
                          </button>
                        </div>
                        
                        {expandedMTRs[wo.id] && (
                          <div className="mtr-list">
                            {workOrderMTRs[wo.id].map((mtr) => (
                              <div key={mtr.id} style={{marginBottom: '0.5rem'}}>
                                <div style={{fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem'}}>
                                  {mtr.originalName}
                                </div>
                                <div style={{display: 'flex', gap: '0.5rem', flexWrap: 'wrap'}}>
                                  <button
                                    className="mtr-download-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleViewMTR(wo.id, mtr.id, mtr.originalName);
                                    }}
                                    title={`View ${mtr.originalName}`}
                                  >
                                    👁️ View
                                  </button>
                                  <button
                                    className="mtr-download-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDownloadMTR(wo.id, mtr.id, mtr.originalName);
                                    }}
                                    title={`Download ${mtr.originalName}`}
                                  >
                                    📥 Download
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* COC + Shipping Documents (split from Carolina portal docs by documentType) */}
                    {renderPortalDocSection({
                      drNumber: wo.drNumber,
                      docs: getCocDocs(wo.drNumber),
                      title: '📜 Certificates of Conformance (COC)',
                      isExpanded: !!expandedPortalDocs[wo.drNumber],
                      onToggle: () => togglePortalDocs(wo.drNumber)
                    })}
                    {renderPortalDocSection({
                      drNumber: wo.drNumber,
                      docs: getShippingDocs(wo.drNumber),
                      title: '🚚 Shipping Documents',
                      isExpanded: !!expandedShippingDocs[wo.drNumber],
                      onToggle: () => toggleShippingDocs(wo.drNumber)
                    })}
                  </div>
                </div>
              ))}
            </div>
            </>
          )}
        </div>
      )}

      {/* Recent Estimates Section - FOURTH */}
      {getFiltered(recentEstimates, 'estimate').length > 0 && (
        <div className="section">
          <h2 className="section-title">📋 Recent Estimates ({getFiltered(recentEstimates, 'estimate').length})</h2>
          <p style={{fontSize: '0.9rem', color: '#666', marginBottom: '1rem'}}>
            Estimates created within the last 30 days
          </p>
          <div className="cards-grid">
            {getFiltered(recentEstimates, 'estimate').map((estimate) => (
              <div key={estimate.id} className="order-card">
                <div className="card-header">
                  <h3>{estimate.estimateNumber}</h3>
                  <span 
                    className="status-badge"
                    style={{ backgroundColor: getStatusColor(estimate.status) }}
                  >
                    {getStatusIcon(estimate.status)} {estimate.status}
                  </span>
                </div>
                <div className="card-body">
                  {estimate.status !== 'draft' && estimate.grandTotal && (
                    <p className="amount">${parseFloat(estimate.grandTotal).toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
                  )}
                  {estimate.status === 'draft' && (
                    <p className="draft-notice">💼 Estimate in progress...</p>
                  )}
                  {estimate.sentAt && (
                    <p className="date">Sent: {new Date(estimate.sentAt).toLocaleDateString()}</p>
                  )}
                  {estimate.validUntil && (
                    <p className="date">Valid Until: {new Date(estimate.validUntil).toLocaleDateString()}</p>
                  )}
                  {estimate.acceptedAt && (
                    <p className="date accepted">✅ Accepted: {new Date(estimate.acceptedAt).toLocaleDateString()}</p>
                  )}
                  
                  {/* Estimate PDF */}
                  {estimatePDFs[estimate.id] && (
                    <div className="mtr-section">
                      <p className="mtr-title">📄 Estimate PDF</p>
                      <div className="mtr-list">
                        <button
                          className="mtr-download-btn"
                          onClick={() => handleViewEstimatePDF(
                            estimate.id, 
                            estimatePDFs[estimate.id].id, 
                            estimatePDFs[estimate.id].originalName || estimatePDFs[estimate.id].filename || 'estimate.pdf'
                          )}
                          title="View Estimate PDF"
                        >
                          👁️ View PDF
                        </button>
                        <button
                          className="mtr-download-btn"
                          onClick={() => handleDownloadEstimatePDF(
                            estimate.id, 
                            estimatePDFs[estimate.id].id, 
                            estimatePDFs[estimate.id].originalName || estimatePDFs[estimate.id].filename || 'estimate.pdf'
                          )}
                          title="Download Estimate PDF"
                        >
                          📥 Download PDF
                        </button>
                      </div>
                    </div>
                  )}
                  
                  {/* Portal Files */}
                  {estimatePortalFiles[estimate.estimateNumber] && estimatePortalFiles[estimate.estimateNumber].length > 0 && (
                    <div className="mtr-section" style={{marginTop: '1rem'}}>
                      <div 
                        style={{
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          marginBottom: '0.5rem',
                          cursor: 'pointer'
                        }}
                        onClick={() => toggleEstimateFiles(estimate.estimateNumber)}
                      >
                        <p className="mtr-title" style={{margin: 0}}>
                          📎 Additional Files ({estimatePortalFiles[estimate.estimateNumber].length})
                        </p>
                        <button 
                          className="toggle-btn"
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            padding: '0.25rem 0.5rem'
                          }}
                        >
                          {expandedEstimateFiles[estimate.estimateNumber] ? '▼ Hide' : '▶ Show'}
                        </button>
                      </div>
                      
                      {expandedEstimateFiles[estimate.estimateNumber] && (
                        <div className="mtr-list">
                          {estimatePortalFiles[estimate.estimateNumber].map((file) => (
                            <div key={file.id} style={{marginBottom: '0.5rem'}}>
                              <div style={{fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem'}}>
                                {file.name}
                              </div>
                              <div style={{display: 'flex', gap: '0.5rem', flexWrap: 'wrap'}}>
                                <button
                                  className="mtr-download-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleViewEstimateFile(estimate.estimateNumber, file.id, file.name, file.downloadUrl);
                                  }}
                                  title={`View ${file.name}`}
                                >
                                  👁️ View
                                </button>
                                <button
                                  className="mtr-download-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownloadEstimateFile(estimate.estimateNumber, file.id, file.name, file.downloadUrl);
                                  }}
                                  title={`Download ${file.name}`}
                                >
                                  📥 Download
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Older Estimates Section - FIFTH (COLLAPSIBLE) */}
      {getFiltered(olderEstimates, 'estimate').length > 0 && (
        <div className="section">
          {!showOlderEstimates && (
            <div style={{display: 'flex', justifyContent: 'center', padding: '2rem 0'}}>
              <button 
                className="toggle-btn"
                onClick={() => setShowOlderEstimates(true)}
                style={{
                  padding: '1rem 2rem',
                  fontSize: '1rem',
                  fontWeight: '500',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = 'translateY(-2px)';
                  e.target.style.boxShadow = '0 6px 12px rgba(0,0,0,0.15)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
                }}
              >
                Load Older Estimates ({getFiltered(olderEstimates, 'estimate').length})
              </button>
            </div>
          )}
          
          {showOlderEstimates && (
            <>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
                <h2 className="section-title">📋 Older Estimates ({getFiltered(olderEstimates, 'estimate').length})</h2>
                <button 
                  className="toggle-btn"
                  onClick={() => setShowOlderEstimates(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    fontSize: '0.9rem',
                    background: '#f0f0f0',
                    border: '1px solid #ddd',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  ▲ Hide
                </button>
              </div>
              <div className="cards-grid">
              {getFiltered(olderEstimates, 'estimate').map((estimate) => (
                <div key={estimate.id} className="order-card">
                  <div className="card-header">
                    <h3>{estimate.estimateNumber}</h3>
                    <span 
                      className="status-badge"
                      style={{ backgroundColor: getStatusColor(estimate.status) }}
                    >
                      {getStatusIcon(estimate.status)} {estimate.status}
                    </span>
                  </div>
                  <div className="card-body">
                    {estimate.status !== 'draft' && estimate.grandTotal && (
                      <p className="amount">${parseFloat(estimate.grandTotal).toLocaleString('en-US', {minimumFractionDigits: 2})}</p>
                    )}
                    {estimate.status === 'draft' && (
                      <p className="draft-notice">💼 Estimate in progress...</p>
                    )}
                    {estimate.sentAt && (
                      <p className="date">Sent: {new Date(estimate.sentAt).toLocaleDateString()}</p>
                    )}
                    {estimate.validUntil && (
                      <p className="date">Valid Until: {new Date(estimate.validUntil).toLocaleDateString()}</p>
                    )}
                    {estimate.acceptedAt && (
                      <p className="date accepted">✅ Accepted: {new Date(estimate.acceptedAt).toLocaleDateString()}</p>
                    )}
                    
                    {/* Estimate PDF */}
                    {estimatePDFs[estimate.id] && (
                      <div className="mtr-section">
                        <p className="mtr-title">📄 Estimate PDF</p>
                        <div className="mtr-list">
                          <button
                            className="mtr-download-btn"
                            onClick={() => handleViewEstimatePDF(
                              estimate.id, 
                              estimatePDFs[estimate.id].id, 
                              estimatePDFs[estimate.id].originalName || estimatePDFs[estimate.id].filename || 'estimate.pdf'
                            )}
                            title="View Estimate PDF"
                          >
                            👁️ View PDF
                          </button>
                          <button
                            className="mtr-download-btn"
                            onClick={() => handleDownloadEstimatePDF(
                              estimate.id, 
                              estimatePDFs[estimate.id].id, 
                              estimatePDFs[estimate.id].originalName || estimatePDFs[estimate.id].filename || 'estimate.pdf'
                            )}
                            title="Download Estimate PDF"
                          >
                            📥 Download PDF
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {/* Portal Files */}
                    {estimatePortalFiles[estimate.estimateNumber] && estimatePortalFiles[estimate.estimateNumber].length > 0 && (
                      <div className="mtr-section" style={{marginTop: '1rem'}}>
                        <div 
                          style={{
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            marginBottom: '0.5rem',
                            cursor: 'pointer'
                          }}
                          onClick={() => toggleEstimateFiles(estimate.estimateNumber)}
                        >
                          <p className="mtr-title" style={{margin: 0}}>
                            📎 Additional Files ({estimatePortalFiles[estimate.estimateNumber].length})
                          </p>
                          <button 
                            className="toggle-btn"
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: '0.9rem',
                              padding: '0.25rem 0.5rem'
                            }}
                          >
                            {expandedEstimateFiles[estimate.estimateNumber] ? '▼ Hide' : '▶ Show'}
                          </button>
                        </div>
                        
                        {expandedEstimateFiles[estimate.estimateNumber] && (
                          <div className="mtr-list">
                            {estimatePortalFiles[estimate.estimateNumber].map((file) => (
                              <div key={file.id} style={{marginBottom: '0.5rem'}}>
                                <div style={{fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem'}}>
                                  {file.name}
                                </div>
                                <div style={{display: 'flex', gap: '0.5rem', flexWrap: 'wrap'}}>
                                  <button
                                    className="mtr-download-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleViewEstimateFile(estimate.estimateNumber, file.id, file.name, file.downloadUrl);
                                    }}
                                    title={`View ${file.name}`}
                                  >
                                    👁️ View
                                  </button>
                                  <button
                                    className="mtr-download-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDownloadEstimateFile(estimate.estimateNumber, file.id, file.name, file.downloadUrl);
                                    }}
                                    title={`Download ${file.name}`}
                                  >
                                    📥 Download
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            </>
          )}
        </div>
      )}

      {/* Empty State */}
      {!loading && recentEstimates.length === 0 && olderEstimates.length === 0 && workOrders.length === 0 && recentlyShipped.length === 0 && completedOrders.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">📭</div>
          <h3>No Orders Found</h3>
          <p>You don't have any estimates or work orders in the system yet.</p>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
