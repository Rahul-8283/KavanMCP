import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ProcessContextMenuProps {
  x: number;
  y: number;
  onTerminate: () => void;
  onClose: () => void;
}

// Approximate size used to keep the menu inside the window
const MENU_WIDTH = 192;
const MENU_HEIGHT = 44;

export function ProcessContextMenu({ x, y, onTerminate, onClose }: ProcessContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

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

  const left = Math.max(8, Math.min(x, window.innerWidth - MENU_WIDTH - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - MENU_HEIGHT - 8));

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{ left, top }}
      className="fixed z-50 w-48 py-1 bg-bg-secondary border border-border rounded-md shadow-lg"
    >
      <button
        role="menuitem"
        onClick={onTerminate}
        className="w-full text-left px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-hover-bg transition-colors cursor-pointer"
      >
        Terminate Process
      </button>
    </div>,
    document.body
  );
}
