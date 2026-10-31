"use client";

import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { useEffect } from "react";

/**
 * Smooth, inertial scrolling for the whole page. It renders nothing.
 *
 * Lenis moves the real document scroll position, so the CSS scroll-driven effects (the reveal, the hero drift,
 * the nav bar) keep working, and keyboard, find-in-page and screen readers are unaffected. With
 * prefers-reduced-motion set, Lenis turns its own smoothing off. Where an anchor lands is set in CSS
 * (scroll-padding-top on <html>, scroll-margin-top on sections), which Lenis reads.
 */
export function SmoothScroll() {
  useEffect(() => {
    const lenis = new Lenis({
      autoRaf: true,
      duration: 1.15,
      anchors: { duration: 1.4 },
    });
    return () => lenis.destroy();
  }, []);

  return null;
}
