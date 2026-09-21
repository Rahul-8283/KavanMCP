import { useEffect, useRef } from 'react';
import { useMetrics } from '../context/MetricsContext';

export enum ConnectionStatus {
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED'
}

export function useWebSocketConnection() {
  const { updateMetrics, setStatus } = useMetrics();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const backoffRef = useRef(1000); // Start with 1 second backoff

  useEffect(() => {
    let isMounted = true;

    function connect() {
      if (!isMounted) return;
      
      setStatus(ConnectionStatus.CONNECTING);
      const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws';
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMounted) return;
        console.log('[WebSocket] Connected to metrics server');
        setStatus(ConnectionStatus.CONNECTED);
        backoffRef.current = 1000; // Reset backoff on successful connection
      };

      ws.onmessage = (event) => {
        if (!isMounted) return;
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'metrics_update' && payload.data) {
            updateMetrics({
              cpu: payload.data.cpu_percent,
              ram: payload.data.ram_percent,
              disk: payload.data.disk_percent,
              lastUpdated: payload.data.timestamp
            });
          }
        } catch (error) {
          console.error('[WebSocket] Error parsing message:', error);
        }
      };

      ws.onclose = () => {
        if (!isMounted) return;
        console.log(`[WebSocket] Disconnected. Reconnecting in ${backoffRef.current}ms...`);
        setStatus(ConnectionStatus.DISCONNECTED);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          // Exponential backoff up to 10 seconds max
          backoffRef.current = Math.min(backoffRef.current * 2, 10000);
          connect();
        }, backoffRef.current);
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
      };
    }

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [updateMetrics, setStatus]);
}
