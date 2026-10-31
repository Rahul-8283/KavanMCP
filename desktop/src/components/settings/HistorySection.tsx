import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { useConfig, type RetentionDays } from '../../context/ConfigContext';
import { useToast } from '../../context/ToastContext';
import { SegmentedControl, type SegmentOption } from '../common/SegmentedControl';
import { ConfigGate } from './ConfigGate';
import { SettingsSection } from './SettingsSection';

const RETENTION_OPTIONS: SegmentOption<RetentionDays>[] = [
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
];
const DEFAULT_RETENTION: RetentionDays = 30;

/** Asks before a shorter retention deletes alerts. In the style of the terminate dialog. */
function ShortenConfirm({ days, isBusy, onConfirm, onCancel }: {
  days: RetentionDays;
  isBusy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isBusy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isBusy, onCancel]);

  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isBusy) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="retention-title"
        aria-describedby="retention-body"
        className="animate-pop-in w-full max-w-md overflow-hidden rounded-xl border border-line-strong bg-raised shadow-pop"
      >
        <div className="px-6 pt-5">
          <p className="caps">Alert history</p>
          <h3 id="retention-title" className="mt-1.5 font-display text-lg font-semibold text-ink">
            Keep alerts for {days} days?
          </h3>
          <p id="retention-body" className="mt-3 rounded-r-md border-l-2 border-crimson bg-crimson-wash px-3 py-2 text-[0.8125rem] font-medium text-crimson-ink">
            Alerts older than {days} days will be deleted. This cannot be undone.
          </p>
        </div>
        <div className="flex justify-end gap-2.5 px-6 pb-5 pt-5">
          <button autoFocus onClick={onCancel} disabled={isBusy} className="btn h-9 px-4">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={isBusy} className="btn btn-primary h-9 px-4">
            {isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
            Delete older alerts
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function HistorySection() {
  const { config, updateSetting } = useConfig();
  const { addToast } = useToast();
  const current = config?.alert_retention_days ?? DEFAULT_RETENTION;
  const [pending, setPending] = useState<RetentionDays | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const save = async (days: RetentionDays) => {
    setIsSaving(true);
    const ok = await updateSetting('alert_retention_days', days);
    setIsSaving(false);
    if (!ok) addToast('Could not save how long alerts are kept. It was reverted.', 'warning');
    return ok;
  };

  const choose = (days: RetentionDays) => {
    if (days === current) return;
    // A longer window loses nothing, so it saves at once. A shorter one deletes alerts, so it asks.
    if (days > current) void save(days);
    else setPending(days);
  };

  const confirm = async () => {
    if (pending === null) return;
    await save(pending);
    setPending(null);
  };

  return (
    <SettingsSection title="History" description="How long Kavan remembers.">
      <ConfigGate>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4">
          <div>
            <p className="text-[0.8125rem] font-medium text-ink">Keep alert history for</p>
            <p className="mt-0.5 text-xs text-ink-soft">Performance graphs always cover the last 7 days.</p>
          </div>
          <SegmentedControl
            options={RETENTION_OPTIONS}
            value={current}
            onChange={choose}
            ariaLabel="Keep alert history for"
            disabled={isSaving}
          />
        </div>
      </ConfigGate>

      {pending !== null && (
        <ShortenConfirm days={pending} isBusy={isSaving} onConfirm={confirm} onCancel={() => setPending(null)} />
      )}
    </SettingsSection>
  );
}
