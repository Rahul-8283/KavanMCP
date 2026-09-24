import { useEffect } from 'react';
import { X, Info, AlertTriangle, XOctagon } from 'lucide-react';
import { useToast, Toast as ToastType } from '../../context/ToastContext';

interface ToastProps {
  toast: ToastType;
}

export function Toast({ toast }: ToastProps) {
  const { removeToast } = useToast();

  useEffect(() => {
    const timer = setTimeout(() => {
      removeToast(toast.id);
    }, 5000);
    
    return () => clearTimeout(timer);
  }, [toast.id, removeToast]);

  const colorMap = {
    info: {
      border: 'border-blue-500',
      icon: <Info className="w-5 h-5 text-blue-500" />
    },
    warning: {
      border: 'border-amber-500',
      icon: <AlertTriangle className="w-5 h-5 text-amber-500" />
    },
    critical: {
      border: 'border-red-500',
      icon: <XOctagon className="w-5 h-5 text-red-500" />
    }
  };

  const style = colorMap[toast.level] || colorMap.info;

  return (
    <div className={`pointer-events-auto flex items-start gap-3 p-4 bg-bg-secondary rounded-lg shadow-lg border-l-4 ${style.border} animate-slide-in-right max-w-sm`}>
      <div className="shrink-0">
        {style.icon}
      </div>
      <div className="flex-1 text-sm text-text-primary pt-0.5 break-words">
        {toast.message}
      </div>
      <button 
        onClick={() => removeToast(toast.id)}
        className="shrink-0 text-text-secondary hover:text-text-primary transition-colors cursor-pointer ml-2"
        aria-label="Dismiss toast"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
