import React, { createContext, useContext, useState, useCallback } from 'react';

const TransactionContext = createContext(null);

export const TransactionProvider = ({ children }) => {
  const [currentTransaction, setCurrentTransaction] = useState(null);

  const startTransaction = useCallback((customer, type) => {
    setCurrentTransaction({
      customer,
      type, // 'B2B', 'B2C', 'B2D'
      timestamp: new Date().toISOString(),
    });
  }, []);

  const clearTransaction = useCallback(() => {
    setCurrentTransaction(null);
  }, []);

  return (
    <TransactionContext.Provider
      value={{
        currentTransaction,
        startTransaction,
        clearTransaction,
      }}
    >
      {children}
    </TransactionContext.Provider>
  );
};

export const useTransaction = () => {
  const context = useContext(TransactionContext);
  if (!context) {
    throw new Error('useTransaction must be used within a TransactionProvider');
  }
  return context;
};
