'use strict';

import { useState, useEffect, useCallback, useRef } from 'react';
import { checkConnection, subscribeToStatus, isUsbPrinterAvailable } from '../services/UsbPrinterService.js';

/**
 * React hook for USB printer connection state.
 *
 * Returns:
 *   status   – "connected" | "disconnected" | "permission_denied" | "requesting_permission" | "unavailable"
 *   refresh  – call this to re-probe the connection (e.g. when screen focuses)
 */
export function useUsbPrinter() {
  const [status, setStatus] = useState(isUsbPrinterAvailable() ? 'disconnected' : 'unavailable');
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!isUsbPrinterAvailable()) return;
    const s = await checkConnection();
    if (mountedRef.current) setStatus(s);
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    // Initial probe
    refresh();

    // Listen for real-time changes (cable plug/unplug, permission result)
    const sub = subscribeToStatus((s) => {
      console.log('[useUsbPrinter] status event:', s);
      if (mountedRef.current) setStatus(s);
    });

    return () => {
      mountedRef.current = false;
      sub.remove();
    };
  }, [refresh]);

  return { status, refresh };
}
