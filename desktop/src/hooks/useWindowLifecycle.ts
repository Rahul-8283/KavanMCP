import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

export function useWindowLifecycle() {
  useEffect(() => {
    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    async function setupCloseInterceptor() {
      // 4.1 Hide, Don't Kill: Intercept the native 'close-requested' event
      const stop = await appWindow.onCloseRequested(async (event) => {
        // Stop the app from actually killing the process
        event.preventDefault();
        
        // Hide the window instead, letting the Tray icon take over in the background
        await appWindow.hide();
      });

      // Registration is async: if the hook unmounted meanwhile (StrictMode does this on
      // every mount), remove the listener now instead of leaking a second one.
      if (cancelled) {
        stop();
      } else {
        unlisten = stop;
      }
    }

    setupCloseInterceptor();

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);
}
