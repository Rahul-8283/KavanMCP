import type { ReactNode } from 'react';

export function EmptyState({ icon, message, children }: { icon?: ReactNode; message: string; children?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-12 text-center">
      {icon && <div className="text-ink-faint">{icon}</div>}
      <p className="max-w-sm text-[0.8125rem] text-ink-soft">{message}</p>
      {children}
    </div>
  );
}
