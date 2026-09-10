import type { Metadata } from "next";
import type { Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/components/auth-provider";
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
  metadataBase: new URL("https://seedenv.com"),
  applicationName: "SeedEnv",
  title: {
    default: "SeedEnv | Seed Real Beta Communities",
    template: "%s | SeedEnv",
  },
  description: "Seed authentic beta communities. Get paid for real launch feedback.",
  alternates: {
    canonical: "/",
  },
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    url: "https://seedenv.com",
    siteName: "SeedEnv",
    title: "SeedEnv | Seed Real Beta Communities",
    description: "Seed authentic beta communities. Get paid for real launch feedback.",
    images: [
      {
        url: "/seedenv-logo.png",
        width: 972,
        height: 1048,
        alt: "SeedEnv",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SeedEnv | Seed Real Beta Communities",
    description: "Seed authentic beta communities. Get paid for real launch feedback.",
    images: ["/seedenv-logo.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SeedEnv",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#090A0F",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-obsidian text-white selection:bg-aurum selection:text-obsidian">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
