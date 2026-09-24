import { useState, useEffect } from "react";
import { MainLayout } from "./components/layout/MainLayout";
import { useWebSocketConnection } from "./hooks/useWebSocketConnection";
import { ToastContainer } from "./components/common/ToastContainer";
import { Dashboard } from "./pages/Dashboard";
import { Settings } from "./pages/Settings";

function App() {
  useWebSocketConnection(); // Start the WebSocket pipeline globally
  const [activeView, setActiveView] = useState<'dashboard' | 'settings'>('dashboard');



  useEffect(() => {
    // Clear any lingering CSS zoom property from previous HMR states
    (document.body.style as any).zoom = '';
    
    let currentSize = 16; // Default browser font-size in px

    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Ctrl (Windows/Linux) or Cmd (Mac)
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          currentSize = Math.min(currentSize + 1, 24);
          document.documentElement.style.fontSize = `${currentSize}px`;
        } else if (e.key === '-') {
          e.preventDefault();
          currentSize = Math.max(currentSize - 1, 10);
          document.documentElement.style.fontSize = `${currentSize}px`;
        } else if (e.key === '0') {
          e.preventDefault();
          currentSize = 16;
          document.documentElement.style.fontSize = `${currentSize}px`;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  return (
    <>
      <MainLayout activeView={activeView} setActiveView={setActiveView}>
        {activeView === 'dashboard' ? <Dashboard /> : <Settings />}
      </MainLayout>
      <ToastContainer />
    </>
  );
}

export default App;
