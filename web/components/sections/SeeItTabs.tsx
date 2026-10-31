"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Screenshot } from "@/components/ui/Screenshot";
import type { Shot } from "@/content/shots";

/** Simple tabs, no carousel library. Only the open tab's picture is in the page, so only it is downloaded. */
export function SeeItTabs({ shots }: { shots: Shot[] }) {
  const [selected, setSelected] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function move(to: number) {
    const next = (to + shots.length) % shots.length;
    setSelected(next);
    tabRefs.current[next]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowRight") move(index + 1);
    else if (event.key === "ArrowLeft") move(index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(shots.length - 1);
    else return;
    event.preventDefault();
  }

  const current = shots[selected];

  return (
    <div>
      <div role="tablist" aria-label="Screens of the app" className="mb-8 flex flex-wrap justify-center gap-2">
        {shots.map((shot, index) => {
          const active = index === selected;
          return (
            <button
              key={shot.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              role="tab"
              type="button"
              id={`tab-${shot.id}`}
              aria-selected={active}
              aria-controls="screens-panel"
              tabIndex={active ? 0 : -1}
              onClick={() => setSelected(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`rounded-md border px-4 py-2 text-[0.9375rem] font-medium transition-colors ${
                active
                  ? "border-transparent bg-crimson text-white"
                  : "border-line-strong text-ink-soft hover:bg-hover hover:text-ink"
              }`}
            >
              {shot.tab}
            </button>
          );
        })}
      </div>

      <div id="screens-panel" role="tabpanel" aria-labelledby={`tab-${current.id}`} tabIndex={0}>
        <Screenshot key={current.id} shot={current} className="mx-auto max-w-5xl" />
      </div>
    </div>
  );
}
