/**
 * The five screenshots of the real 2.1.5 app. Each exists in dark and light, at two widths, as AVIF and WebP.
 * The files are produced by scripts/optimize-screenshots.mjs from the PNGs in shots-src/.
 */
export interface Shot {
  id: "dashboard" | "alerts" | "trends" | "killed" | "settings";
  tab: string;
  caption: string;
  /** Says what the picture shows, for people who cannot see it */
  alt: string;
  width: number;
  height: number;
}

export const SHOT_WIDTHS = [800, 1600] as const;

export const shots: Shot[] = [
  {
    id: "dashboard",
    tab: "Dashboard",
    caption: "Every running process with its security tier, and the program's context menu open.",
    alt: "The Dashboard page: CPU, memory and disk gauges above a table of running processes sorted by CPU, each with a security tier badge, and a context menu open on one process offering Terminate, Protect and Stop alerting.",
    width: 1600,
    height: 900,
  },
  {
    id: "alerts",
    tab: "Alerts",
    caption: "Each alert keeps when it started, how high it went, and what was using the most.",
    alt: "The Alerts page, with one alert expanded to show its CPU, memory and disk readings and the program that was using the most.",
    width: 1600,
    height: 900,
  },
  {
    id: "trends",
    tab: "Trends",
    caption: "Charts from one hour to seven days, zoomed into a spike.",
    alt: "The Trends page: CPU, memory and disk charts zoomed into a spike, with each limit drawn as a dashed line and the time of the CPU alert shaded in red.",
    width: 1600,
    height: 900,
  },
  {
    id: "killed",
    tab: "Recently Killed",
    caption: "End the wrong program by mistake and restore it with one click.",
    alt: "The Recently Killed page: a list of programs Kavan ended, each with its security tier and a Restore button, and one marked as already restored.",
    width: 1600,
    height: 900,
  },
  {
    id: "settings",
    tab: "Settings",
    caption: "Mark programs Kavan must never end, and programs it should record quietly.",
    alt: "The Settings page: alert thresholds, the Never terminate and Never alert on lists, history length, theme, alert sound and start-with-Windows options.",
    width: 1600,
    height: 900,
  },
];
