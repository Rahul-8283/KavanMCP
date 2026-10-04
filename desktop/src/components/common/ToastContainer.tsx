import { useToast } from '../../context/ToastContext';
import { Toast } from './Toast';

export function ToastContainer() {
  const { toasts } = useToast();

  return (
    <div className="pointer-events-none fixed right-5 top-5 z-50 flex flex-col gap-2.5">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
