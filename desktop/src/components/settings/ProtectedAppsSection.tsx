import { useCallback, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useConfig, type BackendSetting } from '../../context/ConfigContext';
import { useToast } from '../../context/ToastContext';
import { isListed, normalizeProcessName } from '../../utils/protection';
import { AppPicker } from './AppPicker';
import { SettingsSection } from './SettingsSection';

const MAX_ENTRIES = 200;

interface ListProps {
  settingKey: 'never_kill' | 'never_alert';
  title: string;
  description: string;
  /** What the list is for, used in the picker's label */
  noun: string;
  /** Tier 1 processes are protected whatever the list says, so they are offered as already protected */
  showSystemProcesses: boolean;
  list: string[];
}

function Chip({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <span className="inline-flex h-7 max-w-full items-center gap-1 rounded-md border border-line bg-sunken pl-2.5 pr-1 font-mono text-xs text-ink">
      <span className="truncate" title={name}>{name}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${name}`}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-faint transition-colors hover:bg-hover hover:text-crimson-ink"
      >
        <X size={12} />
      </button>
    </span>
  );
}

function ProtectedList({ settingKey, title, description, noun, showSystemProcesses, list }: ListProps) {
  const { updateSetting } = useConfig();
  const { addToast } = useToast();
  const [picking, setPicking] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);

  const save = useCallback(async (next: string[]) => {
    const ok = await updateSetting(settingKey as BackendSetting, next);
    if (!ok) addToast('Could not save the protected list. The previous list was restored.', 'warning');
    return ok;
  }, [updateSetting, settingKey, addToast]);

  const add = (name: string) => {
    if (list.length >= MAX_ENTRIES || isListed(name, list)) return;
    void save([...list, normalizeProcessName(name)]);
  };

  const remove = (name: string) => save(list.filter((item) => item !== name));
  const closePicker = useCallback(() => setPicking(false), []);

  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[0.8125rem] font-medium text-ink">
            {title}
            <span className="tnum rounded-full border border-line px-1.5 text-[0.6875rem] font-normal leading-4 text-ink-faint">
              {list.length}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-ink-soft">{description}</p>
        </div>
        <button
          ref={addButton}
          type="button"
          onClick={() => setPicking((open) => !open)}
          aria-expanded={picking}
          aria-haspopup="dialog"
          className="btn shrink-0"
        >
          <Plus size={14} />
          Add app
        </button>
      </div>

      <div className="mt-3 flex min-h-7 flex-wrap gap-2">
        {list.length === 0 && <p className="self-center text-xs text-ink-faint">No apps on this list yet.</p>}
        {list.map((name) => (
          <Chip key={name} name={name} onRemove={() => remove(name)} />
        ))}
      </div>

      {picking && (
        <AppPicker
          anchorRef={addButton}
          list={list}
          maxEntries={MAX_ENTRIES}
          showSystemProcesses={showSystemProcesses}
          noun={noun}
          onAdd={add}
          onClose={closePicker}
        />
      )}
    </div>
  );
}

export function ProtectedAppsSection() {
  const { config } = useConfig();
  const neverKill = config?.never_kill ?? [];
  const neverAlert = config?.never_alert ?? [];

  return (
    <SettingsSection title="Protected apps" description="Apps Kavan should leave alone.">
      {!config ? (
        <p className="px-5 py-6 text-[0.8125rem] text-ink-soft">Loading protected apps...</p>
      ) : (
        <div className="divide-y divide-line-faint">
          <ProtectedList
            settingKey="never_kill"
            title="Never terminate"
            description="Kavan will not end these, whether you or Claude ask. Windows system processes are always protected."
            noun="never terminate"
            showSystemProcesses
            list={neverKill}
          />
          <ProtectedList
            settingKey="never_alert"
            title="Never alert on"
            description="No toast or sound for these. Their alerts are still kept in the history, marked as muted."
            noun="never alert on"
            showSystemProcesses={false}
            list={neverAlert}
          />
        </div>
      )}
    </SettingsSection>
  );
}
