import { useConfig, type Theme } from '../../context/ConfigContext';
import { SettingsSection } from './SettingsSection';
import { ThemePreview } from './ThemePreview';

const THEME_OPTIONS: { theme: Theme; label: string }[] = [
  { theme: 'dark', label: 'Dark' },
  { theme: 'light', label: 'Light' },
];

/** Client-side only: the theme is kept by the app itself, so this works with the backend offline. */
export function AppearanceSection() {
  const { theme, setTheme } = useConfig();

  return (
    <SettingsSection title="Appearance" description="Choose between the dark and light interface.">
      <div role="radiogroup" aria-label="Theme" className="grid max-w-md grid-cols-2 gap-4 p-5">
        {THEME_OPTIONS.map(({ theme: option, label }) => {
          const isSelected = theme === option;
          return (
            <button
              key={option}
              role="radio"
              aria-checked={isSelected}
              onClick={() => setTheme(option)}
              className={`rounded-lg border p-2 text-left transition-colors ${isSelected ? 'border-crimson bg-crimson-wash' : 'border-line hover:border-line-strong'}`}
            >
              <ThemePreview theme={option} />
              <span className="mt-2 flex items-center gap-2 px-0.5 text-[0.8125rem] font-medium text-ink">
                <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border ${isSelected ? 'border-crimson' : 'border-line-strong'}`}>
                  {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-crimson" />}
                </span>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </SettingsSection>
  );
}
