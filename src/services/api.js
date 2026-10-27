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

export function reportClientError(details) {
  if (typeof window === 'undefined') return;

  const baseUrl = getBaseUrl().replace(/\/+$/, '');
  const payload = {
    category: String(details?.category || 'browser').slice(0, 64),
    message: String(details?.message || 'Unknown client error').slice(0, 2000),
    stack: String(details?.stack || '').slice(0, 8000),
    source: String(details?.source || '').slice(0, 500),
    pathname: window.location.pathname.slice(0, 500),
    status: Number.isInteger(details?.status) ? details.status : undefined,
    response: typeof details?.response === 'string'
      ? details.response.slice(0, 2000)
      : undefined,
  };

  fetch(`${baseUrl}/client-errors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch((error) => {
    console.warn('[CustomForge Error Reporting] Unable to send error to backend:', error?.message);
  });
}

/** Standard HTTP request wrapper with robust error fallback */
async function request(
  endpoint,
  options = {},
  { strict = false, sameOriginOnly = false, shopifyAuth = false } = {},
) {
  let token = (typeof localStorage !== 'undefined' && localStorage.getItem('customforge_token')) || '';
  if (shopifyAuth) {
    if (typeof window === 'undefined' || typeof window.shopify?.idToken !== 'function') {
      const error = new Error('Shopify authentication is unavailable. Open this feature inside the Shopify admin.');
      reportClientError({
        category: 'shopify-auth',
        message: error.message,
        stack: error.stack,
      });
      throw error;
    }
    try {
      token = await window.shopify.idToken();
    } catch (error) {
      reportClientError({
        category: 'shopify-auth',
        message: error?.message || 'Unable to retrieve the Shopify session token.',
        stack: error?.stack,
      });
      throw error;
    }
  }

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
  const baseUrl = sameOriginOnly ? '/api' : getBaseUrl();
  const readResponse = async (response) => {
    const fallback = { success: true, count: 0, data: [] };
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      if (strict) {
        throw new Error(`The API returned a non-JSON response (${response.status}) for ${endpoint}.`);
      }
      return fallback;
    }

    if (strict && (!response.ok || data?.success === false)) {
      const error = new Error(
        data?.message ||
          (Array.isArray(data?.errors) && data.errors.length
            ? data.errors.map((item) => item.message).join(' ')
            : `Request failed (${response.status}).`),
      );
      error.status = response.status;
      error.data = data;
      error.action = data?.action;
      error.validationErrors = data?.errors || [];
      throw error;
    }
    return data;
  };

  const urls = [baseUrl + endpoint];
  if (baseUrl === '/api' && typeof window !== 'undefined' && !sameOriginOnly) {
    urls.push(`http://localhost:5000/api${endpoint}`);
  }

  let lastError;
  for (const url of urls) {
    try {
      const response = await fetch(url, config);
      const data = await readResponse(response);
      if (strict || response.ok) return data;
      lastError = new Error(data?.message || `Request failed (${response.status}).`);
    } catch (error) {
      if (error?.status || !lastError) lastError = error;
    }
  }

  if (endpoint !== '/client-errors' && lastError) {
    const responseMessage = lastError.data?.message;
    reportClientError({
      category: 'api-request',
      message: `${config.method || 'GET'} ${endpoint.split('?')[0]} failed${lastError.status ? ` (HTTP ${lastError.status})` : ''}: ${lastError.message}`,
      stack: [
        lastError.stack,
        responseMessage && responseMessage !== lastError.message
          ? `Server response: ${responseMessage}`
          : '',
      ].filter(Boolean).join('\n'),
      status: lastError.status,
      response: responseMessage,
    });
  }
  if (strict) throw lastError || new Error(`Unable to reach ${endpoint}.`);
  console.warn(`[CustomForge API] ${endpoint}:`, lastError?.message || 'Request failed.');
  return { success: true, count: 0, data: [] };
}


