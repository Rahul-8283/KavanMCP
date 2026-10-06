import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';
import type { View } from '../components/layout/views';

/** What a page is asked to show when another page sends the user to it. */
export type NavigationTarget =
  /** Alerts: expand this alert. Its start time lets the page widen its date range to include it. */
  | { kind: 'alert'; alertId: string; startedAt: string }
  /** Trends: focus on this window, in epoch milliseconds. */
  | { kind: 'window'; from: number; to: number };

interface NavigationContextType {
  view: View;
  target: NavigationTarget | null;
  /** Opens a page. Without a target the page opens as it normally would. */
  navigate: (view: View, target?: NavigationTarget) => void;
  /** Called by a page once it has acted on the target, so it is not applied twice. */
  clearTarget: () => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>('dashboard');
  const [target, setTarget] = useState<NavigationTarget | null>(null);

  const navigate = useCallback((next: View, nextTarget?: NavigationTarget) => {
    setView(next);
    setTarget(nextTarget ?? null);
  }, []);

  const clearTarget = useCallback(() => setTarget(null), []);

  const value = useMemo(() => ({ view, target, navigate, clearTarget }), [view, target, navigate, clearTarget]);

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (context === undefined) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
}
