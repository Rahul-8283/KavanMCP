import { createContext, useContext, useState, ReactNode, useCallback } from 'react';

export type ToastLevel = 'info' | 'success' | 'warning' | 'critical';

/** A button on a toast, such as Undo. Running it also closes the toast. */
export interface ToastAction {
  label: string;
  onAction: () => void | Promise<void>;
}

export interface Toast {
  id: string;
  message: string;
  level: ToastLevel;
  action?: ToastAction;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (message: string, level: ToastLevel, action?: ToastAction) => void;
  removeToast: (id: string) => void;
}

const MAX_TOASTS = 3;

/**
 * At most three toasts stay. The oldest one goes, except that a toast with an action is kept in
 * preference to one without: it may be the user's only chance to undo, and threshold alerts
 * arrive every few seconds. The toast just added is never the one dropped.
 */
function withinLimit(toasts: Toast[]): Toast[] {
  const kept = [...toasts];
  while (kept.length > MAX_TOASTS) {
    const older = kept.slice(0, -1);
    const index = older.findIndex((toast) => !toast.action);
    kept.splice(index === -1 ? 0 : index, 1);
  }
  return kept;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, level: ToastLevel, action?: ToastAction) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => withinLimit([...prev, { id, message, level, action }]));
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
