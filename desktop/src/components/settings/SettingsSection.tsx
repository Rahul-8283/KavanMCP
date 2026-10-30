import type { ReactNode } from 'react';

export function SettingsSection({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel overflow-hidden">
      <div className="flex min-h-[4.25rem] items-center justify-between gap-4 border-b border-line px-5 py-3">
        <div className="min-w-0">
          <h2 className="font-display text-[0.9375rem] font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-ink-soft">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
