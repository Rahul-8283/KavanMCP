import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, BellOff, OctagonX, Shield, ShieldOff } from 'lucide-react';
import type { Process } from '../../context/ProcessContext';

interface ProcessContextMenuProps {
  x: number;
  y: number;
  process: Process;
  isProtected: boolean;
  isMuted: boolean;
  onTerminate: () => void;
  onToggleProtected: () => void;
  onToggleMuted: () => void;
  onClose: () => void;
}

const ITEM_CLASS = 'flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[0.8125rem] font-medium transition-colors';

const WINDOW_MARGIN = 8;

export function ProcessContextMenu({ x, y, process, isProtected, isMuted, onTerminate, onToggleProtected, onToggleMuted, onClose }: ProcessContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  // Measured rather than assumed: the menu's size follows the user's zoom level
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    setPosition({
      left: Math.max(WINDOW_MARGIN, Math.min(x, window.innerWidth - width - WINDOW_MARGIN)),
      top: Math.max(WINDOW_MARGIN, Math.min(y, window.innerHeight - height - WINDOW_MARGIN)),
    });
  }, [x, y]);

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    // Capture phase so scrolling the virtualized table also dismisses the menu
    window.addEventListener('scroll', onClose, true);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{ left: position?.left ?? x, top: position?.top ?? y, visibility: position ? 'visible' : 'hidden' }}
      className="animate-fade-in fixed z-50 w-56 overflow-hidden rounded-lg border border-line-strong bg-raised shadow-pop"
    >
      <div className="border-b border-line px-3 py-2.5">
        <p className="truncate text-[0.8125rem] font-medium text-ink" title={process.name}>{process.name}</p>
        <p className="tnum mt-0.5 font-mono text-[0.6875rem] text-ink-faint">PID {process.pid}</p>
      </div>
      <div className="p-1">
        <button
          role="menuitem"
          onClick={onTerminate}
          className={`${ITEM_CLASS} text-crimson-ink hover:bg-crimson-wash`}
        >
          <OctagonX size={15} strokeWidth={1.75} />
          Terminate Process
        </button>
      </div>
      <div className="border-t border-line p-1">
        {process.tier === 1 ? (
          <p className="flex h-8 items-center gap-2.5 px-2 text-[0.8125rem] text-ink-faint">
            <Shield size={15} strokeWidth={1.75} />
            Always protected
          </p>
        ) : (
          <button role="menuitem" onClick={onToggleProtected} className={`${ITEM_CLASS} text-ink hover:bg-hover`}>
            {isProtected ? <ShieldOff size={15} strokeWidth={1.75} /> : <Shield size={15} strokeWidth={1.75} />}
            {isProtected ? 'Remove protection' : 'Protect from termination'}
          </button>
        )}
        <button role="menuitem" onClick={onToggleMuted} className={`${ITEM_CLASS} text-ink hover:bg-hover`}>
          {isMuted ? <Bell size={15} strokeWidth={1.75} /> : <BellOff size={15} strokeWidth={1.75} />}
          {isMuted ? 'Alert on this app again' : 'Stop alerting on this app'}
        </button>
      </div>
    </div>,
    document.body
  );
}
