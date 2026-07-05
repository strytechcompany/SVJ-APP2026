import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import API_BASE_URL from '../config';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Pings /api/health to wake Render from sleep before the real login request.
// Render free tier cold start can take 30-90s; fast-check first, then show a
// status message so the user knows why it's slow.
export const wakeServer = async (onStatus) => {
  try {
    await axios.get(`${API_BASE_URL}/health`, { timeout: 8000 });
    console.log('[API] Server is awake (fast)');
    return true;
  } catch {
    // Server is sleeping — notify the user and retry with a longer timeout
    onStatus?.('Server is starting up, please wait...');
  }
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await axios.get(`${API_BASE_URL}/health`, { timeout: 60000 });
      console.log('[API] Server is awake');
      onStatus?.(null);
      return true;
    } catch (err) {
      console.log(`[API] Wake attempt ${attempt}/2 failed: ${err.message}`);
      if (attempt < 2) await new Promise((r) => setTimeout(r, 3000));
    }
  }
  onStatus?.(null);
  console.warn('[API] Server did not respond to health ping — proceeding anyway');
  return false;
};

api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const fullUrl = `${config.baseURL}${config.url}`;
    console.log(`[API] ${config.method?.toUpperCase()} ${fullUrl}`);
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const fullUrl = error.config
      ? `${error.config.baseURL}${error.config.url}`
      : 'unknown URL';
    const status = error.response?.status;
    const contentType = error.response?.headers?.['content-type'] || '';

    if (status === 404 && contentType.includes('text/plain')) {
      // text/plain 404 = Render infrastructure response — the Node.js server is NOT running.
      // Our Express catch-all always returns application/json.
      console.error(
        `[API] SERVER DOWN — ${fullUrl}\n` +
        `  The backend is not running at: ${API_BASE_URL}\n` +
        `  Render service is suspended or the URL has changed.\n` +
        `  Fix: go to render.com, check the service, redeploy, and update config.js.`
      );
    } else if (status === 404) {
      console.error(`[API] 404 Route Not Found — ${fullUrl}`);
    } else if (status === 401) {
      console.warn(`[API] 401 Unauthorized — ${fullUrl}`);
    } else if (status === 500) {
      console.error(`[API] 500 Server Error — ${fullUrl}`, error.response?.data);
    } else {
      console.error(`[API] ${status ?? 'Network Error'} — ${fullUrl}`, error.message);
    }

    if (status === 401) {
      // If we get an Unauthorized error, the token is invalid or expired.
      // Clear storage so the user isn't trapped in a 401 loop
      const token = await AsyncStorage.getItem('token');
      if (token) {
        await AsyncStorage.removeItem('token');
        await AsyncStorage.removeItem('user');
        // We only show the alert if they were supposedly logged in
        import('react-native').then(({ Alert, DeviceEventEmitter }) => {
          Alert.alert(
            'Session Expired',
            'Your login session has expired or is invalid. Please log in again.',
          );
          DeviceEventEmitter.emit('session_expired');
        });
      }
    }
    return Promise.reject(error);
  }
);

export const reportsAPI = {
  getReports: (params) => api.get('/reports', { params }), // mode, date, month, year
};

export const settingsAPI = {
  getSettings: () => api.get('/settings'),
  updateSettings: (data) => api.put('/settings', data),
  backupDatabase: () => api.post('/settings/backup'),
  restoreDatabase: (data) => api.post('/settings/restore', data),
  recalculateData: () => api.post('/settings/recalculate'),
  getServerStatus: () => api.get('/settings/status'),
};

export const cashLedgerAPI = {
  getHistory: (params) => api.get('/cash-ledger', { params }), // page, limit
  addAdjustment: (data) => api.post('/cash-ledger/adjust', data), // amount, description
};

export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }, { timeout: 30000 }),
  verifyOtp: (email, otp) => api.post('/auth/verify-otp', { email, otp }),
  getProfile: () => api.get('/auth/profile'),
  requestPasswordOtp: () => api.post('/auth/request-password-otp'),
  resetPassword: (data) => api.post('/auth/change-password', data),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetForgotPassword: (data) => api.post('/auth/reset-forgot-password', data),
};

export const userAPI = {
  list: () => api.get('/users'),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  toggleStatus: (id) => api.put(`/users/${id}/status`),
  resetPassword: (id, data) => api.put(`/users/${id}/reset-password`, data),
};

export const dashboardAPI = {
  getGoldRate: () => api.get('/dashboard/gold-rate'),
  updateGoldRate: (rate, effectiveDate) =>
    api.put('/dashboard/gold-rate', { rate, effectiveDate }),
  getRecentIssued: () => api.get('/dashboard/recent-issued'),
};

export const stockAPI = {
  create: (data) => api.post('/stock/create', data),
  getAll: (params) => api.get('/stock/all', { params }),
  getSummary: () => api.get('/stock/summary'),
  getById: (id) => api.get(`/stock/${id}`),
  getByBarcode: (barcode) => api.get(`/stock/barcode/${barcode}`),
  update: (id, data) => api.put(`/stock/update/${id}`, data),
  remove: (id) => api.delete(`/stock/delete/${id}`),
};

export const customerAPI = {
  create: (data) => api.post('/customers/create', data),
  getAll: (params) => api.get('/customers/all', { params }),
  getById: (id) => api.get(`/customers/${id}`),
  update: (id, data) => api.put(`/customers/update/${id}`, data),
  remove: (id) => api.delete(`/customers/delete/${id}`),
  search: (params) => api.get('/customers/search', { params }),
  getByType: (type, params) => api.get(`/customers/type/${type}`, { params }),
};

export const transactionAPI = {
  create: (data) => api.post('/transactions/create', data),
  getAll: (params) => api.get('/transactions/all', { params }),
  getRecent: () => api.get('/transactions/recent'),
  getById: (id) => api.get(`/transactions/${id}`),
  getByCustomer: (customerId) => api.get(`/transactions/customer/${customerId}`),
  markPrinted: (id) => api.post(`/transactions/${id}/print`),
  update: (id, data) => api.put(`/transactions/${id}`, data),
  delete: (id) => api.delete(`/transactions/${id}`),
};

export const settlementAPI = {
  create: (data) => api.post('/settlements/create', data),
  getByBill: (billId) => api.get(`/settlements/bill/${billId}`),
  getById: (id) => api.get(`/settlements/${id}`),
};

export const inventoryAPI = {
  getReceived: (params) => api.get('/inventory/received', { params }),
  getReceivedSummary: () => api.get('/inventory/received/summary'),
};

export const lineStockAPI = {
  getDashboardSummary: () => api.get('/linestock/dashboard/summary'),
  getTransactions: (params) => api.get('/linestock', { params }),
  getTransactionById: (id) => api.get(`/linestock/${id}`),
  issueStock: (data) => api.post('/linestock/issue', data),
  settleStock: (data) => api.post('/linestock/settle', data),
  getSettlementById: (id) => api.get(`/linestock/settlement/${id}`),
};

export const orderAPI = {
  create: (data) => api.post('/orders/create', data),
  getAll: (params) => api.get('/orders/all', { params }),
  getById: (id) => api.get(`/orders/${id}`),
  updateStatus: (id, status) => api.put(`/orders/${id}/status`, { status }),
  remove: (id) => api.delete(`/orders/${id}`),
};

export default api;

