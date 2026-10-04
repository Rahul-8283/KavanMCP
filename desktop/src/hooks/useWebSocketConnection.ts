import { useEffect, useRef } from 'react';
import { useMetrics } from '../context/MetricsContext';
import { useToast } from '../context/ToastContext';
import { useConfig } from '../context/ConfigContext';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';

export enum ConnectionStatus {
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED'
}

async function triggerNativeAlert(title: string, body: string) {
  try {
    let permissionGranted = await isPermissionGranted();
    if (!permissionGranted) {
      const permission = await requestPermission();
      permissionGranted = permission === 'granted';
    }
    if (permissionGranted) {
      sendNotification({ title, body });
    }
  } catch (err) {
    console.error("Failed to send native notification", err);
  }
}

function playBeep() {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const audioCtx = new AudioContext();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 frequency
    
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime); // 10% volume
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.5);
  } catch (e) {
    console.error('Failed to play beep', e);
  }
}

export function useWebSocketConnection() {
  const { updateMetrics, setStatus } = useMetrics();
  const { addToast } = useToast();
  const { config } = useConfig();
  // The socket effect is created once, so it reads the sound setting through a ref
  const soundEnabledRef = useRef(true);
  soundEnabledRef.current = config?.sound_alerts !== false;
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

        // Start client-side ping to keep connection alive and prevent 60s drop
        const pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
        (ws as any).pingInterval = pingInterval;
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
          } else if (payload.type === 'threshold_alert') {
            // Render React Toast
            addToast(payload.message, payload.level);
            
            // 5.1 Native OS Integration
            if (payload.level === 'critical') {
              triggerNativeAlert('Kavan Alert', payload.message);
            }
            
            // 5.2 Sound Alerts
            if (soundEnabledRef.current) {
              playBeep();
            }
          }
        } catch (error) {
          console.error('[WebSocket] Error parsing message:', error);
        }
      };

      ws.onclose = () => {
        if (!isMounted) return;
        if ((ws as any).pingInterval) clearInterval((ws as any).pingInterval);
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
        // Clear interval if it exists on unmount to prevent ghost pings
        if ((wsRef.current as any).pingInterval) {
          clearInterval((wsRef.current as any).pingInterval);
        }
        // Remove onclose listener so it doesn't trigger state updates/reconnects during unmount
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [updateMetrics, setStatus]);
}
