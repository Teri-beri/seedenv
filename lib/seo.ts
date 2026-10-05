import type { Metadata } from "next";

export const SITE_URL = "https://seedenv.com";
export const SITE_DESCRIPTION = "Connect indie developers with verified beta testers. Launch TestFlight missions, gather qualitative UX feedback, and reward top testers.";

export const siteMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "SeedEnv",
  title: {
    default: "SeedEnv | Beta Testing Platform & App Feedback",
    template: "%s | SeedEnv",
  },
  description: SITE_DESCRIPTION,
  keywords: ["beta testing", "TestFlight beta testers", "iOS app testing", "indie hackers", "app feedback", "user testing platform", "SeedEnv"],
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: "SeedEnv | Launch Faster with Verified Beta Testers",
    description: "Claim missions, test mobile & web apps, and deliver structured feedback to developers.",
    url: SITE_URL,
    siteName: "SeedEnv",
    locale: "en_US",
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "SeedEnv - High-Signal Beta Testing & App Store Readiness" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SeedEnv | Beta Testing & Feedback Platform",
    description: "Turn everyday testers into early adopters. High-signal beta testing for modern software teams.",
    images: [{ url: "/twitter-image", width: 1200, height: 630, alt: "SeedEnv - High-Signal Beta Testing & App Store Readiness" }],
  },
};

export function publicPageMetadata(title: string, description: string, path: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}${path}` },
    openGraph: { ...siteMetadata.openGraph, title: `${title} | SeedEnv`, description, url: `${SITE_URL}${path}` },
    twitter: { ...siteMetadata.twitter, title: `${title} | SeedEnv`, description },
  };
}

export const siteStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "SeedEnv",
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      inLanguage: "en-US",
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#application`,
      name: "SeedEnv",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web, iOS, Android",
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      offers: {
        "@type": "Offer",
        name: "Public mission browsing",
        price: "0",
        priceCurrency: "USD",
        description: "Browse public beta testing missions for free. Funded developer campaigns have separate tester rewards and platform fees.",
        url: `${SITE_URL}/pricing`,
      },
    },
  ],
};