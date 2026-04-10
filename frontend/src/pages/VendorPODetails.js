import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import StepViewer3D from './StepViewer3D';
import '../pages/Dashboard.css';

const VendorPODetails = ({ user }) => {
  const { poNumber } = useParams();
  const navigate = useNavigate();
  const [poData, setPoData] = useState(null);
  const [files, setFiles] = useState([]);
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloadingFile, setDownloadingFile] = useState(null);
  const [viewing3D, setViewing3D] = useState(null); // { fileUrl, fileName }

  useEffect(() => {
    fetchPODetails();
  }, [poNumber]);

  const fetchPODetails = async () => {
    console.log('========================================');
    console.log('🔍 FETCHING PO DETAILS');
    console.log('PO Number:', poNumber);
    console.log('========================================');

    try {
      setLoading(true);
      setError(null);

      // Fetch PO details
      const response = await axios.get(`/api/vendor/purchase-orders/${poNumber}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      console.log('📦 PO DETAILS RESPONSE:');
      console.log('Response data:', response.data);

      const data = response.data.data || response.data;
      console.log('PO Data:', data);

      setPoData(data);

      // Extract files from parts array
      let allFiles = [];
      
      if (data.parts && Array.isArray(data.parts)) {
        console.log('📁 CHECKING PARTS FOR FILES');
        console.log('Total parts:', data.parts.length);
        
        data.parts.forEach((part, index) => {
          console.log(`\n  Part #${index + 1}:`);
          console.log('    ALL PART KEYS:', Object.keys(part));
          console.log('    FULL PART OBJECT:', JSON.stringify(part, null, 2));
          
          if (part.files && Array.isArray(part.files)) {
            console.log('    Files found:', part.files.length);
            console.log('    Files:', part.files);
            
            // Log each file's structure
            part.files.forEach((file, fileIndex) => {
              console.log(`\n    📄 File #${fileIndex + 1} structure:`);
              console.log('      Full file object:', file);
              console.log('      file.id:', file.id);
              console.log('      file.filename:', file.filename);
              console.log('      file.fileName:', file.fileName);
              console.log('      file.originalName:', file.originalName);
              console.log('      file.name:', file.name);
              console.log('      All keys:', Object.keys(file));
            });
            
            allFiles = allFiles.concat(part.files);
          } else {
            console.log('    No files array found');
          }
        });
        
        console.log('\n📊 TOTAL FILES ACROSS ALL PARTS:', allFiles.length);
        console.log('All files:', allFiles);
        setFiles(allFiles);
        setParts(data.parts);
        
      } else {
        console.log('📁 NO PARTS ARRAY FOUND');
        setFiles([]);
      }

      setLoading(false);
      console.log('✅ PO DETAILS LOADED');
      console.log('========================================');

    } catch (err) {
      console.error('❌ ERROR FETCHING PO DETAILS:');
      console.error('Error:', err);
      console.error('Response:', err.response?.data);
      setError('Failed to load purchase order details');
      setLoading(false);
    }
  };

  const handleDownloadFile = async (fileId, fileName) => {
    console.log('⬇️ DOWNLOADING FILE:');
    console.log('File ID:', fileId);
    console.log('File name:', fileName);

    try {
      setDownloadingFile(fileId);

      // Get the signed URL from our backend
      const response = await axios.get(`/api/vendor/files/${fileId}/download`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      console.log('✅ FILE URL RECEIVED');
      console.log('Response:', response.data);

      // Extract the signed URL from the response
      const signedUrl = response.data.data?.url || response.data.url;
      
      if (!signedUrl) {
        throw new Error('No download URL in response');
      }

      console.log('📥 Downloading from S3:', signedUrl);

      // Create a temporary link to download from the signed URL
      const link = document.createElement('a');
      link.href = signedUrl;
      link.setAttribute('download', fileName || response.data.data?.originalName || 'download');
      link.setAttribute('target', '_blank');
      document.body.appendChild(link);
      link.click();
      link.remove();

      console.log('✅ FILE DOWNLOAD INITIATED');

    } catch (err) {
      console.error('❌ ERROR DOWNLOADING FILE:');
      console.error(err);
      alert('Failed to download file: ' + (err.response?.data?.error || err.message));
    } finally {
      setDownloadingFile(null);
    }
  };

  const is3DViewable = (fileName) => {
    console.log('🔍 Checking if 3D viewable:', fileName);
    
    if (!fileName) {
      console.log('  ❌ No filename provided');
      return false;
    }
    
    const ext = fileName.toLowerCase().split('.').pop();
    console.log('  Extension:', ext);
    
    const is3D = ['step', 'stp', 'stl', 'obj'].includes(ext);
    console.log('  Is 3D viewable:', is3D);
    
    return is3D;
  };

  const handleView3D = async (fileId, fileName) => {
    console.log('🎨 OPENING 3D VIEWER');
    console.log('File ID:', fileId);
    console.log('File name:', fileName);

    try {
      // Get the signed URL from our backend
      const response = await axios.get(`/api/vendor/files/${fileId}/download`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const signedUrl = response.data.data?.url || response.data.url;
      
      if (!signedUrl) {
        throw new Error('No file URL in response');
      }

      console.log('✅ Opening 3D viewer with URL:', signedUrl);
      
      setViewing3D({
        fileUrl: signedUrl,
        fileName: fileName || response.data.data?.originalName || 'model.step'
      });

    } catch (err) {
      console.error('❌ ERROR OPENING 3D VIEWER:');
      console.error(err);
      alert('Failed to open 3D viewer: ' + (err.response?.data?.error || err.message));
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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
      <div className="dashboard" style={{background: '#fef3c7', minHeight: '100vh'}}>
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading purchase order details...</p>
        </div>
      </div>
    );
  }

  if (error || !poData) {
    return (
      <div className="dashboard" style={{background: '#fef3c7', minHeight: '100vh', padding: '2rem'}}>
        <div className="error-banner">
          <span>⚠️</span> {error || 'Purchase order not found'}
        </div>
        <button 
          onClick={() => navigate('/vendor/dashboard')}
          style={{
            marginTop: '1rem',
            padding: '0.75rem 1.5rem',
            background: '#f59e0b',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: '600'
          }}
        >
          ← Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="dashboard" style={{background: '#fef3c7', minHeight: '100vh'}}>
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-content">
          <div className="header-left">
            <img src="/logo.png" alt="Carolina Rolling Co Inc" className="dashboard-logo" />
            <div>
              <h1>🏭 Purchase Order Details</h1>
              <p className="welcome">PO #{poNumber}</p>
            </div>
          </div>
          <div className="header-actions">
            <button 
              onClick={() => navigate('/vendor/dashboard')}
              style={{
                padding: '0.75rem 1.5rem',
                background: 'white',
                color: '#f59e0b',
                border: '2px solid #f59e0b',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </div>

      <div style={{padding: 'clamp(0.75rem, 3vw, 2rem)', maxWidth: '1200px', margin: '0 auto', boxSizing: 'border-box', width: '100%', overflowX: 'hidden'}}>
        {/* PO Information Card */}
        <div style={{
          background: 'white',
          borderRadius: '12px',
          padding: 'clamp(1rem, 3vw, 2rem)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          marginBottom: '2rem',
          boxSizing: 'border-box',
          overflow: 'hidden'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '1.5rem',
            flexWrap: 'wrap',
            gap: '0.75rem'
          }}>
            <div>
              <h2 style={{margin: '0 0 0.5rem 0', fontSize: '1.5rem'}}>
                {poData.poType === 'outside_processing' ? '📦' : '🚛'} PO #{poNumber}
              </h2>
              <p style={{margin: 0, color: '#666'}}>
                DR-{poData.workOrder?.drNumber} • {poData.workOrder?.workOrderNumber}
              </p>
            </div>
            <span 
              style={{
                background: getStatusColor(poData.workOrder?.status),
                color: 'white',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                fontWeight: '600',
                textTransform: 'capitalize'
              }}
            >
              {poData.workOrder?.status?.replace('_', ' ')}
            </span>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
            gap: '1.5rem',
            marginTop: '1.5rem',
            paddingTop: '1.5rem',
            borderTop: '1px solid #e0e0e0'
          }}>
            {poData.serviceType && (
              <div>
                <p style={{margin: '0 0 0.25rem 0', color: '#666', fontSize: '0.875rem'}}>Service Type</p>
                <p style={{margin: 0, fontWeight: '600'}}>{poData.serviceType}</p>
              </div>
            )}

            {poData.leg && (
              <div>
                <p style={{margin: '0 0 0.25rem 0', color: '#666', fontSize: '0.875rem'}}>Transport</p>
                <p style={{margin: 0, fontWeight: '600'}}>{poData.leg}</p>
              </div>
            )}

            {poData.partNumber && (
              <div>
                <p style={{margin: '0 0 0.25rem 0', color: '#666', fontSize: '0.875rem'}}>Part Number</p>
                <p style={{margin: 0, fontWeight: '600'}}>{poData.partNumber}</p>
              </div>
            )}





            {poData.quantity && (
              <div>
                <p style={{margin: '0 0 0.25rem 0', color: '#666', fontSize: '0.875rem'}}>Quantity</p>
                <p style={{margin: 0, fontWeight: '600'}}>{poData.quantity}</p>
              </div>
            )}

            {poData.sentAt && (
              <div>
                <p style={{margin: '0 0 0.25rem 0', color: '#666', fontSize: '0.875rem'}}>Sent Date</p>
                <p style={{margin: 0, fontWeight: '600'}}>{formatDate(poData.sentAt)}</p>
              </div>
            )}


          </div>

          {poData.notes && (
            <div style={{
              marginTop: '1.5rem',
              padding: '1rem',
              background: '#f9f9f9',
              borderRadius: '8px'
            }}>
              <p style={{margin: '0 0 0.5rem 0', fontWeight: '600', color: '#666'}}>Notes:</p>
              <p style={{margin: 0}}>{poData.notes}</p>
            </div>
          )}
        </div>

        {/* Line Items Section */}
        {parts.length > 0 ? parts.map((part, partIndex) => {
          const partFiles = part.files || [];
          const partNum = part.clientPartNumber || part.partNumber || '';
          const desc = part.materialDescription || '';
          const serviceType = part.rollingDescription || part.partType || '';
          const qty = part.quantity || '';
          const serviceNotes = part.specialInstructions || '';
          const partId = part.id;

          // Build size string from available dimension fields
          const dims = [
            part.thickness && `${part.thickness}" thick`,
            part.width && `${part.width}" wide`,
            part.length && `${part.length}" long`,
          ].filter(Boolean).join(' × ');
          const diameter = part.outerDiameter || part.diameter || '';
          const innerDia = part.innerDiameter || '';
          const radius = part.radius || '';

          return (
            <div key={partId || partIndex} style={{
              background: 'white',
              borderRadius: '12px',
              padding: 'clamp(1rem, 3vw, 1.75rem)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              borderLeft: '4px solid #f59e0b'
            }}>
              {/* Part header */}
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem'}}>
                <div style={{flex: 1}}>
                  <h3 style={{margin: '0 0 0.35rem 0', fontSize: '1.1rem', color: '#1a1a1a'}}>
                    📦 Part #{partIndex + 1}{partNum ? `: ${partNum}` : ''}
                  </h3>
                  <div style={{display: 'flex', flexWrap: 'wrap', gap: '0.4rem', margin: '0.35rem 0'}}>
                    {qty > 0 && (
                      <span style={{background: '#fef3c7', color: '#92400e', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: '600'}}>
                        Qty: {qty}
                      </span>
                    )}
                    {serviceType && (
                      <span style={{background: '#ede9fe', color: '#5b21b6', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: '600'}}>
                        {serviceType}
                      </span>
                    )}
                  </div>
                  {desc && (
                    <p style={{margin: '0.35rem 0 0', color: '#333', fontSize: '0.9rem', lineHeight: 1.6}}>
                      {desc}
                    </p>
                  )}
                  {(dims || diameter || innerDia || radius) && (
                    <div style={{margin: '0.5rem 0 0', display: 'flex', flexWrap: 'wrap', gap: '0.75rem'}}>
                      {dims && <span style={{fontSize: '0.85rem', color: '#444'}}>📐 <strong>Size:</strong> {dims}</span>}
                      {diameter && <span style={{fontSize: '0.85rem', color: '#444'}}>⭕ <strong>OD:</strong> {diameter}"</span>}
                      {innerDia && <span style={{fontSize: '0.85rem', color: '#444'}}>⭕ <strong>ID:</strong> {innerDia}"</span>}
                      {radius && <span style={{fontSize: '0.85rem', color: '#444'}}>📏 <strong>Radius:</strong> {radius}"</span>}
                    </div>
                  )}
                  {serviceNotes && (
                    <p style={{margin: '0.5rem 0 0', color: '#555', fontSize: '0.875rem', fontStyle: 'italic', borderLeft: '3px solid #f59e0b', paddingLeft: '0.6rem'}}>
                      📝 {serviceNotes}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => navigate('/vendor/issues', { state: {
                    workOrderId: poData.workOrder?.id,
                    workOrderPartId: partId,
                    poNumber: poNumber,
                    drNumber: poData.workOrder?.drNumber,
                    partNumber: partNum,
                    partDescription: desc,
                    partIndex: partIndex + 1
                  }})}
                  style={{
                    padding: '0.45rem 0.9rem',
                    background: 'white',
                    color: '#dc2626',
                    border: '1.5px solid #dc2626',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '0.82rem',
                    whiteSpace: 'nowrap',
                    flexShrink: 0
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'white'; }}
                >
                  ⚠️ Report Issue
                </button>
              </div>

              {/* Part files */}
              {partFiles.length > 0 ? (
                <div style={{display: 'grid', gap: '0.6rem', marginTop: '0.75rem', borderTop: '1px solid #f0f0f0', paddingTop: '0.75rem'}}>
                  <p style={{margin: '0 0 0.4rem', fontSize: '0.8rem', fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em'}}>
                    Files ({partFiles.length})
                  </p>
                  {partFiles.map((file) => {
                    const fileName = file.filename || file.fileName || file.originalName || file.name || 'Unnamed File';
                    const is3D = is3DViewable(fileName);
                    return (
                      <div key={file.id} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        flexWrap: 'wrap', gap: '0.75rem',
                        padding: '0.75rem', border: '1.5px solid #e8e8e8', borderRadius: '8px',
                        transition: 'all 0.2s', boxSizing: 'border-box'
                      }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#f59e0b'; e.currentTarget.style.background = '#fffbf0'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#e8e8e8'; e.currentTarget.style.background = 'white'; }}
                      >
                        <div style={{flex: 1, minWidth: 0}}>
                          <p style={{margin: '0 0 0.2rem', fontWeight: '600', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                            📄 {fileName}
                          </p>
                          <p style={{margin: 0, color: '#888', fontSize: '0.8rem'}}>
                            {(file.sharedAt || file.createdAt || file.uploadedAt) ? `Uploaded: ${formatDate(file.sharedAt || file.createdAt || file.uploadedAt)}` : ''}
                            {is3D && <span style={{marginLeft: '0.4rem', color: '#8b5cf6'}}>• 3D Viewable</span>}
                          </p>
                        </div>
                        <div style={{display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: '130px'}}>
                          {is3D && (
                            <button onClick={() => handleView3D(file.id, fileName)} style={{padding: '0.45rem 0.75rem', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '0.82rem', width: '100%'}}
                              onMouseEnter={e => e.currentTarget.style.background = '#7c3aed'}
                              onMouseLeave={e => e.currentTarget.style.background = '#8b5cf6'}
                            >🎨 View 3D</button>
                          )}
                          <button onClick={() => handleDownloadFile(file.id, fileName)} disabled={downloadingFile === file.id}
                            style={{padding: '0.45rem 0.75rem', background: downloadingFile === file.id ? '#ccc' : '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', cursor: downloadingFile === file.id ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '0.82rem', width: '100%'}}
                            onMouseEnter={e => { if (downloadingFile !== file.id) e.currentTarget.style.background = '#d97706'; }}
                            onMouseLeave={e => { if (downloadingFile !== file.id) e.currentTarget.style.background = '#f59e0b'; }}
                          >{downloadingFile === file.id ? '⏳...' : '⬇️ Download'}</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{margin: '0.75rem 0 0', color: '#aaa', fontSize: '0.875rem'}}>No files attached to this part.</p>
              )}
            </div>
          );
        }) : (
          <div style={{background: 'white', borderRadius: '12px', padding: '2rem', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', textAlign: 'center', color: '#999'}}>
            <div style={{fontSize: '2.5rem', marginBottom: '0.75rem'}}>📭</div>
            <p style={{margin: 0}}>No line items found for this purchase order.</p>
          </div>
        )}
      </div>

      {/* 3D Viewer Modal */}
      {viewing3D && (
        <StepViewer3D
          fileUrl={viewing3D.fileUrl}
          fileName={viewing3D.fileName}
          onClose={() => setViewing3D(null)}
        />
      )}
    </div>
  );
};

export default VendorPODetails;
