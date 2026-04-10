// frontend/src/pages/VendorIssues.js
// Vendor Portal - View Reported Issues

import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  getIssues,
  reportIssue,
  formatDateTime
} from '../utils/vendorApi';
import './Dashboard.css';

const VendorIssues = () => {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  const navigate = useNavigate();
  const location = useLocation();
  
  // Pre-filled data from navigation state
  const prefillData = location.state || {};

  // Form state
  const [formData, setFormData] = useState({
    reportedBy: '',
    description: '',
    photo: null
  });

  useEffect(() => {
    fetchIssues();
    
    // If navigated here to report new issue, show modal
    if (prefillData.workOrderId) {
      setShowReportModal(true);
    }
  }, []);

  const fetchIssues = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getIssues();
      
      console.log('Fetched issues:', data);
      setIssues(data || []);
    } catch (err) {
      console.error('Error fetching issues:', err);
      setError('Failed to load issues.');
      
      if (err.message.includes('Authentication failed')) {
        navigate('/vendor/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file (JPG, PNG, etc.)');
        return;
      }
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert('File size must be less than 10MB');
        return;
      }
      setFormData(prev => ({ ...prev, photo: file }));
    }
  };

  const handleSubmitIssue = async (e) => {
    e.preventDefault();
    
    if (!formData.description.trim()) {
      alert('Please describe the issue');
      return;
    }

    if (!prefillData.workOrderId) {
      alert('Missing work order information');
      return;
    }

    setSubmitting(true);

    try {
      const issueData = {
        workOrderId: prefillData.workOrderId,
        workOrderPartId: prefillData.workOrderPartId,
        poNumber: prefillData.poNumber,
        reportedBy: formData.reportedBy.trim() || 'Vendor',
        description: formData.description.trim(),
        photo: formData.photo
      };

      console.log('Submitting issue:', issueData);
      
      const result = await reportIssue(issueData);
      
      console.log('Issue reported:', result);
      
      // Show success message
      alert('Issue reported successfully! We will review it shortly.');
      
      // Reset form and close modal
      setFormData({ reportedBy: '', description: '', photo: null });
      setShowReportModal(false);
      
      // Refresh issues list
      await fetchIssues();
      
      // Navigate back to dashboard
      navigate('/vendor/dashboard');
    } catch (err) {
      console.error('Error reporting issue:', err);
      alert('Failed to report issue. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const cancelReport = () => {
    setFormData({ reportedBy: '', description: '', photo: null });
    setShowReportModal(false);
    
    // If navigated here to report, go back
    if (prefillData.workOrderId) {
      navigate(-1);
    }
  };

  const goBack = () => {
    navigate('/vendor/dashboard');
  };

  // Count open issues
  const openIssues = issues.filter(issue => issue.status === 'open' || issue.status === 'acknowledged');

  return (
    <div className="dashboard-container">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-content">
          <div className="header-left">
            <button onClick={goBack} className="btn btn-back">
              ← Back
            </button>
            <h1>⚠️ Issues I Reported</h1>
          </div>
          <div className="header-right">
            {!showReportModal && (
              <button onClick={() => setShowReportModal(true)} className="btn btn-primary">
                + Report New Issue
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="dashboard-main">
        <div className="dashboard-content">

          {/* Report Issue Modal */}
          {showReportModal && (
            <div className="modal-overlay">
              <div className="modal-content">
                <div className="modal-header">
                  <h2>Report Issue</h2>
                  <button onClick={cancelReport} className="modal-close">✕</button>
                </div>

                <form onSubmit={handleSubmitIssue} className="issue-form">
                  {/* Work Order Info */}
                  {prefillData.drNumber && (
                    <div className="form-info">
                      <p><strong>Work Order:</strong> DR-{prefillData.drNumber}</p>
                      {prefillData.poNumber && (
                        <p><strong>PO:</strong> {prefillData.poNumber}</p>
                      )}
                      {prefillData.partNumber && (
                        <p><strong>Part:</strong> #{prefillData.partNumber}</p>
                      )}
                    </div>
                  )}

                  {/* Your Name */}
                  <div className="form-group">
                    <label htmlFor="reportedBy">Your Name</label>
                    <input
                      type="text"
                      id="reportedBy"
                      name="reportedBy"
                      value={formData.reportedBy}
                      onChange={handleInputChange}
                      className="form-control"
                      placeholder="Optional"
                    />
                  </div>

                  {/* Description */}
                  <div className="form-group">
                    <label htmlFor="description">
                      Describe the Issue <span className="required">*</span>
                    </label>
                    <textarea
                      id="description"
                      name="description"
                      value={formData.description}
                      onChange={handleInputChange}
                      className="form-control"
                      rows="4"
                      placeholder="Please describe the issue in detail..."
                      required
                    />
                  </div>

                  {/* Photo Upload */}
                  <div className="form-group">
                    <label htmlFor="photo">Photo (Optional)</label>
                    <input
                      type="file"
                      id="photo"
                      name="photo"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="form-control"
                    />
                    {formData.photo && (
                      <small className="form-hint">
                        Selected: {formData.photo.name} ({(formData.photo.size / 1024).toFixed(1)} KB)
                      </small>
                    )}
                    <small className="form-hint">
                      Max 10MB • JPG, PNG, WebP
                    </small>
                  </div>

                  {/* Actions */}
                  <div className="modal-actions">
                    <button
                      type="button"
                      onClick={cancelReport}
                      className="btn btn-secondary"
                      disabled={submitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={submitting}
                    >
                      {submitting ? 'Submitting...' : 'Submit Report'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Issues List */}
          <section className="dashboard-section">
            {loading && (
              <div className="loading-message">
                <p>Loading issues...</p>
              </div>
            )}

            {error && (
              <div className="error-message">
                <p>{error}</p>
                <button onClick={fetchIssues} className="btn btn-primary">
                  Try Again
                </button>
              </div>
            )}

            {!loading && !error && issues.length === 0 && (
              <div className="empty-state">
                <p>📭 No issues reported yet</p>
                <p className="empty-state-subtitle">
                  Report any questions or problems you encounter with purchase orders.
                </p>
              </div>
            )}

            {!loading && !error && issues.length > 0 && (
              <>
                {/* Open Issues */}
                {openIssues.length > 0 && (
                  <div className="issues-group">
                    <h3 className="group-title">⚠️ Open Issues ({openIssues.length})</h3>
                    {openIssues.map((issue) => (
                      <div key={issue.id} className={`issue-card issue-${issue.status}`}>
                        <div className="issue-header">
                          <div className="issue-title">
                            <span className={`status-badge status-${issue.status}`}>
                              {issue.status.toUpperCase()}
                            </span>
                            <span className="issue-wo">
                              {issue.workOrderNumber}
                              {issue.poNumber && ` • ${issue.poNumber}`}
                            </span>
                          </div>
                          <div className="issue-date">
                            {formatDateTime(issue.reportedAt)}
                          </div>
                        </div>

                        <div className="issue-body">
                          {issue.reportedBy && (
                            <div className="issue-meta">
                              Reported by: {issue.reportedBy}
                            </div>
                          )}
                          <div className="issue-description">
                            {issue.description}
                          </div>
                          {issue.photoUrl && (
                            <div className="issue-photo">
                              <a href={issue.photoUrl} target="_blank" rel="noopener noreferrer">
                                📷 View Photo
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Resolved Issues */}
                {issues.filter(i => i.status === 'resolved').length > 0 && (
                  <div className="issues-group">
                    <h3 className="group-title">
                      ✅ Resolved Issues ({issues.filter(i => i.status === 'resolved').length})
                    </h3>
                    {issues.filter(i => i.status === 'resolved').map((issue) => (
                      <div key={issue.id} className="issue-card issue-resolved">
                        <div className="issue-header">
                          <div className="issue-title">
                            <span className="status-badge status-resolved">RESOLVED</span>
                            <span className="issue-wo">
                              {issue.workOrderNumber}
                              {issue.poNumber && ` • ${issue.poNumber}`}
                            </span>
                          </div>
                          <div className="issue-date">
                            {formatDateTime(issue.reportedAt)}
                          </div>
                        </div>

                        <div className="issue-body">
                          {issue.reportedBy && (
                            <div className="issue-meta">
                              Reported by: {issue.reportedBy}
                            </div>
                          )}
                          <div className="issue-description">
                            {issue.description}
                          </div>
                          {issue.photoUrl && (
                            <div className="issue-photo">
                              <a href={issue.photoUrl} target="_blank" rel="noopener noreferrer">
                                📷 View Photo
                              </a>
                            </div>
                          )}

                          {issue.resolutionNotes && (
                            <div className="issue-resolution">
                              <strong>Resolution ({formatDateTime(issue.resolvedAt)}):</strong>
                              <p>{issue.resolutionNotes}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

        </div>
      </main>

      {/* Footer */}
      <footer className="dashboard-footer">
        <p>&copy; 2026 Carolina Rolling. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default VendorIssues;
