import React, { createContext, useContext, useState, useCallback } from 'react';
import { stockAPI, inventoryAPI } from '../services/api';

const StockContext = createContext();

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const parseNumericValue = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  const normalized = String(value).replace(/,/g, '').trim();
  const match = normalized.match(/-?\d*\.?\d+/);
  if (!match) return 0;

  const num = Number(match[0]);
  return Number.isFinite(num) ? num : 0;
};

const getQuantity = (item) => toNumber(
  parseNumericValue(
    item && typeof item === 'object'
      ? (item.quantity ?? item.qty ?? item.pcs ?? item.totalQty)
      : item
  )
);

const getWeight = (item) => toNumber(
  parseNumericValue(
    item && typeof item === 'object'
      ? (item.grossWeight ?? item.netWeight ?? item.totalWeight ?? item.weight)
      : item
  )
);

const mergeStockGroups = (prevGroups = [], nextGroups = []) => {
  const merged = [...prevGroups];
  nextGroups.forEach((newGroup) => {
    const existing = merged.find((g) => {
      const leftKey = g.groupKey || String(g.designName || '').toUpperCase();
      const rightKey = newGroup.groupKey || String(newGroup.designName || '').toUpperCase();
      return leftKey === rightKey;
    });

    if (existing) {
      existing.records = [...existing.records, ...newGroup.records];
      existing.totalQty += parseNumericValue(newGroup.totalQty);
      existing.totalNetWeight += parseNumericValue(newGroup.totalNetWeight);
      existing.totalStockWeight = existing.totalNetWeight;
      existing.totalWeight = existing.totalNetWeight;
    } else {
      merged.push({
        ...newGroup,
        totalQty: parseNumericValue(newGroup.totalQty),
        totalNetWeight: parseNumericValue(newGroup.totalNetWeight),
        totalStockWeight: parseNumericValue(newGroup.totalNetWeight),
        totalWeight: parseNumericValue(newGroup.totalNetWeight),
      });
    }
  });
  return merged;
};

