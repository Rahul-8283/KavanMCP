import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Screenshot } from "@/components/ui/Screenshot";
import { pitch, site, subline } from "@/content/site";
import { shots } from "@/content/shots";

// The last word of the pitch is set in italic crimson; the text itself is the same string used for the page title
const cut = pitch.lastIndexOf(" ");
const lead = pitch.slice(0, cut);
const last = pitch.slice(cut + 1);

export function Hero() {
  const dashboard = shots[0];
  return (
    <section aria-labelledby="hero-heading" className="relative overflow-hidden pb-16 pt-14 md:pb-24 md:pt-20">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[34rem]"
        style={{ backgroundImage: "var(--hero-glow)" }}
      />
      <div className="wrap relative">
        <div className="mx-auto max-w-3xl text-center">
          <p className="caps mb-5 text-crimson-ink">Kavan · for Windows</p>
          <h1 id="hero-heading" className="text-5xl sm:text-6xl md:text-7xl">
            {lead} <em>{last}</em>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-ink-soft md:text-xl">{subline}</p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button href="#download" variant="primary">
              <Download aria-hidden="true" size={18} />
              Download for Windows
              <span className="tnum rounded bg-black/20 px-1.5 py-0.5 text-xs font-medium">v{site.version}</span>
            </Button>
            <Button href="#how" variant="quiet">
              See how it works
            </Button>
          </div>
          <p className="mt-5 text-sm text-ink-faint">Windows 10 and 11 · Free · Runs entirely on your PC</p>
        </div>

        <div className="parallax mx-auto mt-14 max-w-5xl md:mt-20">
          <Screenshot shot={dashboard} showCaption={false} sizes="(min-width: 1100px) 1024px, calc(100vw - 2rem)" />
        </div>
      </div>
    </section>
  );
}
