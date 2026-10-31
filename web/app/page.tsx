import { Download } from "@/components/sections/Download";
import { Faq } from "@/components/sections/Faq";
import { Features } from "@/components/sections/Features";
import { Footer } from "@/components/sections/Footer";
import { Hero } from "@/components/sections/Hero";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { Nav } from "@/components/sections/Nav";
import { Requirements } from "@/components/sections/Requirements";
import { Safety } from "@/components/sections/Safety";
import { SeeIt } from "@/components/sections/SeeIt";
import { WithClaude } from "@/components/sections/WithClaude";
import { releasesLatest, site, siteUrl } from "@/content/site";

// Structured data for search engines. The download URL appears only once there is something to download.
const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Kavan",
  alternateName: "KavanMCP",
  url: siteUrl,
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Windows 10, Windows 11",
  softwareVersion: site.version,
  description:
    "Watches a Windows PC, explains what is using it up, and lets you or Claude close the right program, safely.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  ...(site.state === "ready" ? { downloadUrl: releasesLatest } : {}),
};

export default function Home() {
  return (
    <>
      <a href="#content" className="skip-link">
        Skip to content
      </a>
      <div id="top" />
      <Nav />
      <main id="content">
        <Hero />
        <HowItWorks />
        <Features />
        <Safety />
        <SeeIt />
        <WithClaude />
        <Requirements />
        <Download />
        <Faq />
      </main>
      <Footer />
      <script
        type="application/ld+json"
        // JSON.stringify output only; "<" is escaped so the data can never close the script tag
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
    </>
  );
}
