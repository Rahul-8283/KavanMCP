import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { MainLayout } from "./components/layout/MainLayout";
import type { View } from "./components/layout/views";
import { useWebSocketConnection } from "./hooks/useWebSocketConnection";
import { useTrayIntegration } from "./hooks/useTrayIntegration";
import { useWindowLifecycle } from "./hooks/useWindowLifecycle";
import { EmptyState } from "./components/common/EmptyState";
import { ToastContainer } from "./components/common/ToastContainer";
import { useNavigation } from "./context/NavigationContext";
import { Loader2 } from "lucide-react";
import { Alerts } from "./pages/Alerts";
import { Dashboard } from "./pages/Dashboard";
import { Settings } from "./pages/Settings";

// The charting library is large and only this page uses it, so it is fetched when the page
// is first opened. The Dashboard's start-up cost stays what it was.
const Trends = lazy(() => import("./pages/Trends").then((module) => ({ default: module.Trends })));

// One page per view. A new page is added here and to View.
const PAGES: Record<View, ComponentType> = {
  dashboard: Dashboard,
  alerts: Alerts,
  trends: Trends,
  settings: Settings,
};

function App() {
  useWebSocketConnection(); // Start the WebSocket pipeline globally
  useTrayIntegration(); // Start the System Tray & IPC integrations
  useWindowLifecycle(); // Intercept window close to hide instead of kill

  const { view, navigate } = useNavigation();
  const Page = PAGES[view];

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
      <MainLayout activeView={view} setActiveView={navigate}>
        <Suspense fallback={<div className="flex h-full"><EmptyState icon={<Loader2 className="h-6 w-6 animate-spin" />} message="Loading..." /></div>}>
          <Page />
        </Suspense>
      </MainLayout>
      <ToastContainer />
    </>
  );
}

export default App;
