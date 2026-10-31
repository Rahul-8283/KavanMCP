import { Accordion } from "@/components/ui/Accordion";
import { Section } from "@/components/ui/Section";

const QUESTIONS = [
  {
    q: "Is it safe to let an AI close programs?",
    a: "Every process is sorted into one of four tiers first. Tier 1, the parts of Windows that keep it running, can never be ended, by you or by Claude. Everything else needs a confirmation, and a confirmation works once and expires after five minutes.",
  },
  {
    q: "Can Claude close something without asking me?",
    a: "No. Every kill needs your confirmation, and a program on your protected list is refused.",
  },
  {
    q: "Does it send my data anywhere?",
    a: "No. Nothing leaves your PC. There is no cloud, no account, no API key and no telemetry.",
  },
  {
    q: "I ended the wrong program. Can I get it back?",
    a: "Yes, with Undo on the toast or Restore on the Recently Killed page. It restarts the program. It cannot bring back unsaved work.",
  },
  {
    q: "Do I need Claude?",
    a: "No. The desktop app is complete on its own. Claude is an extra for people who already use Claude Desktop.",
  },
  {
    q: "Does it need Administrator rights?",
    a: "Only to end system-level programs. Kavan tells you when it is needed.",
  },
  {
    q: "Does it slow my PC down?",
    a: "The background scan costs about 2% of one core, once a minute.",
  },
  {
    q: "Which versions of Windows?",
    a: "Windows 10 and 11, 64-bit. There is no Mac or Linux version.",
  },
];

export function Faq() {
  return (
    <Section id="faq" eyebrow="FAQ" title="The catches, plainly.">
      <div className="reveal mx-auto max-w-3xl">
        {QUESTIONS.map(({ q, a }) => (
          <Accordion key={q} question={q}>
            {a}
          </Accordion>
        ))}
      </div>
    </Section>
  );
}
