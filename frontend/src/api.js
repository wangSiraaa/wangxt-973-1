import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000
});

api.interceptors.request.use(config => {
  const user = JSON.parse(localStorage.getItem('locker_user') || 'null');
  if (user) {
    config.headers['X-User-Phone'] = user.phone;
    config.headers['X-User-Role'] = user.role;
    config.headers['X-User-Name'] = user.name;
  }
  return config;
});

api.interceptors.response.use(
  res => res.data,
  err => {
    const msg = err.response?.data?.error || err.message || '请求失败';
    return Promise.reject(new Error(msg));
  }
);

export default api;

export const lockerApi = {
  list: (params) => api.get('/lockers', { params }),
  heatmap: () => api.get('/lockers/heatmap'),
  getStatus: (id) => api.get(`/lockers/${id}/status`)
};

export const orderApi = {
  list: (params) => api.get('/orders', { params }),
  detail: (id) => api.get(`/orders/${id}`),
  rent: (data) => api.post('/visitor/rent', data),
  visitorOrders: (phone) => api.get(`/visitor/orders/${phone}`),
  visitorActive: (phone) => api.get(`/visitor/active-order/${phone}`),
  applySwap: (data) => api.post('/visitor/apply-swap', data),
  adminReturn: (data) => api.post('/admin/return', data),
  confirmSwap: (data) => api.post('/admin/swap/confirm', data),
  forceClose: (data) => api.post('/admin/force-close', data),
  bindWristband: (data) => api.post('/admin/wristband/bind', data),
  lockEvent: (data) => api.post('/admin/lock-event', data)
};

export const repairApi = {
  list: (params) => api.get('/repairs', { params }),
  report: (data) => api.post('/admin/fault/report', data),
  assign: (data) => api.post('/repair/assign', data),
  start: (data) => api.post('/repair/start', data),
  complete: (data) => api.post('/repair/complete', data),
  accept: (data) => api.post('/repair/accept', data)
};

export const financeApi = {
  depositLedger: (params) => api.get('/finance/deposit-ledger', { params }),
  hanging: () => api.get('/finance/hanging'),
  refund: (data) => api.post('/finance/refund', data),
  retryRefund: (data) => api.post('/finance/refund/retry', data),
  overtimeReversal: (data) => api.post('/finance/overtime-reversal', data),
  handleHanging: (data) => api.post('/finance/hanging/handle', data),
  mixRefund: (data) => api.post('/finance/mix-refund', data),
  settlements: (params) => api.get('/finance/settlements', { params }),
  runSettlement: (data) => api.post('/finance/settlement/run', data),
  lockSettlement: (data) => api.post('/finance/settlement/lock', data),
  settlementDiffs: (date) => api.get(`/finance/settlement/differences/${date}`)
};

export const itemApi = {
  list: (params) => api.get('/left-items', { params }),
  register: (data) => api.post('/admin/left-item/register', data),
  claim: (data) => api.post('/left-item/claim', data)
};

export const batchApi = {
  disable: (data) => api.post('/admin/batch-disable', data)
};

export const approvalApi = {
  list: (params) => api.get('/force-open/approvals', { params }),
  apply: (data) => api.post('/force-open/apply', data),
  approve: (data) => api.post('/force-open/approve', data)
};

export const auditApi = {
  list: (params) => api.get('/audits', { params })
};

export const couponApi = {
  list: () => api.get('/coupons')
};

export const authApi = {
  login: (data) => api.post('/auth/login', data)
};
