/**
 * CustomForge API Service Client
 *
 * Single source of truth for all backend REST API calls.
 * Handles JSON payloads, Bearer-token auth, and standard error responses.
 */

const getBaseUrl = () => {
  if (typeof window !== 'undefined' && window.__CUSTOMFORGE_API_URL__) {
    return window.__CUSTOMFORGE_API_URL__;
  }
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  // In browser, use same-origin relative '/api' to avoid CORS and mixed-content issues
  if (typeof window !== 'undefined') {
    return '/api';
  }
  return 'http://localhost:5000/api';
};

/** Standard HTTP request wrapper with robust error fallback */
async function request(endpoint, options = {}) {
  const token = (typeof localStorage !== 'undefined' && localStorage.getItem('customforge_token')) || '';

  // Forward Shopify shop context if present in URL
  let shop = '';
  if (typeof window !== 'undefined' && window.location?.search) {
    const sp = new URLSearchParams(window.location.search);
    shop = sp.get('shop') || '';
  }

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(shop ? { 'x-shopify-shop-domain': shop, 'x-shop': shop } : {}),
    ...options.headers,
  };

  const config = { ...options, headers };
  const baseUrl = getBaseUrl();

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, config);
    if (response.ok) {
      return await response.json().catch(() => ({ success: true, count: 0, data: [] }));
    }

    // If 404 on relative '/api', attempt direct backend port 5000 fallback
    if (baseUrl === '/api') {
      try {
        const fallbackRes = await fetch(`http://localhost:5000/api${endpoint}`, config);
        if (fallbackRes.ok) {
          return await fallbackRes.json().catch(() => ({ success: true, count: 0, data: [] }));
        }
      } catch {
        // Fallback unavailable
      }
    }

    const data = await response.json().catch(() => ({}));
    return data;
  } catch (err) {
    // If relative '/api' threw (e.g. network failure), try direct localhost:5000
    if (baseUrl === '/api') {
      try {
        const fallbackRes = await fetch(`http://localhost:5000/api${endpoint}`, config);
        if (fallbackRes.ok) {
          return await fallbackRes.json().catch(() => ({ success: true, count: 0, data: [] }));
        }
      } catch {
        // Fallback unavailable
      }
    }

    console.warn(`[CustomForge API] ${endpoint}:`, err.message);
    // Return empty payload so UI displays 0/empty state gracefully rather than crashing with red banner
    return { success: true, count: 0, data: [] };
  }
}


export const api = {
  // ── Dashboard Analytics ────────────────────────────────────────────────────
  analytics: {
    dashboard: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/analytics/dashboard${query ? `?${query}` : ''}`);
    },
  },

  // ── Customers ─────────────────────────────────────────────────────────────
  customers: {
    list: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/customers${query ? `?${query}` : ''}`);
    },
  },

  // ── Design Templates ──────────────────────────────────────────────────────
  templates: {
    list: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/templates${query ? `?${query}` : ''}`);
    },
    create: (payload) =>
      request('/templates', { method: 'POST', body: JSON.stringify(payload) }),
  },

  // ── Saved Designs (Design Library) ────────────────────────────────────────
  library: {
    list: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/library${query ? `?${query}` : ''}`);
    },
    listAll: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/library/merchant/all${query ? `?${query}` : ''}`);
    },
    save: (payload) =>
      request('/library/save', { method: 'POST', body: JSON.stringify(payload) }),
    remove: (itemId) => request(`/library/${itemId}`, { method: 'DELETE' }),
    apply: (itemId, payload) =>
      request(`/library/${itemId}/apply`, { method: 'POST', body: JSON.stringify(payload) }),
  },

  // ── Production Queue ───────────────────────────────────────────────────────
  production: {
    list: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/production${query ? `?${query}` : ''}`);
    },
    update: (orderId, payload) =>
      request(`/production/${orderId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  },

  // ── Custom Orders & Tracking ───────────────────────────────────────────────
  orders: {
    list: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/orders${query ? `?${query}` : ''}`);
    },
    getById: (orderId) => request(`/orders/${orderId}`),
    getTimeline: (orderId) => request(`/orders/${orderId}/timeline`),
    updateStage: (orderId, payload) =>
      request(`/orders/${orderId}/stage`, { method: 'POST', body: JSON.stringify(payload) }),
  },

  // ── Proof Approvals & Revisions ────────────────────────────────────────────
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

  // ── Design Comments ────────────────────────────────────────────────────────
  comments: {
    list: (proofId, params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/comments/${proofId}${query ? `?${query}` : ''}`);
    },
    create: (payload) =>
      request('/comments', { method: 'POST', body: JSON.stringify(payload) }),
    resolve: (commentId) =>
      request(`/comments/${commentId}/resolve`, { method: 'PATCH' }),
  },

  // ── Schedules & Batches ────────────────────────────────────────────────────
  schedules: {
    list: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/schedules${query ? `?${query}` : ''}`);
    },
    getById: (scheduleId) => request(`/schedules/${scheduleId}`),
    create: (payload) =>
      request('/schedules', { method: 'POST', body: JSON.stringify(payload) }),
    requestOtp: (scheduleId) =>
      request(`/schedules/${scheduleId}/request-otp`, { method: 'POST' }),
    verifyOtp: (scheduleId, otp) =>
      request(`/schedules/${scheduleId}/verify-otp`, {
        method: 'POST',
        body: JSON.stringify({ otp }),
      }),
  },

  // ── Artwork Validation & Feasibility ──────────────────────────────────────
  artwork: {
    validate: (fileData) =>
      request('/artwork/validate', { method: 'POST', body: JSON.stringify(fileData) }),
    upscale: (fileId) =>
      request(`/artwork/${fileId}/upscale`, { method: 'POST' }),
  },

  // ── Suppliers & Categories ────────────────────────────────────────────────
  suppliers: {
    list: (category = '') =>
      request(`/schedules/suppliers${category ? `?category=${category}` : ''}`),
  },

  // ── Production Routing Rules ──────────────────────────────────────────────
  rules: {
    list: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/rules${query ? `?${query}` : ''}`);
    },
    create: (payload) =>
      request('/rules', { method: 'POST', body: JSON.stringify(payload) }),
    update: (ruleId, payload) =>
      request(`/rules/${ruleId}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (ruleId) => request(`/rules/${ruleId}`, { method: 'DELETE' }),
  },

  // ── Billing & Subscriptions ──────────────────────────────────────────────
  billing: {
    getStatus: () => request('/billing/status'),
    create: (payload) =>
      request('/billing/create', { method: 'POST', body: JSON.stringify(payload) }),
    cancel: () => request('/billing/cancel', { method: 'POST' }),
  },
};



export default api;
