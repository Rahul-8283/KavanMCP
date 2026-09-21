import { useEffect, useRef } from 'react';
import { useMetrics } from '../context/MetricsContext';

export function useWebSocketConnection() {
  const { updateMetrics } = useMetrics();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const backoffRef = useRef(1000); // Start with 1 second backoff

  useEffect(() => {
    function connect() {
      const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws';
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WebSocket] Connected');
        backoffRef.current = 1000; // Reset backoff on successful connection
        // Dispatch event to notify UI components (e.g. Header)
        window.dispatchEvent(new CustomEvent('backend-online'));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Assuming backend sends { cpu, ram, disk }
          if (data && typeof data.cpu === 'number') {
            updateMetrics({
              cpu: data.cpu,
              ram: data.ram,
              disk: data.disk,
            });
          }
        } catch (error) {
          console.error('[WebSocket] Error parsing message:', error);
        }
      };

      ws.onclose = () => {
        console.log(`[WebSocket] Disconnected. Reconnecting in ${backoffRef.current}ms...`);
        // Dispatch event to notify UI components
        window.dispatchEvent(new CustomEvent('backend-offline'));
        
        reconnectTimeoutRef.current = setTimeout(() => {
          // Exponential backoff up to 30 seconds max
          backoffRef.current = Math.min(backoffRef.current * 2, 30000);
          connect();
        }, backoffRef.current);
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        ws.close(); // Force onclose to trigger reconnection
      };
    }

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [updateMetrics]);
}
