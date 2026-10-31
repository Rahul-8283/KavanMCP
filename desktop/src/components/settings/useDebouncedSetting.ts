import { useEffect, useState } from 'react';
import { useConfig, type BackendSetting } from '../../context/ConfigContext';
import { useToast } from '../../context/ToastContext';

const SAVE_DEBOUNCE_MS = 500; // one request after the user stops moving the slider

/**
 * A local slider value for smooth dragging, persisted to the backend once it settles.
 * `fallback` is shown until the saved value has loaded.
 */
export function useDebouncedSetting(key: BackendSetting, label: string, saved: number | undefined, fallback: number) {
  const { updateSetting } = useConfig();
  const { addToast } = useToast();
  const [value, setValue] = useState<number>(saved ?? fallback);

  // Server-side changes (initial load, rollback after a failed save, reset) take over the slider
  useEffect(() => {
    if (saved !== undefined) setValue(saved);
  }, [saved]);

  useEffect(() => {
    if (saved === undefined || value === saved) return;
    const timer = setTimeout(async () => {
      const ok = await updateSetting(key, value);
      if (!ok) addToast(`Could not save ${label}. The previous value was restored.`, 'warning');
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, saved, key, label, updateSetting, addToast]);

  return [value, setValue] as const;
}
