interface SwitchProps {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, disabled = false }: SwitchProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      className={`relative h-[1.375rem] w-10 shrink-0 rounded-full border transition-colors disabled:opacity-45 ${checked ? 'border-transparent bg-crimson' : 'border-line-strong bg-sunken'}`}
    >
      <span
        className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-[left,background-color] duration-200 ${checked ? 'left-[1.25rem] bg-white' : 'left-0.5 bg-ink-faint'}`}
      />
    </button>
  );
}
