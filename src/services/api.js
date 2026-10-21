/**
 * CustomForge API Service Client
 * 
 * Configured to communicate with the CustomForge backend REST API (default port 5000)
 * Handles token authentication, JSON payloads, and standard error responses.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/**
 * Standard HTTP request wrapper with Bearer token authentication
 */
async function request(endpoint, options = {}) {
  const token = localStorage.getItem('customforge_token') || '';

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const config = {
    ...options,
    headers,
  };

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(data.message || `Request failed with status ${response.status}`);
      error.status = response.status;
      error.details = data;
      throw error;
    }

    return data;
  } catch (err) {
    console.error(`[CustomForge API] Error on ${endpoint}:`, err);
    throw err;
  }
}

export const api = {
  // Schedules & Batches
  schedules: {
    list: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/schedules${query ? `?${query}` : ''}`);
    },
    getById: (scheduleId) => request(`/schedules/${scheduleId}`),
    create: (payload) =>
      request('/schedules', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    requestOtp: (scheduleId) =>
      request(`/schedules/${scheduleId}/request-otp`, {
        method: 'POST',
      }),
    verifyOtp: (scheduleId, otp) =>
      request(`/schedules/${scheduleId}/verify-otp`, {
        method: 'POST',
        body: JSON.stringify({ otp }),
      }),
  },

  // Proof Approvals & Revisions
  proofs: {
    list: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/proofs${query ? `?${query}` : ''}`);
    },
    getById: (proofId) => request(`/proofs/${proofId}`),
    approve: (proofId, otp) =>
      request(`/proofs/${proofId}/approve`, {
        method: 'POST',
        body: JSON.stringify({ otp }),
      }),
    requestRevision: (proofId, notes) =>
      request(`/proofs/${proofId}/revisions`, {
        method: 'POST',
        body: JSON.stringify({ notes }),
      }),
  },

  // Custom Orders & Tracking
  orders: {
    list: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/orders${query ? `?${query}` : ''}`);
    },
    getById: (orderId) => request(`/orders/${orderId}`),
    getTimeline: (orderId) => request(`/orders/${orderId}/timeline`),
  },

  // Artwork Validation & Feasibility Pre-flight
  artwork: {
    validate: (fileData) =>
      request('/artwork/validate', {
        method: 'POST',
        body: JSON.stringify(fileData),
      }),
    upscale: (fileId) =>
      request(`/artwork/${fileId}/upscale`, {
        method: 'POST',
      }),
  },

  // Suppliers & Categories
  suppliers: {
    list: (category = '') =>
      request(`/schedules/suppliers${category ? `?category=${category}` : ''}`),
  },
};

export default api;
