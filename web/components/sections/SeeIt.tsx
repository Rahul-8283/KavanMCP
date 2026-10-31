import { Section } from "@/components/ui/Section";
import { shots } from "@/content/shots";
import { SeeItTabs } from "./SeeItTabs";

export function SeeIt() {
  return (
    <Section
      id="screens"
      eyebrow="See it"
      title="This is the real app."
      lead="Captured from Kavan 2.1.5, in the theme you are using."
      band
    >
      <SeeItTabs shots={shots} />
    </Section>
  );
}
