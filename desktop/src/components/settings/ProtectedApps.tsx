import { useMemo, useRef, useState, useEffect } from 'react';
import { Loader2, Plus, Search, X } from 'lucide-react';
import { useConfig, type BackendSetting } from '../../context/ConfigContext';
import { useProcess } from '../../context/ProcessContext';
import { useToast } from '../../context/ToastContext';
import { useProcessManager } from '../../hooks/useProcessManager';
import { isListed, nameProblem, normalizeProcessName } from '../../utils/protection';
import { SettingsSection } from './SettingsSection';

const MAX_ENTRIES = 200;

interface ListProps {
  settingKey: 'never_kill' | 'never_alert';
  title: string;
  description: string;
  /** Tier 1 processes are protected whatever the list says, so they are offered as already protected */
  showSystemProcesses: boolean;
  list: string[];
}

function Chip({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-sunken pl-2.5 pr-1 font-mono text-xs text-ink">
      {name}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${name}`}
        className="flex h-5 w-5 items-center justify-center rounded text-ink-faint transition-colors hover:bg-hover hover:text-ink"
      >
        <X size={12} />
      </button>
    </span>
  );
}

function AddPicker({ settingKey, showSystemProcesses, list, onAdd, onClose }: {
  settingKey: ListProps['settingKey'];
  showSystemProcesses: boolean;
  list: string[];
  onAdd: (name: string) => void;
  onClose: () => void;
}) {
  const { processes, isLoading } = useProcess();
  const { fetchProcesses } = useProcessManager();
  const [query, setQuery] = useState('');
  const [typed, setTyped] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (processes.length === 0) void fetchProcesses();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onPointer = (e: PointerEvent) => { if (!panelRef.current?.contains(e.target as Node)) onClose(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [onClose]);

  const options = useMemo(() => {
    const byName = new Map<string, { name: string; systemProcess: boolean }>();
    for (const proc of processes) {
      const name = normalizeProcessName(proc.name);
      const systemProcess = proc.tier === 1;
      if (!byName.has(name)) byName.set(name, { name, systemProcess });
    }
    const search = normalizeProcessName(query);
    return [...byName.values()]
      .filter((option) => option.systemProcess ? showSystemProcesses : true)
      .filter((option) => !search || option.name.includes(search))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 200);
  }, [processes, query, showSystemProcesses]);

  const problem = typed.trim() ? nameProblem(typed) : null;
  const full = list.length >= MAX_ENTRIES;

  return (
    <div ref={panelRef} className="absolute right-5 top-full z-20 mt-2 w-80 overflow-hidden rounded-lg border border-line-strong bg-raised shadow-pop">
      <div className="border-b border-line p-2">
        <div className="flex h-8 items-center gap-2 rounded-md border border-line bg-sunken px-2">
          <Search size={13} className="shrink-0 text-ink-faint" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search running programs"
            aria-label="Search running programs"
            className="min-w-0 flex-1 bg-transparent text-[0.8125rem] text-ink outline-none placeholder:text-ink-faint"
          />
        </div>
      </div>

      <ul className="max-h-60 overflow-y-auto py-1" role="listbox" aria-label="Running programs">
        {isLoading && processes.length === 0 && (
          <li className="flex items-center gap-2 px-3 py-2 text-xs text-ink-soft">
            <Loader2 size={13} className="animate-spin" /> Reading running programs...
          </li>
        )}
        {options.map((option) => {
          const already = isListed(option.name, list);
          const locked = option.systemProcess || already || full;
          return (
            <li key={option.name}>
              <button
                type="button"
                disabled={locked}
                onClick={() => onAdd(option.name)}
                className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-[0.8125rem] text-ink transition-colors hover:bg-hover disabled:cursor-default disabled:text-ink-faint disabled:hover:bg-transparent"
              >
                <span className="truncate font-mono text-xs">{option.name}</span>
                {option.systemProcess && <span className="shrink-0 text-[0.6875rem] uppercase tracking-[0.07em]">Always protected</span>}
                {!option.systemProcess && already && <span className="shrink-0 text-[0.6875rem] uppercase tracking-[0.07em]">Added</span>}
              </button>
            </li>
          );
        })}
        {!isLoading && options.length === 0 && (
          <li className="px-3 py-2 text-xs text-ink-soft">No running program matches. Type its name below.</li>
        )}
      </ul>

      <form
        className="border-t border-line p-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (problem || !typed.trim() || full || isListed(typed, list)) return;
          onAdd(normalizeProcessName(typed));
          setTyped('');
        }}
      >
        <div className="flex gap-2">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Or type a program name"
            aria-label="Type a program name"
            aria-invalid={problem !== null}
            className="field min-w-0 flex-1 font-mono text-xs"
          />
          <button type="submit" disabled={problem !== null || !typed.trim() || full} className="btn h-8 px-2.5">
            Add
          </button>
        </div>
        {problem && <p className="mt-1.5 text-xs text-crimson-ink">{problem}</p>}
        {!problem && full && <p className="mt-1.5 text-xs text-ink-soft">This list is full ({MAX_ENTRIES} names).</p>}
        {settingKey === 'never_kill' && !problem && !full && (
          <p className="mt-1.5 text-xs text-ink-faint">Kavan will refuse to end this program, whether you or Claude ask.</p>
        )}
      </form>
    </div>
  );
}

function ProtectedList({ settingKey, title, description, showSystemProcesses, list }: ListProps) {
  const { updateSetting } = useConfig();
  const { addToast } = useToast();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async (next: string[]) => {
    setBusy(true);
    const ok = await updateSetting(settingKey as BackendSetting, next);
    setBusy(false);
    if (!ok) addToast('Could not save the protected list. The previous list was restored.', 'warning');
    return ok;
  };

  const add = async (name: string) => {
    if (list.length >= MAX_ENTRIES || isListed(name, list)) return;
    setPicking(false);
    await save([...list, normalizeProcessName(name)]);
  };

  const remove = (name: string) => save(list.filter((item) => item !== name));

  return (
    <div className="relative px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[0.8125rem] font-medium text-ink">{title}</p>
          <p className="mt-0.5 text-xs text-ink-soft">{description}</p>
        </div>
        <button
          type="button"
          onClick={() => setPicking((open) => !open)}
          disabled={busy}
          aria-expanded={picking}
          className="btn shrink-0"
        >
          <Plus size={14} />
          Add app
        </button>
      </div>

      <div className="mt-3 flex min-h-8 flex-wrap gap-2" aria-busy={busy}>
        {list.length === 0 && <p className="text-xs text-ink-faint">No apps on this list.</p>}
        {list.map((name) => (
          <Chip key={name} name={name} onRemove={() => remove(name)} />
        ))}
      </div>

      {picking && (
        <AddPicker
          settingKey={settingKey}
          showSystemProcesses={showSystemProcesses}
          list={list}
          onAdd={add}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

export function ProtectedApps() {
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
            showSystemProcesses
            list={neverKill}
          />
          <ProtectedList
            settingKey="never_alert"
            title="Never alert on"
            description="No toast or sound for these. Their alerts are still kept in the history, marked as muted."
            showSystemProcesses={false}
            list={neverAlert}
          />
        </div>
      )}
    </SettingsSection>
  );
}
