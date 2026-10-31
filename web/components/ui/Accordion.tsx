import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

interface AccordionProps {
  question: ReactNode;
  children: ReactNode;
  /** Open when the page loads */
  open?: boolean;
}

/** A native <details>, so it works without JavaScript and is accessible by default. */
export function Accordion({ question, children, open = false }: AccordionProps) {
  return (
    <details open={open} className="group border-b border-line first:border-t">
      <summary className="flex items-center justify-between gap-4 py-5 text-left text-lg font-medium">
        <span>{question}</span>
        <ChevronDown aria-hidden="true" size={20} className="chev shrink-0 text-ink-faint" />
      </summary>
      <div className="pb-6 pr-8 text-ink-soft">{children}</div>
    </details>
  );
}
