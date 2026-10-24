import { useEffect, useRef } from 'react';
import { X, Info, AlertTriangle, XOctagon, CheckCircle2, type LucideIcon } from 'lucide-react';
import { useToast, Toast as ToastType, ToastLevel } from '../../context/ToastContext';

interface ToastProps {
  toast: ToastType;
}

// `tone` sets currentColor, which both the edge rule and the icon are drawn in
const LEVEL_STYLE: Record<ToastLevel, { tone: string; icon: LucideIcon }> = {
  info: { tone: 'text-ink-soft', icon: Info },
  success: { tone: 'text-ok', icon: CheckCircle2 },
  warning: { tone: 'text-warn', icon: AlertTriangle },
  critical: { tone: 'text-crimson-ink', icon: XOctagon },
};

const LIFETIME_MS = 5000;
// A toast with a button needs time to be read and then reached for
const ACTION_LIFETIME_MS = 10000;

export function Toast({ toast }: ToastProps) {
  const { removeToast } = useToast();
  const { action } = toast;
  const hasAction = action !== undefined;
  const actionRun = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      removeToast(toast.id);
    }, hasAction ? ACTION_LIFETIME_MS : LIFETIME_MS);

    return () => clearTimeout(timer);
  }, [toast.id, hasAction, removeToast]);

  const runAction = () => {
    if (!action || actionRun.current) return;
    actionRun.current = true;
    removeToast(toast.id);
    // The toast is gone by now, so a failure has nowhere to be shown from here
    void Promise.resolve()
      .then(() => action.onAction())
      .catch((err) => console.error('Toast action failed:', err));
  };

  const { tone, icon: Icon } = LEVEL_STYLE[toast.level] || LEVEL_STYLE.info;

  return (
    <div
      role={toast.level === 'critical' ? 'alert' : 'status'}
      className="animate-toast-in pointer-events-auto relative flex w-[22rem] max-w-[calc(100vw-2.5rem)] items-start gap-3 overflow-hidden rounded-lg border border-line-strong bg-raised py-3 pl-5 pr-3 shadow-pop"
    >
      <span className={`absolute inset-y-0 left-0 w-[3px] bg-current ${tone}`} />
      <Icon className={`mt-px h-[1.125rem] w-[1.125rem] shrink-0 ${tone}`} strokeWidth={1.75} />
      <p className="min-w-0 flex-1 break-words text-[0.8125rem] leading-5 text-ink">
        {toast.message}
      </p>
      {action && (
        <button
          onClick={runAction}
          className="-my-0.5 shrink-0 rounded px-1.5 py-0.5 text-[0.8125rem] font-semibold leading-5 text-crimson-ink transition-colors hover:bg-hover"
        >
          {action.label}
        </button>
      )}
      <button
        onClick={() => removeToast(toast.id)}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-faint transition-colors hover:bg-hover hover:text-ink"
        aria-label="Dismiss toast"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
