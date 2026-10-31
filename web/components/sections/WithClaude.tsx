import { Section } from "@/components/ui/Section";

type Speaker = "You" | "Claude";

interface Line {
  who: Speaker;
  text: string;
}

const MAIN: Line[] = [
  { who: "You", text: "My laptop is lagging. What's going on?" },
  {
    who: "Claude",
    text: "Chrome is using 2.1 GB and a background updater is at 38% CPU with no window. I'd suggest closing the updater. Want me to?",
  },
  { who: "You", text: "Yes." },
  { who: "Claude", text: "Done. It freed 310 MB. If you need it back, I can restore it." },
];

const REFUSED: Line[] = [
  { who: "You", text: "Close explorer.exe" },
  { who: "Claude", text: "That's a protected Windows process. Kavan won't end it." },
];

function Chat({ lines, label }: { lines: Line[]; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-3">
      {lines.map((line, index) => {
        const mine = line.who === "You";
        return (
          <div key={index} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
            <span className="caps mb-1 px-1">{line.who}</span>
            <p
              className={`max-w-[34rem] rounded-lg px-4 py-3 text-[0.9375rem] leading-relaxed ${
                mine
                  ? "rounded-br-sm bg-crimson-wash text-ink"
                  : "rounded-bl-sm border border-line bg-raised text-ink"
              }`}
            >
              {line.text}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function WithClaude() {
  return (
    <Section
      id="claude"
      eyebrow="With Claude"
      title={
        <>
          Or just <em>ask.</em>
        </>
      }
      lead="If you use Claude Desktop, Claude can look at your system and propose what to close. It proposes, you confirm, and Kavan blocks anything in Tier 1."
    >
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="panel reveal p-5 md:p-7">
          <p className="caps mb-5">An example conversation</p>
          <Chat lines={MAIN} label="An example conversation with Claude" />
        </div>
        <div className="panel reveal self-start p-5 md:p-7">
          <p className="caps mb-5">And when it should say no</p>
          <Chat lines={REFUSED} label="An example of Claude being refused" />
        </div>
      </div>
      <p className="mt-6 text-sm text-ink-faint">
        These conversations are illustrations, not recordings. The desktop app works fully without Claude.
      </p>
    </Section>
  );
}
