import { useEffect, useRef, useState } from 'react';
import { TrayIcon } from '@tauri-apps/api/tray';
import { Menu, MenuItem, PredefinedMenuItem } from '@tauri-apps/api/menu';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { resolveResource } from '@tauri-apps/api/path';
import { useMetrics } from '../context/MetricsContext';
import { useConfig } from '../context/ConfigContext';
import { ConnectionStatus } from './useWebSocketConnection';

const TRAY_ID = 'main';
const ICON_GREEN = 'icons/tray-green.ico';
const ICON_YELLOW = 'icons/tray-yellow.ico';
const ICON_RED = 'icons/tray-red.ico';
const CRITICAL_PERCENT = 95;

// The tray belongs to the app, not to a component: React StrictMode mounts effects
// twice in dev, so creation is shared here and the tray is never torn down on unmount.
let trayPromise: Promise<TrayIcon | null> | null = null;

async function showMainWindow() {
  const appWindow = getCurrentWindow();
  if (await appWindow.isMinimized()) await appWindow.unminimize();
  await appWindow.show();
  await appWindow.setFocus();
}

async function createTray(): Promise<TrayIcon> {
  // A tray from a previous page load still exists on the Rust side, but its menu
  // callbacks point at the old JS context and would silently do nothing. Replace it.
  const stale = await TrayIcon.getById(TRAY_ID);
  if (stale) await stale.close();

  const openItem = await MenuItem.new({
    text: 'Open KavanMCP',
    action: () => {
      showMainWindow().catch((e) => console.error('Failed to open the window:', e));
    },
  });

  const separator = await PredefinedMenuItem.new({ item: 'Separator' });

  const quitItem = await MenuItem.new({
    text: 'Quit',
    action: () => {
      // Closing the window only hides it, so quitting goes through Rust
      invoke('quit_app').catch((e) => console.error('Failed to quit:', e));
    },
  });

  const menu = await Menu.new({ items: [openItem, separator, quitItem] });

  return TrayIcon.new({
    id: TRAY_ID,
    tooltip: 'KavanMCP',
    icon: await resolveResource(ICON_GREEN),
    menu,
    // Left click restores the window; the menu belongs to right click (Phase 7 §4.2)
    showMenuOnLeftClick: false,
    action: (event) => {
      // 'Click' fires for both buttons and for press and release: restore once, on left release
      if (event.type === 'Click' && event.button === 'Left' && event.buttonState === 'Up') {
        showMainWindow().catch((e) => console.error('Failed to restore the window:', e));
      }
    },
  });
}

export function useTrayIntegration() {
  const { metrics, status } = useMetrics();
  const { config } = useConfig();
  const [tray, setTray] = useState<TrayIcon | null>(null);
  const currentIconRef = useRef<string>('');

  // 1. Initialize Tray and Context Menu
  useEffect(() => {
    let cancelled = false;

    if (!trayPromise) {
      trayPromise = createTray().catch((e) => {
        console.error('Failed to initialize tray:', e);
        trayPromise = null; // Allow a later mount to retry
        return null;
      });
    }

    trayPromise.then((t) => {
      if (!cancelled) setTray(t);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // 2. Dynamic Updates (Section 3.1 & 3.2)
  // Thresholds are optional here: without a config the tray still reports live metrics.
  useEffect(() => {
    if (!tray) return;

    const { cpu, ram } = metrics;
    const isOnline = status === ConnectionStatus.CONNECTED;
    const cpuWarning = config?.cpu_threshold ?? 90;
    const ramWarning = config?.ram_threshold ?? 90;

    // Section 3.1: Dynamic Icon Swapping
    let nextIcon = ICON_GREEN;
    if (isOnline) {
      if (cpu >= CRITICAL_PERCENT || ram >= CRITICAL_PERCENT) {
        nextIcon = ICON_RED;
      } else if (cpu >= cpuWarning || ram >= ramWarning) {
        nextIcon = ICON_YELLOW;
      }
    }

    // Section 3.2: Dynamic Tooltips
    const tooltip = isOnline
      ? `KavanMCP\nCPU: ${Math.round(cpu)}% | RAM: ${Math.round(ram)}%`
      : 'KavanMCP\nBackend offline';

    let cancelled = false;
    (async () => {
      try {
        if (currentIconRef.current !== nextIcon) {
          const iconPath = await resolveResource(nextIcon);
          if (cancelled) return;
          await tray.setIcon(iconPath);
          currentIconRef.current = nextIcon;
        }
        await tray.setTooltip(tooltip);
      } catch (e) {
        console.error('Failed to update tray:', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tray, metrics, config, status]);
}
