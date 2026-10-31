import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import { repoIsPublic, site } from "@/content/site";

interface FooterLink {
  href: string;
  label: string;
}

function LinkGroup({ title, links }: { title: string; links: FooterLink[] }) {
  if (links.length === 0) return null;
  return (
    <nav aria-label={title}>
      <p className="caps mb-3">{title}</p>
      <ul className="flex flex-col gap-2 text-[0.9375rem]">
        {links.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              className="inline-flex items-center gap-1 text-ink-soft transition-colors hover:text-ink"
            >
              {link.label}
              {link.href.startsWith("http") ? <ArrowUpRight aria-hidden="true" size={14} /> : null}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Footer() {
  // The project repository is always linked. Release notes and the issue tracker are linked once it is public.
  const project: FooterLink[] = [{ href: site.repository, label: "Project repository" }];
  if (repoIsPublic) {
    project.push({ href: site.releaseNotes, label: "Release notes" });
    project.push({ href: `${site.repository}/issues`, label: "Report an issue" });
  }

  const person: FooterLink[] = [];
  if (site.profiles.github) person.push({ href: site.profiles.github, label: "GitHub" });
  if (site.profiles.linkedin) person.push({ href: site.profiles.linkedin, label: "LinkedIn" });
  if (site.contactEmail) person.push({ href: `mailto:${site.contactEmail}`, label: "Email" });

  return (
    <footer className="border-t border-line py-12">
      <div className="wrap">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5 font-display text-[1.7rem] leading-none">
              <Image src="/kavan-mark.svg" alt="" width={28} height={28} />
              Kavan
            </div>
            <p className="tnum mt-3 text-sm text-ink-soft">
              Version {site.version} · {site.licence} licence
            </p>
          </div>

          <div className="flex gap-14">
            <LinkGroup title="Project" links={project} />
            <LinkGroup title="Find me" links={person} />
          </div>
        </div>

        <p className="mt-10 border-t border-line pt-6 text-sm text-ink-faint">
          Kavan is an independent project. Claude is a product of Anthropic.
        </p>
      </div>
    </footer>
  );
}
