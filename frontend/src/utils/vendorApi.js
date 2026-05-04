import axios from 'axios';

const API_BASE_URL = '/api/vendor';

// Get token from localStorage
const getToken = () => {
  return localStorage.getItem('token');
};

// Check if vendor is authenticated
export const isAuthenticated = () => {
  const token = getToken();
  return !!token;
};

// Get vendor name from localStorage
export const getVendorName = () => {
  return localStorage.getItem('vendorName') || 'Vendor';
};

// Logout function
export const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('vendorName');
  delete axios.defaults.headers.common['Authorization'];
  window.location.href = '/login';
};

// Verify token and get vendor info
export const verifyToken = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/verify`, {
      headers: {
        'Authorization': `Bearer ${getToken()}`
      }
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

// Get all purchase orders for vendor
export const getPurchaseOrders = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/purchase-orders`, {
      headers: {
        'Authorization': `Bearer ${getToken()}`
      }
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

// Get purchase order details
export const getPurchaseOrderDetails = async (poNumber) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/purchase-orders/${poNumber}`, {
      headers: {
        'Authorization': `Bearer ${getToken()}`
      }
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

// Get file download URL
export const getFileDownloadUrl = (fileId, poNumber) => {
  return `${API_BASE_URL}/purchase-orders/${poNumber}/files/${fileId}`;
};

// Download file
export const downloadFile = async (fileUrl, fileName) => {
  try {
    const response = await axios.get(fileUrl, {
      responseType: 'blob',
      headers: {
        'Authorization': `Bearer ${getToken()}`
      }
    });
    
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
    throw error;
  }
};

// Submit issue
export const submitIssue = async (issueData) => {
  try {
    const formData = new FormData();
    // Required by backend
    if (issueData.workOrderId) formData.append('workOrderId', issueData.workOrderId);
    if (issueData.workOrderPartId) formData.append('workOrderPartId', issueData.workOrderPartId);
    if (issueData.poNumber) formData.append('poNumber', issueData.poNumber);
    if (issueData.reportedBy) formData.append('reportedBy', issueData.reportedBy);
    formData.append('description', issueData.description);
    if (issueData.priority) formData.append('priority', issueData.priority);

    if (issueData.photo) {
      formData.append('photo', issueData.photo);
    }

    const response = await axios.post(`${API_BASE_URL}/issues`, formData, {
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'multipart/form-data'
      }
    });

    return response.data;
  } catch (error) {
    console.error('submitIssue error:', error.response?.data || error.message);
    throw error;
  }
};

// Report issue (alias for submitIssue)
export const reportIssue = submitIssue;

// Get vendor issues
export const getIssues = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/issues`, {
      headers: {
        'Authorization': `Bearer ${getToken()}`
      }
    });
    return response.data;
  } catch (error) {
    throw error;
  }
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Check if a date is past due
export const isPastDue = (dueDate) => {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  const now = new Date();
  return due < now;
};

// Format date to readable string
export const formatDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
};

// Format date and time to readable string
export const formatDateTime = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

// Format currency
export const formatCurrency = (amount) => {
  if (!amount && amount !== 0) return '';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
};

// Format file size in bytes to human-readable format
export const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

// Get file extension
export const getFileExtension = (fileName) => {
  if (!fileName) return '';
  return fileName.split('.').pop().toLowerCase();
};

// Get icon for file type
export const getFileIcon = (fileName) => {
  const ext = getFileExtension(fileName);
  switch(ext) {
    case 'pdf': return 'ð';
    case 'step':
    case 'stp': return 'ð§';
    case 'dxf': return 'ð';
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif': return 'ð¼ï¸';
    case 'zip':
    case 'rar': return 'ð¦';
    case 'doc':
    case 'docx': return 'ð';
    case 'xls':
    case 'xlsx': return 'ð';
    default: return 'ð';
  }
};

// Check if file is viewable (STEP, DXF, PDF)
export const isViewableFile = (fileName) => {
  const ext = getFileExtension(fileName);
  return ['step', 'stp', 'dxf', 'pdf'].includes(ext);
};

export default {
  isAuthenticated,
  getVendorName,
  logout,
  verifyToken,
  getPurchaseOrders,
  getPurchaseOrderDetails,
  getFileDownloadUrl,
  downloadFile,
  submitIssue,
  reportIssue,
  getIssues,
  isPastDue,
  formatDate,
  formatDateTime,
  formatCurrency,
  formatFileSize,
  getFileExtension,
  getFileIcon,
  isViewableFile
};
