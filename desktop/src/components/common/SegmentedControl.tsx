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
}

export function SegmentedControl<T extends string | number>({ options, value, onChange, ariaLabel }: SegmentedControlProps<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex h-8 items-center gap-0.5 rounded-md border border-line bg-sunken p-0.5">
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <button
            key={option.value}
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(option.value)}
            title={option.title}
            className={`h-full rounded px-2.5 text-xs font-medium transition-colors ${isSelected ? 'bg-raised text-ink shadow-[0_0_0_1px_var(--line-strong)]' : 'text-ink-soft hover:text-ink'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
