import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
} from 'react';
import { customerAPI } from '../services/api';

const CustomerContext = createContext();

export const CustomerProvider = ({ children }) => {
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });

  // ─── Fetch All Customers ───────────────────────────────────────────────────
  const fetchCustomers = useCallback(async (params = {}, reset = true) => {
    try {
      if (reset) setLoading(true);
      setError(null);

      const queryParams = {
        search: params.search ?? searchQuery,
        type: (params.type ?? typeFilter) === 'LINE STOCKER' ? 'LINE_STOCKER' : (params.type ?? typeFilter),
        page: reset ? 1 : pagination.page + 1,
        limit: 20,
      };

      const res = await customerAPI.getAll(queryParams);
      if (res.data.success) {
        if (reset) {
          setCustomers(res.data.data);
        } else {
          setCustomers((prev) => [...prev, ...res.data.data]);
        }
        setPagination(res.data.pagination);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load customers');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchQuery, typeFilter, pagination.page]);

  // ─── Refresh ───────────────────────────────────────────────────────────────
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchCustomers({ search: searchQuery, type: typeFilter }, true);
  }, [fetchCustomers, searchQuery, typeFilter]);

  // ─── Create Customer ───────────────────────────────────────────────────────
  const createCustomer = useCallback(async (data) => {
    const maxRetries = 2;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await customerAPI.create(data);
        if (res.data.success) {
          await fetchCustomers({ search: searchQuery, type: typeFilter }, true);
        }
        return res.data;
      } catch (err) {
        lastError = err;
        const status = err?.response?.status;
        const message = String(err?.response?.data?.message || '').toLowerCase();
        const isCodeConflict = status === 409 && message.includes('customer code already exists');

        if (isCodeConflict && attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  }, [fetchCustomers, searchQuery, typeFilter]);

  // ─── Update Customer ───────────────────────────────────────────────────────
  const updateCustomer = useCallback(async (id, data) => {
    const res = await customerAPI.update(id, data);
    if (res.data.success) {
      await fetchCustomers({ search: searchQuery, type: typeFilter }, true);
      setSelectedCustomer(res.data.data);
    }
    return res.data;
  }, [fetchCustomers, searchQuery, typeFilter]);

  // ─── Delete Customer ───────────────────────────────────────────────────────
  const deleteCustomer = useCallback(async (id) => {
    const res = await customerAPI.remove(id);
    if (res.data.success) {
      await fetchCustomers({ search: searchQuery, type: typeFilter }, true);
    }
    return res.data;
  }, [fetchCustomers, searchQuery, typeFilter]);

  // ─── Get Single Customer ───────────────────────────────────────────────────
  const getCustomerById = useCallback(async (id) => {
    const res = await customerAPI.getById(id);
    if (res.data.success) {
      setSelectedCustomer(res.data.data);
    }
    return res.data;
  }, []);

  // ─── Load More ─────────────────────────────────────────────────────────────
  const loadMore = useCallback(() => {
    if (pagination.page < pagination.pages && !loading) {
      fetchCustomers({}, false);
    }
  }, [pagination, loading, fetchCustomers]);

  return (
    <CustomerContext.Provider
      value={{
        customers,
        selectedCustomer,
        loading,
        refreshing,
        error,
        pagination,
        searchQuery,
        setSearchQuery,
        typeFilter,
        setTypeFilter,
        fetchCustomers,
        onRefresh,
        createCustomer,
        updateCustomer,
        deleteCustomer,
        getCustomerById,
        loadMore,
        setSelectedCustomer,
      }}
    >
      {children}
    </CustomerContext.Provider>
  );
};

export const useCustomer = () => useContext(CustomerContext);
