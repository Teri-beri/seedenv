import type { Metadata } from "next";

export const SITE_URL = "https://seedenv.com";
export const SITE_DESCRIPTION = "Find beta testers for iOS, Android and web apps. Launch TestFlight or Google Play testing cohorts, collect structured bug reports and UX feedback with SeedEnv.";

export const siteMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "SeedEnv",
  title: {
    default: "Find Beta Testers for iOS, Android & Web Apps | SeedEnv",
    template: "%s | SeedEnv",
  },
  description: SITE_DESCRIPTION,
  keywords: ["beta testing", "TestFlight beta testers", "iOS app testing", "indie hackers", "app feedback", "user testing platform", "SeedEnv"],
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: "Find Beta Testers for iOS, Android & Web Apps | SeedEnv",
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: "SeedEnv",
    locale: "en_US",
    type: "website",
    images: [{ url: "/opengraph-image?v=seedcube-v3", width: 1200, height: 630, alt: "SeedEnv - High-Signal Beta Testing & App Store Readiness" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Find Beta Testers for iOS, Android & Web Apps | SeedEnv",
    description: SITE_DESCRIPTION,
    images: [{ url: "/twitter-image?v=seedcube-v3", width: 1200, height: 630, alt: "SeedEnv - High-Signal Beta Testing & App Store Readiness" }],
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
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "SeedEnv",
      url: SITE_URL,
      logo: `${SITE_URL}/icons/favicon-512.png`,
      parentOrganization: { "@type": "Organization", name: "TERIMUS LLC", url: `${SITE_URL}/terimus` },
      contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: "terimus@seedenv.com", url: `${SITE_URL}/contact` },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "SeedEnv",
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      inLanguage: "en-US",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#application`,
      name: "SeedEnv",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ],
};