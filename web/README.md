# Kavan website

The one-page pitch site for KavanMCP. Next.js (App Router, TypeScript), Tailwind CSS 4, a static export with no server.
The plan it follows is `docs/WEBSITE_PLAN.md`.

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # writes the whole site to out/, ready for any static host
npm run lint
npm run typecheck
```

## What to edit

| To change | Edit |
|---|---|
| The download state, version, installer file, size, checksum, licence, repository, GitHub and LinkedIn | `content/release.json` |
| Screenshot captions and alt text | `content/shots.ts` |
| Page copy | the matching file in `components/sections/` |
| Colours (shared with the desktop app) | `app/globals.css` |

### The download card has three states

Set `state` in `content/release.json`:

- `soon`: the repository is not public yet. The card says the download is coming and links nowhere that can fail.
- `preview`: the repository is public but there is no installer. The card shows the source-build steps.
- `ready`: the installer is published. Fill in `installer.fileName`, `sizeBytes`, `sha256` and `releasedOn`; if any is
  missing the page falls back to `preview` instead of showing a half-empty card.

Check the "Install" and "Uninstall" steps in `components/sections/Download.tsx` against the real installer before
switching to `ready`; they could not be tested because no installer exists yet.

## Deploying

Set `NEXT_PUBLIC_SITE_URL` to the site's address when building, so the canonical link, sitemap and sharing tags are right:

```bash
NEXT_PUBLIC_SITE_URL=https://example.com npm run build
```

Then publish the `out/` folder.

## Screenshots, icons and the sharing image

- `shots-src/` holds the real captures of the 2.1.0 app (1600 px wide, dark and light). `npm run shots` turns them into
  the AVIF and WebP files in `public/shots/`. The page never ships a PNG.
- `npm run icons` rebuilds `app/apple-icon.png` and `app/favicon.ico` from `public/kavan-mark.svg`.
- `public/og.png` (1200×630) is rendered from `scripts/og.html`. See the comment at the top of that file.

## Choices worth knowing

- **Fonts:** Instrument Serif (headlines), Manrope (text) and JetBrains Mono (code), all from Google Fonts and
  self-hosted by `next/font` at build time, so the page makes no request to a font service.
- **Smooth scrolling:** Lenis (`components/SmoothScroll.tsx`). It turns itself off under `prefers-reduced-motion`.
  Where an anchor link lands is set in CSS (`scroll-padding-top`, `scroll-margin-top`).
- **No Cache Components:** `cacheComponents` and `partialPrefetching` are off. A static export has no request-time
  caching, and Cache Components rejects the `force-static` that `robots.ts` and `sitemap.ts` need.
- **Privacy:** no analytics, no cookies, no third-party requests. The only thing stored is the theme, in `localStorage`.
