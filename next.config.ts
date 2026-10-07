import type { NextConfig } from "next";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: { "/api/billing/invoices/*": ["./assets/fonts/NotoSans.ttf", "./public/seedenv-logo-v3.png"] },
  experimental: {
    serverActions: { bodySizeLimit: "8mb" },
  },
  async rewrites() {
    return [{ source: "/@:username", destination: "/u/:username" }];
  },
  async headers() {
    const noindex = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];
    return [
      { source: "/:path*", headers: securityHeaders },
      ...["dashboard", "api", "settings", "account", "console", "admin", "onboarding", "clippers", "quests", "applications"].map((path) => ({ source: `/${path}/:path*`, headers: noindex })),
      // /auth/signin is the public sign-in page and stays indexable; other auth screens do not.
      { source: "/auth", headers: noindex },
      { source: "/auth/:path((?!signin$).*)", headers: noindex },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
