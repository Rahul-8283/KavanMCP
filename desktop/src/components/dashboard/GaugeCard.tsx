import { ReactNode, memo } from 'react';

interface GaugeCardProps {
  title: string;
  value: number; // 0 to 100
  threshold: number; // The user's alert threshold, drawn as the red zone of the dial
  icon?: ReactNode;
  isOffline?: boolean;
}

const RING_RADIUS = 43;

export const GaugeCard = memo(function GaugeCard({ title, value, threshold, icon, isOffline = false }: GaugeCardProps) {
  const clampedValue = Math.min(Math.max(value || 0, 0), 100);
  const redZoneStart = Math.min(Math.max(threshold, 0), 100);
  // Same comparison the backend uses to raise an alert
  const isOver = !isOffline && clampedValue > redZoneStart;
  const arcLength = isOffline ? 0 : clampedValue;

  let caption = `Alerts above ${redZoneStart}%`;
  if (isOffline) caption = 'No signal';
  else if (isOver) caption = `Over the ${redZoneStart}% limit`;

  return (
    <section className={`panel @container flex items-center justify-between gap-4 px-5 py-4 transition-opacity duration-500 ${isOffline ? 'opacity-60' : ''}`}>
      <div className="min-w-0">
        <h2 className="caps">{title}</h2>
        <p className="mt-2 flex items-baseline gap-1 font-display">
          <span className={`tnum text-[2.375rem] font-light leading-none tracking-[-0.02em] transition-colors duration-300 ${isOver ? 'text-crimson-ink' : 'text-ink'}`}>
            {isOffline ? '--' : clampedValue.toFixed(1)}
          </span>
          <span className="text-sm text-ink-faint">%</span>
        </p>
        <p className={`mt-2 truncate text-xs ${isOver ? 'font-medium text-crimson-ink' : 'text-ink-soft'}`}>{caption}</p>
      </div>

      {/* The dial quotes the logo: a value ring, a faint inner ring, a glyph at the centre.
          A card too narrow to hold it beside the reading shows the reading alone. */}
      <div className="relative hidden h-[4.75rem] w-[4.75rem] shrink-0 @[15.5rem]:block">
        <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden="true">
          <g fill="none" transform="rotate(-90 50 50)">
            <circle cx="50" cy="50" r={RING_RADIUS} stroke="var(--line-strong)" strokeWidth="1.5" />
            {!isOffline && (
              <circle
                cx="50" cy="50" r={RING_RADIUS} pathLength={100}
                stroke="var(--crimson)" strokeWidth="1.5"
                strokeDasharray={`${100 - redZoneStart} 100`}
                strokeDashoffset={-redZoneStart}
              />
            )}
            <circle
              cx="50" cy="50" r={RING_RADIUS} pathLength={100}
              stroke={isOver ? 'var(--crimson)' : 'var(--ink)'} strokeWidth="5"
              strokeDasharray={`${arcLength} 100`}
              style={{ transition: 'stroke-dasharray 0.7s cubic-bezier(0.2, 0.7, 0.2, 1), stroke 0.3s ease' }}
            />
          </g>
          <circle cx="50" cy="50" r="32" fill="none" stroke="var(--line)" strokeWidth="1" />
        </svg>
        {icon && (
          <div className={`absolute inset-0 flex items-center justify-center transition-colors duration-300 ${isOver ? 'text-crimson-ink' : 'text-ink-faint'}`}>
            {icon}
          </div>
        )}
      </div>
    </section>
  );
});
