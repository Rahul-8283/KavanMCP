import { Section } from "@/components/ui/Section";

const NEEDS = [
  { need: "Windows 10 or 11", note: "64-bit.", optional: false },
  {
    need: "Python 3.11 or newer",
    note: "Runs Kavan's background service. The installer does not include Python, so this is a one-time setup. The steps are in the download section.",
    optional: false,
  },
  {
    need: "Claude Desktop",
    note: "Only for the Claude features. The desktop app works without it.",
    optional: true,
  },
  {
    need: "Administrator rights",
    note: "Needed only to end system-level programs. Kavan tells you when it is needed.",
    optional: true,
  },
];

export function Requirements() {
  return (
    <Section
      id="requirements"
      eyebrow="Requirements"
      title="What you need."
      lead="Kavan is not a one-click install yet. The background service runs from a Python environment that you set up once."
    >
      <dl className="panel reveal divide-y divide-line">
        {NEEDS.map(({ need, note, optional }) => (
          <div key={need} className="grid gap-1 p-5 md:grid-cols-[16rem_1fr] md:gap-6 md:p-6">
            <dt className="flex flex-wrap items-center gap-2 font-semibold">
              {need}
              {optional ? (
                <span className="rounded border border-line px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-ink-faint">
                  Optional
                </span>
              ) : null}
            </dt>
            <dd className="text-ink-soft">{note}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
