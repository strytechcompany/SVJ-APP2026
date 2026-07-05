import React, { createContext, useContext, useState, useCallback } from 'react';
import { orderAPI } from '../services/api';

const OrderContext = createContext();

export const OrderProvider = ({ children }) => {
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchOrders = useCallback(async (params = {}, reset = true) => {
    try {
      if (reset) setLoading(true);
      setError(null);

      const queryParams = {
        search: params.search ?? searchQuery,
        status: params.status ?? statusFilter,
        page: reset ? 1 : pagination.page + 1,
        limit: 20,
      };

      const res = await orderAPI.getAll(queryParams);
      if (res.data.success) {
        if (reset) {
          setOrders(res.data.data);
        } else {
          setOrders((prev) => [...prev, ...res.data.data]);
        }
        setPagination(res.data.pagination);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load orders');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchQuery, statusFilter, pagination.page]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOrders({ search: searchQuery, status: statusFilter }, true);
  }, [fetchOrders, searchQuery, statusFilter]);

  const createOrder = useCallback(async (data) => {
    const res = await orderAPI.create(data);
    if (!res.data.success) throw new Error(res.data.message || 'Failed to create order');
    await onRefresh();
    return res.data;
  }, [onRefresh]);

  const updateOrderStatus = useCallback(async (id, status) => {
    const res = await orderAPI.updateStatus(id, status);
    if (!res.data.success) throw new Error(res.data.message || 'Failed to update status');
    setOrders((prev) =>
      prev.map((o) => (o._id === id ? { ...o, status: res.data.data.status } : o))
    );
    return res.data;
  }, []);

  const deleteOrder = useCallback(async (id) => {
    const res = await orderAPI.remove(id);
    if (!res.data.success) throw new Error(res.data.message || 'Failed to delete order');
    setOrders((prev) => prev.filter((o) => o._id !== id));
    return res.data;
  }, []);

  const loadMore = useCallback(() => {
    if (pagination.page < pagination.pages && !loading) {
      fetchOrders({}, false);
    }
  }, [pagination, loading, fetchOrders]);

  return (
    <OrderContext.Provider
      value={{
        orders,
        pagination,
        loading,
        refreshing,
        error,
        statusFilter,
        setStatusFilter,
        searchQuery,
        setSearchQuery,
        fetchOrders,
        onRefresh,
        createOrder,
        updateOrderStatus,
        deleteOrder,
        loadMore,
      }}
    >
      {children}
    </OrderContext.Provider>
  );
};

export const useOrders = () => useContext(OrderContext);
