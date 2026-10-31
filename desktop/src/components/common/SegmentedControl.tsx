export interface SegmentOption<T extends string | number> {
  value: T;
  label: string;
  title?: string;
}

interface SegmentedControlProps<T extends string | number> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  disabled?: boolean;
}

export function SegmentedControl<T extends string | number>({ options, value, onChange, ariaLabel, disabled = false }: SegmentedControlProps<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} aria-disabled={disabled || undefined} className={`flex h-8 items-center gap-0.5 rounded-md border border-line bg-sunken p-0.5 ${disabled ? 'opacity-45' : ''}`}>
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <button
            key={option.value}
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            title={option.title}
            className={`h-full rounded px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed ${isSelected ? 'bg-raised text-ink shadow-[0_0_0_1px_var(--line-strong)]' : 'text-ink-soft enabled:hover:text-ink'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
