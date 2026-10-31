import { Bell, ChartLine, LayoutDashboard, LockKeyhole, MessagesSquare, Undo2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Section } from "@/components/ui/Section";

const ICON = { size: 20, strokeWidth: 1.9 } as const;

const FEATURES = [
  {
    icon: <LayoutDashboard {...ICON} />,
    title: "Live dashboard",
    body: "CPU, memory and disk gauges that turn crimson over your limits, and a table of every running process with its security tier.",
  },
  {
    icon: <Bell {...ICON} />,
    title: "Alert history",
    body: "Every alert saved with when it started, how high it went, and what was using the most. Filter by date, type and severity.",
  },
  {
    icon: <ChartLine {...ICON} />,
    title: "Performance trends",
    body: "Charts from one hour to seven days. Drag to zoom into a spike. Gaps are shown as gaps, never joined across.",
  },
  {
    icon: <Undo2 {...ICON} />,
    title: "Undo for kills",
    body: "End the wrong program by mistake and restore it in one click, from the toast or from Recently Killed.",
  },
  {
    icon: <LockKeyhole {...ICON} />,
    title: "Protected apps",
    body: "Mark programs Kavan must never end, even if you or Claude ask, and programs it should record quietly without alerting.",
  },
  {
    icon: <MessagesSquare {...ICON} />,
    title: "Works with Claude",
    body: "Ask Claude to find what's slow and clean it up. Seven tools, and every kill still needs your confirmation.",
  },
];

export function Features() {
  return (
    <Section id="features" eyebrow="What you get" title="Everything you need to find the cause." band>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <Card key={feature.title} icon={feature.icon} title={feature.title}>
            {feature.body}
          </Card>
        ))}
      </div>
    </Section>
  );
}
