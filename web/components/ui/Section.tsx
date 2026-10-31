import type { ReactNode } from "react";

interface SectionProps {
  /** The anchor the nav links to */
  id: string;
  /** Small label above the heading */
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
  children: ReactNode;
  /** A line under the section, for sections that sit on a raised band */
  band?: boolean;
}

/** Every section has one job and one heading. */
export function Section({ id, eyebrow, title, lead, children, band = false }: SectionProps) {
  const headingId = `${id}-heading`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={`section-pad${band ? " border-y border-line bg-surface/60" : ""}`}
    >
      <div className="wrap">
        <header className="reveal mb-10 max-w-2xl md:mb-14">
          {eyebrow ? <p className="caps mb-3 text-crimson-ink">{eyebrow}</p> : null}
          <h2 id={headingId} className="text-4xl md:text-5xl">
            {title}
          </h2>
          {lead ? <p className="mt-4 text-lg text-ink-soft">{lead}</p> : null}
        </header>
        {children}
      </div>
    </section>
  );
}
