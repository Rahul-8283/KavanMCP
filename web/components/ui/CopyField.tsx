"use client";

import { Check, Copy } from "lucide-react";
import { useRef, useState } from "react";

interface CopyFieldProps {
  /** What is copied, and what is shown */
  value: string;
  /** Names the field for screen readers */
  label: string;
  /** Wrap long values over several lines, for a config snippet */
  block?: boolean;
}

/** A value with a copy button: the checksum and the Claude Desktop config. */
export function CopyField({ value, label, block = false }: CopyFieldProps) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const codeRef = useRef<HTMLElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function selectText() {
    const node = codeRef.current;
    const selection = window.getSelection();
    if (!node || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  async function copy() {
    let next: "copied" | "failed" = "copied";
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // No clipboard access (an insecure page, or a blocked permission): select the text so Ctrl+C works
      selectText();
      next = "failed";
    }
    setState(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2400);
  }

  return (
    <div className="flex items-start gap-2 rounded-md border border-line bg-sunken p-2 pl-3.5">
      <code
        ref={codeRef}
        aria-label={label}
        className={`tnum min-w-0 flex-1 py-1.5 text-[0.8125rem] leading-relaxed text-ink ${
          block ? "whitespace-pre-wrap break-words" : "break-all"
        }`}
      >
        {value}
      </code>
      <button
        type="button"
        onClick={copy}
        className="btn btn-sm shrink-0"
        aria-label={`Copy ${label}`}
      >
        {state === "copied" ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}
        {state === "copied" ? "Copied" : state === "failed" ? "Press Ctrl+C" : "Copy"}
      </button>
      <span role="status" className="sr-only">
        {state === "copied" ? `${label} copied` : state === "failed" ? `Select the text and press Control C` : ""}
      </span>
    </div>
  );
}
