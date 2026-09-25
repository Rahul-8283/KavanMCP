import { useEffect, useRef } from 'react';
import { TrayIcon } from '@tauri-apps/api/tray';
import { Menu, MenuItem, PredefinedMenuItem } from '@tauri-apps/api/menu';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { resolveResource } from '@tauri-apps/api/path';
import { useMetrics } from '../context/MetricsContext';
import { useConfig } from '../context/ConfigContext';

export function useTrayIntegration() {
  const { metrics } = useMetrics();
  const { config } = useConfig();
  const trayRef = useRef<TrayIcon | null>(null);
  const currentIconRef = useRef<string>('');

  // 1. Initialize Tray and Context Menu
  useEffect(() => {
    async function initTray() {
      try {
        // Build the native Right-Click Menu
        const openItem = await MenuItem.new({ 
          text: 'Open KavanMCP', 
          action: async () => {
            const appWindow = getCurrentWindow();
            await appWindow.show();
            await appWindow.setFocus();
          }
        });
        
        const separator = await PredefinedMenuItem.new({ item: 'Separator' });
        
        const quitItem = await MenuItem.new({ 
          text: 'Quit', 
          action: async () => {
            const appWindow = getCurrentWindow();
            // We MUST use destroy() instead of close().
            // close() gets intercepted by our "Hide, Don't Kill" hook and just hides the app!
            await appWindow.destroy(); 
          }
        });
        
        const menu = await Menu.new({ items: [openItem, separator, quitItem] });

        // Check if tray already exists (helps with React StrictMode / HMR)
        let tray = await TrayIcon.getById('main');
        
        if (!tray) {
          const defaultIconPath = await resolveResource('icons/tray-green.ico');
          tray = await TrayIcon.new({
            id: 'main',
            tooltip: 'KavanMCP',
            icon: defaultIconPath, 
            menu: menu,
            action: async (event) => {
               // Only unhide if it's a left click. Ignore hover (Enter/Move) events!
               if (event.type === 'Click') {
                 const appWindow = getCurrentWindow();
                 await appWindow.show();
                 await appWindow.setFocus();
               }
            }
          });
        }
        
        trayRef.current = tray;
        currentIconRef.current = 'icons/tray-green.ico';
      } catch (e) {
        console.error("Failed to initialize tray:", e);
      }
    }
    
    initTray();
    
    return () => {
      // Cleanup on unmount
      if (trayRef.current) {
        trayRef.current.close().catch(console.error);
        trayRef.current = null;
      }
    }
  }, []);

  // 2. Dynamic Updates (Section 3.1 & 3.2)
  useEffect(() => {
    if (!trayRef.current || !metrics || !config) return;

    const { cpu, ram } = metrics;
    
    // Section 3.1: Dynamic Icon Swapping
    let newIcon = 'icons/tray-green.ico';
    
    // Calculate thresholds
    const cpuWarning = config.cpu_threshold || 90;
    const ramWarning = config.ram_threshold || 90;
    
    if (cpu >= 95 || ram >= 95) {
      newIcon = 'icons/tray-red.ico'; // Critical
    } else if (cpu >= cpuWarning || ram >= ramWarning) {
      newIcon = 'icons/tray-yellow.ico'; // Warning
    }

    async function updateTray() {
       if (trayRef.current) {
         // Only dispatch IPC command if the icon actually changed
         if (currentIconRef.current !== newIcon) {
           const absoluteIconPath = await resolveResource(newIcon);
           await trayRef.current.setIcon(absoluteIconPath).catch(console.error);
           currentIconRef.current = newIcon;
         }
         
         // Section 3.2: Dynamic Tooltips
         await trayRef.current.setTooltip(`CPU: ${cpu}% | RAM: ${ram}%`).catch(console.error);
       }
    }
    
    updateTray();
  }, [metrics, config]);
}
