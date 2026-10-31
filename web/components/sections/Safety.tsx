import { FileText, ShieldCheck, WifiOff } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { TierBadge, type Tier } from "@/components/ui/TierBadge";

const TIERS: { tier: Tier; name: string; body: string }[] = [
  {
    tier: 1,
    name: "System",
    body: "Windows' own processes. They can never be ended, by you or by Claude, and the block sits in front of the operating-system call itself.",
  },
  {
    tier: 2,
    name: "Essential",
    body: "Apps you work in, like your editor and browser. A clear warning, then your confirmation.",
  },
  {
    tier: 3,
    name: "Optional",
    body: "Background programs. Safe to end if you need the resources.",
  },
  {
    tier: 4,
    name: "Unverified",
    body: "An unknown program using lots of CPU with no window. Flagged as suspicious.",
  },
];

const GUARANTEES = [
  {
    icon: ShieldCheck,
    title: "Two steps to kill.",
    body: "A kill is staged, then confirmed. The confirmation expires after five minutes and works for one program once.",
  },
  {
    icon: FileText,
    title: "Everything is logged.",
    body: "Every kill, block and restore is written to a local audit log.",
  },
  {
    icon: WifiOff,
    title: "Nothing leaves your PC.",
    body: "No cloud, no account, no API key, no telemetry. The app talks only to itself on your machine, and refuses requests from web pages.",
  },
];

export function Safety() {
  return (
    <Section
      id="safety"
      eyebrow="Safety"
      title={
        <>
          Built so it <em>can&apos;t</em> break Windows.
        </>
      }
      lead="Every process is sorted into one of four tiers before anything can be done to it. The tier decides what is allowed."
    >
      <ul className="panel reveal divide-y divide-line">
        {TIERS.map(({ tier, name, body }) => (
          <li key={tier} className="grid gap-3 p-5 sm:grid-cols-[11rem_1fr] sm:items-center sm:gap-6 md:p-6">
            <div>
              <TierBadge tier={tier} />
            </div>
            <p className="text-ink-soft">
              <strong className="font-semibold text-ink">{name}.</strong> {body}
            </p>
          </li>
        ))}
      </ul>

      <ul className="mt-8 grid gap-5 md:grid-cols-3">
        {GUARANTEES.map(({ icon: Icon, title, body }) => (
          <li key={title} className="reveal flex gap-4">
            <Icon aria-hidden="true" size={22} strokeWidth={1.75} className="mt-1 shrink-0 text-ok" />
            <p className="text-[0.9375rem] text-ink-soft">
              <strong className="font-semibold text-ink">{title}</strong> {body}
            </p>
          </li>
        ))}
      </ul>

      <p className="mt-10 text-sm text-ink-faint">
        Checked by 641 backend tests and 81 desktop tests at version 2.1.5.
      </p>
    </Section>
  );
}
