import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

export function useWindowLifecycle() {
  useEffect(() => {
    const appWindow = getCurrentWindow();
    let unlisten: () => void;

    async function setupCloseInterceptor() {
      // 4.1 Hide, Don't Kill: Intercept the native 'close-requested' event
      unlisten = await appWindow.onCloseRequested(async (event) => {
        // Stop the app from actually killing the process
        event.preventDefault();
        
        // Hide the window instead, letting the Tray icon take over in the background
        await appWindow.hide();
      });
    }

    setupCloseInterceptor();

    return () => {
      // Clean up the event listener if the hook ever unmounts
      if (unlisten) unlisten();
    };
  }, []);
}
