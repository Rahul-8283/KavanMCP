import { useEffect } from 'react';
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

export function Toast({ toast }: ToastProps) {
  const { removeToast } = useToast();

  useEffect(() => {
    const timer = setTimeout(() => {
      removeToast(toast.id);
    }, 5000);

    return () => clearTimeout(timer);
  }, [toast.id, removeToast]);

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
