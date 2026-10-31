# KavanMCP Website Plan: A One-Page Pitch Site

## 1. Objective & Overview

### 1.1 The Goal
One page that lets a visitor understand KavanMCP in about a minute, believe that it is safe, and download it. The page serves two readers with one story:

- **Users** who are tired of hunting for the program that is slowing their PC, and who may already use Claude Desktop.
- **Clients and reviewers** who are judging the project: they should see a finished, careful product, not a demo.

### 1.2 What "Success" Means
| Measure | Target |
|---|---|
| A new visitor can say what Kavan does after the hero alone | Yes, in one sentence, without scrolling |
| A visitor can find the download in one click from anywhere on the page | Yes. The nav button is always visible |
| Every claim on the page is true of the shipped product | 100%. See §10 |
| Lighthouse (mobile) | Performance 95+, Accessibility 100, Best Practices 100, SEO 100 |
| Page weight | Under 1 MB on first load, excluding screenshots below the fold |
| Needs a server | No. The site is static |

### 1.3 Scope
**In:** one Next.js page, a download section, screenshots of the real app, a safety explanation, an FAQ, and sharing metadata.
**Out:** accounts, a blog, a dashboard, payments, a docs site, a CMS, localisation. The docs stay in the repository.

---

## 2. Facts the Page Must Respect

Before any design, these are the true constraints of the product today. The page is written around them, not around what would be nicer.

| Fact | Where it comes from | What it means for the page |
|---|---|---|
| Windows only | Uses `psutil`, `pywin32` and the Windows tray | Say "for Windows 10 and 11" in the hero. Never imply Mac or Linux |
| The repository is private today, and will be made public once the work is finished | The README's static badges exist because shields.io cannot read it | Once it is public, GitHub Releases links work for everyone. Until then they return 404. The plan is built for the public repository, with a fallback for the gap. See §8 |
| No installer has been produced yet | `npm run tauri build` built the app but the installer step timed out in testing | The download section needs a plan for what it offers on day one. See §8 |
| The backend needs Python 3.11+ | `mcp-server` runs from a virtual environment; the installer does not bundle Python | A plain-language "Requirements" block, not a footnote |
| The AI half needs Claude Desktop | Claude connects over MCP | Describe the desktop app as complete on its own, and the Claude link as an extra |
| Local only | No cloud, no API keys, no telemetry, the API listens on 127.0.0.1 | This is a headline feature, and must stay true. See §11 |
| The version is 2.1.5 | All version fields were set together | Show the real version next to the download |
| V2.2 (baselines, auto-kill rules, suggestions) is only a plan | `v2.2/PLAN_V2_2.md` | Never show it as available. At most a small "Planned" strip |
| An installer that is not code-signed shows a Windows SmartScreen warning | Windows behaviour | Tell people before they see it, in the download section |

---

## 3. Audience & Message

### 3.1 Who Reads It
1. **The frustrated user.** Task Manager shows 300 processes and no answer. Wants the cause, and a safe way to fix it.
2. **The Claude user.** Already talks to Claude about their computer. Wants it to be able to act, with guard rails.
3. **The evaluator.** A client, recruiter or reviewer. Scans for craft: honesty, safety, tests, polish.

### 3.2 The One-Line Pitch
> **Find what's slowing your PC, and end it safely.**

Sub-line: *KavanMCP watches your Windows system, explains what is using it up, and lets you or Claude close the right program, with a safety engine that can never touch the parts of Windows that keep it running.*

### 3.3 Message Order
The page answers these questions, in this order. Each section below exists to answer exactly one.

1. What is it? (Hero)
2. How does it work? (Three steps)
3. What can I do with it? (Features)
4. Why is it safe to let an AI do this? (Safety)
5. What does it look like? (Screenshots)
6. What will I need? (Requirements)
7. How do I get it? (Download)
8. What are the catches? (FAQ)

### 3.4 Tone
Calm, exact and short. No hype words ("revolutionary", "powerful", "supercharge"). Say what it does and what it will not do. The product's own promise is caution, so the writing is cautious too.

---

## 4. Technical Decisions

