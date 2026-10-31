import { SHOT_WIDTHS, type Shot } from "@/content/shots";

type Theme = "dark" | "light";

function sources(id: Shot["id"], theme: Theme, ext: "avif" | "webp") {
  return SHOT_WIDTHS.map((w) => `/shots/${id}-${theme}-${w}.${ext} ${w}w`).join(", ");
}

/**
 * A real capture of the app, in a window frame, with a caption.
 * Both themes are in the page; the stylesheet shows the one that matches the visitor's theme, and a hidden image
 * is never downloaded, so each visitor fetches one picture.
 */
export function Screenshot({
  shot,
  sizes = "(min-width: 1200px) 1120px, calc(100vw - 2rem)",
  showCaption = true,
  className = "",
}: {
  shot: Shot;
  sizes?: string;
  showCaption?: boolean;
  className?: string;
}) {
  const themes: Theme[] = ["dark", "light"];
  return (
    <figure className={className}>
      <div className="overflow-hidden rounded-lg border border-line-strong bg-sunken shadow-pop">
        <div aria-hidden="true" className="flex h-8 items-center gap-1.5 border-b border-line bg-surface px-3.5">
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        </div>
        {themes.map((theme) => (
          <picture key={theme} className={theme === "dark" ? "shot-dark" : "shot-light"}>
            <source type="image/avif" srcSet={sources(shot.id, theme, "avif")} sizes={sizes} />
            <source type="image/webp" srcSet={sources(shot.id, theme, "webp")} sizes={sizes} />
            {/* A plain <img> on purpose: <picture> gives AVIF with a WebP fallback, which next/image cannot in a static export */}
            <img
              src={`/shots/${shot.id}-${theme}-1600.webp`}
              alt={shot.alt}
              width={shot.width}
              height={shot.height}
              loading="lazy"
              decoding="async"
              className="block h-auto w-full"
            />
          </picture>
        ))}
      </div>
      {showCaption ? <figcaption className="mt-3 text-center text-sm text-ink-soft">{shot.caption}</figcaption> : null}
    </figure>
  );
}
