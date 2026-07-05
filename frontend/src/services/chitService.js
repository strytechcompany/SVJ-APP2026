import api from './api';

export const createChitCustomer = async (data) => {
  const response = await api.post(`/chits`, data);
  return response.data;
};

export const getChitCustomers = async (status = '', search = '') => {
  const response = await api.get(`/chits?status=${status}&search=${search}`);
  return response.data;
};

export const payInstallment = async (chitId, data) => {
  const response = await api.post(`/chits/${chitId}/pay`, data);
  return response.data;
};

export const getChitTransactions = async (chitId) => {
  const response = await api.get(`/chits/${chitId}/transactions`);
  return response.data;
};

export const getAllChitTransactions = async () => {
  const response = await api.get(`/chits/all/transactions`);
  return response.data;
};

export const markReceiptPrinted = async (receiptId, pdfUrl = null) => {
  const response = await api.post(`/chits/receipts/${receiptId}/print`, { pdfUrl });
  return response.data;
};
