import api from './api';

export const expenseAPI = {
  create: async (data) => {
    const res = await api.post('/expenses/create', data);
    return res.data;
  },
  getAll: async (params = {}) => {
    // params can include type, filter, search
    const query = new URLSearchParams(params).toString();
    const res = await api.get(`/expenses/all?${query}`);
    return res.data;
  },
  getById: async (id) => {
    const res = await api.get(`/expenses/${id}`);
    return res.data;
  },
  update: async (id, data) => {
    const res = await api.put(`/expenses/update/${id}`, data);
    return res.data;
  },
  delete: async (id) => {
    const res = await api.delete(`/expenses/delete/${id}`);
    return res.data;
  },
  getSummary: async () => {
    const res = await api.get('/expenses/summary');
    return res.data;
  }
};
