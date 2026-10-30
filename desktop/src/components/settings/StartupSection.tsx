import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';
import { open } from '@tauri-apps/plugin-dialog';
import { Loader2 } from 'lucide-react';
import { Switch } from '../common/Switch';
import { useToast } from '../../context/ToastContext';
import { SettingsSection } from './SettingsSection';

// Only the desktop shell can answer these. In a browser they fail, and the section says so.
const DESKTOP_ONLY = 'Available in the desktop app.';

function errorText(err: unknown): string {
  return typeof err === 'string' ? err : err instanceof Error ? err.message : 'Something went wrong.';
}

export function StartupSection() {
  const { addToast } = useToast();
  const [location, setLocation] = useState<string | null | undefined>(undefined);
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    invoke<string | null>('get_backend_location')
      .then((folder) => { if (!cancelled) setLocation(folder); })
      .catch(() => { if (!cancelled) setLocation(null); });
    // The sign-in list is read every time, so the switch shows the truth even if the backend is offline
    isEnabled()
      .then((on) => { if (!cancelled) setAutostart(on); })
      .catch(() => { if (!cancelled) setAutostart(null); });
    return () => { cancelled = true; };
  }, []);

  const chooseLocation = async () => {
    setProblem(null);
    const picked = await open({ directory: true, multiple: false, title: 'Choose the mcp-server folder' }).catch(() => null);
    if (typeof picked !== 'string') return;
    setBusy(true);
    try {
      setLocation(await invoke<string>('set_backend_location', { folder: picked }));
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async () => {
    if (autostart === null) return;
    setBusy(true);
    try {
      if (autostart) await disable();
      else await enable();
      setAutostart(await isEnabled());
    } catch (err) {
      addToast(`Could not change the sign-in setting: ${errorText(err)}`, 'warning');
    } finally {
      setBusy(false);
    }
  };

  const hasLocation = typeof location === 'string';
  const switchDisabled = busy || autostart === null || !hasLocation;

  return (
    <SettingsSection title="Startup" description="How Kavan starts with your computer.">
      <div className="divide-y divide-line-faint">
        <div className="flex items-center justify-between gap-6 px-5 py-4">
          <div>
            <p className="text-[0.8125rem] font-medium text-ink">Start Kavan when you sign in to Windows</p>
            <p className="mt-0.5 text-xs text-ink-soft">
              {hasLocation
                ? 'Kavan starts in the tray, without opening a window.'
                : 'Set the backend location first. Kavan needs it to start on its own at sign-in.'}
            </p>
          </div>
          {busy && autostart === null ? (
            <Loader2 size={16} className="animate-spin text-ink-faint" />
          ) : (
            <Switch
              checked={autostart === true}
              onChange={toggle}
              disabled={switchDisabled}
              label="Start Kavan when you sign in to Windows"
            />
          )}
        </div>

        <div className="px-5 py-4">
          <div className="flex items-center justify-between gap-6">
            <div className="min-w-0">
              <p className="text-[0.8125rem] font-medium text-ink">Backend location</p>
              <p className="tnum mt-0.5 truncate font-mono text-xs text-ink-soft" title={hasLocation ? location : undefined}>
                {location === undefined ? 'Reading...' : hasLocation ? location : `Not set. ${DESKTOP_ONLY}`}
              </p>
            </div>
            <button type="button" onClick={chooseLocation} disabled={busy} className="btn shrink-0">
              {hasLocation ? 'Change' : 'Set location'}
            </button>
          </div>
          <p className="mt-2 text-xs text-ink-soft">
            Started at sign-in, Kavan runs without Administrator rights.
          </p>
          {problem && <p role="alert" className="mt-2 text-xs text-crimson-ink">{problem}</p>}
        </div>
      </div>
    </SettingsSection>
  );
}
