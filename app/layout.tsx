import type { Metadata } from "next";
import type { Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/components/auth-provider";
import { SupportModal } from "@/components/SupportModal";
import { CursorGridTrail } from "@/components/cursor-grid-trail";
import { siteMetadata, siteStructuredData } from "@/lib/seo";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  ...siteMetadata,
  manifest: "/manifest.json",
  verification: {
    other: { "msvalidate.01": "6424EAA9B2B14ACA2821B39003908FF0" },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SeedEnv",
  },
  icons: {
    icon: [
      { url: "/seedenv-favicon-v4.ico", sizes: "16x16 32x32 48x48 64x64 128x128 256x256", type: "image/x-icon" },
      { url: "/icons/favicon-192.png?v=seedcube-v4", sizes: "192x192", type: "image/png" },
      { url: "/icons/favicon-512.png?v=seedcube-v4", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png?v=seedcube-v3", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0F1117",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full scroll-smooth antialiased motion-reduce:scroll-auto`}
    >
      <body className="min-h-full bg-obsidian text-white selection:bg-aurum selection:text-obsidian">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-zinc-100 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-zinc-950 focus:shadow-lg">Skip to content</a>
        <CursorGridTrail />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteStructuredData).replace(/</g, "\\u003c") }}
        />
        <AuthProvider>{children}<SupportModal aiEnabled={Boolean(process.env.GEMINI_API_KEY)} /></AuthProvider>
      </body>
    </html>
  );
}