| Decision | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router), TypeScript** | As requested. One route, `app/page.tsx` |
| Output | **Static export** (`output: 'export'`) | No server, no cost, works on any static host, nothing to keep alive |
| Styling | **Tailwind CSS 4** | The app already uses it, so the design tokens carry across unchanged |
| Fonts | **`next/font`**, self-hosted | The app uses Segoe UI, which is not on Mac or Linux browsers. Pick one web font for text and one for headings; self-hosting avoids a third-party request |
| Images | **`next/image` with pre-sized WebP/AVIF** | Static export needs `images.unoptimized`, so images are optimised once at build time by a script, not at request time |
| Motion | **CSS only**, honouring `prefers-reduced-motion` | No animation library. Fewer dependencies, smaller page |
| Icons | **`lucide-react`** | Same set as the app |
| State | None. Dark/light is a class on `<html>` | A pitch page has no state worth managing |
| Dependencies | next, react, react-dom, tailwindcss, lucide-react, nothing else | Each extra package is something to keep patched |
| Location | **`web/`** at the repository root | Separate from `desktop/` and `mcp-server/`, with its own `package.json` |
| Hosting | **Vercel, Cloudflare Pages or GitHub Pages** | All serve a static export for free. Cloudflare Pages is the most generous on bandwidth |
| Node | 20 LTS or newer | Matches the desktop app's tooling |

---

## 5. Page Structure

A single scroll, with a sticky top bar. Anchors are `#how`, `#features`, `#safety`, `#screens`, `#requirements`, `#download`, `#faq`.

```
┌──────────────────────────────────────────────────────────┐
│ ◆ KAVAN   How · Features · Safety · FAQ     [ Download ] │  sticky nav
├──────────────────────────────────────────────────────────┤
│ 1  HERO                                                  │
│ 2  HOW IT WORKS        three steps                       │
│ 3  FEATURES            six cards                         │
│ 4  SAFETY              the four tiers                    │
│ 5  SEE IT              screenshots                       │
│ 6  WITH CLAUDE         an example conversation           │
│ 7  REQUIREMENTS        what you need                     │
│ 8  DOWNLOAD            version, button, checksum         │
│ 9  FAQ                 eight questions                   │
│ 10 FOOTER              version, licence, links           │
└──────────────────────────────────────────────────────────┘
```

---

## 6. Section by Section

### 6.1 Navigation
- Left: the Kavan mark (`desktop/public/kavan_logo.svg`) and the name in the display font.
- Centre (hidden under 720 px): the section links.
- Right: a **Download** button in the crimson accent, always visible.
- Becomes slightly opaque with a bottom line after the user scrolls. A theme toggle sits beside the button.

### 6.2 Hero
- **Headline:** *Find what's slowing your PC, and end it safely.*
- **Sub-line:** as in §3.2, two lines at most.
- **Actions:** **Download for Windows** (primary, shows `v2.1.5`), and **See how it works** (a quiet link to `#how`).
- **Small print under the buttons:** *Windows 10 and 11 · Free · Runs entirely on your PC*. (Edit "Free" to match the licence decision in §12.)
- **Visual:** the Dashboard screenshot in a window frame, tilted very slightly or flat, with the crimson glow the app itself uses behind it. It must be a real capture, never a mock-up.
- **Above the fold on a laptop:** headline, sub-line, both buttons and the top half of the screenshot.

### 6.3 How It Works
Three numbered steps in a row, one line each, with a small icon:

1. **It watches.** *Kavan reads CPU, memory and disk every two seconds and records the history, even with the window closed.*
2. **It explains.** *When something spikes, it records which program was using the most, and shows it on a graph.*
3. **You decide.** *You confirm each kill in the app, or ask Claude. Kavan will not end anything on its own.*

