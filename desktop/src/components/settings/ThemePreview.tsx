import type { Theme } from '../../context/ConfigContext';

// A miniature of the app drawn in the given theme's own palette
export function ThemePreview({ theme }: { theme: Theme }) {
  return (
    <div data-palette={theme} aria-hidden="true" className="flex h-[4.5rem] overflow-hidden rounded-md border border-line bg-canvas">
      <div className="flex w-6 flex-col items-center gap-1.5 border-r border-line bg-sidebar pt-2">
        <span className="h-2 w-2 rounded-full bg-crimson" />
        <span className="h-[3px] w-3 rounded-full bg-ink-faint" />
        <span className="h-[3px] w-3 rounded-full bg-line-strong" />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-2">
        <span className="h-1.5 w-12 rounded-full bg-ink" />
        <div className="flex gap-1.5">
          <span className="h-4 flex-1 rounded-sm border border-line bg-surface" />
          <span className="h-4 flex-1 rounded-sm border border-line bg-surface" />
          <span className="h-4 flex-1 rounded-sm border border-line bg-surface" />
        </div>
        <span className="flex-1 rounded-sm border border-line bg-surface" />
      </div>
    </div>
  );
}
