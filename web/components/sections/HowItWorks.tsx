import { Eye, Hand, Lightbulb } from "lucide-react";
import { Section } from "@/components/ui/Section";

const STEPS = [
  {
    icon: Eye,
    title: "It watches.",
    body: "Kavan reads CPU, memory and disk every two seconds and records the history, even with the window closed.",
  },
  {
    icon: Lightbulb,
    title: "It explains.",
    body: "When something spikes, it records which program was using the most, and shows it on a graph.",
  },
  {
    icon: Hand,
    title: "You decide.",
    body: "You confirm each kill in the app, or ask Claude. Kavan will not end anything on its own.",
  },
];

export function HowItWorks() {
  return (
    <Section id="how" eyebrow="How it works" title={
        <>
          Three steps, and you stay in <em>charge.</em>
        </>
      }>
      <ol className="grid gap-5 md:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, body }, index) => (
          <li key={title} className="panel reveal relative p-6 pt-8">
            <span
              aria-hidden="true"
              className="tnum absolute -top-3.5 left-6 flex h-7 min-w-7 items-center justify-center rounded-md bg-crimson px-2 text-sm font-semibold text-white"
            >
              {index + 1}
            </span>
            <Icon aria-hidden="true" size={26} strokeWidth={1.75} className="mb-4 text-crimson-ink" />
            <h3 className="text-xl font-semibold">{title}</h3>
            <p className="mt-2 text-ink-soft">{body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
