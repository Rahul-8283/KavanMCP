import type { ReactNode } from "react";

interface CardProps {
  icon?: ReactNode;
  title: string;
  children: ReactNode;
}

/** An icon, a title and two lines. Used for the feature grid. */
export function Card({ icon, title, children }: CardProps) {
  return (
    <article className="panel reveal flex flex-col gap-3 p-6">
      {icon ? (
        <span
          aria-hidden="true"
          className="flex h-10 w-10 items-center justify-center rounded-md bg-crimson-wash text-crimson-ink"
        >
          {icon}
        </span>
      ) : null}
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-[0.9375rem] leading-relaxed text-ink-soft">{children}</p>
    </article>
  );
}
