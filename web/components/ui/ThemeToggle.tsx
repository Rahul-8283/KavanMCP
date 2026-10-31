"use client";

import { Moon, Sun } from "lucide-react";

const KEY = "kavan-theme";

/**
 * Dark / light. The theme is the data-theme attribute on <html>, set before first paint by the script in the layout.
 * Both icons are always rendered and the stylesheet shows the right one, so the server and client HTML always match.
 */
export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const current =
      root.dataset.theme ?? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    const next = current === "light" ? "dark" : "light";
    root.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Storage can be blocked; the choice then lasts until the page is closed
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn btn-quiet btn-icon"
      aria-label="Switch between dark and light theme"
    >
      <Sun aria-hidden="true" size={18} className="theme-sun" />
      <Moon aria-hidden="true" size={18} className="theme-moon" />
    </button>
  );
}