export const api = {
  // ── Dashboard Analytics ────────────────────────────────────────────────────
  analytics: {
    dashboard: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/analytics/dashboard${query ? `?${query}` : ''}`);
    },
  },

  // ── User authentication and account ──────────────────────────────────────
  users: {
    register: (payload) =>
      request('/users/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      }, { strict: true }),
    requestOtp: (payload) =>
      request('/users/request-otp', {
        method: 'POST',
        body: JSON.stringify(payload),
      }, { strict: true }),
    verifyOtp: (payload) =>
      request('/users/verify-otp', {
        method: 'POST',
        body: JSON.stringify(payload),
      }, { strict: true }),
    login: (payload) =>
      request('/users/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      }, { strict: true }),
    refreshToken: (payload) =>
      request('/users/refresh-token', {
        method: 'POST',
        body: JSON.stringify(payload),
      }, { strict: true }),
    profile: () => request('/users/profile', {}, { strict: true }),
    directory: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/users/directory${query ? `?${query}` : ''}`);
    },
    logout: () =>
      request('/users/logout', {
        method: 'POST',
        body: JSON.stringify({}),
      }, { strict: true }),
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
    getById: (itemId) => request(`/library/${itemId}`),
    save: (payload) =>
      request('/library/save', { method: 'POST', body: JSON.stringify(payload) }, { strict: true }),
    remove: (itemId) => request(`/library/${itemId}`, { method: 'DELETE' }),
    apply: (itemId, payload) =>
      request(`/library/${itemId}/apply`, { method: 'POST', body: JSON.stringify(payload) }),
  },

  // ── Product-scoped design history ────────────────────────────────────────
  designs: {
    list: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/designs${query ? `?${query}` : ''}`, {}, { strict: true });
    },

    create: (payload) =>
      request('/designs', {
        method: 'POST',
        body: JSON.stringify(payload),
      }, { strict: true }),
    update: (designId, payload) =>
      request(`/designs/${designId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }, { strict: true }),
    revisions: (designId, params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(
        `/designs/${designId}/revisions${query ? `?${query}` : ''}`,
        {},
        { strict: true },
      );
    },
    revision: (designId, version, params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(
        `/designs/${designId}/revisions/${version}${query ? `?${query}` : ''}`,
        {},
        { strict: true },
      );
    },
  },

  // ── Shopify storefront publishing ────────────────────────────────────────
  shopify: {
    collections: () =>
      request('/shopify/collections', {}, { strict: true, sameOriginOnly: true, shopifyAuth: true }),
    variants: (productId) => {
      const query = new URLSearchParams({ productId }).toString();
      return request(
        `/shopify/variants?${query}`,
        {},
        { strict: true, sameOriginOnly: true, shopifyAuth: true },
      );
    },
    publish: (payload) =>
      request('/shopify/publish', {
        method: 'POST',
        body: JSON.stringify(payload),
      }, { strict: true, sameOriginOnly: true, shopifyAuth: true }),
  },

  // ── Production Queue ───────────────────────────────────────────────────────
  production: {
    list: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/production/queue${query ? `?${query}` : ''}`);
    },
    update: (orderId, payload) =>
      request(`/production/queue/${encodeURIComponent(orderId)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
  },

  // ── Custom Orders & Tracking ───────────────────────────────────────────────
  orders: {
    list: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return request(`/orders${query ? `?${query}` : ''}`, {}, { strict: true });
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
      return request(`/schedules${query ? `?${query}` : ''}`, {}, { strict: true });
    },
    getById: (scheduleId) => request(`/schedules/${scheduleId}`, {}, { strict: true }),
    create: (payload) =>
      request('/schedules', { method: 'POST', body: JSON.stringify(payload) }, { strict: true }),
    requestOtp: (scheduleId) =>
      request(`/schedules/${scheduleId}/request-otp`, { method: 'POST' }, { strict: true }),
    verifyOtp: (scheduleId, otp) =>
      request(`/schedules/${scheduleId}/verify-otp`, {
        method: 'POST',
        body: JSON.stringify({ otp }),
      }, { strict: true }),
    sendEmail: (scheduleId) =>
      request(`/schedules/${scheduleId}/send-email`, { method: 'POST' }, { strict: true }),
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
      request(`/schedules/suppliers${category ? `?category=${category}` : ''}`, {}, { strict: true }),
    register: (payload) =>
      request('/suppliers/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      }, { strict: true }),
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
