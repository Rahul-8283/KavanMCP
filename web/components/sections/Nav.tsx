import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#safety", label: "Safety" },
  { href: "#faq", label: "FAQ" },
];

/** Sticky top bar. It firms up, and gains a bottom line, as the page scrolls (CSS only). */
export function Nav() {
  return (
    <header className="sticky top-0 z-50">
      <div aria-hidden="true" className="nav-bar absolute inset-0 bg-canvas/85 backdrop-blur-md" />
      <div aria-hidden="true" className="nav-line absolute inset-x-0 bottom-0 h-px bg-line" />
      <div className="wrap relative flex h-16 items-center justify-between gap-4">
        <a href="#top" className="flex items-center gap-2.5 font-display text-[1.7rem] leading-none">
          <Image src="/kavan-mark.svg" alt="" width={32} height={32} priority />
          <span>Kavan</span>
        </a>

        <nav aria-label="Sections" className="hidden items-center gap-1 min-[720px]:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-[0.9375rem] font-medium text-ink-soft transition-colors hover:text-ink"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button href="#download" variant="primary" small>
            Download
          </Button>
        </div>
      </div>
    </header>
  );
}
