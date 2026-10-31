import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Playfair_Display } from "next/font/google";
import type { ReactNode } from "react";
import { SmoothScroll } from "@/components/SmoothScroll";
import { siteUrl } from "@/content/site";
import "./globals.css";

// Self-hosted by next/font at build time: the page makes no request to a font service.
// Playfair Display for the headlines, Inter for text, JetBrains Mono for checksums and commands.
const display = Playfair_Display({
  variable: "--font-display-face",
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
});
const text = Inter({ variable: "--font-text", subsets: ["latin"], display: "swap" });
const code = JetBrains_Mono({ variable: "--font-code", subsets: ["latin"], display: "swap" });

const title = "Kavan: find what's slowing your PC, and end it safely";
const description =
  "Kavan watches your Windows PC, explains what is using it up, and lets you or Claude close the right program, safely. Free, and it runs entirely on your PC.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  applicationName: "Kavan",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Kavan",
    title,
    description,
    url: "/",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Kavan: find what's slowing your PC, and end it safely, with the Kavan dashboard.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark light",
};

// Runs before first paint so there is no flash of the wrong theme. A saved choice wins, then the system setting, then dark.
const themeScript = `(function(){var t=null;try{t=localStorage.getItem('kavan-theme')}catch(e){}
if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}
document.documentElement.dataset.theme=t})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: the theme script sets data-theme on <html> before React loads
    <html lang="en" className={`${display.variable} ${text.variable} ${code.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <SmoothScroll />
        {children}
      </body>
    </html>
  );
}