export const StockProvider = ({ children }) => {
  // --- SHOWROOM STOCK STATE ---
  const [stocks, setStocks] = useState([]);
  const [summary, setSummary] = useState({ totalDesigns: 0, totalQuantity: 0, totalStockWeight: 0, totalNetWeight: 0 });
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // --- RECEIVED INVENTORY STATE ---
  const [receivedInventory, setReceivedInventory] = useState([]);
  const [receivedSummary, setReceivedSummary] = useState({ totalEntries: 0, totalWeight: 0, totalPurity: 0, totalAmount: 0 });
  const [receivedPagination, setReceivedPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [receivedFilter, setReceivedFilter] = useState('All');

  // --- GLOBAL STATE ---
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // ─── Fetch Showroom Stocks ────────────────────────────────────────────────────────
  const fetchStocks = useCallback(async (params = {}, reset = true) => {
    try {
      if (reset) setLoading(true);
      setError(null);

      const queryParams = {
        search: params.search ?? searchQuery,
        category: params.category ?? selectedCategory,
        page: reset ? 1 : pagination.page + 1,
        limit: 50,
        scan: 'true',
      };

      console.log('[StockContext] fetchStocks request:', queryParams);
      const res = await stockAPI.getAll(queryParams);
      console.log('[StockContext] fetchStocks raw response:', res.data);
      console.log('[StockContext] fetchStocks response:', {
        success: res.data?.success,
        groups: res.data?.data?.length ?? 0,
        total: res.data?.pagination?.total,
        page: res.data?.pagination?.page,
        pages: res.data?.pagination?.pages,
      });
      if (res.data.success) {
        const nextStocks = Array.isArray(res.data.data) ? res.data.data : [];
        if (reset) {
          setStocks(nextStocks);
        } else {
          const merged = mergeStockGroups(stocks, nextStocks);
          setStocks(merged);
        }
        console.log('[StockContext] fetched stock groups from MongoDB:', nextStocks.length);
        setPagination(res.data.pagination);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load stock');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchQuery, selectedCategory, pagination.page, stocks]);

  const fetchSummary = useCallback(async () => {
    try {
      console.log('[StockContext] fetchSummary request');
      const res = await stockAPI.getSummary();
      console.log('[StockContext] fetchSummary raw response:', res.data);
      console.log('[StockContext] fetchSummary response:', res.data?.data);
      if (res.data?.success) {
        const nextSummary = {
          totalDesigns: parseNumericValue(res.data.data?.totalDesigns),
          totalQuantity: parseNumericValue(res.data.data?.totalQuantity),
          totalStockWeight: parseNumericValue(res.data.data?.totalStockWeight ?? res.data.data?.totalNetWeight),
          totalNetWeight: parseNumericValue(res.data.data?.totalNetWeight ?? res.data.data?.totalStockWeight),
        };
        console.log('[StockContext] parsed summary totals:', nextSummary);
        setSummary(nextSummary);
        return nextSummary;
      }
      return null;
    } catch (err) {
      console.error('fetchSummary error:', err.message);
    }
  }, []);

  // ─── Fetch Received Inventory ───────────────────────────────────────────────────
  const fetchReceivedInventory = useCallback(async (params = {}, reset = true) => {
    try {
      if (reset) setLoading(true);
      setError(null);

      const queryParams = {
        filter: params.filter ?? receivedFilter,
        page: reset ? 1 : receivedPagination.page + 1,
        limit: 50,
      };

      console.log('[StockContext] fetchReceivedInventory request:', queryParams);
      const res = await inventoryAPI.getReceived(queryParams);
      console.log('[StockContext] fetchReceivedInventory response:', {
        success: res.data?.success,
        items: res.data?.data?.length ?? 0,
        total: res.data?.pagination?.total,
        page: res.data?.pagination?.page,
        pages: res.data?.pagination?.pages,
      });
      if (res.data.success) {
        if (reset) {
          setReceivedInventory(res.data.data);
        } else {
          setReceivedInventory(prev => [...prev, ...res.data.data]);
        }
        setReceivedPagination(res.data.pagination);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load received inventory');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [receivedFilter, receivedPagination.page]);

  const fetchReceivedSummary = useCallback(async () => {
    try {
      console.log('[StockContext] fetchReceivedSummary request');
      const res = await inventoryAPI.getReceivedSummary();
      console.log('[StockContext] fetchReceivedSummary response:', res.data?.data);
      if (res.data.success) setReceivedSummary(res.data.data);
    } catch (err) {
      console.error('fetchReceivedSummary error:', err.message);
    }
  }, []);

  // ─── Refresh ───────────────────────────────────────────
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      fetchStocks({ search: searchQuery, category: selectedCategory }, true),
      fetchSummary(),
      fetchReceivedInventory({ filter: receivedFilter }, true),
      fetchReceivedSummary()
    ]);
  }, [fetchStocks, fetchSummary, fetchReceivedInventory, fetchReceivedSummary, searchQuery, selectedCategory, receivedFilter]);

  // ─── Crud for Showroom ────────────────────────────────────────────────────────
  const createStock = useCallback(async (data) => {
    const res = await stockAPI.create(data);
    if (res.data.success) onRefresh();
    return res.data;
  }, [onRefresh]);

  const updateStock = useCallback(async (id, data) => {
    const res = await stockAPI.update(id, data);
    if (res.data.success) onRefresh();
    return res.data;
  }, [onRefresh]);

  const deleteStock = useCallback(async (id) => {
    const res = await stockAPI.remove(id);
    if (res.data.success) onRefresh();
    return res.data;
  }, [onRefresh]);

  const getStockById = useCallback(async (id) => {
    const res = await stockAPI.getById(id);
    return res.data;
  }, []);

  const loadMoreStocks = useCallback(() => {
    if (pagination.page < pagination.pages && !loading) fetchStocks({}, false);
  }, [pagination, loading, fetchStocks]);

  const loadMoreReceived = useCallback(() => {
    if (receivedPagination.page < receivedPagination.pages && !loading) fetchReceivedInventory({}, false);
  }, [receivedPagination, loading, fetchReceivedInventory]);

  return (
    <StockContext.Provider
      value={{
        stocks, summary, pagination, searchQuery, setSearchQuery, selectedCategory, setSelectedCategory,
        fetchStocks, fetchSummary, loadMoreStocks, createStock, updateStock, deleteStock, getStockById,
        
        receivedInventory, receivedSummary, receivedPagination, receivedFilter, setReceivedFilter,
        fetchReceivedInventory, fetchReceivedSummary, loadMoreReceived,

        loading, refreshing, error, onRefresh,
      }}
    >
      {children}
    </StockContext.Provider>
  );
};

export const useStock = () => useContext(StockContext);
