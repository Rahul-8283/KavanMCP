import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Check, CornerDownLeft, Loader2, Lock, Plus, Search, X } from 'lucide-react';
import { useProcess } from '../../context/ProcessContext';
import { useProcessManager } from '../../hooks/useProcessManager';
import { formatMemoryMb } from '../dashboard/format';
import { isListed, nameProblem, normalizeProcessName } from '../../utils/protection';

const PANEL_WIDTH_REM = 22;
const PREFERRED_HEIGHT = 400;
const VIEWPORT_MARGIN = 12;
const ANCHOR_GAP = 8;
const MAX_ROWS = 150;

interface Row {
  key: string;
  name: string;
  /** A name typed by the user, for a program that is not running */
  typed: boolean;
  count: number;
  memoryMb: number;
  /** Cannot be chosen, with the reason shown in its place */
  locked: 'listed' | 'system' | null;
  problem: string | null;
}

interface Placement {
  left: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

interface AppPickerProps {
  anchorRef: RefObject<HTMLElement | null>;
  list: readonly string[];
  maxEntries: number;
  /** Windows system processes are protected whatever the list says, so they are shown as such */
  showSystemProcesses: boolean;
  noun: string;
  onAdd: (name: string) => void;
  onClose: () => void;
}

export function AppPicker({ anchorRef, list, maxEntries, showSystemProcesses, noun, onAdd, onClose }: AppPickerProps) {
  const { processes, isLoading, error } = useProcess();
  const { fetchProcesses } = useProcessManager();
  const [query, setQuery] = useState('');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // The running programs are read when the picker opens, unless a scan is already in hand
  useEffect(() => {
    if (processes.length === 0) void fetchProcesses();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Placed against the Add button, below it or above it, whichever has the room. A portal keeps
  // the panel from being clipped by the settings card it was opened from.
  useLayoutEffect(() => {
    const place = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const panel = panelRef.current;
      if (!anchor || !panel) return;
      const width = panel.getBoundingClientRect().width;
      const below = window.innerHeight - anchor.bottom - ANCHOR_GAP - VIEWPORT_MARGIN;
      const above = anchor.top - ANCHOR_GAP - VIEWPORT_MARGIN;
      const left = Math.max(VIEWPORT_MARGIN, Math.min(anchor.right - width, window.innerWidth - width - VIEWPORT_MARGIN));
      if (below >= Math.min(PREFERRED_HEIGHT, 300) || below >= above) {
        setPlacement({ left, top: anchor.bottom + ANCHOR_GAP, maxHeight: Math.min(PREFERRED_HEIGHT, below) });
      } else {
        setPlacement({ left, bottom: window.innerHeight - anchor.top + ANCHOR_GAP, maxHeight: Math.min(PREFERRED_HEIGHT, above) });
      }
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [anchorRef]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !anchorRef.current?.contains(target)) onClose();
    };
    // The page behind scrolls away from the button the panel hangs from, so it is closed with it
    const onScroll = (e: Event) => {
      if (!panelRef.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose, anchorRef]);

  // The panel is hidden until it is placed, and a hidden input cannot take focus, so focus follows placement
  const placed = placement !== null;
  useEffect(() => {
    if (placed) inputRef.current?.focus();
  }, [placed]);

  const full = list.length >= maxEntries;

  const rows = useMemo<Row[]>(() => {
    const byName = new Map<string, Row>();
    for (const proc of processes) {
      const name = normalizeProcessName(proc.name);
      const existing = byName.get(name);
      if (existing) {
        existing.count += 1;
        existing.memoryMb += proc.memory_mb;
        continue;
      }
      const system = proc.tier === 1;
      byName.set(name, {
        key: `p:${name}`, name, typed: false, count: 1, memoryMb: proc.memory_mb,
        locked: system ? 'system' : isListed(name, list) ? 'listed' : null, problem: null,
      });
    }

    const search = normalizeProcessName(query);
    const matches = [...byName.values()]
      .filter((row) => (row.locked === 'system' ? showSystemProcesses : true))
      .filter((row) => !search || row.name.includes(search))
      // The busiest programs come first: they are the ones a user is looking to protect or quiet
      .sort((a, b) => Number(a.locked === 'system') - Number(b.locked === 'system') || b.memoryMb - a.memoryMb || a.name.localeCompare(b.name))
      .slice(0, MAX_ROWS);

    // A name that is not running can still be added. It is offered only when nothing running matches
    // what was typed, so a half-typed name never turns into an entry that matches no process.
    if (search && matches.length === 0 && !isListed(search, list)) {
      matches.push({
        key: `t:${search}`, name: search, typed: true, count: 0, memoryMb: 0, locked: null, problem: nameProblem(search),
      });
    }
    return matches;
  }, [processes, query, list, showSystemProcesses]);

  const selectable = rows.filter((row) => row.locked === null && row.problem === null && !full);
  const active = selectable.find((row) => row.key === activeKey) ?? selectable[0] ?? null;

  useEffect(() => {
    if (!active) return;
    listRef.current?.querySelector(`[data-key="${CSS.escape(active.key)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (row: Row) => {
    onAdd(row.name);
    setQuery('');
    setActiveKey(null);
    inputRef.current?.focus();
  };

  const move = (step: number) => {
    if (selectable.length === 0) return;
    const current = active ? selectable.indexOf(active) : -1;
    setActiveKey(selectable[(current + step + selectable.length) % selectable.length].key);
  };

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (active) choose(active);
    }
  };

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`Add an app to the ${noun} list`}
      style={{
        left: placement?.left ?? 0,
        top: placement?.top,
        bottom: placement?.bottom,
        maxHeight: placement?.maxHeight,
        width: `${PANEL_WIDTH_REM}rem`,
        visibility: placement ? 'visible' : 'hidden',
      }}
      className="animate-fade-in fixed z-50 flex max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-xl border border-line-strong bg-raised shadow-pop"
    >
      <div className="shrink-0 border-b border-line p-2.5">
        <div className="flex h-9 items-center gap-2 rounded-md border border-line bg-sunken px-2.5 focus-within:border-line-strong">
          <Search size={14} className="shrink-0 text-ink-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveKey(null); }}
            onKeyDown={onInputKeyDown}
            placeholder="Search, or type a program name"
            aria-label="Search running programs, or type a program name"
            aria-controls="app-picker-list"
            aria-activedescendant={active ? `app-picker-${active.key}` : undefined}
            className="min-w-0 flex-1 bg-transparent text-[0.8125rem] text-ink outline-none placeholder:text-ink-faint"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              aria-label="Clear search"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-faint transition-colors hover:bg-hover hover:text-ink"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <p className="mt-2 px-0.5 text-[0.6875rem] text-ink-faint">
          {query ? 'Matching programs' : 'Running now, busiest first'}
        </p>
      </div>

      <ul id="app-picker-list" ref={listRef} role="listbox" aria-label="Programs" className="min-h-0 flex-1 overflow-y-auto py-1">
        {isLoading && processes.length === 0 && (
          <li className="flex items-center gap-2 px-4 py-3 text-xs text-ink-soft">
            <Loader2 size={13} className="animate-spin" />
            Reading running programs...
          </li>
        )}
        {!isLoading && processes.length === 0 && (
          <li className="px-4 py-3 text-xs text-ink-soft">
            {error ? `The running programs could not be read (${error}). ` : 'No running programs were found. '}
            You can still type a name above.
          </li>
        )}
        {processes.length > 0 && rows.length === 0 && (
          <li className="px-4 py-3 text-xs text-ink-soft">No running program matches.</li>
        )}

        {rows.map((row) => {
          const isActive = active?.key === row.key;
          const disabled = row.locked !== null || row.problem !== null || full;
          return (
            <li
              key={row.key}
              id={`app-picker-${row.key}`}
              data-key={row.key}
              role="option"
              aria-selected={isActive}
              aria-disabled={disabled}
              onMouseMove={() => { if (!disabled && !isActive) setActiveKey(row.key); }}
              onClick={() => { if (!disabled) choose(row); }}
              className={`mx-1 flex min-h-9 items-center gap-3 rounded-md px-2.5 py-1.5 text-[0.8125rem] ${disabled ? 'cursor-default' : 'cursor-pointer'} ${isActive ? 'bg-active' : ''}`}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center text-ink-faint">
                {row.locked === 'system' ? <Lock size={13} /> : row.locked === 'listed' ? <Check size={14} className="text-ok" /> : <Plus size={14} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate font-mono text-xs ${disabled ? 'text-ink-faint' : 'text-ink'}`} title={row.name}>
                  {row.typed ? `Add "${row.name}"` : row.name}
                </span>
                {row.typed && !row.problem && (
                  <span className="block text-[0.6875rem] text-ink-faint">Not running now. Add it by name.</span>
                )}
                {row.problem && <span className="block text-[0.6875rem] text-crimson-ink">{row.problem}</span>}
              </span>
              <span className="tnum shrink-0 text-right text-[0.6875rem] text-ink-faint">
                {row.locked === 'system' && 'Always protected'}
                {row.locked === 'listed' && 'Added'}
                {row.locked === null && !row.typed && (
                  <>
                    {row.count > 1 && <span className="mr-2">×{row.count} </span>}
                    {formatMemoryMb(row.memoryMb)} MB
                  </>
                )}
                {isActive && row.locked === null && <CornerDownLeft size={12} className="ml-2 inline text-ink-faint" aria-hidden="true" />}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-3.5 py-2 text-[0.6875rem] text-ink-faint">
        <span>{full ? `This list is full (${maxEntries} names).` : '↑ ↓ to move · Enter to add · Esc to close'}</span>
        <span className="tnum">{list.length} / {maxEntries}</span>
      </div>
    </div>,
    document.body,
  );
}
