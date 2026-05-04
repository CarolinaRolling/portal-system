// frontend/src/pages/VendorPODetail.js
// Vendor Portal - Purchase Order Detail View with 3D/2D File Viewers
// UPDATED VERSION with STEP and DXF viewer integration

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getPurchaseOrderDetails,
  getFileDownloadUrl,
  downloadFile,
  formatDate,
  formatFileSize,
  getFileIcon,
  isPastDue
} from '../utils/vendorApi';
import StepViewer from '../components/StepViewer';
import DxfViewer from '../components/DxfViewer';
import './Dashboard.css';

const VendorPODetail = () => {
  const { poNumber } = useParams();
  const navigate = useNavigate();
  
  const [poData, setPoData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedSections, setExpandedSections] = useState({});
  
  // File viewer state
  const [viewerState, setViewerState] = useState({
    isOpen: false,
    fileType: null,
    fileUrl: null,
    fileName: null
  });

  useEffect(() => {
    fetchPODetails();
  }, [poNumber]);

  const fetchPODetails = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getPurchaseOrderDetails(poNumber);
      
      console.log('PO Details:', data);
      setPoData(data);
      
      // Auto-expand first part's files
      if (data.parts && data.parts.length > 0) {
        setExpandedSections({ [`files-${data.parts[0].id}`]: true });
      }
    } catch (err) {
      console.error('Error fetching PO details:', err);
      setError('Failed to load purchase order details.');
      
      if (err.message.includes('Authentication failed')) {
        navigate('/vendor/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (sectionId) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

  const handleViewFile = async (file) => {
    try {
      console.log('Viewing file:', file.originalName, 'Type:', file.fileType);
      
      // Get download URL
      const fileData = await getFileDownloadUrl(file.id);
      
      if (!fileData.url) {
        throw new Error('No download URL received');
      }

      // Determine file type and open appropriate viewer
      if (file.fileType === 'step_file' || file.mimeType === 'application/step') {
        // Open 3D STEP viewer
        setViewerState({
          isOpen: true,
          fileType: 'step',
          fileUrl: fileData.url,
          fileName: file.originalName
        });
      } else if (file.fileType === 'dxf' || file.originalName.toLowerCase().endsWith('.dxf')) {
        // Open 2D DXF viewer
        setViewerState({
          isOpen: true,
          fileType: 'dxf',
          fileUrl: fileData.url,
          fileName: file.originalName
        });
      } else if (file.mimeType === 'application/pdf') {
        // Open PDF in new tab
        window.open(fileData.url, '_blank');
      } else {
        // Other files - open in new tab
        window.open(fileData.url, '_blank');
      }
    } catch (err) {
      console.error('Error viewing file:', err);
      alert('Failed to open file. Please try downloading instead.');
    }
  };

  const closeViewer = () => {
    setViewerState({
      isOpen: false,
      fileType: null,
      fileUrl: null,
      fileName: null
    });
  };

  const handleDownloadFile = async (file) => {
    try {
      console.log('Downloading file:', file.originalName);
      await downloadFile(file.id, file.originalName);
    } catch (err) {
      console.error('Error downloading file:', err);
      alert('Failed to download file.');
    }
  };

  const handleReportIssue = (part) => {
    // Navigate to issue report with pre-filled data
    navigate('/vendor/issues/new', {
      state: {
        workOrderId: poData.workOrder?.id,
        workOrderPartId: part?.id,
        poNumber: poNumber,
        drNumber: poData.workOrder?.drNumber,
        partNumber: part?.partNumber
      }
    });
  };

  const getViewButtonText = (file) => {
    if (file.fileType === 'step_file') {
      return '🧊 View 3D';
    } else if (file.fileType === 'dxf') {
      return '📐 View 2D';
    } else if (file.mimeType === 'application/pdf') {
      return '👁️ View PDF';
    } else {
      return '👁️ View';
    }
  };

  const goBack = () => {
    navigate('/vendor/dashboard');
  };

  // Render file viewer modal
  const renderFileViewer = () => {
    if (!viewerState.isOpen) return null;

    if (viewerState.fileType === 'step') {
      return (
        <StepViewer
          fileUrl={viewerState.fileUrl}
          fileName={viewerState.fileName}
          onClose={closeViewer}
        />
      );
    } else if (viewerState.fileType === 'dxf') {
      return (
        <DxfViewer
          fileUrl={viewerState.fileUrl}
          fileName={viewerState.fileName}
          onClose={closeViewer}
        />
      );
    }

    return null;
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading-message">
          <p>Loading purchase order details...</p>
        </div>
      </div>
    );
  }

  if (error || !poData) {
    return (
      <div className="dashboard-container">
        <div className="error-message">
          <p>{error || 'Purchase order not found'}</p>
          <button onClick={goBack} className="btn btn-primary">
            ← Back to Purchase Orders
          </button>
        </div>
      </div>
    );
  }

  const { workOrder, purchaseOrder, parts } = poData;

  return (
    <>
      {/* File Viewer Modal */}
      {renderFileViewer()}

      <div className="dashboard-container">
        {/* Header */}
        <header className="dashboard-header">
          <div className="header-content">
            <div className="header-left">
              <button onClick={goBack} className="btn btn-back">
                ← Back
              </button>
              <div>
                <h1>PO: {purchaseOrder.poNumber}</h1>
                <p className="vendor-subtitle">
                  {purchaseOrder.serviceType || purchaseOrder.leg || purchaseOrder.poType}
                </p>
              </div>
            </div>
            <div className="header-right">
              <button onClick={() => navigate('/vendor/issues')} className="btn btn-secondary">
                ⚠️ Report Issue
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="dashboard-main">
          <div className="dashboard-content">
            
            {/* Work Order Info */}
            <section className="dashboard-section">
              <div className="section-header">
                <h2>📋 Work Order Information</h2>
              </div>
              <div className="info-card">
                <div className="info-grid">
                  <div className="info-item">
                    <span className="info-label">DR Number:</span>
                    <span className="info-value">DR-{workOrder.drNumber}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Work Order:</span>
                    <span className="info-value">{workOrder.workOrderNumber}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Status:</span>
                    <span className={`status-badge status-${workOrder.status}`}>
                      {workOrder.status}
                    </span>
                  </div>
                  {workOrder.promisedDate && (
                    <div className="info-item">
                      <span className="info-label">Due Date:</span>
                      <span className={`info-value ${isPastDue(workOrder.promisedDate) ? 'text-danger' : ''}`}>
                        {formatDate(workOrder.promisedDate)}
                        {isPastDue(workOrder.promisedDate) && ' ⚠️ PAST DUE'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Purchase Order Info */}
            <section className="dashboard-section">
              <div className="section-header">
                <h2>📦 Purchase Order Details</h2>
              </div>
              <div className="info-card">
                <div className="info-grid">
                  <div className="info-item">
                    <span className="info-label">PO Number:</span>
                    <span className="info-value">{purchaseOrder.poNumber}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Type:</span>
                    <span className="info-value">
                      {purchaseOrder.poType === 'outside_processing' ? 'Outside Processing' : 'Transport'}
                    </span>
                  </div>
                  {purchaseOrder.serviceType && (
                    <div className="info-item">
                      <span className="info-label">Service:</span>
                      <span className="info-value">{purchaseOrder.serviceType}</span>
                    </div>
                  )}
                  {purchaseOrder.leg && (
                    <div className="info-item">
                      <span className="info-label">Transport Leg:</span>
                      <span className="info-value">{purchaseOrder.leg}</span>
                    </div>
                  )}
                  {purchaseOrder.sentAt && (
                    <div className="info-item">
                      <span className="info-label">Sent Date:</span>
                      <span className="info-value">{formatDate(purchaseOrder.sentAt)}</span>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Parts */}
            <section className="dashboard-section">
              <div className="section-header">
                <h2>🔧 Parts ({parts?.length || 0})</h2>
              </div>

              {!parts || parts.length === 0 ? (
                <div className="empty-state">
                  <p>No parts information available</p>
                </div>
              ) : (
                <div className="parts-list">
                  {parts.map((part, index) => (
                    <div key={part.id} className="part-card">
                      {/* Part Header */}
                      <div className="part-header">
                        <h3>
                          Part #{part.partNumber}
                          {part.clientPartNumber && (
                            <span className="client-part-number"> • {part.clientPartNumber}</span>
                          )}
                        </h3>
                        <span className={`status-badge status-${part.status}`}>
                          {part.status}
                        </span>
                      </div>

                      {/* Part Details */}
                      <div className="part-details">
                        <div className="info-grid">
                          {part.partType && (
                            <div className="info-item">
                              <span className="info-label">Type:</span>
                              <span className="info-value">{part.partType.replace(/_/g, ' ')}</span>
                            </div>
                          )}
                          {part.quantity && (
                            <div className="info-item">
                              <span className="info-label">Quantity:</span>
                              <span className="info-value">{part.quantity}</span>
                            </div>
                          )}
                          {part.material && (
                            <div className="info-item">
                              <span className="info-label">Material:</span>
                              <span className="info-value">{part.material}</span>
                            </div>
                          )}
                          {part.thickness && (
                            <div className="info-item">
                              <span className="info-label">Thickness:</span>
                              <span className="info-value">{part.thickness}</span>
                            </div>
                          )}
                          {part.outerDiameter && (
                            <div className="info-item">
                              <span className="info-label">Outer Diameter:</span>
                              <span className="info-value">{part.outerDiameter}</span>
                            </div>
                          )}
                        </div>

                        {part.materialDescription && (
                          <div className="part-description">
                            <strong>Material:</strong> {part.materialDescription}
                          </div>
                        )}

                        {part.rollingDescription && (
                          <div className="part-description">
                            <strong>Rolling:</strong> {part.rollingDescription}
                          </div>
                        )}

                        {part.specialInstructions && (
                          <div className="special-instructions">
                            <strong>⚠️ Special Instructions:</strong>
                            <p>{part.specialInstructions}</p>
                          </div>
                        )}
                      </div>

                      {/* Files Section */}
                      {part.files && part.files.length > 0 && (
                        <div className="files-section">
                          <button
                            className="section-toggle"
                            onClick={() => toggleSection(`files-${part.id}`)}
                          >
                            <span>📁 Files ({part.files.length})</span>
                            <span className="toggle-icon">
                              {expandedSections[`files-${part.id}`] ? '▼' : '▶'}
                            </span>
                          </button>

                          {expandedSections[`files-${part.id}`] && (
                            <div className="files-list">
                              {part.files.map((file) => (
                                <div key={file.id} className="file-item">
                                  <div className="file-info">
                                    <span className="file-icon">{getFileIcon(file.fileType)}</span>
                                    <div className="file-details">
                                      <div className="file-name">{file.originalName}</div>
                                      <div className="file-meta">
                                        {file.fileType.replace(/_/g, ' ')} • {formatFileSize(file.size)}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="file-actions">
                                    <button
                                      onClick={() => handleViewFile(file)}
                                      className="btn btn-sm btn-primary"
                                    >
                                      {getViewButtonText(file)}
                                    </button>
                                    <button
                                      onClick={() => handleDownloadFile(file)}
                                      className="btn btn-sm btn-secondary"
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

                      {/* Report Issue Button */}
                      <div className="part-actions">
                        <button
                          onClick={() => handleReportIssue(part)}
                          className="btn btn-warning"
                        >
                          ⚠️ Report Issue with This Part
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

          </div>
        </main>

        {/* Footer */}
        <footer className="dashboard-footer">
          <p>&copy; 2026 Carolina Rolling. All rights reserved.</p>
        </footer>
      </div>
    </>
  );
};

export default VendorPODetail;
