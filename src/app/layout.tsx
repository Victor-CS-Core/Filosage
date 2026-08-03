import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "@fontsource-variable/inter";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/components/AuthProvider";
import { DrawerProvider } from "@/components/AppDrawer";
import TrafficTracker from "@/components/TrafficTracker";
import AnalyticsConsent from "@/components/AnalyticsConsent";

function safeRequestOrigin(headerList: Headers) {
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  if (configuredOrigin) {
    try {
      return new URL(configuredOrigin).origin;
    } catch {
      // Fall through to the incoming host when a deployment variable is malformed.
    }
  }

  const forwardedHost = headerList.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || headerList.get("host");
  const forwardedProtocol = headerList.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProtocol === "http" || forwardedProtocol === "https"
    ? forwardedProtocol
    : host?.startsWith("localhost")
      ? "http"
      : "https";

  if (host && /^[a-z0-9.-]+(?::\d+)?$/i.test(host)) return `${protocol}://${host}`;
  return "https://teach-app-victo.ktr0nn.chatgpt.site";
}

export async function generateMetadata(): Promise<Metadata> {
  const origin = safeRequestOrigin(await headers());
  const socialImage = new URL("/og-outcome.png", origin).toString();

  return {
    metadataBase: new URL(origin),
    title: {
      default: "Erudoza · Learn it. Use it. Prove it.",
      template: "%s | Erudoza",
    },
    description: "Focused learning paths for product and data professionals: diagnose the starting point, practice on real work, and demonstrate what you can apply.",
    applicationName: "Erudoza",
    category: "education",
    openGraph: {
      title: "Erudoza · Learn the hard thing. Use it at work.",
      description: "Focused learning paths for product and data professionals, built around real outcomes and demonstrated mastery.",
      type: "website",
      url: origin,
      images: [{ url: socialImage, width: 1536, height: 1024, alt: "Erudoza · Learn it. Use it. Prove it." }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Erudoza · Learn the hard thing. Use it at work.",
      description: "Focused professional learning built around real outcomes and demonstrated mastery.",
      images: [socialImage],
    },
  };
}

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAF7" },
    { media: "(prefers-color-scheme: dark)", color: "#071127" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- Theme must be set before first paint. */}
        <script id="erudoza-theme-bootstrap" src="/theme-bootstrap.js" nonce={nonce} suppressHydrationWarning />
        <ThemeProvider>
          <AuthProvider>
            <DrawerProvider>
              <TrafficTracker />
              {children}
              <AnalyticsConsent />
            </DrawerProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