Step 3 is true today and is also the strongest reassurance, so it is stated plainly. (When V2.2's optional rules exist, this line is revisited. It must not be changed before then.)

### 6.4 Features
Six cards, each with an icon, a title and two lines. Order is by what a first-time visitor cares about.

| Card | Copy (draft) |
|---|---|
| **Live dashboard** | CPU, memory and disk gauges that turn crimson over your limits, and a table of every running process with its security tier. |
| **Alert history** | Every alert saved with when it started, how high it went, and what was using the most. Filter by date, type and severity. |
| **Performance trends** | Charts from one hour to seven days. Drag to zoom into a spike. Gaps are shown as gaps, never joined across. |
| **Undo for kills** | End the wrong program by mistake and restore it in one click, from the toast or from Recently Killed. |
| **Protected apps** | Mark programs Kavan must never end, even if you or Claude ask, and programs it should record quietly without alerting. |
| **Works with Claude** | Ask Claude to find what's slow and clean it up. Seven tools, and every kill still needs your confirmation. |

### 6.5 Safety
The section that separates Kavan from a "kill everything" script. Heading: **Built so it can't break Windows.**

A four-row visual, each row a coloured tier badge (reuse the app's tier colours) with one sentence:

| Tier | Name | What happens |
|---|---|---|
| 1 | **System** | Windows' own processes. They can never be ended, by you or by Claude, and the block sits in front of the operating-system call itself. |
| 2 | **Essential** | Apps you work in, like your editor and browser. A clear warning, then your confirmation. |
| 3 | **Optional** | Background programs. Safe to end if you need the resources. |
| 4 | **Unverified** | An unknown program using lots of CPU with no window. Flagged as suspicious. |

Below it, three short guarantees, each one verifiable:
- **Two steps to kill.** A kill is staged, then confirmed, and the confirmation expires after five minutes and works for one program once.
- **Everything is logged.** Every kill, block and restore is written to a local audit log.
- **Nothing leaves your PC.** No cloud, no account, no API key, no telemetry. The app talks only to itself on your machine, and refuses requests from web pages.

### 6.6 See It
A row of three or four screenshots with captions, switching with simple tabs (no carousel library):

1. **Dashboard** with the process table and a context menu open.
2. **Alerts** with one row expanded.
3. **Trends** zoomed into a spike.
4. **Recently Killed** with Restore buttons.

A fifth, **Settings** with protected apps, can sit in the extra-detail row. Every screenshot is from the real 2.1.5 app, in both the dark and the light theme, and the page shows the one that matches the visitor's theme.

### 6.7 With Claude
Heading: **Or just ask.** A chat-style panel showing an example exchange:

> **You:** My laptop is lagging. What's going on?
> **Claude:** Chrome is using 2.1 GB and a background updater is at 38% CPU with no window. I'd suggest closing the updater. Want me to?
> **You:** Yes.
> **Claude:** Done. It freed 310 MB. If you need it back, I can restore it.

Rules for this block:
- It is labelled **"An example conversation"**, because it is illustrative, not a recording.
- It must be consistent with what the tools do: Claude proposes, the user confirms, Kavan blocks Tier 1.
- A second, shorter example shows Claude being refused: *"Close explorer.exe"* → *"That's a protected Windows process. Kavan won't end it."*

### 6.8 Requirements
A compact two-column list:

| You need | Notes |
|---|---|
| Windows 10 or 11 | 64-bit |
| Python 3.11 or newer | Runs Kavan's background service. See the download section for the setup steps |
| Claude Desktop | Optional. Only for the Claude features. The desktop app works without it |
| Administrator rights | Optional. Needed only to end system-level programs; Kavan tells you when it is needed |

The honest status of setup belongs here, not hidden in the FAQ. If setup is not one click when the site launches, this section says how many steps it is.

### 6.9 Download
The most important section, and the one with the most open decisions (§8, §12).

- A card with: **Kavan 2.1.5 for Windows**, the file name, the size, the release date, and a **SHA-256 checksum** with a copy button.
- A line before the button: *Windows may warn that the app is from an unknown publisher, because it is not code-signed yet. Choose "More info" then "Run anyway" if you trust the source.* Remove this line only once the installer is signed.
- Under it, three collapsible steps: **Install**, **Connect Claude Desktop** (the config snippet), **Uninstall**.
- A secondary link to the public repository. A star count can be shown if it is read at build time, so the page makes no request at runtime.

### 6.10 FAQ
Eight questions, plain answers, in an accessible accordion built from `<details>`:

1. **Is it safe to let an AI close programs?** The four tiers, and the confirmation step.
2. **Can Claude close something without asking me?** No. Every kill needs confirmation, and a program on your protected list is refused.
3. **Does it send my data anywhere?** No. Nothing leaves your PC.
4. **I ended the wrong program. Can I get it back?** Yes, with Undo or Recently Killed. It restarts the program. It cannot bring back unsaved work.
5. **Do I need Claude?** No. The desktop app is complete on its own.
6. **Does it need Administrator rights?** Only to end system-level programs.
7. **Does it slow my PC down?** The background scan costs about 2% of one core, once a minute.
8. **Which versions of Windows?** 10 and 11, 64-bit.

### 6.11 Footer
Kavan mark, version, licence, a link to the release notes, a link to the public repository, contact, and the line *"KavanMCP is an independent project. Claude is a product of Anthropic."* Keep the trademark note, so the page does not suggest an affiliation.

---

## 7. Design System

### 7.1 One Brand With the App
The site uses the app's own palette, so the screenshots look native on the page. Tokens come from `desktop/src/styles/index.css`; copy them, do not retype them.

| Token | Dark | Light |
|---|---|---|
| Canvas | `#0c0a0a` | parchment, see `:root` |
| Surface | `#141111` | see `:root` |
| Raised | `#1b1717` | see `:root` |
| Ink | `#f2ebe7` | `#1e1816` |
| Ink (soft) | `#aba29e` | `#5c534d` |
| Ink (faint) | `#7b726e` | `#857a72` |
| Accent (crimson) | `#d41b2c`, bright `#f42032` | `#b4121f`, bright `#cc1020` |
| Success | see app | `#2d6a4a` |
| Warning | see app | `#8c5a06` |

- **Dark is the default.** The site follows `prefers-color-scheme` and lets the visitor override it. The choice is remembered in `localStorage`.
- The soft crimson glow behind the hero is a single radial gradient, the same one the app uses.

### 7.2 Type
- One text face and one display face, both self-hosted through `next/font`. Choose a pair with a clear Windows feel (a humanist sans such as Inter for text, with the heading in a slightly tighter weight). The app's Segoe UI cannot be relied on in a browser.
- A modular scale of about 1.25. Body 17 to 18 px, line length 60 to 70 characters.
- Numbers in tables and checksums use tabular figures and a monospace face.

### 7.3 Layout
- A 12-column grid, content width 1120 px, generous vertical rhythm (96 to 128 px between sections on desktop, 64 px on mobile).
- Every section has one job and one heading. No section is a card stack inside a card stack.
- Mobile first. Breakpoints at 640, 900 and 1200 px.

### 7.4 Components
A small set, each used more than once: `Button` (primary, quiet), `Section`, `Card`, `TierBadge`, `Screenshot` (with window frame and caption), `Accordion`, `CopyField` (for the checksum and config snippet), `ThemeToggle`.

### 7.5 Motion
- Sections fade up by 12 px as they enter, once, with a 200 ms ease.
- The hero screenshot has a slow, subtle parallax on scroll. Both are removed under `prefers-reduced-motion`.
- Nothing autoplays, loops or blocks reading.

---

## 8. Download & Distribution

This is the one part of the plan that is a decision, not a build task, because today the product cannot simply be linked.

### 8.1 The Situation
1. The repository will be made public once the work is done. From then on, a GitHub Releases link works for everyone and shows the file size natively. Until then it returns "404" to visitors, so the site must not go live pointing at it.
2. No installer exists yet. The app builds, but the installer step needs to be run on the maintainer's machine.
3. What would be downloaded is not self-contained: the backend needs Python and a virtual environment.

**The decision is made:** the public repository is the home of the download. The site and the repository going public are therefore one launch, in the order given in §8.4.

### 8.2 Options
| Option | Visitor experience | Cost | Recommended |
|---|---|---|---|
| **A. A separate public "releases" repository** that holds only installers and release notes | Normal GitHub download link, no source exposed | One extra repo, a manual upload per release | Only as a stop-gap, if the site must go live before the source is public |
| **B. The main repository, made public** | The best credibility signal. Releases, checksums, issues and the README are one click away | Exposes the code and its history, so it needs the checks in §8.4 first | **Yes. This is the plan** |
| **C. Host the installer on the site itself** (static asset or object storage) | One click, no GitHub | Large files in the repo or a bucket, and bandwidth | Only for a small installer |
| **D. "Request access" form** | Slower for the visitor | Needs a form handler, and it adds friction | Only if the product is meant to be gated |

### 8.3 What the Page Offers
Depending on readiness, the download card is in one of three states. The component supports all three through one config value, so the page never has to be rewritten.

| State | Card shows | When |
|---|---|---|
| **Ready** | Version, size, checksum, a **Download** button linking to the GitHub release, and a link to the repository | The repository is public and the installer is published |
| **Preview** | *"Kavan 2.1.5 is available as a source build. Setup takes about ten minutes."* with the setup steps and a link to the repository | The repository is public but no installer is published yet |
| **Soon** | *"Kavan is almost ready. The Windows download is coming."*, with no link that can fail | Before the repository is public. The site can be deployed in this state to share a preview |

The button points at the repository's stable `/releases/latest` page, so the link does not change with each release. The file name, size and checksum shown beside it still come from `release.json`.

### 8.4 Before the Repository Goes Public
Publishing is hard to undo, because a public history stays public even if it is later deleted. Before the switch:
- **Secrets.** Search the whole history, not only the current files, for keys, tokens, passwords and personal paths (for example with `gitleaks`), and rotate anything found. The project is local-first and has no API keys by design, but check rather than assume.
- **Personal data.** Screenshots, test fixtures and docs must not show real process names, usernames, machine paths or email addresses.
- **Licence.** Add a `LICENSE` file that matches the README badge, and settle the product's terms (§12).
- **README.** It becomes the second landing page. Replace the static last-commit badge with the live one, which works once the repository is public, and link the website.
- **Private notes.** Read through `docs/`, `phase_v2_1/`, `v2.2/` and the commit messages for anything that should not be published.
- **Branches.** Delete scratch branches and keep `main` clean.
- **Release.** Build the installer, install and uninstall it on a clean Windows machine, and publish it as a GitHub Release with the SHA-256 of the exact file.

### 8.5 Before the "Ready" State
- The installer is built and test-installed on a clean Windows machine, including uninstall.
- It is either code-signed, or the SmartScreen note in §6.9 stays.
- The SHA-256 of the exact uploaded file is published on the page.
- The page's version, file name and size come from one small file (`web/content/release.json`) that is updated with each release.

---

## 9. Assets

| Asset | Source | Notes |
|---|---|---|
| Logo / mark | `desktop/public/kavan_logo.svg` | Use the SVG. Provide a light and a dark variant |
| Screenshots (5) | A fresh capture of the real 2.1.5 app | 1600 px wide, dark and light, with realistic but harmless data. Never show real process names that could identify the user |
| Open Graph image | Designed once, 1200×630 | Logo, headline, one screenshot |
| Favicon set | From the mark | SVG favicon, 32 px PNG, and an Apple touch icon |
| Tier badges | Redrawn as inline SVG | So they follow the theme and stay sharp |

A script in `web/scripts/` converts the source screenshots to WebP and AVIF at two widths, so the page never ships a PNG.

---

## 10. Content Rules: What the Page May Say

The page is part of the product's promise. Every statement is checked against this list.

**May say**
- "Windows 10 and 11", "no cloud, no account, no API key, no telemetry", "Tier 1 processes cannot be ended", "every kill needs your confirmation", "every kill, block and restore is logged", "restores the program, not unsaved work".
- Counts and figures, **if** they are current: 641 backend tests and 81 desktop tests at 2.1.5, one process scan a minute, a two-second refresh. Re-check each at every release.

**May not say**
- Anything about V2.2 as if it existed: automatic kills, learned baselines, suggestions, schedules. If a roadmap strip is added, it is labelled **Planned** and kept small.
- "Works on Mac or Linux", "one-click install" (until true), "AI that optimises your PC for you" (it advises, you decide), or any comparison with a named competitor.
- Performance claims without a number and a source ("faster", "lighter").
- Testimonials, user counts or logos that do not exist.

---

## 11. Privacy, SEO and Sharing

### 11.1 Privacy
Kavan's headline claim is "no telemetry", so the site must not undermine it.
- **Analytics (decided).** Vercel Analytics and Speed Insights report anonymous visit and page-speed figures to Vercel. The footer says so in one line. Nothing from the Kavan app is sent. This supersedes the earlier "no analytics" rule.
- No third-party fonts or embeds. Fonts are self-hosted; the only outside service is the Vercel reporting above.
- No cookie banner is needed, because nothing is set except the theme in `localStorage`.

### 11.2 SEO
- One `<h1>` (the headline), a logical heading order, descriptive `<title>` and meta description (under 160 characters).
- `lang="en"`, canonical URL, `robots.txt`, `sitemap.xml`.
- JSON-LD `SoftwareApplication` with name, version, operating system "Windows 10, Windows 11", category "UtilitiesApplication", and the download URL once it exists.

### 11.3 Sharing
Open Graph and Twitter-card tags with the 1200×630 image, so a link in a message shows a proper preview.

---

## 12. Open Decisions

Each needs an answer before the part that depends on it. A recommended answer is given.

1. **Where does the download live?** *Decided:* GitHub Releases on the main repository, once it is public (§8.2 option B).
2. **In what order does it all go live?** (before the site is deployed) Recommended: finish §8.4, make the repository public, publish the release, then deploy the site in the **Ready** state. If the site must be shown earlier, deploy it in the **Soon** state.
3. **Licence and price.** The README badge says MIT, and a public repository needs a real `LICENSE` file that matches. State the licence on the page, and say "Free" only if it is.
4. **The domain and the product name on the page.** "Kavan" or "KavanMCP". Recommended: **Kavan** as the name, with "KavanMCP" in the download file and the technical sections.
5. **Code signing.** Recommended: ship unsigned at first, with the honest SmartScreen note, and sign later.
6. **Email capture for the "Soon" state.** Recommended: skip it. A mailto link is enough, and it adds no service to maintain.
7. **A short screen recording.** A 20-second clip of kill and undo would sell the product well. Recommended: yes, as a muted looping MP4/WebM under 2 MB, added after launch.

---

## 13. Accessibility & Performance

- **Contrast:** body text and the crimson accent meet WCAG AA in both themes. The accent text colour (`crimson-ink`) is used for text, and the brighter crimson only for fills.
- **Keyboard:** every control is reachable with Tab, shows a visible focus ring, and works with Enter or Space. A "Skip to content" link is the first focusable element.
- **Semantics:** one `<main>`, landmarks for header, footer and sections, `<details>` for the FAQ, real `<button>` and `<a>` elements.
- **Images:** every screenshot has alt text that says what it shows ("The Alerts page, with one alert expanded to show its CPU, memory and disk readings").
- **Motion:** respects `prefers-reduced-motion`.
- **Budgets:** JavaScript under 90 kB gzipped, the hero image under 120 kB, LCP under 2 s on a mid-range phone over 4G, no layout shift.

---

## 14. Build Order

| Order | Step | Done when |
|---|---|---|
| 1 | Scaffold `web/` with Next.js, TypeScript and Tailwind 4, and copy the tokens | An empty page builds with `output: 'export'` and shows both themes |
| 2 | Layout, nav, theme toggle, footer | The shell works on mobile and desktop |
| 3 | Hero and How it works | The first screen answers "what is it" |
| 4 | Features and Safety | Copy is final and checked against §10 |
| 5 | Screenshots, With Claude | Real captures in both themes, with alt text |
| 6 | Requirements, Download (all three states), FAQ | The download card reads from `release.json` |
| 7 | SEO, sharing and favicons | The preview card renders, and the structured data validates |
| 8 | Performance and accessibility pass | The budgets in §13 and the Lighthouse targets in §1.2 are met |
| 9 | Make the repository public (§8.4), publish the release, then deploy | The production URL serves the exported site in the **Ready** state, and its download link returns the installer |

---

## 15. Testing the Site

| Check | How |
|---|---|
| Builds and exports | `next build` produces `out/` with no warnings |
| Links | Every anchor and external link resolves, and the download link returns the file |
| Checksum | The SHA-256 on the page matches the uploaded file |
| Responsive | 360, 768, 1280 and 1920 px, both themes |
| Keyboard and screen reader | Tab through the whole page. Check headings and landmarks with a screen reader |
| Reduced motion | With the setting on, nothing animates |
| Offline claim | The page makes no request to another origin (check the network panel) |
| Browsers | Current Chrome, Edge, Firefox and Safari |
| Claims | Each statement is checked against §10 and the current release |

---

## 16. Definition of Done

The website is ready to publish when all of these hold:

1. **One page tells the whole story.** Hero to FAQ, in the order of §3.3, with one clear download action.
2. **Every claim is true.** Checked against §10 and the shipped 2.1.5 product, with nothing from V2.2 presented as available.
3. **The download works.** The button, size and checksum match a real, test-installed file, or the page honestly shows the Preview state.
4. **It looks like the product.** The palette, tier colours and screenshots match the app, in both themes.
5. **It is fast and accessible.** The Lighthouse and budget targets in §1.2 and §13 are met.
6. **It respects the promise.** Analytics are limited to the Vercel reporting in §11.1, disclosed in the footer, and nothing from the app is collected.
7. **It is cheap to keep.** A static export on a free host, with release details in one small file.

Once these pass, the site can be deployed and linked from the repository README.
